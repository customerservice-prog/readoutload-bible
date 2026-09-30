import http from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('./public/', import.meta.url));
const types = {
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8',
  '.xml':'application/xml; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.png':'image/png'
};
const aliases = new Map([
  ['/bible','/bible.html'],['/tanakh','/tanakh.html'],['/quran','/quran.html'],
  ['/bhagavad-gita','/bhagavad-gita.html'],['/dhammapada','/dhammapada.html']
]);
const htmlAliases = new Map([...aliases].map(([pretty,file])=>[file,pretty]));
const rootPath = resolve(root);
function safePathname(url) { return decodeURIComponent(new URL(url,'http://localhost').pathname); }
async function sendFile(req,res,pathname,status=200) {
  const mapped = pathname === '/' ? '/index.html' : (pathname === '/favicon.ico' ? '/icon.svg' : (aliases.get(pathname) || pathname));
  const path = resolve(root,'.'+mapped);
  if (!path.startsWith(rootPath + sep) || pathname.includes('\0') || pathname.includes('\\')) {
    res.writeHead(403,{'Content-Type':'text/plain; charset=utf-8'}); return res.end('Forbidden');
  }
  if (!(await stat(path)).isFile()) throw Object.assign(new Error(),{code:'ENOENT'});
  const body = await readFile(path), ext=extname(path);
  const isHtml=ext==='.html', isData=pathname.startsWith('/data/');
  const cache=isHtml?'public, max-age=300, must-revalidate':isData?'public, max-age=3600, must-revalidate':'public, max-age=3600, stale-while-revalidate=86400';
  res.writeHead(status,{'Content-Type':types[ext]||'application/octet-stream','Content-Length':body.length,'Cache-Control':cache});
  res.end(req.method==='HEAD'?undefined:body);
}
export const server = http.createServer(async (req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Language','en');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'");
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405,{'Allow':'GET, HEAD'});return res.end('Method not allowed');}
  try {
    const pathname=safePathname(req.url);
    if(pathname==='/healthz'){
      const catalog=JSON.parse(await readFile(resolve(root,'data/catalog.json'),'utf8'));
      if(catalog.works.length!==5)throw new Error('Library incomplete');
      res.writeHead(200,{'Content-Type':types['.json'],'Cache-Control':'no-store'});
      return res.end(req.method==='HEAD'?'':JSON.stringify({status:'ok',works:catalog.works.map(w=>({id:w.id,books:w.books.length,chapters:w.chapterCount,passages:w.verseCount}))}));
    }
    if(htmlAliases.has(pathname)){
      res.writeHead(308,{'Location':htmlAliases.get(pathname),'Cache-Control':'public, max-age=86400'});return res.end();
    }
    if(pathname.length>1&&pathname.endsWith('/')&&aliases.has(pathname.slice(0,-1))){
      res.writeHead(308,{'Location':pathname.slice(0,-1),'Cache-Control':'public, max-age=86400'});return res.end();
    }
    return await sendFile(req,res,pathname);
  } catch(err) {
    if(err instanceof URIError){res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8'});return res.end('Bad request');}
    if(err.code==='ENOENT'){
      try{return await sendFile(req,res,'/404.html',404);}catch{}
      res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('Not found');
    }
    res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8'});res.end('The library is temporarily unavailable. Please try again.');
  }
});
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||3000);
  server.listen(port,'0.0.0.0',()=>console.log(`Read Aloud listening on ${port}`));
  process.on('SIGTERM',()=>server.close());
}