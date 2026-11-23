const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'app.js'), 'utf8');
const context = vm.createContext({ crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, Uint32Array, btoa, atob, document: { getElementById: id => ({ checked: true, value: '20' }) }, localStorage: { setItem: (name, value) => { context.saved = value; } } });
vm.runInContext(source.slice(0, source.indexOf('function render()')), context);
test('actual vault encryption round-trips and rejects wrong keys and tampering', async () => {
  await vm.runInContext(`(async () => {
    envelope = { salt: b64(crypto.getRandomValues(new Uint8Array(16))) };
    key = await derive('a long master passphrase', unb64(envelope.salt));
    await persist([{ name: 'Example', password: 'secret-test-password' }]);
  })()`, context);
  assert.ok(!context.saved.includes('secret-test-password'));
  const plain = await vm.runInContext(`(async () => new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(envelope.iv) }, key, unb64(envelope.data))))()`, context);
  assert.equal(JSON.parse(plain)[0].password, 'secret-test-password');
  const first = JSON.parse(context.saved);
  await vm.runInContext('persist()', context);
  assert.notEqual(JSON.parse(context.saved).iv, first.iv);
  await assert.rejects(vm.runInContext(`(async () => { const wrongKey = await derive('wrong master passphrase', unb64(envelope.salt)); return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(envelope.iv) }, wrongKey, unb64(envelope.data)); })()`, context));
  await assert.rejects(vm.runInContext(`(async () => { const bytes = unb64(envelope.data); bytes[0] ^= 1; return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(envelope.iv) }, key, bytes); })()`, context));
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
