const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Keychain } = require('../password-manager.js');
const password = 'assignment test master passphrase';

test('required API: missing keys, insert, update, remove, serialization and reload', async () => {
  const chain = await Keychain.init(password);
  assert.equal(await chain.get('missing'), null);
  assert.equal(await chain.remove('missing'), false);
  await chain.set('example.com', 'first'); await chain.set('__proto__', 'safe');
  await chain.set('example.com', 'second');
  const [repr, hash] = await chain.dump();
  assert.equal(typeof hash, 'string'); assert.ok(JSON.parse(repr).kvs);
  assert.ok(!repr.includes('example.com')); assert.ok(!repr.includes(password)); assert.ok(!repr.includes('second'));
  const loaded = await Keychain.load(password, repr, hash);
  assert.equal(await loaded.get('example.com'), 'second');
  assert.equal(await loaded.get('__proto__'), 'safe');
  assert.equal(await loaded.remove('example.com'), true);
  assert.equal(await loaded.remove('example.com'), false);
  assert.equal(await loaded.get('example.com'), null);
});
test('all supported password lengths have equal ciphertext sizes, including Unicode', async () => {
  const chain = await Keychain.init(password);
  for (const value of ['', 'a', 'a\0b', 'x'.repeat(64), '🔑'.repeat(64)]) {
    await chain.set('example.com', value);
    assert.equal(await chain.get('example.com'), value);
    const record = Object.values(JSON.parse((await chain.dump())[0]).kvs)[0];
    assert.equal(Buffer.from(record.ciphertext, 'base64').length, 274);
  }
  await assert.rejects(chain.set('example.com', 'x'.repeat(65)));
  await assert.rejects(chain.set('example.com', '🔑'.repeat(65)));
});
test('swap attacks fail independently of trusted checksum', async () => {
  const chain = await Keychain.init(password);
  await chain.set('good.com', 'good secret'); await chain.set('evil.com', 'evil secret');
  const data = JSON.parse((await chain.dump())[0]); const [a, b] = Object.keys(data.kvs);
  [data.kvs[a], data.kvs[b]] = [data.kvs[b], data.kvs[a]];
  await assert.rejects(Keychain.load(password, JSON.stringify(data)), /Authentication failed/);
});
test('trusted checksum rejects old snapshots and individual record rollback', async () => {
  const chain = await Keychain.init(password); await chain.set('example.com', 'old secret');
  const [old] = await chain.dump(); await chain.set('example.com', 'new secret');
  const [current, trusted] = await chain.dump();
  await assert.rejects(Keychain.load(password, old, trusted), /checksum mismatch/);
  const modified = JSON.parse(current); modified.kvs = JSON.parse(old).kvs;
  await assert.rejects(Keychain.load(password, JSON.stringify(modified), trusted));
  assert.equal(await (await Keychain.load(password, current, trusted)).get('example.com'), 'new secret');
  // Without trusted external state, an authentic old snapshot is indistinguishable.
  assert.equal(await (await Keychain.load(password, old)).get('example.com'), 'old secret');
});
test('salt and nonces vary; one record update does not reencrypt the others', async () => {
  const a = await Keychain.init(password), b = await Keychain.init(password);
  assert.notEqual(JSON.parse((await a.dump())[0]).salt, JSON.parse((await b.dump())[0]).salt);
  await a.set('one', 'secret'); await a.set('two', 'another');
  const first = JSON.parse((await a.dump())[0]); await a.set('one', 'secret');
  const second = JSON.parse((await a.dump())[0]); const [one, two] = Object.keys(first.kvs);
  assert.notEqual(first.kvs[one].iv, second.kvs[one].iv);
  assert.deepEqual(first.kvs[two], second.kvs[two]);
});
test('empty vault authenticates password; modified kvs is actually restored', async () => {
  const chain = await Keychain.init(password); const [empty] = await chain.dump();
  await assert.rejects(Keychain.load('incorrect', empty));
  await chain.set('example.com', 'secret'); const data = JSON.parse((await chain.dump())[0]); data.kvs = {};
  const loaded = await Keychain.load(password, JSON.stringify(data));
  assert.equal(await loaded.get('example.com'), null);
});
