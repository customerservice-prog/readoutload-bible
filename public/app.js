import {defaults, cleanState, readState, writeState, paginate, pageForVerse, speechChunks, adjacentChapter, escapeHTML as esc, WORK_IDS} from './core.js';
const $ = id => document.getElementById(id);
const icon = id => `<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;
let storage; try { storage = window.localStorage; } catch {}
let {state, available: storageAvailable} = readState(storage);
let works = [], activeWork = null, activeBook = null, bookIndex = 0, chapterIndex = 0, selectedVerse = 0, pages = [], pageIndex = 0, busy = false, requestToken = 0, suppressScrollUntil = 0, deepLinkHandled = false;
const bookCache = new Map();
const speechSupported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
const synth = speechSupported ? window.speechSynthesis : null;
let speechState = 'idle', audioToken = 0, chunkIndex = 0, utterance = null, startWatchdog, sleepTimer, sleepMinutes = 0;
const chapter = () => activeBook?.chapters[chapterIndex];
function applyPreferences() {
  document.documentElement.dataset.theme = state.preferences.theme;
  document.documentElement.style.setProperty('--reader-size', `${state.preferences.fontSize}px`);
  $('theme').value = state.preferences.theme; $('font-size').value = state.preferences.fontSize; $('font-value').textContent = `${state.preferences.fontSize}px`;
  $('continuous').checked = state.preferences.continuous; $('remember').checked = state.remember;
  if (![...$('speed').options].some(o=>Number(o.value)===state.preferences.rate)) $('speed').add(new Option(`${state.preferences.rate}×`, String(state.preferences.rate)));
  $('speed').value = String(state.preferences.rate);
}
function persist(merge = true) {
  if (merge && state.remember) {
    const other = readState(storage).state;
    for (const id of WORK_IDS) if ((other.progress[id]?.updatedAt || 0) > (state.progress[id]?.updatedAt || 0)) state.progress[id] = other.progress[id];
  }
  storageAvailable = writeState(storage, state);
  $('saved-label').textContent = !state.remember ? 'Saving is turned off' : storageAvailable ? 'Place saved on this device' : 'Not saved — browser storage unavailable';
  if (!storageAvailable) notice('This browser is not saving your place. You can still read; use Settings → Save a backup before leaving.');
}
function rememberPlace() {
  if (!activeWork || !chapter() || busy) return;
  if (state.remember) {
    state.lastWork = activeWork.id;
    state.progress[activeWork.id] = {book: activeBook.id, chapter: chapter().number, verse: chapter().verses[selectedVerse].number, updatedAt: Date.now()};
  }
  persist();
}
function notice(message) { $('global-notice').textContent = message; $('global-notice').hidden = false; }
function encodeProgressPayload(value) {
  const bytes=new TextEncoder().encode(JSON.stringify(cleanState(value)));let binary='';
  for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decodeProgressPayload(value) {
  const padded=value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4);
  const binary=atob(padded),bytes=Uint8Array.from(binary,ch=>ch.charCodeAt(0));
  const raw=JSON.parse(new TextDecoder().decode(bytes));
  if(raw.version!==1||!raw.progress||typeof raw.progress!=='object'||Array.isArray(raw.progress))throw new Error('Invalid progress link');
  return cleanState(raw);
}
async function copyProgressLink() {
  const status=$('progress-link-status');
  if(!state.remember||!Object.keys(state.progress).length){status.textContent='Read something first so there is a saved place to move.';return;}
  const url=`${location.origin}${location.pathname}#restore=${encodeProgressPayload(state)}`;
  try{await navigator.clipboard.writeText(url);status.textContent='Private progress link copied. Open it on your other device to restore your place.';}
  catch{window.prompt('Copy this private progress link:',url);status.textContent='Copy the link above and open it on your other device.';}
}
function message(text) { $('reader-message').textContent = text; $('reader-message').hidden = !text; }
function showDialog(id) { if (!$(id).open) $(id).showModal(); }
function updateHome() {
  const saved = state.remember && state.progress[state.lastWork]; const work = works.find(w=>w.id===state.lastWork);
  const hasSavedPlace = Boolean(saved && work);
  $('continue-section').hidden = !hasSavedPlace;
  for (const id of ['header-continue','mobile-continue']) if ($(id)) $(id).hidden = !hasSavedPlace;
  if (saved && work) {
    const book = work.books.find(b=>b.id===saved.book);
    $('continue-title').textContent = work.books.length > 1 ? `${book?.name || work.title} ${saved.chapter}` : `${work.title} · ${work.chapterLabel} ${saved.chapter}`;
    $('continue-detail').textContent = `${work.unit} ${saved.verse} · ${work.edition}`;
  }
  for (const element of document.querySelectorAll('.card-resume')) {
    const progress = state.remember && state.progress[element.dataset.for];
    element.hidden = !progress; element.textContent = progress ? 'Your place is saved · Continue →' : '';
  }
}
async function loadLibrary() {
  $('library-grid').setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('./data/catalog.json', {cache:'no-cache'});
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (!Array.isArray(data.works) || data.works.length !== WORK_IDS.length || !WORK_IDS.every(id=>data.works.some(w=>w.id===id))) throw new Error();
    works = data.works;
    $('library-grid').innerHTML = works.map((work,index)=>`<button class="tradition-card ${index===0?'featured':''}" data-work="${esc(work.id)}" aria-label="Open ${esc(work.religion)}: ${esc(work.title)}"><span class="book-cover" aria-hidden="true">${icon('book')}</span><span class="card-copy"><span class="eyebrow">${esc(work.religion)}</span><h3>${esc(work.title)}</h3><p>${esc(work.subtitle)}<br>${esc(work.edition)}</p><span class="card-resume" data-for="${esc(work.id)}" hidden></span></span><svg class="card-arrow" aria-hidden="true"><use href="#i-arrow"/></svg></button>`).join('');
    document.querySelectorAll('[data-work]').forEach(button=>button.addEventListener('click',()=>openWork(button.dataset.work)));
    updateHome();
    if (!deepLinkHandled) {
      deepLinkHandled = true;
      const params=new URLSearchParams(location.hash.slice(1)),restore=params.get('restore'),requested=params.get('read');
      if(restore){
        try{
          const restored=decodeProgressPayload(restore);
          if(confirm('Restore the saved reading places and settings from this private link on this device?')){
            state=restored;applyPreferences();persist(false);updateHome();notice('Your saved reading places were restored on this device.');
          }
        }catch{notice('This progress link could not be restored. Your current saved places were not changed.');}
        history.replaceState(null,'',location.pathname+location.search);
      }
      if (requested && works.some(work=>work.id===requested)) {
        history.replaceState(null,'',location.pathname+location.search);
        await openWork(requested);
      }
    }
  } catch {
    $('library-grid').innerHTML = '<div class="load-message" role="alert">The library could not be loaded. Your saved places have not been changed.<br><button id="retry-library" class="button subtle">Try again</button></div>';
    $('retry-library').addEventListener('click', loadLibrary);
  } finally { $('library-grid').setAttribute('aria-busy','false'); }
}
function setBusy(value) {
  busy = value;
  for (const id of ['book-select','chapter-select','verse-select','prev-page','next-page']) $(id).disabled = value;
  $('reading-content').setAttribute('aria-busy', String(value));
  updateAudioUI();
}
async function getBook(work, book) {
  const key = `${work.id}/${book.id}`;
  if (!bookCache.has(key)) bookCache.set(key, fetch(`./data/${key}.json`).then(async response=>{
    if(!response.ok)throw new Error('Book unavailable'); const data=await response.json();
    if(data.workId!==work.id||data.id!==book.id||!Array.isArray(data.chapters)||data.chapters.length!==book.chapters.length)throw new Error('Invalid book data');
    return data;
  }).catch(error=>{bookCache.delete(key);throw error;}));
  return bookCache.get(key);
}
async function openWork(id) {
  const work = works.find(w=>w.id===id); if (!work) return;
  stopSpeech(); activeWork = work; activeBook = null;
  $('reader-title').textContent = work.title; $('reader-tradition').textContent = work.religion;
  $('reader-edition').textContent = work.edition; $('chapter-label').textContent = work.chapterLabel; $('verse-label').textContent = work.unit;
  $('book-field').hidden = work.books.length === 1;
  $('book-select').replaceChildren(...work.books.map(book=>new Option(book.name, book.id)));
  const saved = state.remember && state.progress[id];
  const b = saved ? Math.max(0,work.books.findIndex(book=>book.id===saved.book)) : 0;
  const c = saved ? Math.max(0,work.books[b].chapters.findIndex(ch=>ch.number===saved.chapter)) : 0;
  showDialog('reader');
  await loadLocation(b,c,saved?.verse);
}
async function loadLocation(b,c,verse = null,automatic = false,lastPage = false) {
  if(!automatic)stopSpeech();
  const token=++requestToken, work=activeWork;
  setBusy(true); message(''); $('reading-content').innerHTML='<div class="load-message" role="status">Opening your page…</div>';
  $('book-select').value=work.books[b].id;
  $('chapter-select').replaceChildren(...work.books[b].chapters.map(ch=>new Option(`${work.chapterLabel} ${ch.number}${ch.title?' · '+ch.title:''}`,String(ch.number))));
  $('chapter-select').value=String(work.books[b].chapters[c].number);
  $('verse-select').replaceChildren();
  try {
    const data=await getBook(work,work.books[b]);
    if(token!==requestToken||!$('reader').open)return false;
    activeBook=data;bookIndex=b;chapterIndex=c;
    if(!chapter()?.verses?.length)throw new Error('Chapter unavailable');
    selectedVerse=verse?Math.max(0,chapter().verses.findIndex(v=>v.number===verse)):0;
    pages=paginate(chapter().verses);pageIndex=lastPage?pages.length-1:pageForVerse(pages,selectedVerse);
    if(lastPage)selectedVerse=pages[pageIndex].start;
    $('verse-select').replaceChildren(...chapter().verses.map(v=>new Option(v.number,v.number)));
    setBusy(false);renderPage();rememberPlace();return true;
  } catch {
    if(token!==requestToken||!$('reader').open)return false;
    stopSpeech();
    $('reading-content').innerHTML='<div class="load-message" role="alert">This page could not be opened.<br>Your previous saved place is safe.<br><button class="button subtle" id="retry-book">Try again</button></div>';
    $('retry-book').addEventListener('click',()=>loadLocation(b,c,verse,false,lastPage));
    // Keep navigation disabled: old book data must not overwrite the saved place.
    $('book-select').disabled=false;return false;
  }
}
function renderPage() {
  suppressScrollUntil=Date.now()+650;
  const ch=chapter(),page=pages[pageIndex];
  const heading=activeWork.books.length>1?`${activeBook.name} ${ch.number}`:`${activeWork.chapterLabel} ${ch.number}`;
  $('reading-content').innerHTML=`<header class="chapter-heading"><span class="eyebrow">${esc(activeWork.title)}</span><h3>${esc(heading)}</h3>${ch.title?`<p>${esc(ch.title)}</p>`:''}<p>Tap a ${activeWork.unit.toLowerCase()} to read from there.</p>${ch.omittedVerseNumbers?.length?`<p class="edition-note">Source note (not scripture): this edition has no text for verse ${esc(ch.omittedVerseNumbers.join(', '))}. Original numbering is retained.</p>`:''}</header>`+ch.verses.slice(page.start,page.end).map((verse,i)=>`<p class="verse${page.start+i===selectedVerse?' selected':''}" tabindex="0" role="button" aria-label="Start at ${esc(activeWork.unit)} ${esc(verse.number)}" data-verse="${page.start+i}"><span class="verse-number">${esc(verse.number)}</span>${esc(verse.text)}</p>`).join('');
  $('reading-content').querySelectorAll('[data-verse]').forEach(element=>{
    const select=()=>{stopSpeech();selectedVerse=Number(element.dataset.verse);chunkIndex=0;highlight();rememberPlace();};
    element.addEventListener('click',select);element.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();select();}});
  });
  $('reading-scroll').scrollTop=0;
  $('page-label').textContent=`Page ${pageIndex+1} of ${pages.length} · ${activeWork.chapterLabel} ${ch.number}`;
  $('prev-page').disabled=pageIndex===0&&!adjacentChapter(activeWork.books,bookIndex,chapterIndex,-1);
  $('next-page').disabled=pageIndex===pages.length-1&&!adjacentChapter(activeWork.books,bookIndex,chapterIndex,1);
  highlight();
  requestAnimationFrame(()=>{ if(selectedVerse!==page.start)$('reading-content').querySelector(`[data-verse="${selectedVerse}"]`)?.scrollIntoView({block:'nearest'}); });
}
function highlight() {
  for(const element of $('reading-content').querySelectorAll('[data-verse]')) {
    const selected=Number(element.dataset.verse)===selectedVerse;
    element.classList.toggle('selected',selected);element.classList.toggle('speaking',selected&&speechState==='playing');
    element.setAttribute('aria-pressed',String(selected));
  }
  if(chapter())$('verse-select').value=chapter().verses[selectedVerse].number;
}
async function goPage(direction,automatic=false) {
  if(busy)return false;if(!automatic)stopSpeech();chunkIndex=0;
  const next=pageIndex+direction;
  if(next>=0&&next<pages.length){pageIndex=next;selectedVerse=pages[next].start;renderPage();rememberPlace();return true;}
  const location=adjacentChapter(activeWork.books,bookIndex,chapterIndex,direction);
  if(!location)return false;
  return loadLocation(location.bookIndex,location.chapterIndex,null,automatic,direction<0);
}
function updateAudioUI() {
  const running=['playing','starting'].includes(speechState);
  $('read-aloud').innerHTML=icon(running?'pause':speechState==='paused'?'play':'volume')+`<span>${running?'Pause':speechState==='paused'?'Resume':'Read aloud'}</span>`;
  $('read-aloud').disabled=busy||!speechSupported;
  $('stop-audio').disabled=speechState==='idle';
  if(!speechSupported)$('audio-status').textContent='Read aloud is not supported in this browser.';
}
function stopSpeech(status='Listen with your device’s voice',paused=false) {
  audioToken++;clearTimeout(startWatchdog);clearTimeout(sleepTimer);sleepTimer=null;
  synth?.cancel();utterance=null;speechState=paused?'paused':'idle';if(!paused)chunkIndex=0;
  $('audio-status').textContent=status;updateAudioUI();highlight();
}
function pauseSpeech(reason='Paused · Resume replays the current short phrase') {stopSpeech(reason,true);rememberPlace();}
function beginSpeech() {
  if(busy||!chapter()||!speechSupported)return;
  if(['playing','starting'].includes(speechState)){pauseSpeech();return;}
  if(speechState!=='paused')chunkIndex=0;
  const token=++audioToken;synth.cancel();synth.resume?.();speechState='starting';message('');updateAudioUI();
  $('audio-status').textContent='Starting your device’s voice…';
  if(sleepMinutes){clearTimeout(sleepTimer);sleepTimer=setTimeout(()=>pauseSpeech('Sleep timer finished. Your place is saved.'),sleepMinutes*60000);}
  speakUnit(token);
}
function speakUnit(token) {
  if(token!==audioToken||!$('reader').open)return;
  const verses=chapter().verses,chunks=speechChunks(verses[selectedVerse].text);
  if(chunkIndex>=chunks.length)chunkIndex=0;
  utterance=new SpeechSynthesisUtterance(chunks[chunkIndex]);utterance.lang='en-US';utterance.rate=state.preferences.rate;
  const voices=synth.getVoices();const preferred=voices.find(v=>v.voiceURI===state.preferences.voice&&/^en\b/i.test(v.lang));
  const fallback=voices.find(v=>/^en\b/i.test(v.lang)&&v.default)||voices.find(v=>/^en\b/i.test(v.lang));
  if(preferred||fallback)utterance.voice=preferred||fallback;
  utterance.onstart=()=>{if(token!==audioToken)return;clearTimeout(startWatchdog);speechState='playing';$('audio-status').textContent=`Reading ${activeWork.unit.toLowerCase()} ${verses[selectedVerse].number}`;updateAudioUI();highlight();rememberPlace();suppressScrollUntil=Date.now()+650;$('reading-content').querySelector(`[data-verse="${selectedVerse}"]`)?.scrollIntoView({block:'nearest'});};
  utterance.onerror=event=>{if(token!==audioToken)return;stopSpeech('Audio unavailable');message(`Your device could not read this text (${event.error || 'voice unavailable'}). Try another voice in Settings or another browser. Your reading place is unchanged.`);};
  utterance.onend=async()=>{
    if(token!==audioToken)return;clearTimeout(startWatchdog);
    chunkIndex++;
    if(chunkIndex<chunks.length){speakUnit(token);return;}
    chunkIndex=0;
    const next=selectedVerse+1;
    if(next<pages[pageIndex].end){selectedVerse=next;highlight();rememberPlace();speakUnit(token);return;}
    if(!state.preferences.continuous){stopSpeech('Page finished · turn the page to continue');return;}
    const advanced=await goPage(1,true);
    if(token!==audioToken)return;
    if(!advanced){stopSpeech('You reached the end of this edition.');return;}
    speakUnit(token);
  };
  clearTimeout(startWatchdog);startWatchdog=setTimeout(()=>{if(token!==audioToken)return;stopSpeech('Voice did not start');message('No voice started on this device. Choose an English voice in Settings, check your device’s speech settings, or try another browser.');},12000);
  synth.speak(utterance);
}
function populateVoices() {
  const voices=(synth?.getVoices()||[]).filter(v=>/^en\b/i.test(v.lang));
  $('voice').replaceChildren(new Option('Device default (English)',''),...voices.map(v=>new Option(`${v.name}${v.localService?' · device':' · online'}`,v.voiceURI)));
  $('voice').value=voices.some(v=>v.voiceURI===state.preferences.voice)?state.preferences.voice:'';
  if ($('test-voice')) $('test-voice').disabled=!speechSupported;
}
function testVoice() {
  if(!speechSupported){$('voice-test-status').textContent='Read aloud is not supported in this browser.';return;}
  synth.cancel();synth.resume?.();
  const sample=new SpeechSynthesisUtterance('Read Aloud voice check. Your listening voice is ready.');
  sample.lang='en-US';sample.rate=state.preferences.rate;
  const voices=synth.getVoices(),preferred=voices.find(v=>v.voiceURI===$('voice').value&&/^en\b/i.test(v.lang)),fallback=voices.find(v=>/^en\b/i.test(v.lang)&&v.default)||voices.find(v=>/^en\b/i.test(v.lang));
  if(preferred||fallback)sample.voice=preferred||fallback;
  $('voice-test-status').textContent='Starting voice test…';
  sample.onstart=()=>{$('voice-test-status').textContent='Voice started. If you can hear this, read aloud is ready.';};
  sample.onend=()=>{$('voice-test-status').textContent='Voice test finished successfully.';};
  sample.onerror=event=>{$('voice-test-status').textContent=`Voice test failed (${event.error||'voice unavailable'}). Try another voice or browser.`;};
  synth.speak(sample);
}
function openSettings() {if(['playing','starting'].includes(speechState))pauseSpeech('Paused while settings are open');applyPreferences();populateVoices();$('settings-status').textContent='';$('progress-link-status').textContent='';$('voice-test-status').textContent=speechSupported?'Use this before a long listening session.':'Read aloud is not supported in this browser.';showDialog('settings');}
function information(title,html) {if(['playing','starting'].includes(speechState))pauseSpeech();$('information-title').textContent=title;$('information-content').innerHTML=html;showDialog('information');}
function sources(only=null) {
  information('Texts & editions','<p>Scripture is reproduced from identified editions, not generated by AI. Translations and religious canons differ. The library does not claim to contain every religion or every sacred text.</p>'+(only?[only]:works).map(work=>`<section><h3>${esc(work.title)}</h3><p><strong>${esc(work.edition)}</strong></p><p>${esc(work.detail)}</p><p>${esc(work.rights)}</p><p><a href="${esc(work.sourceUrl)}" target="_blank" rel="noopener noreferrer">Source & edition information ↗</a> · <a href="${esc(work.originalFile)}" target="_blank" rel="noopener noreferrer">Original source file</a></p></section>`).join('')+'<p>For use outside the United States, check applicable copyright rules. This site is free and non-commercial; some source permissions specifically require that.</p>');
}
for(const id of ['continue-reading','header-continue','mobile-continue']) $(id)?.addEventListener('click',()=>openWork(state.lastWork));
$('close-reader').addEventListener('click',()=>$('reader').close());
$('reader').addEventListener('close',()=>{requestToken++;stopSpeech();updateHome();});
$('reader').addEventListener('cancel',()=>stopSpeech());
$('prev-page').addEventListener('click',()=>goPage(-1));$('next-page').addEventListener('click',()=>goPage(1));
$('read-aloud').addEventListener('click',beginSpeech);$('stop-audio').addEventListener('click',()=>stopSpeech());
$('book-select').addEventListener('change',()=>loadLocation(activeWork.books.findIndex(b=>b.id===$('book-select').value),0));
$('chapter-select').addEventListener('change',()=>loadLocation(bookIndex,activeWork.books[bookIndex].chapters.findIndex(c=>c.number===Number($('chapter-select').value))));
$('verse-select').addEventListener('change',()=>{const value=$('verse-select').value;stopSpeech();selectedVerse=chapter().verses.findIndex(v=>v.number===value);pageIndex=pageForVerse(pages,selectedVerse);renderPage();rememberPlace();});
$('reader').addEventListener('keydown',event=>{
  if($('settings').open||$('information').open||busy||['INPUT','SELECT','TEXTAREA','BUTTON'].includes(event.target.tagName)||event.altKey||event.ctrlKey||event.metaKey)return;
  if(event.key==='ArrowRight'){event.preventDefault();goPage(1);}if(event.key==='ArrowLeft'){event.preventDefault();goPage(-1);}
});
let scrollDebounce;
$('reading-scroll').addEventListener('scroll',()=>{clearTimeout(scrollDebounce);scrollDebounce=setTimeout(()=>{
  if(busy||Date.now()<suppressScrollUntil||speechState!=='idle'||!chapter())return;
  const top=$('reading-scroll').getBoundingClientRect().top+20;
  const element=[...$('reading-content').querySelectorAll('[data-verse]')].find(e=>e.getBoundingClientRect().bottom>top);
  if(element){selectedVerse=Number(element.dataset.verse);highlight();rememberPlace();}
},160);},{passive:true});
for(const id of ['open-settings','reader-settings'])$(id).addEventListener('click',openSettings);
for(const button of document.querySelectorAll('[data-close]'))button.addEventListener('click',()=>$(button.dataset.close).close());
$('theme').addEventListener('change',()=>{state.preferences.theme=$('theme').value;applyPreferences();persist();});
$('font-size').addEventListener('input',()=>{state.preferences.fontSize=Number($('font-size').value);applyPreferences();persist();});
$('voice').addEventListener('change',()=>{state.preferences.voice=$('voice').value;$('voice-test-status').textContent='Voice changed · test it before listening.';persist();});
$('test-voice').addEventListener('click',testVoice);
$('speed').addEventListener('change',()=>{const running=speechState!=='idle';state.preferences.rate=Number($('speed').value);if(running)pauseSpeech('Speed changed · press Resume');persist();});
$('continuous').addEventListener('change',()=>{state.preferences.continuous=$('continuous').checked;persist();});
$('sleep-timer').addEventListener('change',()=>{sleepMinutes=Number($('sleep-timer').value);});
$('remember').addEventListener('change',()=>{
  if(!$('remember').checked&&!confirm('Turn off saving and remove saved reading places from this browser?')){$('remember').checked=true;return;}
  state.remember=$('remember').checked;
  if(!state.remember){state.progress={};state.lastWork=null;persist(false);}else rememberPlace();
  persist(false);updateHome();$('settings-status').textContent=state.remember?'Saving is on for this browser.':'Saving is off. You can read without keeping a history.';
});
$('export-progress').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify(cleanState(state),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='read-aloud-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('settings-status').textContent='Backup created. It contains your reading choices, so keep it somewhere private.';
});
$('import-progress').addEventListener('click',()=>$('import-file').click());
$('copy-progress-link').addEventListener('click',copyProgressLink);
$('import-file').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try {
    if(file.size>500000)throw new Error('This file is too large to be a reading backup.');
    const raw=JSON.parse(await file.text());if(raw.version!==1||!raw.progress||typeof raw.progress!=='object'||Array.isArray(raw.progress))throw new Error('This is not a supported Read Aloud backup.');
    const restored=cleanState(raw);if(!confirm('Restore this backup? Saved places and settings in this browser will be replaced.'))return;
    if($('reader').open)$('reader').close();state=restored;applyPreferences();persist(false);updateHome();$('settings-status').textContent='Backup restored. Your saved place is ready in the library.';
  }catch(error){$('settings-status').textContent=error instanceof SyntaxError?'That file is not valid JSON.':error.message;}
  finally{event.target.value='';}
});
$('clear-progress').addEventListener('click',()=>{
  if(!confirm('Forget all saved reading places in this browser? Your text and voice settings will stay.'))return;
  state.progress={};state.lastWork=null;persist(false);updateHome();$('settings-status').textContent='Reading history removed. New reading progress will be saved while Remember my place is enabled.';
});
$('open-sources').addEventListener('click',()=>sources());$('reader-edition').addEventListener('click',()=>sources(activeWork));
$('open-privacy').addEventListener('click',()=>information('Your place. Your privacy.','<p>No account, payment, advertising, or analytics is required. You do not need to tell us your religion; everyone may explore any text.</p><h3>Saved on this device</h3><p>When enabled, this browser stores your selected edition, book, chapter, verse or passage, and reading preferences. These choices are not sent to an application account or a reading-history server. Settings lets you turn saving off, delete your places, or save a private backup.</p><p>Local saving cannot be guaranteed forever. Private browsing, clearing site data, browser storage limits, and device changes can remove it. Backups can be restored on another device; automatic cross-device sync is not included.</p><h3>Listening</h3><p>Read aloud uses your device’s speech service. Some voices process text online through the browser or operating-system provider. No microphone access is needed. Narration pauses when the page becomes hidden; lock-screen and background listening are not promised.</p><h3>Hosting</h3><p>The hosting provider may keep standard access logs, including requested file paths and IP addresses. The site itself does not add tracking scripts or advertising cookies. All scripture requests are served by this site, not by third-party scripture APIs during reading.</p>'));
window.addEventListener('pagehide',()=>{stopSpeech();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&['playing','starting'].includes(speechState))pauseSpeech('Paused because the page is in the background · press Resume');});
synth?.addEventListener('voiceschanged',populateVoices);
applyPreferences();populateVoices();updateAudioUI();loadLibrary();
if(!storageAvailable)notice('Your browser has not made saved storage available. Reading still works; use Settings to save a backup.');
