const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server.cjs');
const { Keychain } = require('../password-manager.js');
const { validateRepresentation } = require('../storage-api.cjs');

test('storage API isolates browsers, saves ciphertext, rejects conflicts and cross-origin writes', async t => {
  const rows = new Map();
  const store = {
    async get(id) { return rows.get(id) || { representation: null, revision: 0 }; },
    async save(id, representation, revision) {
      if ((rows.get(id)?.revision || 0) !== revision) { const error = new Error('Reload before saving'); error.status = 409; throw error; }
      rows.set(id, { representation, revision: revision + 1 }); return { revision: revision + 1 };
    }
  };
  const server = createServer(store, { accountAuth: false }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const first = await fetch(`${origin}/api/vault`), cookie = first.headers.get('set-cookie').split(';')[0];
  assert.match(first.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.equal((await first.json()).mode, 'mysql');
  const chain = await Keychain.init('test master password'); await chain.set('example.com', 'secret-site-password');
  const [representation] = await chain.dump();
  const save = (revision, overrides = {}, data = representation) => fetch(`${origin}/api/vault`, {
    method: 'PUT', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json', ...overrides }, body: JSON.stringify({ representation: data, revision })
  });
  assert.equal((await save(0)).status, 200);
  const saved = await (await fetch(`${origin}/api/vault`, { headers: { Cookie: cookie } })).json();
  assert.equal(saved.representation, representation); assert.equal(saved.revision, 1);
  assert.equal(await (await Keychain.load('test master password', saved.representation)).get('example.com'), 'secret-site-password');
  assert.ok(!saved.representation.includes('secret-site-password'));
  assert.equal((await save(0)).status, 409);
  assert.equal((await save(1, { Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await save(1, { Cookie: '' })).status, 403);
  assert.equal((await save(1, {}, JSON.stringify({ password: 'plaintext' }))).status, 400);
  assert.equal((await (await fetch(`${origin}/api/vault`)).json()).representation, null);
  assert.equal((await fetch(`${origin}/.env`)).status, 404);
});
test('database failure is reported, never acknowledged as saved', async t => {
  const server = createServer({ get: async () => { throw new Error('database offline'); } }, { accountAuth: false });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/vault`);
  assert.equal(response.status, 503); assert.match((await response.json()).error, /Database unavailable/);
});
test('encrypted envelope validation rejects unexpected plaintext fields', async () => {
  const chain = await Keychain.init('test master password'); const data = JSON.parse((await chain.dump())[0]);
  validateRepresentation(JSON.stringify(data));
  data.masterPassword = 'never store this'; assert.throws(() => validateRepresentation(JSON.stringify(data)));
});
