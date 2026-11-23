const { scrypt, randomBytes, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');
const derive = promisify(scrypt);
const OPTIONS = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
let activeDerivations = 0;
async function deriveKey(password, salt) {
  if (activeDerivations >= 2) throw Object.assign(new Error('Authentication is busy. Try again shortly.'), { status: 429 });
  activeDerivations++;
  try { return await derive(password, salt, 32, OPTIONS); }
  finally { activeDerivations--; }
}
function validateCredentials(email, password) {
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[\x21-\x7e]+$/.test(email)) throw Object.assign(new Error('Enter a valid email address.'), { status: 400 });
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password) > 256) throw Object.assign(new Error('Account password must be at least 12 characters and at most 256 bytes.'), { status: 400 });
  return email.toLowerCase();
}
async function hashPassword(password) {
  const salt = randomBytes(16), key = await deriveKey(password, salt);
  return `scrypt$131072$8$1$${salt.toString('hex')}$${key.toString('hex')}`;
}
async function verifyPassword(password, stored) {
  // The missing-account path does the same expensive derivation.
  const parts = (stored || '').split('$');
  const valid = parts.length === 6 && parts.slice(0, 4).join('$') === 'scrypt$131072$8$1' && /^[a-f0-9]{32}$/.test(parts[4]) && /^[a-f0-9]{64}$/.test(parts[5]);
  const salt = valid ? Buffer.from(parts[4], 'hex') : Buffer.alloc(16);
  const derived = await deriveKey(password, salt);
  return valid && timingSafeEqual(derived, Buffer.from(parts[5], 'hex'));
}
const tokenHash = token => createHash('sha256').update(token).digest('hex');
module.exports = { validateCredentials, hashPassword, verifyPassword, tokenHash };
