const { randomBytes, createHash } = require('node:crypto');
const MAX_BODY = 12000000;
function respond(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
function cookieToken(req) {
  const match = (req.headers.cookie || '').match(/(?:^|;\s*)password_vault=([a-f0-9]{64})(?:;|$)/);
  return match?.[1];
}
function vaultId(token) { return createHash('sha256').update(token).digest('hex'); }
function validateRepresentation(representation) {
  if (typeof representation !== 'string' || Buffer.byteLength(representation) > MAX_BODY - 1024) throw new Error('Invalid vault data');
  const data = JSON.parse(representation);
  const base64 = (value, length) => typeof value === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(value) && (length === undefined || Buffer.from(value, 'base64').length === length);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const only = (value, names) => Object.keys(value).every(name => names.includes(name));
  const record = (value, length) => object(value) && only(value, ['iv', 'ciphertext']) && base64(value.iv, 12) && base64(value.ciphertext, length) && Buffer.from(value.ciphertext, 'base64').length >= 16;
  if (!object(data) || data.iterations !== 600000 || !base64(data.salt, 16)) throw new Error('Invalid encrypted vault');
  if (data.version === 1) {
    if (!only(data, ['version', 'iterations', 'salt', 'iv', 'data']) || !base64(data.iv, 12) || !base64(data.data) || Buffer.from(data.data, 'base64').length < 16) throw new Error('Invalid legacy vault');
  } else if (data.version === 2) {
    if (!only(data, ['version', 'iterations', 'salt', 'check', 'kvs', 'metadata']) || !record(data.check) || !object(data.kvs) || (data.metadata !== undefined && !object(data.metadata))) throw new Error('Invalid encrypted vault');
    for (const [tag, value] of Object.entries(data.kvs)) if (!base64(tag, 32) || !record(value, 274)) throw new Error('Invalid encrypted record');
    for (const [tag, value] of Object.entries(data.metadata || {})) if (!Object.hasOwn(data.kvs, tag) || !record(value)) throw new Error('Invalid metadata');
  } else throw new Error('Unsupported vault format');
}
async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) { const error = new Error('Request too large'); error.status = 413; throw error; }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function createStorageHandler(store, { secureCookies = false } = {}) {
  return async (req, res) => {
    if (req.url.split('?')[0] !== '/api/vault') return false;
    res.setHeader('Cache-Control', 'no-store');
    if (!store) { respond(res, 200, { mode: 'local' }); return true; }
    try {
      if (!['GET', 'PUT'].includes(req.method)) { respond(res, 405, { error: 'Method not allowed' }); return true; }
      if (req.headers['sec-fetch-site'] === 'cross-site') { respond(res, 403, { error: 'Cross-site access denied' }); return true; }
      let token = cookieToken(req);
      if (req.method === 'GET') {
        token ||= randomBytes(32).toString('hex');
        const result = await store.get(vaultId(token));
        res.setHeader('Set-Cookie', `password_vault=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=31536000${secureCookies ? '; Secure' : ''}`);
        respond(res, 200, { mode: 'mysql', ...result });
      } else {
        const expectedOrigin = `${secureCookies ? 'https' : 'http'}://${req.headers.host}`;
        if (!token || req.headers.origin !== expectedOrigin || req.headers['content-type']?.split(';')[0].trim() !== 'application/json') { respond(res, 403, { error: 'Same-origin JSON request with vault cookie required' }); return true; }
        const data = await body(req);
        if (!Number.isSafeInteger(data.revision) || data.revision < 0 || data.revision > 4294967294) throw new Error('Invalid revision');
        validateRepresentation(data.representation);
        respond(res, 200, await store.save(vaultId(token), data.representation, data.revision));
      }
    } catch (error) {
      const status = error.status || (error instanceof SyntaxError || /Invalid|Unsupported/.test(error.message) ? 400 : 503);
      respond(res, status, { error: status === 409 ? error.message : status === 503 ? 'MySQL unavailable. Nothing was saved; try again.' : 'Invalid or oversized encrypted vault request.' });
    }
    return true;
  };
}
module.exports = { createStorageHandler, validateRepresentation, vaultId };
