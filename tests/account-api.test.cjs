const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { handleRequest } = require('../function-adapter.cjs');
const { Keychain } = require('../password-manager.js');
function memoryStore() {
  const accounts = new Map(), sessions = new Map(), vaults = new Map(), limits = new Map();
  return {
    findAccount: async email => accounts.get(email),
    async registerAccount(email, password_hash) {
      if (accounts.has(email)) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
      const account = { email, password_hash, account_id: randomUUID(), vault_id: randomUUID() }; accounts.set(email, account); return account;
    },
    createSession: async (hash, id) => sessions.set(hash, [...accounts.values()].find(account => account.account_id === id)),
    session: async hash => sessions.get(hash), logout: async hash => sessions.delete(hash),
    async limit(key, max) { limits.set(key, (limits.get(key) || 0) + 1); return limits.get(key) <= max; },
    get: async id => vaults.get(id) || { representation: null, revision: 0 },
    async save(id, representation, revision) {
      if ((vaults.get(id)?.revision || 0) !== revision) throw Object.assign(new Error('Reload before saving'), { status: 409 });
      vaults.set(id, { representation, revision: revision + 1 }); return { revision: revision + 1 };
    }
  };
}
test('hosted adapter: sign in from a fresh browser restores same vault; logout and isolation enforced', async () => {
  const store = memoryStore(), origin = 'https://password.example';
  const call = (path, method = 'GET', data, cookie = '', requestOrigin = origin) => handleRequest(new Request(origin + path, {
    method, headers: { Cookie: cookie, Origin: requestOrigin, 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) })
  }), store, { clientIp: 'test-ip' });
  assert.equal((await call('/api/vault')).status, 401);
  const credentials = { email: 'student@example.com', password: 'account-test-password!' };
  const registration = await call('/api/auth/register', 'POST', credentials);
  assert.equal(registration.status, 200);
  assert.match(registration.headers.get('set-cookie'), /HttpOnly; SameSite=Strict.*Secure/);
  const cookie = registration.headers.get('set-cookie').split(';')[0];
  const chain = await Keychain.init('different master passphrase'); await chain.set('example.com', 'secret-site-password');
  const [representation] = await chain.dump();
  assert.equal((await call('/api/vault', 'PUT', { representation, revision: 0 }, cookie)).status, 200);
  assert.equal((await call('/api/vault', 'PUT', { representation, revision: 1 }, cookie, 'https://attacker.example')).status, 403);
  assert.equal((await call('/api/auth/login', 'POST', { ...credentials, password: 'wrong-account-password' })).status, 401);
  const login = await call('/api/auth/login', 'POST', credentials);
  const secondCookie = login.headers.get('set-cookie').split(';')[0];
  const loaded = await (await call('/api/vault', 'GET', undefined, secondCookie)).json();
  assert.equal(loaded.representation, representation); assert.equal(loaded.email, credentials.email);
  const other = await call('/api/auth/register', 'POST', { email: 'other@example.com', password: 'different-account-password' });
  const otherCookie = other.headers.get('set-cookie').split(';')[0];
  assert.equal((await (await call('/api/vault', 'GET', undefined, otherCookie)).json()).representation, null);
  assert.equal((await call('/api/auth/logout', 'POST', {}, secondCookie)).status, 200);
  assert.equal((await call('/api/vault', 'GET', undefined, secondCookie)).status, 401);
});
test('hosted function fails closed if hosted database settings are missing', async () => {
  const { default: handler } = await import('../netlify/functions/api.mjs');
  const result = await handler(new Request('https://password.example/api/vault'), {});
  assert.equal(result.status, 503);
});
test('login throttling and untrusted origins are rejected before password verification', async () => {
  const store = memoryStore(); store.limit = async () => false;
  const origin = 'https://password.example';
  const request = suppliedOrigin => new Request(origin + '/api/auth/login', {
    method: 'POST', headers: { Origin: suppliedOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student@example.com', password: 'test-account-password' })
  });
  assert.equal((await handleRequest(request(origin), store, { clientIp: 'limited-ip' })).status, 429);
  assert.equal((await handleRequest(request('https://attacker.example'), store)).status, 403);
});
