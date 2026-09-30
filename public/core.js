export const STORE_KEY = 'read-aloud:library:v1';
export const WORK_IDS = ['bible-asv', 'tanakh-jps', 'quran-pickthall', 'gita-arnold', 'dhammapada-muller'];
export const defaults = () => ({version: 1, remember: true, lastWork: null, progress: {}, preferences: {theme: 'paper', fontSize: 22, rate: 1, voice: '', continuous: true}});
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export function cleanState(input) {
  const state = defaults();
  if (!input || input.version !== 1) return state;
  state.remember = input.remember !== false;
  state.lastWork = WORK_IDS.includes(input.lastWork) ? input.lastWork : null;
  const p = input.preferences || {};
  state.preferences = {
    theme: ['paper', 'sepia', 'night'].includes(p.theme) ? p.theme : 'paper',
    fontSize: Number.isFinite(p.fontSize) ? clamp(p.fontSize, 18, 32) : 22,
    rate: Number.isFinite(p.rate) ? clamp(p.rate, 0.6, 1.5) : 1,
    voice: typeof p.voice === 'string' ? p.voice.slice(0, 300) : '',
    continuous: p.continuous !== false
  };
  for (const id of WORK_IDS) {
    const item = input.progress?.[id];
    if (!item || typeof item.book !== 'string' || !/^[a-z0-9-]{1,80}$/.test(item.book) || !Number.isInteger(item.chapter) || item.chapter < 1 || item.chapter > 200) continue;
    state.progress[id] = {
      book: item.book, chapter: item.chapter,
      verse: typeof item.verse === 'string' && /^[0-9, -]{1,24}$/.test(item.verse) ? item.verse : '1',
      updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : 0
    };
  }
  if (!state.remember) { state.progress = {}; state.lastWork = null; }
  return state;
}
export function readState(storage) {
  try { return {state: cleanState(JSON.parse(storage.getItem(STORE_KEY))), available: true}; }
  catch { return {state: defaults(), available: false}; }
}
export function writeState(storage, state) {
  try { storage.setItem(STORE_KEY, JSON.stringify(cleanState(state))); return true; }
  catch { return false; }
}
// Page boundaries depend on the text, not viewport size. A saved verse survives reflow.
export function paginate(verses, maxWords = 170) {
  if (!verses.length) return [];
  const pages = []; let start = 0, words = 0;
  verses.forEach((verse, i) => {
    const count = verse.text.trim().split(/\s+/).length;
    if (words && words + count > maxWords) { pages.push({start, end: i}); start = i; words = 0; }
    words += count;
  });
  pages.push({start, end: verses.length});
  return pages;
}
export function pageForVerse(pages, index) {
  return Math.max(0, pages.findIndex(page => index >= page.start && index < page.end));
}
// Short utterances avoid the long-utterance failures found on some speech engines.
export function speechChunks(text, limit = 220) {
  let remaining = text.replace(/\s+/g, ' ').trim(); const chunks = [];
  while (remaining.length > limit) {
    const prefix = remaining.slice(0, limit + 1);
    let cut = Math.max(prefix.lastIndexOf('. '), prefix.lastIndexOf('? '), prefix.lastIndexOf('! '));
    if (cut < limit / 3) cut = prefix.lastIndexOf(' ');
    else cut += 1;
    if (cut < 1) cut = limit;
    chunks.push(remaining.slice(0, cut)); remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
export function adjacentChapter(books, bookIndex, chapterIndex, direction) {
  const candidate = chapterIndex + direction;
  if (candidate >= 0 && candidate < books[bookIndex].chapters.length) return {bookIndex, chapterIndex: candidate};
  const nextBook = bookIndex + direction;
  if (nextBook < 0 || nextBook >= books.length) return null;
  return {bookIndex: nextBook, chapterIndex: direction > 0 ? 0 : books[nextBook].chapters.length - 1};
}
export function escapeHTML(text) {
  return String(text).replace(/[&<>"']/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[ch]));
}
