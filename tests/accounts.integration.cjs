require('dotenv').config({ quiet: true });
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const mysql = require('mysql2/promise');
const { config, createStore } = require('../database.cjs');
const { hashPassword, verifyPassword, tokenHash } = require('../account-auth.cjs');
const { Keychain } = require('../password-manager.js');
test('MySQL accounts: claim legacy vault, hashed password, persistent sessions and ownership', async () => {
  const pool = mysql.createPool(config()), store = createStore(pool), tag = randomBytes(12).toString('hex');
  const legacyId = randomBytes(32).toString('hex'), email = `${tag}@test.invalid`, otherEmail = `other-${tag}@test.invalid`, limitKey = tokenHash(tag);
  const vaultIds = [legacyId];
  try {
    const chain = await Keychain.init('legacy master for integration'); await chain.set('test.example', 'test-secret');
    const [representation] = await chain.dump(); await store.save(legacyId, representation, 0);
    const hashed = await hashPassword('separate-account-password');
    assert.ok(!hashed.includes('separate-account-password'));
    assert.equal(await verifyPassword('separate-account-password', hashed), true);
    assert.equal(await verifyPassword('wrong-password', hashed), false);
    const account = await store.registerAccount(email, hashed, legacyId);
    assert.equal(account.vault_id, legacyId);
    const found = await store.findAccount(email); assert.equal(found.password_hash, hashed);
    const sessionHash = tokenHash(randomBytes(32).toString('hex'));
    await store.createSession(sessionHash, account.account_id);
    assert.equal((await store.session(sessionHash)).vault_id, legacyId);
    assert.equal((await store.get((await store.session(sessionHash)).vault_id)).representation, representation);
    const other = await store.registerAccount(otherEmail, hashed, legacyId); vaultIds.push(other.vault_id);
    assert.notEqual(other.vault_id, legacyId);
    assert.equal((await store.get(other.vault_id)).representation, null);
    await store.logout(sessionHash); assert.equal(await store.session(sessionHash), null);
    assert.equal(await store.limit(limitKey, 2), true); assert.equal(await store.limit(limitKey, 2), true); assert.equal(await store.limit(limitKey, 2), false);
  } finally {
    await pool.execute('DELETE FROM accounts WHERE email IN (?, ?)', [email, otherEmail]);
    for (const id of vaultIds) await pool.execute('DELETE FROM vaults WHERE vault_id = ?', [id]);
    await pool.execute('DELETE FROM auth_limits WHERE limit_key = ?', [limitKey]); await pool.end();
  }
});
