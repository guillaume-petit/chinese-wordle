# 词语 Daily

A mobile-first Chinese vocabulary puzzle MVP built with React, TypeScript, and Vite.

## Run locally

```sh
npm install
npm run dev
```

`npm test`, `npm run typecheck`, and `npm run build` run the unit tests, strict TypeScript check, and production build.

## MVP features

- A daily two-character puzzle that rolls over at midnight in `Asia/Shanghai`, plus offline practice.
- Pinyin autocomplete (tone marks/numbers, `ü`/`v`, optional syllable separators, abbreviations) and direct simplified/traditional character entry.
- Character-only occurrence-aware feedback, an always-visible topic, optional sentence hints, result sharing, saved words, history, and local statistics.
- Local browser storage, responsive styling, keyboard/IME safeguards, reduced-motion support, and an installable PWA app shell.

Accepted guesses and autocomplete use a bundled two-character **CC-CEDICT** snapshot, not a live API. Curated answers come only from approved spreadsheet rows. The MVP examples have been removed; the spreadsheet now contains imported TOCFL candidates and excluded words. All dictionary readings are searchable and written variants share one suggestion.

## Refresh the dictionary

Download the UTF-8 gzip snapshot from [MDBG's CC-CEDICT download page](https://www.mdbg.net/chinese/dictionary?page=cc-cedict) to `content\cedict-source.txt.gz`, then run:

```powershell
npm run content:build -- --source content\cedict-source.txt.gz
npm run test:importer
```

The importer writes the full `src\generated\dictionary.json` (used by content tools and tests) and a compact `src\generated\dictionary.runtime.json` (about 3.6 MB raw / 1.4 MB gzip instead of 20 MB / 3.3 MB). The app does not bundle either into its JavaScript: it fetches the compact file as a separate hashed asset at startup, behind a short loading screen, and the service worker precaches it for offline play. Both files are committed, so ordinary builds need neither the source archive nor network access; `npm run content:runtime` regenerates the compact file alone. Never edit generated entries by hand. The importer supports a separately licensed frequency overlay via `--frequency`; CC-CEDICT itself has no frequencies, so ranks otherwise remain unknown and ties sort deterministically by pinyin/form, never answer order.

CC-CEDICT contributors provide the dictionary under **CC BY-SA 4.0**. The derived dictionary (including normalization and merged forms/readings) carries that same license. See `THIRD_PARTY_NOTICES.md`, offline notices in `public\licenses`. This dictionary license is separate from unrelated application code and learning content.

## Edit curated words in a spreadsheet

Open `content\curated-words.csv` in Excel, LibreOffice Calc, or another spreadsheet editor. Import using **UTF-8**, comma separators, and text columns (especially IDs and pinyin). Export back to **CSV UTF-8**, keeping the header names. Quoted commas, quotation marks, and multiline cells are supported.

| Columns | What to enter |
|---|---|
| `id` | Existing canonical dictionary ID; never rename or reuse an existing ID |
| `simplified`, `traditional` | Two recognized Chinese characters in each script |
| `tocflLevel`, `sourceReference` | Verified level 1-6 and source edition/entry reference; required for candidates and approved rows |
| `reviewStatus` | `candidate`, `approved`, or `excluded` |
| `exclusionReason` | Required when excluded |
| `pinyinNumbered` | Two syllables separated by a space, e.g. `peng2 you5`; `v` or `u:` for umlauts, tone 5 for neutral |
| `toneAlternatives` | Optional dictionary-recognized alternate tones for the same syllables, separated by semicolons, e.g. `peng2 you3` |
| `pinyinDisplay` | Optional tone-marked display spelling matching `pinyinNumbered`; leave blank to generate it |
| `gloss`, `definition`, `topic` | Short gloss, intended meaning, broad hint category |
| `exampleSimplified`, `exampleTraditional`, `exampleEnglish` | Reviewed example and translation |
| `hintSimplified`, `hintTraditional`, `hintEnglish` | Sentence clue and translation; preserve answer blanks such as `＿＿` / `____` |

Use `candidate` while authoring; incomplete candidates never become puzzle answers. Set `approved` only when all learning fields are ready. Set `excluded` with a reason to remove a word from new puzzles. Imported reference levels come from `L0`-`L5` IDs, mapped to levels 1-6; no learning hints or examples are invented.

For a new word, find its canonical `id` and recognized forms/readings in `src\generated\dictionary.json` (search for the Chinese form). Use that dictionary ID in the CSV. A word missing from the dictionary needs a separate reviewed dictionary change before approval; do not make up a new ID.

After saving:

```powershell
npm run content:curated
```

Errors identify the offending row/field; fix the CSV and rerun. No network or CC-CEDICT download is needed. `npm run dev` and `npm run build` regenerate curated data automatically. Never edit `src\generated\curated.json` by hand: it is rebuilt solely from currently approved rows, with no archive or compatibility retention. Removed rows are removed from generated learning content too.

An empty or candidate-only spreadsheet builds successfully but displays **No approved words yet** instead of starting a puzzle. Old MVP saves are not migrated into the new vocabulary.

## Daily schedule

`content\daily-schedule.csv` fixes which approved word is the answer on each date (`date,id`, one row per consecutive day). It is committed and append-only: approving or adding words never changes an already scheduled date, so all players get the same word. Extend it before it runs out (the curated build warns when fewer than 60 days remain):

```powershell
npm run content:schedule
npm run content:curated
```

By default this covers today + 365 days (Asia/Shanghai); use `-- --days 730` for more. Every approved word is used once, in a seeded pseudo-random order, before any word repeats; newly approved words are scheduled first. Dates up to today are never changed. If you exclude a word that is scheduled for a future date, rerun `npm run content:schedule` to replace it; a word on a past or current date must stay approved (or be replaced by hand). Dates outside the schedule fall back to a date-based pick that changes between content releases, so never let the schedule run out.

## Import the supplied TOCFL reference

`content\tocfl-202307.csv` contains the supplied reference with `ID,Traditional,Simplified,Pinyin,POS,Variants` columns. The importer keeps explicit two-character pairs and variants, matches both scripts to the same CC-CEDICT entry, and writes candidates or excluded rows with reasons:

```powershell
npm run content:tocfl
npm run content:curated
```

The reference has already been imported. Reimporting refuses to overwrite a nonempty curated CSV. To deliberately replace it and discard editorial changes, run `npm run content:tocfl -- --replace`. Other source files can be supplied with `--source`.

Inspect `content\tocfl-import-report.json` for exclusions, source-reading differences, variant/duplicate provenance, and conflicting source levels. Duplicates use the lowest reference level (first introduction), preserving all source references. Only approved words become playable; matched candidates still need topics, examples, and hints. Verify the reference's reuse terms before distribution.

Dictionary-derived pinyin/gloss/definition cells retain CC-CEDICT's CC BY-SA 4.0 attribution and share-alike requirements. The supplied TOCFL reference has its own reuse terms; importing it does not establish permission to redistribute it.

TOCFL levels are stored and displayed when supplied. The Monday-Saturday level schedule is still planned, not activated by spreadsheet editing alone.

This milestone uses browser local storage and an indexed in-thread dictionary rather than Dexie/IndexedDB and a Web Worker. The compact dictionary is loaded whole at startup; splitting glosses into a lazily loaded file is deferred. The daily schedule is generated, not hand-reviewed, and does not yet follow the weekday level progression. Audio, real ads, Android/Capacitor packaging, analytics, and server-hosted content updates are not configured. Review curated learning content and measure mobile search latency before public release.
