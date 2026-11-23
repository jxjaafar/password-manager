const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'app.js'), 'utf8');
const { Keychain } = require('../password-manager.js');
const context = vm.createContext({ Keychain, crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, Uint32Array, btoa, atob, document: { getElementById: id => ({ checked: true, value: '20' }) }, localStorage: { setItem: (name, value) => { context.saved = value; } } });
vm.runInContext(source.slice(0, source.indexOf('function render()')), context);
test('actual vault encryption round-trips and rejects wrong keys and tampering', async () => {
  await vm.runInContext(`(async () => {
    key = await Keychain.init('a long master passphrase');
    await persist([{ id: 'example.com', name: 'Example', password: 'secret-test-password' }]);
  })()`, context);
  assert.ok(!context.saved.includes('secret-test-password'));
  const restored = await Keychain.load('a long master passphrase', context.saved);
  assert.equal(await restored.get('example.com'), 'secret-test-password');
  const first = context.saved;
  await vm.runInContext('persist()', context);
  assert.equal(context.saved, first, 'Unchanged records retain their ciphertext');
  await assert.rejects(Keychain.load('wrong master passphrase', context.saved));
  const modified = JSON.parse(context.saved), tag = Object.keys(modified.kvs)[0];
  const bytes = Buffer.from(modified.kvs[tag].ciphertext, 'base64'); bytes[0] ^= 1;
  modified.kvs[tag].ciphertext = bytes.toString('base64');
  await assert.rejects(Keychain.load('a long master passphrase', JSON.stringify(modified)));
});
test('generator obeys length and character requirements', () => {
  for (const length of [12, 20, 64]) {
    for (let i = 0; i < 50; i++) {
      const password = vm.runInContext(`generate(${length})`, context);
      assert.equal(password.length, length);
      assert.match(password, /[a-z]/); assert.match(password, /[A-Z]/);
      assert.match(password, /[0-9]/); assert.match(password, /[^a-zA-Z0-9]/);
    }
  }
});
test('invalid backup parameters are rejected', () => {
  assert.throws(() => vm.runInContext("validateEnvelope({ version: 1, iterations: 1, salt: '', iv: '', data: '' })", context));
});
