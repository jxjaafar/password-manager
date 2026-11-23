const { randomBytes, createHash } = require('node:crypto');
const { validateCredentials, hashPassword, verifyPassword, tokenHash } = require('./account-auth.cjs');
const MAX_BODY = 4000000;
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
function createStorageHandler(store, { secureCookies = false, accountAuth = true, clientIp } = {}) {
  return async (req, res) => {
    const route = req.url.split('?')[0];
    if (!route.startsWith('/api/')) return false;
    res.setHeader('Cache-Control', 'no-store');
    const mode = store?.kind || 'mysql';
    if (!store) { respond(res, route === '/api/vault' ? 200 : 503, route === '/api/vault' ? { mode: 'local' } : { error: 'Account storage is unavailable.' }); return true; }
    try {
      if (req.headers['sec-fetch-site'] === 'cross-site') { respond(res, 403, { error: 'Cross-site access denied' }); return true; }
      const expectedOrigin = `${secureCookies ? 'https' : 'http'}://${req.headers.host}`;
      if (req.method !== 'GET' && (req.headers.origin !== expectedOrigin || req.headers['content-type']?.split(';')[0].trim() !== 'application/json')) {
        respond(res, 403, { error: 'Same-origin JSON request required.' }); return true;
      }
      const sessionToken = (req.headers.cookie || '').match(/(?:^|;\s*)password_session=([a-f0-9]{64})(?:;|$)/)?.[1];
      const session = accountAuth && sessionToken ? await store.session(tokenHash(sessionToken)) : null;
      const sessionCookie = (token, maxAge = 604800) => `password_session=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`;
      if (route === '/api/auth/login' || route === '/api/auth/register') {
        if (!accountAuth || req.method !== 'POST') { respond(res, 405, { error: 'Method not allowed' }); return true; }
        const data = await body(req);
        const email = validateCredentials(data.email, data.password);
        const ip = clientIp || req.socket?.remoteAddress || 'unknown';
        const ipAllowed = await store.limit(tokenHash(`ip:${ip}`), 30);
        const emailAllowed = await store.limit(tokenHash(`email:${email}`), 10);
        if (!ipAllowed || !emailAllowed) { respond(res, 429, { error: 'Too many sign-in attempts. Try again in 15 minutes.' }); return true; }
        let account;
        if (route.endsWith('/register')) {
          try { account = await store.registerAccount(email, await hashPassword(data.password), cookieToken(req) ? vaultId(cookieToken(req)) : null); }
          catch (error) { if (error.code === 'ER_DUP_ENTRY') { respond(res, 409, { error: 'Could not create this account. Try signing in instead.' }); return true; } throw error; }
        } else {
          account = await store.findAccount(email);
          if (!await verifyPassword(data.password, account?.password_hash)) { respond(res, 401, { error: 'Email or account password is incorrect.' }); return true; }
        }
        const token = randomBytes(32).toString('hex');
        await store.createSession(tokenHash(token), account.account_id);
        res.setHeader('Set-Cookie', sessionCookie(token));
        respond(res, 200, { email: account.email }); return true;
      }
      if (route === '/api/auth/logout') {
        if (req.method !== 'POST') { respond(res, 405, { error: 'Method not allowed' }); return true; }
        if (sessionToken) await store.logout(tokenHash(sessionToken));
        res.setHeader('Set-Cookie', [sessionCookie('', 0), `password_vault=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0${secureCookies ? '; Secure' : ''}`]);
        respond(res, 200, { signedOut: true }); return true;
      }
      if (route !== '/api/vault') { respond(res, 404, { error: 'Endpoint not found' }); return true; }
      if (!['GET', 'PUT'].includes(req.method)) { respond(res, 405, { error: 'Method not allowed' }); return true; }
      if (accountAuth) {
        if (!session) { respond(res, 401, { mode, requiresAccount: true, error: 'Sign in to open your saved vault.' }); return true; }
        if (req.method === 'GET') respond(res, 200, { mode, email: session.email, ...await store.get(session.vault_id) });
        else {
          const data = await body(req);
          if (!Number.isSafeInteger(data.revision) || data.revision < 0 || data.revision > 4294967294) throw new Error('Invalid revision');
          validateRepresentation(data.representation);
          respond(res, 200, await store.save(session.vault_id, data.representation, data.revision));
        }
        return true;
      }
      // Compatibility test harness only. Runtime servers always require account authentication.
      let token = cookieToken(req);
      if (req.method === 'GET') {
        token ||= randomBytes(32).toString('hex');
        const result = await store.get(vaultId(token));
        res.setHeader('Set-Cookie', `password_vault=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=31536000${secureCookies ? '; Secure' : ''}`);
        respond(res, 200, { mode, ...result });
      } else {
        if (!token || req.headers.origin !== expectedOrigin || req.headers['content-type']?.split(';')[0].trim() !== 'application/json') { respond(res, 403, { error: 'Same-origin JSON request with vault cookie required' }); return true; }
        const data = await body(req);
        if (!Number.isSafeInteger(data.revision) || data.revision < 0 || data.revision > 4294967294) throw new Error('Invalid revision');
        validateRepresentation(data.representation);
        respond(res, 200, await store.save(vaultId(token), data.representation, data.revision));
      }
    } catch (error) {
      const status = error.status || (error instanceof SyntaxError || /Invalid|Unsupported/.test(error.message) ? 400 : 503);
      respond(res, status, { error: status === 409 ? error.message : status === 503 ? 'Database unavailable. Retry or reload to check the last saved state.' : 'Invalid or oversized request.' });
    }
    return true;
  };
}
module.exports = { createStorageHandler, validateRepresentation, vaultId };
