import test,{after,before} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {server,CANONICAL_ORIGIN,RAILWAY_HOST} from '../server.mjs';
let base;
before(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
// fetch() cannot override Host, so host-routing tests use a raw request.
const requestAs=(host,path)=>new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:server.address().port,path,headers:{Host:host}},res=>{res.resume();resolve(res);});req.on('error',reject);req.end();});
test('home serves SEO-ready HTML with restrictive security headers',async()=>{
  const r=await fetch(base);assert.equal(r.status,200);const html=await r.text();
  assert.match(html,/Five traditions/);assert.match(html,/GodEars/);assert.match(html,/https:\/\/godears\.org/);assert.match(html,/rel="canonical"/);assert.match(html,/application\/ld\+json/);
  assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(r.headers.get('x-frame-options'),'DENY');
});
test('www host redirects permanently to the canonical GodEars domain',async()=>{const port=server.address().port;const r=await new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:'/quran?x=1',headers:{Host:'www.godears.org'}},resolve);req.on('error',reject);req.end();});assert.equal(r.statusCode,308);assert.equal(r.headers.location,'https://godears.org/quran?x=1');r.resume();});
test('canonical origin is the permanent GodEars domain',()=>assert.equal(CANONICAL_ORIGIN,'https://godears.org'));
test('www and Railway redirects go straight to the pretty canonical URL',async()=>{
  for(const [host,path,location] of [
    ['www.godears.org','/','https://godears.org/'],
    ['WWW.GodEars.org:443','/bible.html','https://godears.org/bible'],
    [RAILWAY_HOST,'/','https://godears.org/'],
    [RAILWAY_HOST,'/tanakh?from=old','https://godears.org/tanakh?from=old'],
    [RAILWAY_HOST,'/dhammapada.html','https://godears.org/dhammapada'],
    [RAILWAY_HOST,'/bhagavad-gita/','https://godears.org/bhagavad-gita'],
    [RAILWAY_HOST,'/sitemap.xml','https://godears.org/sitemap.xml'],
    [RAILWAY_HOST,'/robots.txt','https://godears.org/robots.txt'],
    [RAILWAY_HOST,'//evil.example/x','https://godears.org/x']
  ]){const r=await requestAs(host,path);assert.equal(r.statusCode,308,`${host}${path}`);assert.equal(r.headers.location,location,`${host}${path}`);}
});
test('malformed request targets on redirecting hosts get a safe redirect instead of crashing the server',async()=>{
  const raw=(target,host)=>new Promise((resolve,reject)=>{const socket=net.connect(server.address().port,'127.0.0.1',()=>socket.end(`GET ${target} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`));let data='';socket.on('data',d=>data+=d);socket.on('end',()=>resolve(data));socket.on('error',reject);});
  for(const host of ['www.godears.org',RAILWAY_HOST]){
    for(const target of ['http://[bad/x','/%ZZ?q=1','http://evil.example/bible.html']){
      const response=await raw(target,host);
      assert.match(response,/^HTTP\/1\.1 (308|400)/,`${host} ${target}: ${response.slice(0,80)}`);
      const location=response.match(/^location: (.*)$/im)?.[1]?.trim();
      if(location)assert.ok(location.startsWith('https://godears.org/'),location);
    }
  }
  assert.equal((await fetch(base)).status,200);
});
test('Railway hostname still serves health checks and the build source mirror',async()=>{
  for(const path of ['/healthz','/data/catalog.json','/data/quran-pickthall/source.txt']){
    const r=await requestAs(RAILWAY_HOST,path);
    assert.ok(![301,302,307,308].includes(r.statusCode),`${path} must not redirect`);assert.equal(r.headers.location,undefined);
    assert.equal(r.headers['x-robots-tag'],'noindex');
  }
});
test('platform health checks and the canonical host are served directly',async()=>{
  for(const host of ['godears.org','healthcheck.railway.app','read-aloud.railway.internal']){const r=await requestAs(host,'/');assert.equal(r.statusCode,200,host);assert.equal(r.headers.location,undefined);}
});
test('legacy favicon request resolves without a 404',async()=>{const r=await fetch(base+'/favicon.ico');assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/image\/svg\+xml/);});
test('robots and sitemap are public and reference the reader',async()=>{
  const robots=await fetch(base+'/robots.txt');assert.equal(robots.status,200);assert.match(await robots.text(),/Sitemap:/);
  const sitemap=await fetch(base+'/sitemap.xml');assert.equal(sitemap.status,200);const xml=await sitemap.text();assert.match(xml,/\/bible</);assert.match(xml,/\/quran</);
});
test('every public page and SEO file uses GodEars branding and the godears.org domain',async()=>{
  for(const slug of ['bible','tanakh','quran','bhagavad-gita','dhammapada']){
    const html=await (await fetch(`${base}/${slug}`)).text();
    assert.match(html,new RegExp(`<link rel="canonical" href="https://godears\\.org/${slug}">`));
    assert.match(html,new RegExp(`<meta property="og:url" content="https://godears\\.org/${slug}">`));
    assert.match(html,/<title>[^<]+(Read|Listen) Aloud \| GodEars<\/title>/);
    assert.match(html,/<span class="brand-copy">God<em>Ears<\/em><\/span>/);
    assert.match(html,/"item":"https:\/\/godears\.org\/"/);
  }
  const home=await (await fetch(base)).text();
  assert.match(home,/<title>GodEars — Free Sacred Text Reader with Read Aloud<\/title>/);assert.match(home,/God<em>Ears<\/em>/);
  for(const path of ['/','/bible','/tanakh','/quran','/bhagavad-gita','/dhammapada','/404.html','/sitemap.xml','/robots.txt','/site.webmanifest']){
    const body=await (await fetch(base+path)).text();
    assert.doesNotMatch(body,/railway\.app/,`${path} still references the Railway hostname`);
    assert.doesNotMatch(body,/read <em>aloud\./,`${path} still shows the old wordmark`);
  }
  assert.match(await (await fetch(base+'/robots.txt')).text(),/^Sitemap: https:\/\/godears\.org\/sitemap\.xml$/m);
  const manifest=await (await fetch(base+'/site.webmanifest')).json();assert.equal(manifest.name,'GodEars');assert.equal(manifest.start_url,'/');
});
test('downloadable progress backup uses the GodEars brand',async()=>{const js=await (await fetch(base+'/app.js')).text();assert.match(js,/godears-reading-progress\.json/);assert.doesNotMatch(js,/read-aloud-progress\.json/);});
test('search landing pages have pretty canonical routes',async()=>{
  const r=await fetch(base+'/bible');assert.equal(r.status,200);const html=await r.text();assert.match(html,/Read the Bible Online/);assert.match(html,/rel="canonical"/);
  const old=await fetch(base+'/bible.html',{redirect:'manual'});assert.equal(old.status,308);assert.equal(old.headers.get('location'),'/bible');
});
test('missing files return a branded real 404',async()=>{const r=await fetch(base+'/missing.js');assert.equal(r.status,404);assert.match(await r.text(),/Page not found/);});
test('writes are not accepted by the reader',async()=>{assert.equal((await fetch(base,{method:'POST'})).status,405);});
test('encoded separators cannot expose source files',async()=>{const r=await fetch(base+'/%2e%2e%2fpackage.json');assert.equal(r.status,403);});
test('malformed URL encoding is rejected',async()=>assert.equal((await fetch(base+'/%ZZ')).status,400));
test('HEAD responses contain no body',async()=>{const r=await fetch(base,{method:'HEAD'});assert.equal(r.status,200);assert.equal(await r.text(),'');});