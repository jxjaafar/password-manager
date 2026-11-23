import database from '../../database.cjs';
import adapter from '../../function-adapter.cjs';

let pendingStore;
export default async function (request, context) {
  try {
    const host = process.env.MYSQL_HOST;
    if (process.env.MYSQL_ENABLED !== 'true' || !host || ['localhost', '127.0.0.1', '::1'].includes(host) || process.env.MYSQL_SSL !== 'true') {
      return Response.json({ error: 'Hosted MySQL is not configured. Set MYSQL_ENABLED=true, a hosted MYSQL_HOST, database credentials, and MYSQL_SSL=true in Netlify Functions environment settings.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    pendingStore ||= database.connectStore().catch(error => { pendingStore = null; throw error; });
    const store = await pendingStore;
    return await adapter.handleRequest(request, store, { clientIp: context?.ip || 'unknown' });
  } catch {
    return Response.json({ error: 'Could not connect to hosted MySQL. Check connection settings and run the database setup migration.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
export const config = { path: '/api/*' };
