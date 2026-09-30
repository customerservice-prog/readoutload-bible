import http from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('./public/', import.meta.url));
const types = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.txt':'text/plain; charset=utf-8'};
export const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'");
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, {'Allow':'GET, HEAD'}); return res.end('Method not allowed'); }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/healthz') {
      const catalog = JSON.parse(await readFile(resolve(root, 'data/catalog.json'), 'utf8'));
      if (catalog.works.length !== 5) throw new Error('Library incomplete');
      res.writeHead(200, {'Content-Type': types['.json'], 'Cache-Control':'no-store'});
      return res.end(req.method === 'HEAD' ? '' : JSON.stringify({status:'ok', works:catalog.works.map(w=>({id:w.id, books:w.books.length, chapters:w.chapterCount, passages:w.verseCount}))}));
    }
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(resolve(root) + sep) || pathname.includes('\0') || pathname.includes('\\')) { res.writeHead(403); return res.end('Forbidden'); }
    if (!(await stat(path)).isFile()) throw Object.assign(new Error(), {code:'ENOENT'});
    const body = await readFile(path);
    res.writeHead(200, {'Content-Type':types[extname(path)] || 'application/octet-stream', 'Content-Length':body.length, 'Cache-Control':'public, max-age=0, must-revalidate'});
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (err) {
    res.writeHead(err instanceof URIError ? 400 : err.code === 'ENOENT' ? 404 : 503, {'Content-Type':'text/plain; charset=utf-8'});
    res.end(err.code === 'ENOENT' ? 'Not found' : 'The library is temporarily unavailable. Please try again.');
  }
});
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => console.log(`Read Aloud listening on ${port}`));
  process.on('SIGTERM', () => server.close());
}
