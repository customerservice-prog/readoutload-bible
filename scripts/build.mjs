import {mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const SOURCES = [
  {id:'bible-asv', religion:'Christianity', title:'The Holy Bible', edition:'American Standard Version · 1901', subtitle:'Old & New Testaments', detail:'66-book Protestant canon. This edition does not contain the Catholic or Orthodox deuterocanonical books.', unit:'Verse', chapterLabel:'Chapter', type:'bible', expectedBooks:66, expectedChapters:1189, blob:'68dc440406659661ed5cdc26b4971546ee12127d', url:'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/ASV.json', fallback:'https://cdn.jsdelivr.net/gh/scrollmapper/bible_databases@master/formats/json/ASV.json', sourceUrl:'https://github.com/scrollmapper/bible_databases/blob/master/formats/json/ASV.json', rights:'American Standard Version (1901), public domain in the United States. Digital text: Scrollmapper Bible Databases.'},
  {id:'tanakh-jps', religion:'Judaism', title:'The Tanakh', edition:'Jewish Publication Society · 1917', subtitle:'Torah, Prophets & Writings', detail:'JPS 1917 English translation. Multi-part books are listed separately for navigation; this is not a claim that the Jewish canon contains 39 books.', unit:'Verse', chapterLabel:'Chapter', type:'jps-vpl', expectedBooks:39, expectedChapters:929, sha256:'e139b51f1d2b0a0ca28d6037f7d15e360b80ba55df687efada6bb7a5367a6035', url:'https://ebible.org/Scriptures/engjps_vpl.zip', sourceUrl:'https://ebible.org/engjps/', rights:'JPS 1917 translation, public domain in the United States. Digital text: eBible.org. This is not the modern copyrighted JPS translation.'},
  {id:'quran-pickthall', religion:'Islam', title:'The Quran', edition:'Marmaduke Pickthall · English meaning', subtitle:'114 surahs', detail:'An English translation of the meaning, not the Arabic Quran. Read aloud uses a computer voice, not a recorded Arabic recitation.', unit:'Ayah', chapterLabel:'Surah', type:'quran', expectedBooks:1, expectedChapters:114, url:'https://read-aloud-production-148a.up.railway.app/data/quran-pickthall/source.txt', fallback:'https://tanzil.net/trans/en.pickthall', sourceUrl:'https://tanzil.net/trans/', rights:'Pickthall English translation, distributed by Tanzil for non-commercial use. This website has no advertising or paid access. Tanzil does not guarantee translation accuracy; see its terms. Do not monetize this edition without reviewing permissions.'},
  {id:'gita-arnold', religion:'Hinduism', title:'Bhagavad Gita', edition:'Sir Edwin Arnold · The Song Celestial', subtitle:'18 chapters', detail:'A historical poetic English rendering. Arnold makes interpretive choices and omissions, disclosed in his notes; this is not a verse-by-verse Sanskrit edition. Passage numbers are reader navigation, not canonical verse numbers.', unit:'Passage', chapterLabel:'Chapter', type:'gita', expectedBooks:1, expectedChapters:18, url:'https://read-aloud-production-148a.up.railway.app/data/gita-arnold/source.txt', fallback:'https://www.gutenberg.org/cache/epub/2388/pg2388.txt', sourceUrl:'https://www.gutenberg.org/ebooks/2388', rights:'The Song Celestial, translated by Sir Edwin Arnold. Public domain in the United States. Source: Project Gutenberg ebook 2388. Original ebook and its license are provided with this library.'},
  {id:'dhammapada-muller', religion:'Buddhism', title:'The Dhammapada', edition:'F. Max Müller · English translation', subtitle:'26 chapters', detail:'One Buddhist scripture, not the entire Buddhist canon. Original combined verse numbering is retained.', unit:'Verse', chapterLabel:'Chapter', type:'dhamma', expectedBooks:1, expectedChapters:26, url:'https://read-aloud-production-148a.up.railway.app/data/dhammapada-muller/source.txt', fallback:'https://www.gutenberg.org/files/2017/2017-0.txt', sourceUrl:'https://www.gutenberg.org/ebooks/2017', rights:'Dhammapada, translated by F. Max Müller. Public domain in the United States. Source: Project Gutenberg ebook 2017. Original ebook and its license are provided with this library.'}
];
export const slug = text => text.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const normalize = text => text.replace(/\r\n?/g,'\n').replace(/^\uFEFF/, '');
const roman = text => {const digits={I:1,V:5,X:10,L:50};return [...text].reduce((n,c,i)=>n+(digits[c]<digits[text[i+1]]?-digits[c]:digits[c]),0);};
export function parseBible(text, source) {
  const original = JSON.parse(text);
  if (!Array.isArray(original.books)) throw new Error('Unexpected Bible data schema');
  const allowedOmissions = new Set(['Matthew:17:21','Matthew:18:11','Matthew:23:14','Mark:7:16','Mark:9:44','Mark:9:46','Mark:11:26','Mark:15:28','Luke:17:36','Luke:23:17','John:5:4','Acts:8:37','Acts:15:34','Acts:24:7','Acts:28:29','Romans:16:24']);
  const books = original.books.map(book=>({id:slug(book.name), name:book.name, chapters:book.chapters.map(chapter=>{
    const omittedVerseNumbers=[];
    const verses=chapter.verses.filter(verse=>{
      if(typeof verse.text==='string'&&!verse.text.trim()) {
        const key=`${book.name}:${chapter.chapter}:${verse.verse}`;
        if(source.id!=='bible-asv'||!allowedOmissions.has(key))throw new Error(`Unreviewed empty source verse: ${key}`);
        omittedVerseNumbers.push(String(verse.verse));return false;
      }
      return true;
    }).map(verse=>({number:String(verse.verse),text:verse.text}));
    return {number:chapter.chapter,title:'',verses,...(omittedVerseNumbers.length?{omittedVerseNumbers}:{})};
  })}));
  if (source.id === 'tanakh-jps') {
    const order=['Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','I Samuel','II Samuel','I Kings','II Kings','Isaiah','Jeremiah','Ezekiel','Hosea','Joel','Amos','Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah','Haggai','Zechariah','Malachi','Psalms','Proverbs','Job','Song of Solomon','Ruth','Lamentations','Ecclesiastes','Esther','Daniel','Ezra','Nehemiah','I Chronicles','II Chronicles'];
    const key=s=>s.replace(/^1 /,'I ').replace(/^2 /,'II ').replace('Song of Songs','Song of Solomon');
    if (books.every(b=>order.includes(key(b.name)))) books.sort((a,b)=>order.indexOf(key(a.name))-order.indexOf(key(b.name)));
    else throw new Error('Unrecognized Tanakh book names; refusing to guess canonical order');
  }
  return books;
}
// Read one exact, checksum-pinned entry. No filesystem extraction or archive paths are used.
export function zipEntry(bytes, requestedName) {
  let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
  if(end<0)throw new Error('Invalid scripture ZIP');
  let offset=bytes.readUInt32LE(end+16); const entries=bytes.readUInt16LE(end+10);
  for(let i=0;i<entries;i++) {
    if(bytes.readUInt32LE(offset)!==0x02014b50)throw new Error('Invalid ZIP directory');
    const method=bytes.readUInt16LE(offset+10),length=bytes.readUInt32LE(offset+20),size=bytes.readUInt32LE(offset+24);
    const nameLength=bytes.readUInt16LE(offset+28),extraLength=bytes.readUInt16LE(offset+30),commentLength=bytes.readUInt16LE(offset+32);
    const name=bytes.subarray(offset+46,offset+46+nameLength).toString('utf8');
    if(name===requestedName) {
      if(size>10000000)throw new Error('Scripture ZIP entry is too large');
      const local=bytes.readUInt32LE(offset+42);
      if(bytes.readUInt32LE(local)!==0x04034b50)throw new Error('Invalid ZIP local header');
      const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28),compressed=bytes.subarray(start,start+length);
      const data=method===0?compressed:method===8?inflateRawSync(compressed,{maxOutputLength:10000000}):null;
      if(!data||data.length!==size)throw new Error('Invalid scripture ZIP entry');
      return data;
    }
    offset+=46+nameLength+extraLength+commentLength;
  }
  throw new Error(`Missing original source file ${requestedName}`);
}
export function parseJPS(bytes) {
  const names=[['GEN','Genesis'],['EXO','Exodus'],['LEV','Leviticus'],['NUM','Numbers'],['DEU','Deuteronomy'],['JOS','Joshua'],['JDG','Judges'],['1SA','I Samuel'],['2SA','II Samuel'],['1KI','I Kings'],['2KI','II Kings'],['ISA','Isaiah'],['JER','Jeremiah'],['EZE','Ezekiel'],['HOS','Hosea'],['JOE','Joel'],['AMO','Amos'],['OBA','Obadiah'],['JON','Jonah'],['MIC','Micah'],['NAH','Nahum'],['HAB','Habakkuk'],['ZEP','Zephaniah'],['HAG','Haggai'],['ZEC','Zechariah'],['MAL','Malachi'],['PSA','Psalms'],['PRO','Proverbs'],['JOB','Job'],['SOL','Song of Solomon'],['RUT','Ruth'],['LAM','Lamentations'],['ECC','Ecclesiastes'],['EST','Esther'],['DAN','Daniel'],['EZR','Ezra'],['NEH','Nehemiah'],['1CH','I Chronicles'],['2CH','II Chronicles']];
  const books=new Map(names.map(([code,name])=>[code,{id:slug(name),name,chapters:[]} ]));
  for(const line of normalize(zipEntry(bytes,'engjps_vpl.txt').toString('utf8')).split('\n').filter(Boolean)) {
    const match=line.match(/^(\w{3}) (\d+):(\d+) (.+)$/);
    if(!match||!books.has(match[1]))throw new Error('Unrecognized JPS source line');
    const book=books.get(match[1]),number=Number(match[2]);
    let chapter=book.chapters.find(c=>c.number===number);
    if(!chapter){chapter={number,title:'',verses:[]};book.chapters.push(chapter);}
    chapter.verses.push({number:match[3],text:match[4]});
  }
  return [...books.values()];
}
const SURA_LENGTHS=[7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6];
export function parseQuran(text) {
  const lines=normalize(text).split('\n').filter(line=>line.trim()&&!line.startsWith('#'));
  const numbered=lines.filter(line=>/^\d+[|:]\d+[|:]/.test(line));
  let rows;
  if (numbered.length) rows=numbered.map(line=>{const match=line.match(/^(\d+)[|:](\d+)[|:](.*)$/);return {c:Number(match[1]),v:Number(match[2]),text:match[3]};});
  else {
    if(lines.length!==6236) throw new Error(`Quran: expected 6236 ayahs, got ${lines.length}`);
    let cursor=0; rows=SURA_LENGTHS.flatMap((length,c)=>Array.from({length},(_,v)=>({c:c+1,v:v+1,text:lines[cursor++]})));
  }
  const chapters=SURA_LENGTHS.map((length,c)=>({number:c+1,title:'',verses:rows.filter(r=>r.c===c+1).map(r=>({number:String(r.v),text:r.text}))}));
  chapters.forEach((c,i)=>{if(c.verses.length!==SURA_LENGTHS[i]||c.verses.some((v,j)=>Number(v.number)!==j+1))throw new Error(`Invalid ayah sequence in surah ${i+1}`);});
  if(rows.length!==6236)throw new Error('Unexpected Quran ayah count');
  return [{id:'quran',name:'The Quran',chapters}];
}
export function parseGita(text) {
  const raw=normalize(text); const matches=[...raw.matchAll(/^[ \t]*CHAPTER ([IVX]+)[ \t]*$/gm)];
  const chapters=matches.map((m,i)=>{
    let body=raw.slice(m.index+m[0].length, matches[i+1]?.index??raw.length);
    body=body.split(/^[ \t]*HERE (?:ENDETH|ENDS)/m)[0].trim();
    const verses=[];
    for(const paragraph of body.split(/\n\s*\n/)) {
      const lines=paragraph.split('\n').map(s=>s.trim()).filter(Boolean);
      for(let offset=0;offset<lines.length;offset+=8)verses.push({number:String(verses.length+1),text:lines.slice(offset,offset+8).join('\n')});
    }
    return {number:roman(m[1]),title:'',verses};
  });
  return [{id:'gita',name:'Bhagavad Gita',chapters}];
}
export function parseDhamma(text) {
  const raw=normalize(text).split(/^\*\*\* END OF /m)[0];
  const matches=[...raw.matchAll(/^Chapter ([IVX]+)\.\s*([^\n]*)/gm)];
  const chapters=matches.map((m,i)=>{
    const body=raw.slice(m.index+m[0].length,matches[i+1]?.index??raw.length);
    const verses=[...body.matchAll(/^(\d+(?:,\s*\d+)*)\.\s+/gm)];
    return {number:roman(m[1]),title:m[2].trim(),verses:verses.map((v,j)=>({number:v[1].replace(/\s+/g,' '),text:body.slice(v.index+v[0].length,verses[j+1]?.index??body.length).trim().replace(/\s+/g,' ')}))};
  });
  const verseNumbers=chapters.flatMap(c=>c.verses.flatMap(v=>v.number.split(',').map(Number)));
  if(verseNumbers.length!==423||verseNumbers.some((v,i)=>v!==i+1))throw new Error('Dhammapada: all 423 original verse numbers must be present, in order');
  return [{id:'dhammapada',name:'The Dhammapada',chapters}];
}
export function validateBooks(books, source) {
  if(books.length!==source.expectedBooks)throw new Error(`${source.id}: expected ${source.expectedBooks} books, got ${books.length}`);
  const chapters=books.flatMap(b=>b.chapters);
  if(chapters.length!==source.expectedChapters)throw new Error(`${source.id}: expected ${source.expectedChapters} chapters, got ${chapters.length}`);
  if(new Set(books.map(b=>b.id)).size!==books.length)throw new Error('Duplicate book identifiers');
  for(const book of books)for(const [i,chapter]of book.chapters.entries()) {
    if(chapter.number!==i+1||!chapter.verses.length)throw new Error(`${source.id}/${book.name}: missing or out-of-order chapter ${i+1}`);
    const seen=new Set();
    for(const verse of chapter.verses) {
      if(typeof verse.text!=='string'||!verse.text.trim()||!/^\d+(?:,\s*\d+)*$/.test(verse.number)||seen.has(verse.number))throw new Error(`${source.id}: invalid/empty/duplicate passage`);
      if(/<(?:html|script|!DOCTYPE)/i.test(verse.text))throw new Error('HTML response instead of scripture');
      seen.add(verse.number);
    }
  }
  return {chapterCount:chapters.length,verseCount:chapters.reduce((n,c)=>n+c.verses.length,0)};
}
async function download(source) {
  const cache=resolve(ROOT,'.sources',source.id+'.txt');
  const digest=buffer=>createHash('sha1').update(`blob ${buffer.length}\0`).update(buffer).digest('hex');
  const check=buffer=>{if((source.blob&&digest(buffer)!==source.blob)||(source.sha256&&createHash('sha256').update(buffer).digest('hex')!==source.sha256))throw new Error(`Source checksum changed for ${source.id}. Review upstream before updating the pin.`);return buffer;};
  try{return check(await readFile(cache));}catch{}
  let last;
  for(const url of [source.url,source.fallback].filter(Boolean))for(let attempt=0;attempt<3;attempt++)try {
    const response=await fetch(url,{signal:AbortSignal.timeout(60000),headers:{'User-Agent':'ReadAloudLibrary/1.0 (non-commercial scripture reader)'}});
    if(!response.ok)throw new Error(`HTTP ${response.status} from ${url}`);
    const bytes=check(Buffer.from(await response.arrayBuffer()));
    if(bytes.length>30000000||bytes.length<10000)throw new Error(`Unexpected source size: ${bytes.length}`);
    await writeFile(cache,bytes);return bytes;
  }catch(error){last=error;console.warn(`${source.id}: download attempt failed: ${error.message}`);if(attempt<2)await new Promise(resolve=>setTimeout(resolve,750*(attempt+1)));}
  throw last;
}
export async function build() {
  await mkdir(resolve(ROOT,'.sources'),{recursive:true});
  const out=resolve(ROOT,'public/data'); await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
  const works=[];
  for(const source of SOURCES) {
    const bytes=await download(source);const raw=bytes.toString('utf8');
    const books=source.type==='jps-vpl'?parseJPS(bytes):source.type==='bible'?parseBible(raw,source):source.type==='quran'?parseQuran(raw):source.type==='gita'?parseGita(raw):parseDhamma(raw);
    const counts=validateBooks(books,source);
    const folder=resolve(out,source.id);await mkdir(folder,{recursive:true});
    for(const book of books)await writeFile(resolve(folder,`${book.id}.json`),JSON.stringify({workId:source.id,...book}));
    const {url,fallback,blob,sha256,type,expectedBooks,expectedChapters,...metadata}=source;
    const rawName=source.type==='jps-vpl'?'source.zip':source.type==='bible'?'source.json':'source.txt';await writeFile(resolve(folder,rawName),bytes);
    works.push({...metadata,...counts,sourceSha256:createHash('sha256').update(bytes).digest('hex'),originalFile:`./data/${source.id}/${rawName}`,books:books.map(b=>({id:b.id,name:b.name,chapters:b.chapters.map(c=>({number:c.number,title:c.title,count:c.verses.length}))}))});
    console.log(`${source.id}: ${books.length} books, ${counts.chapterCount} chapters, ${counts.verseCount} passages; source SHA256 ${works.at(-1).sourceSha256}`);
  }
  await writeFile(resolve(out,'catalog.json'),JSON.stringify({version:1,works}));
  console.log('Library build complete. All five editions validated; no runtime scripture API required.');
}
if(process.argv[1]===fileURLToPath(import.meta.url))build().catch(error=>{console.error(error);process.exitCode=1;});
