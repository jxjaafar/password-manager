const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { connectSQLite } = require('../sqlite-store.cjs');
const { Keychain } = require('../password-manager.js');
const { hashPassword, verifyPassword } = require('../account-auth.cjs');
const { handleRequest } = require('../function-adapter.cjs');
test('SQLite file persists account, encrypted passwords, projection and session after reopening', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'password-sqlite-')), file = path.join(dir, 'test.sqlite');
  let store = connectSQLite(file);
  try {
    const account = await store.registerAccount('test@example.com', await hashPassword('sqlite-account-password'));
    await store.createSession('session-test-hash', account.account_id);
    const chain = await Keychain.init('sqlite-master-password'); await chain.set('test.example', 'site-secret');
    const [repr] = await chain.dump(); await store.save(account.vault_id, repr, 0);
    await assert.rejects(store.save(account.vault_id, repr, 0), error => error.status === 409);
    store.close(); store = connectSQLite(file);
    assert.equal(await verifyPassword('sqlite-account-password', (await store.findAccount('test@example.com')).password_hash), true);
    assert.equal((await store.session('session-test-hash')).vault_id, account.vault_id);
    const saved = await store.get(account.vault_id);
    assert.equal(saved.representation, repr); assert.ok(!saved.representation.includes('site-secret'));
    assert.equal(await (await Keychain.load('sqlite-master-password', repr)).get('test.example'), 'site-secret');
    const { DatabaseSync } = require('node:sqlite'); const reader = new DatabaseSync(file);
    const rows = reader.prepare('SELECT * FROM password_demo').all(); reader.close(); assert.equal(rows.length, 1);
    await chain.remove('test.example'); await store.save(account.vault_id, (await chain.dump())[0], 1);
    await store.logout('session-test-hash'); assert.equal(await store.session('session-test-hash'), null);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('SQLite legacy import is non-destructive and links only unclaimed vaults', async () => {
  const store = connectSQLite(':memory:');
  try {
    const chain = await Keychain.init('test master'); await chain.set('test', 'secret'); const [repr] = await chain.dump();
    store.importMySQL([{ vault_id: 'legacy-vault', representation: repr, revision: 4 }], []);
    const account = await store.registerAccount('first@example.com', 'test-hash', 'legacy-vault');
    const other = await store.registerAccount('other@example.com', 'test-hash', 'legacy-vault');
    assert.equal(account.vault_id, 'legacy-vault'); assert.notEqual(other.vault_id, 'legacy-vault');
    assert.throws(() => store.importMySQL([], []), /already has data/);
    assert.equal((await store.get('legacy-vault')).representation, repr);
    assert.equal(await store.limit('test', 1), true); assert.equal(await store.limit('test', 1), false);
  } finally { store.close(); }
});
test('SQLite API selects account vault after a second sign-in', async () => {
  const store = connectSQLite(':memory:'); const origin = 'https://demo.example';
  const call = (route, method = 'GET', data, cookie = '') => handleRequest(new Request(origin + route, {
    method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {})
  }), store, { clientIp: 'sqlite-test' });
  try {
    const credentials = { email: 'browser@example.com', password: 'sqlite-account-password' };
    const registration = await call('/api/auth/register', 'POST', credentials); assert.equal(registration.status, 200);
    const cookie = registration.headers.get('set-cookie').split(';')[0];
    const chain = await Keychain.init('sqlite master'); await chain.set('test', 'secret'); const [representation] = await chain.dump();
    assert.equal((await call('/api/vault', 'PUT', { representation, revision: 0 }, cookie)).status, 200);
    const login = await call('/api/auth/login', 'POST', credentials); assert.equal(login.status, 200);
    const nextCookie = login.headers.get('set-cookie').split(';')[0];
    const data = await (await call('/api/vault', 'GET', undefined, nextCookie)).json();
    assert.equal(data.mode, 'sqlite'); assert.equal(data.representation, representation);
  } finally { store.close(); }
});
