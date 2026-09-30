# GodEars

A free, non-commercial scripture reader. Choose a faith tradition, open a focused reading popup, turn pages, or press **Read aloud**. No account, payment, advertising, analytics, microphone permission, or AI-generated scripture.

## Experience

- Five identified English editions, served as actual complete imported texts rather than sample pages.
- Responsive desktop reading dialog and full-screen mobile reader.
- Book, chapter and verse/passage navigation; previous/next pages cross chapter and book boundaries.
- Read aloud, pause/resume, stop, speed and English voice selection, continuous reading, sleep timer and active-verse highlighting.
- Automatically saved edition/book/chapter/verse per scripture; **Continue reading** on return.
- Adjustable text size, paper/sepia/night appearance, private backup export/import, and history deletion.
- Keyboard-operable controls, native modal focus handling, source attribution, and real loading/error states.

## Run

Requires Node.js 22 or newer. No runtime packages or API keys are needed.

```sh
npm run build
npm start
```

Open `http://localhost:3000`. `PORT` is the only optional environment variable. Source files are fetched during the build and cached in `.sources/`; the deployed reader requests only same-origin static files. A failed source validation fails the build instead of shipping an incomplete library. Build output is `public/data/` and is intentionally not committed.

For static hosting, build once and publish **the entire `public/` folder**, including `data/`. Relative paths also support a project subdirectory. Do not publish the repository root. Docker and Railway configuration are included, but no paid hosting service or domain is provisioned by this code. Free visitor access is separate from hosting costs.

## Included editions and boundaries

| Tradition | Edition | Content |
|---|---|---|
| Christianity | American Standard Version (1901), Scrollmapper | 66-book Protestant Bible; 1,189 chapters |
| Judaism | JPS 1917, eBible.org | Torah, Prophets and Writings; 929 navigation chapters |
| Islam | Pickthall English translation of meanings, Tanzil | 114 surahs; 6,236 ayahs |
| Hinduism | Edwin Arnold, The Song Celestial, Gutenberg 2388 | 18 chapters of a historical poetic rendering |
| Buddhism | F. Max Müller, Dhammapada, Gutenberg 2017 | 26 chapters; all 423 verse numbers, some combined in the original |

These are selected editions, not every religion, translation, or canon. The Protestant Bible does not include Catholic/Orthodox deuterocanonical books. Multi-part Tanakh books are separate navigation volumes, not a claim that the Jewish canon contains 39 books. The Quran is an English rendering, not original Arabic, and narration is a computer voice, not Arabic recitation. Arnold's Gita is a poetic rendering with disclosed interpretive choices/omissions; its reader labels are passages, not Sanskrit verse numbers. The Dhammapada is not the entire Buddhist canon.

Scripture is not rewritten by AI. Text is escaped when displayed. Sixteen empty ASV source slots are disclosed beside their chapters and never filled with invented text or another translation. Original files and attribution remain accessible in **Texts & editions**. ASV and JPS sources are checksum pinned; the catalog records SHA-256 for every original source. Structure and numbering are validated, not claimed to be a scholarly verse-by-verse proof of transcription accuracy.

**Rights:** ASV 1901, JPS 1917, Arnold and Müller editions are public domain in the United States. The chosen Tanzil translation is supplied for **non-commercial use**. Keep this site free of ads and paid access unless permissions are independently cleared or that edition is replaced with a suitably licensed source. Preserve Gutenberg notices and original files. Check local copyright rules outside the US.

Sources: [ASV](https://github.com/scrollmapper/bible_databases/blob/master/formats/json/ASV.json), [JPS](https://ebible.org/engjps/), [Tanzil terms](https://tanzil.net/trans/), [Gita](https://www.gutenberg.org/ebooks/2388), [Dhammapada](https://www.gutenberg.org/ebooks/2017).

## Honest persistence and audio limits

Progress uses `localStorage` in the same browser and origin. It cannot be guaranteed forever: private browsing, clearing site data, storage restrictions, switching devices, and changing domains can remove access. Backup/restore provides manual transfer; automatic account-based cross-device sync is not implemented. Religious reading choices are not uploaded to an application account. Hosting providers may still keep normal request logs, and some operating-system/browser voices process text online.

Narration starts only on a click. Short speech chunks avoid oversized utterances; Resume replays the current short phrase. The stored position is a verse/passage, not an exact audio timestamp. Voices, pronunciation, availability and quality depend on the user's device. Narration pauses when the tab becomes hidden; background and lock-screen playback are not promised. No paid speech provider is required.

## Verification

```sh
npm run check
npm test
npm run build
# With the server running and Playwright installed:
python tests/browser.py
```

The GitHub Actions workflow builds real source data and tests desktop/mobile reading, saved-place restoration, page boundaries and the speech controller. Browser speech tests use a mocked device engine: they do **not** verify audible output on a physical iPhone/Android device. `/healthz` returns verified catalog counts or fails when the library is missing.
