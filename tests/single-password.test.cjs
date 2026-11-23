const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { Keychain } = require('../password-manager.js');
const { hashPassword, verifyPassword } = require('../account-auth.cjs');

test('one password derives a separate sign-in credential and reopens encrypted passwords', async () => {
  const context = vm.createContext({ crypto: webcrypto, TextEncoder });
  vm.runInContext(readFileSync(require.resolve('../account-ui.js'), 'utf8'), context);
  const password = 'a-test-only-long-passphrase';
  const credential = await context.deriveSignInCredential('demo@example.com', password);
  assert.notEqual(credential, password);
  assert.equal(credential, await context.deriveSignInCredential(' DEMO@example.com ', password));
  assert.notEqual(credential, await context.deriveSignInCredential('another@example.com', password));
  const hash = await hashPassword(credential);
  assert.equal(await verifyPassword(credential, hash), true);
  assert.equal(await verifyPassword(password, hash), false);
  const safe = await Keychain.init(password);
  await safe.set('demo.example', 'saved-demo-password');
  const [representation] = await safe.dump();
  assert.equal(await (await Keychain.load(password, representation)).get('demo.example'), 'saved-demo-password');
  await assert.rejects(Keychain.load(credential, representation));
});
