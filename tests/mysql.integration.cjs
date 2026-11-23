// Explicit integration test: npm run test:db. Requires configured database/schema.
require('dotenv').config({ quiet: true });
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const mysql = require('mysql2/promise');
const { config, createStore } = require('../database.cjs');
const { Keychain } = require('../password-manager.js');
test('real MySQL insert/load/update/conflict and encrypted-only persistence', async () => {
  const pool = mysql.createPool(config()), store = createStore(pool), id = randomBytes(32).toString('hex');
  try {
    assert.equal((await store.get(id)).representation, null);
    const chain = await Keychain.init('mysql integration test master');
    await chain.set('database-test.example', 'test-site-secret');
    const [first] = await chain.dump();
    assert.equal((await store.save(id, first, 0)).revision, 1);
    const fromDatabase = await store.get(id);
    assert.equal(fromDatabase.representation, first);
    assert.ok(!fromDatabase.representation.includes('test-site-secret'));
    assert.equal(await (await Keychain.load('mysql integration test master', fromDatabase.representation)).get('database-test.example'), 'test-site-secret');
    await chain.set('database-test.example', 'updated-secret');
    const [next] = await chain.dump(); await store.save(id, next, 1);
    await assert.rejects(store.save(id, first, 1), error => error.status === 409);
    assert.equal((await store.get(id)).representation, next);
  } finally {
    await pool.execute('DELETE FROM vaults WHERE vault_id = ?', [id]); await pool.end();
  }
});
