const { Readable } = require('node:stream');
const { createStorageHandler } = require('./storage-api.cjs');
async function handleRequest(request, store, options = {}) {
  const url = new URL(request.url);
  if (Number(request.headers.get('content-length')) > 4000000) return Response.json({ error: 'Request too large' }, { status: 413 });
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length > 4000000) return Response.json({ error: 'Request too large' }, { status: 413 });
  const req = Readable.from([bytes]);
  req.method = request.method; req.url = url.pathname + url.search;
  req.headers = Object.fromEntries(request.headers); req.headers.host = url.host;
  const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  let status = 200, output = '';
  const res = {
    setHeader(name, value) { headers.delete(name); for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item); },
    writeHead(code, values = {}) { status = code; for (const [name, value] of Object.entries(values)) this.setHeader(name, value); },
    end(text) { output = text || ''; }
  };
  const handled = await createStorageHandler(store, { secureCookies: true, ...options })(req, res);
  if (!handled) return Response.json({ error: 'Endpoint not found' }, { status: 404 });
  return new Response(output, { status, headers });
}
module.exports = { handleRequest };
