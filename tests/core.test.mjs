import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,cleanState,readState,writeState,paginate,pageForVerse,speechChunks,adjacentChapter,escapeHTML,STORE_KEY} from '../public/core.js';
import {parseBible,parseQuran,parseGita,parseDhamma,validateBooks,SOURCES,sourceUrls,catalogMetadata} from '../scripts/build.mjs';
test('defaults do not assert a religion or create fake progress',()=>{assert.equal(defaults().lastWork,null);assert.deepEqual(defaults().progress,{});});
test('reading places survive serialization at verse precision',()=>{let value=null;const storage={getItem:()=>value,setItem:(k,v)=>{assert.equal(k,STORE_KEY);value=v;}};const state=defaults();state.lastWork='bible-asv';state.progress['bible-asv']={book:'genesis',chapter:12,verse:'8',updatedAt:5};assert.equal(writeState(storage,state),true);assert.deepEqual(readState(storage).state,state);});
test('editions retain independent progress',()=>{const state=defaults();state.progress['bible-asv']={book:'genesis',chapter:2,verse:'3',updatedAt:1};state.progress['tanakh-jps']={book:'genesis',chapter:5,verse:'7',updatedAt:2};assert.equal(cleanState(state).progress['bible-asv'].chapter,2);assert.equal(cleanState(state).progress['tanakh-jps'].chapter,5);});
test('disabling saving discards stored reading choices',()=>{const state=defaults();state.remember=false;state.lastWork='bible-asv';state.progress['bible-asv']={book:'genesis',chapter:1,verse:'1'};assert.deepEqual(cleanState(state).progress,{});assert.equal(cleanState(state).lastWork,null);});
test('corrupt storage is recoverable',()=>assert.equal(readState({getItem:()=>'{bad json'}).available,false));
test('denied storage never claims it saved',()=>assert.equal(writeState({setItem:()=>{throw new Error('QuotaExceededError');}},defaults()),false));
test('unsafe imported values are discarded',()=>{const state=cleanState({version:1,lastWork:'other',progress:{'bible-asv':{book:'../../etc/passwd',chapter:1,verse:'1'}},preferences:{fontSize:500,rate:-4,theme:'<script>'}});assert.deepEqual(state.progress,{});assert.equal(state.lastWork,null);assert.equal(state.preferences.fontSize,32);assert.equal(state.preferences.rate,.6);assert.equal(state.preferences.theme,'paper');});
test('pagination never loses or duplicates passages',()=>{const verses=Array.from({length:24},(_,i)=>({number:String(i+1),text:'word '.repeat(34)}));const pages=paginate(verses);const indices=pages.flatMap(p=>Array.from({length:p.end-p.start},(_,i)=>p.start+i));assert.deepEqual(indices,Array.from({length:24},(_,i)=>i));assert.equal(pageForVerse(pages,22),4);});
test('very long verses remain intact on a page',()=>{const verses=[{text:'word '.repeat(1000)},{text:'short'}];assert.deepEqual(paginate(verses),[{start:0,end:1},{start:1,end:2}]);});
test('speech chunks preserve every word and remain short',()=>{const text='This is a sentence. '.repeat(100);const chunks=speechChunks(text);assert.equal(chunks.join(' '),text.trim());assert.ok(chunks.every(c=>c.length<=220));});
test('speech handles unbroken text without an infinite loop',()=>assert.equal(speechChunks('a'.repeat(1000)).join(''),'a'.repeat(1000)));
test('navigation crosses books and stops at both ends',()=>{const books=[{chapters:[1,2]},{chapters:[1,2,3]}];assert.equal(adjacentChapter(books,0,0,-1),null);assert.deepEqual(adjacentChapter(books,0,1,1),{bookIndex:1,chapterIndex:0});assert.deepEqual(adjacentChapter(books,1,0,-1),{bookIndex:0,chapterIndex:1});assert.equal(adjacentChapter(books,1,2,1),null);});
test('source text is escaped instead of interpreted as markup',()=>assert.equal(escapeHTML('<script>"&'), '&lt;script&gt;&quot;&amp;'));
test('Bible parser preserves supplied words and numbering',()=>{const books=parseBible(JSON.stringify({books:[{name:'Example',chapters:[{chapter:1,verses:[{verse:1,text:'Test fixture.'}]}]}]}),{id:'test'});assert.equal(books[0].chapters[0].verses[0].text,'Test fixture.');});
test('invalid source schemas fail closed',()=>{assert.throws(()=>parseBible('{}',{id:'test'}));assert.throws(()=>parseQuran('<html>an outage</html>'));assert.throws(()=>parseDhamma('partial text'));assert.throws(()=>validateBooks([],{id:'test',expectedBooks:1,expectedChapters:1}));});
test('poetic paragraphs use passage labels, preserving words and lines',()=>{const books=parseGita('CHAPTER I\n\nLine one.\nLine two.\n\nHERE ENDETH CHAPTER I.\n');assert.equal(books[0].chapters[0].verses[0].text,'Line one.\nLine two.');assert.equal(books[0].chapters[0].verses[0].number,'1');});

test('reviewed empty ASV slots remain disclosed, never invented',()=>{const books=parseBible(JSON.stringify({books:[{name:'Matthew',chapters:[{chapter:17,verses:[{verse:20,text:'Test fixture.'},{verse:21,text:''}]}]}]}),{id:'bible-asv'});assert.deepEqual(books[0].chapters[0].omittedVerseNumbers,['21']);assert.equal(books[0].chapters[0].verses.length,1);});
test('unreviewed missing scripture fails instead of being silently omitted',()=>assert.throws(()=>parseBible(JSON.stringify({books:[{name:'Genesis',chapters:[{chapter:1,verses:[{verse:1,text:''}]}]}]}),{id:'bible-asv'}),/Unreviewed/));
test('indented poetic chapter markers are parsed',()=>{const books=parseGita('CHAPTER I\n\nFirst chapter.\n  HERE ENDS CHAPTER I.\n\n  CHAPTER II\n\nSecond chapter.\n  HERE ENDETH CHAPTER II.');assert.equal(books[0].chapters.length,2);assert.equal(books[0].chapters[1].verses[0].text,'Second chapter.');});
test('builds prefer godears.org copies, then the Railway mirror, then the upstream publisher',()=>{
  for(const id of ['quran-pickthall','gita-arnold','dhammapada-muller']){
    const urls=sourceUrls(SOURCES.find(s=>s.id===id));
    assert.equal(urls[0],`https://godears.org/data/${id}/source.txt`);
    assert.equal(urls[1],`https://read-aloud-production-148a.up.railway.app/data/${id}/source.txt`);
    assert.equal(urls.length,3);assert.doesNotMatch(urls[2],/godears|railway/);
  }
});
test('published catalog metadata never includes download or checksum plumbing',()=>{
  for(const source of SOURCES){const metadata=catalogMetadata(source);for(const key of ['url','mirrors','fallback','blob','sha256','type','expectedBooks','expectedChapters'])assert.ok(!(key in metadata),`${source.id} leaks ${key}`);assert.equal(metadata.id,source.id);}
});
