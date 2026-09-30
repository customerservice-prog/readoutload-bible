import test,{after,before} from 'node:test';
import assert from 'node:assert/strict';
import {server} from '../server.mjs';
let base;
before(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
test('home serves SEO-ready HTML with restrictive security headers',async()=>{
  const r=await fetch(base);assert.equal(r.status,200);const html=await r.text();
  assert.match(html,/Read sacred texts/);assert.match(html,/rel="canonical"/);assert.match(html,/application\/ld\+json/);
  assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(r.headers.get('x-frame-options'),'DENY');
});
test('robots and sitemap are public and reference the reader',async()=>{
  const robots=await fetch(base+'/robots.txt');assert.equal(robots.status,200);assert.match(await robots.text(),/Sitemap:/);
  const sitemap=await fetch(base+'/sitemap.xml');assert.equal(sitemap.status,200);const xml=await sitemap.text();assert.match(xml,/\/bible</);assert.match(xml,/\/quran</);
});
test('search landing pages have pretty canonical routes',async()=>{
  const r=await fetch(base+'/bible');assert.equal(r.status,200);const html=await r.text();assert.match(html,/Read the Bible Online/);assert.match(html,/rel="canonical"/);
  const old=await fetch(base+'/bible.html',{redirect:'manual'});assert.equal(old.status,308);assert.equal(old.headers.get('location'),'/bible');
});
test('missing files return a branded real 404',async()=>{const r=await fetch(base+'/missing.js');assert.equal(r.status,404);assert.match(await r.text(),/Page not found/);});
test('writes are not accepted by the reader',async()=>{assert.equal((await fetch(base,{method:'POST'})).status,405);});
test('encoded separators cannot expose source files',async()=>{const r=await fetch(base+'/%2e%2e%2fpackage.json');assert.equal(r.status,403);});
test('malformed URL encoding is rejected',async()=>assert.equal((await fetch(base+'/%ZZ')).status,400));
test('HEAD responses contain no body',async()=>{const r=await fetch(base,{method:'HEAD'});assert.equal(r.status,200);assert.equal(await r.text(),'');});