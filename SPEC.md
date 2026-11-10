# Functional Specification — Chinese Daily Word Puzzle

A mobile-first vocabulary game for Mandarin learners, playable on the web and Android. Players guess a daily two-character word, receive character-level feedback, and finish with a short learning card.

This document defines the MVP. Four-character idioms, pronunciation-based scoring, and accounts are later additions.

---

## 1. Goals and audience

**Primary audience:** intermediate Mandarin learners who recognize common characters. They can type with pinyin on any keyboard or use a Chinese input method.

**Goals:**

- Create a short daily habit.
- Reinforce useful vocabulary.
- Encourage players to return without aggressive monetization.

The core experience must be playable without registration, payment, or watching an ad.

---

## 2. Game modes

| Mode | Behavior |
|---|---|
| **Daily puzzle** | One shared two-character answer each day. Maximum six accepted guesses. Progress resumes if the player closes the app. |
| **Practice** | Additional puzzles drawn from curated vocabulary, excluding the current daily answer. No daily streak impact. |

- Daily puzzles reset at **00:00 Asia/Shanghai**, regardless of the device's timezone.
- Display daily puzzle dates in Chinese calendar format (年/月/日). On Monday-Tuesday, display `Vocabulary level: Novice`; on Wednesday-Thursday, `Vocabulary level: Intermediate`; and on Friday-Saturday, `Vocabulary level: Advanced`. Omit this level label on Sunday.
- A countdown to the next puzzle is displayed.
- An unfinished previous-day puzzle becomes **expired** when a new day starts. Its answer and learning card remain available in history, but it cannot be completed retroactively.

---

## 3. Core gameplay

### 3.1 Guess entry

Players can enter a guess in either of two modes. Switching modes never clears submitted guesses.

| Mode | Behavior |
|---|---|
| **Pinyin (default)** | Players type Latin letters, then pick a two-character word from the suggestions. |
| **Native keyboard** | Players type characters directly with their system's Chinese keyboard (IME). |

The input auto-detects Chinese characters, so a native-keyboard user doesn't need to change settings. A Settings option sets the default mode.

#### Native keyboard rules

- Players enter exactly **two Chinese characters**.
- Either simplified or traditional input is accepted where the dictionary explicitly recognizes it.
- Leading and trailing whitespace is removed. Punctuation, Latin letters mixed with characters, and unsupported input are rejected with a clear message.
- **Enter during IME composition must not submit.**

#### Pinyin input rules

- **Letter case is ignored**, and spaces between syllables are optional: `pengyou`, `peng you` and `PengYou` are equivalent.
- **Tones are optional.** A tone number after a syllable narrows the suggestions: `peng2you3`. Tone marks (`péngyǒu`) are also accepted. A neutral tone can be written as `5`, `0` or no number.
- **`ü` can be typed as `v` or `u:`**: `lvse` and `lu:se` both mean `lǜsè`.
- **Abbreviations are allowed.** Initials only (`py`) or a partial final syllable (`pengy`) also match. Suggestions require at least one letter.
- **The apostrophe (`'`) separates ambiguous syllables**: `xi'an` is different from `xian`.
- **Other characters are rejected inline.** Digits outside tone positions and punctuation other than the apostrophe show an error, and no attempt is consumed.

#### Autocomplete suggestions

- **Only two-character entries from the accepted-guess dictionary** are suggested. Single characters and longer words never appear.
- **Each suggestion shows** the word in the selected script, its tone-marked pinyin, and optionally a short gloss (on by default; can be turned off in Settings).
- **Suggestions update as the player types**, within 100 ms on a mid-range Android device.
- **At most 8 suggestions are shown at once**, with scrolling for more.
- **Ranking:**
  1. Exact full-syllable matches before abbreviations and partial matches.
  2. Words that match the typed tones before words that don't.
  3. Word frequency, from a general-language corpus.
  4. Alphabetical by pinyin.
- **Ranking must never depend on the answer, the answer pool, or answer eligibility.** Otherwise the suggestion list would leak the answer.
- **Already-submitted guesses stay visible but are disabled**, with an "Already tried" label.
- **If nothing matches, show:** "No two-character word matches this pinyin."

#### Selection and submission

- Tapping a suggestion, or pressing Enter/Space on the highlighted one, places the characters into a **pending guess**. It is not submitted yet.
- Arrow keys or Tab move the highlight. Escape closes the list.
- **Submitting requires a pending two-character guess.** Pressing Enter with only pinyin and no selection shows "Choose a word from the suggestions" and consumes no attempt.
- Backspace on a pending guess returns to the pinyin text that produced it, so the player can pick a different suggestion.
- Invalid guesses do not consume an attempt.
- Repeating an already accepted guess shows "You already tried this word" and does not consume an attempt.

### 3.2 Guess validation

An accepted guess must exist in the game's dictionary. The dictionary of accepted guesses is broader than the curated answer pool.

Before committing a guess, the game checks:

1. The puzzle is still active.
2. Input contains exactly two supported Chinese characters.
3. The input matches a recognized dictionary form.
4. The guess has not already been submitted.

For an unrecognized word, show: **"This word isn't in our dictionary. Try another."**

### 3.3 Feedback

Each accepted guess produces two tiles:

| Tile state | Meaning |
|---|---|
| **Correct** | The character is in the correct position. |
| **Present** | The character appears in the answer, but in another position. |
| **Absent** | The character does not match any remaining occurrence in the answer. |

- Repeated characters use **occurrence-aware scoring**: allocate exact matches first, then misplaced matches. A single occurrence in the answer cannot credit multiple guessed characters.
- Scoring compares **characters only**. Matching pinyin with the wrong characters is not credited.
- After each accepted guess, show each character's pinyin as its **initial, final, and tone**, marking each component independently as matching or differing from the answer character in the same position. This is learning feedback only; it does not change character-based tile scoring.
- Use colors plus icons or accessible text — never color alone.

### 3.4 Completion

- A correct guess wins immediately.
- Six unsuccessful accepted guesses end the puzzle.
- Both outcomes reveal the answer and learning card.
- Completed puzzles cannot be restarted to improve their recorded result.
- Hint usage is recorded separately from the guess count.
- A correct submission triggers a roughly two-second sparkle around both winning character tiles in daily and practice modes, visible in the main grid without scrolling to the results. It does not obstruct controls, does not play for restored or historical results, and is disabled when reduced motion is enabled.

---

## 4. Simplified and traditional support

Players choose **简体** or **繁體** during first use and can switch later in Settings.

- Both preferences use the same puzzle ID and answer.
- The chosen script controls word display, guess tiles, suggestions, hints, and learning cards.
- Switching scripts preserves guesses and progress.
- Validation and scoring use curated mappings, not unrestricted automatic conversion.
- Every answer must have reviewed simplified/traditional forms, accepted input forms, and consistent two-character alignment.
- Ambiguous forms that cannot be scored consistently are excluded from the MVP answer pool.
- A word whose simplified and traditional forms differ appears **only once** in suggestions. Words differing only in script are never shown as separate suggestions.

**Script preference is separate from interface language.** The MVP uses English interface text with Chinese vocabulary content; fully localized interfaces are deferred.

Regional synonyms are not automatically correct answers. Only explicitly equivalent written forms match the answer.

---

## 5. Hints

Hints are voluntary and never consume guesses.

| Hint | Availability | Content |
|---|---|---|
| **Sentence** | After three unsuccessful guesses | A natural example with the answer replaced by blanks. |

- Sentence clues appear in the selected Chinese script by default. An optional "Show translation" action reveals an English translation of the clue, preserving any answer blank and never substituting the answer's definition or the unmasked learning-card example. Players can hide it again; it resets to hidden for each puzzle. Translation is part of the already-used sentence hint, with no extra guesses consumed.
- After three failed guesses, enable the sentence hint control without an additional availability prompt. Availability alone does not count as hint usage. The sentence control remains disabled before unlock, after use, and after completion.
- The learning card's definition and audio remain free after completion.
- No full-pinyin hint is available during play, including through rewarded ads. Previously recorded pronunciation hints remain in assisted-result history but are not displayed. Per-guess pronunciation feedback and post-game pinyin remain available.
- Any used hint marks the result as **assisted**. Hint-free and assisted completions both count toward the daily streak, but sharing distinguishes them.
- Typed pinyin and suggestions are **not** hints and don't mark the result as assisted.
- Topic is visible above the guess grid from the beginning in daily and practice puzzles. It has no reveal control, never records hint usage, and never marks a result as assisted. Legacy recorded topic hints are ignored for assisted status in history, statistics, and sharing.
- Topic never filters or reorders suggestions and is not duplicated as a hint below the grid.
- Pronunciation-based tile feedback is outside the MVP.

---

## 6. Learning card and vocabulary

### 6.1 Learning card

After winning, losing, or viewing an expired puzzle, show:

- Answer in the selected script, with the alternate form available.
- Pinyin with tone marks.
- Mandarin pronunciation audio.
- A concise English definition for the intended sense.
- One natural Chinese example sentence with an English translation.
- An option to save the word for review.

Audio plays only on request. If unavailable, or offline without a cached recording, show that clearly without blocking the card.

### 6.2 Answer records

| Data | Requirement |
|---|---|
| Identity | Stable word ID |
| Written forms | Reviewed simplified, traditional, and accepted equivalent forms |
| Pronunciation | Reviewed pinyin and audio reference |
| Learning content | Definition, example, translation, and topic |
| Classification | TOCFL vocabulary level (1-6) and answer eligibility; level is not a guaranteed puzzle-difficulty rating |

Exclude obscure words, proper nouns, and entries with unclear intended readings from the initial answer pool. Human review is required before publication.

### 6.2.1 TOCFL vocabulary progression (planned)

- Use TOCFL as the reference for curated vocabulary, subject to verification of the source edition and reuse terms. Preserve source level assignments rather than estimating levels from word familiarity.
- Daily answers use level 1 on Monday, 2 on Tuesday, 3 on Wednesday, 4 on Thursday, 5 on Friday, and 6 on Saturday, according to the puzzle date in Asia/Shanghai. Sunday is a curated wildcard, not an unrestricted dictionary entry.
- Display the weekday vocabulary band before play with the label `Vocabulary level: <level>`; Monday-Tuesday are Novice, Wednesday-Thursday Intermediate, and Friday-Saturday Advanced. Omit the label on Sunday. It describes a vocabulary band, not guaranteed guessing difficulty; individual familiarity varies.
- Single-character entries are excluded from the curated answer list. The current game remains two-character only in both scripts. Three- and four-character TOCFL entries are outside the current playable pool; including them would require a separately agreed word-length feature. Do not truncate longer entries or treat their fragments as TOCFL-listed words.
- Every eligible answer still requires reviewed script mappings, an intended reading, learning content, and hints. TOCFL membership alone does not make an entry eligible.
- Import all TOCFL entries with exactly two supported Han characters in both simplified and traditional forms as curation candidates, retaining their source levels. Candidates are not automatically published answers. Flag ambiguous intended readings/senses, conflicting written-form mappings, proper names, variant-only references, and duplicates for review; do not automatically reject ordinary polyphonic words or unfamiliar higher-level vocabulary. Match by explicit written forms, not unrestricted script conversion. Exclude entries that cannot support two aligned characters and syllables or cannot be safely resolved after review. Missing hints/examples block answer publication, not candidate import.
- This progression is a planned content/scheduling change; the schedule generator does not yet constrain levels by weekday. The MVP starter records have been removed; puzzles require approved spreadsheet content.

### 6.2.2 Spreadsheet curation

`content/curated-words.csv` is the editable source for curated learning content. Open it in a spreadsheet with UTF-8 encoding and export as CSV after editing. One row represents a word with a stable dictionary ID, written forms, numbered pinyin, TOCFL level/source reference, learning content, and review status.

- `candidate`: retained for editorial work, not used for new puzzles; learning content may be incomplete.
- `approved`: eligible for new daily/general-practice puzzles after content validation; all learning fields are required. New answers require a verified TOCFL level and source reference.
- `excluded`: not eligible for new puzzles; retain an exclusion reason.

The spreadsheet is populated from the supplied `tocfl-202307.csv` reference. Reference IDs `L0` through `L5` map to vocabulary levels 1 through 6. Import all explicitly listed two-character form pairs, including valid two-character variants; never truncate longer words. Match both forms to the same recognized CC-CEDICT entry. Matching entries become candidates, while unmatched entries remain in the spreadsheet as excluded rows with explicit reasons.

Deduplicate equivalent words by canonical dictionary ID and preserve all source references. Where the same word appears at several source levels, use its earliest introduction (lowest level) and record the full level conflict in the import report. Source pinyin differences are reported for editorial review, not silently treated as dictionary readings. Dictionary matching does not approve learning content.

The importer rejects duplicate identities/forms, invalid statuses or levels, invalid or unrecognized approved readings/forms, and missing approved learning content. All candidate/approved rows require level/source provenance. A valid empty or candidate-only sheet generates an empty answer pool and an explicit no-approved-words notice rather than an invalid puzzle.

Only current approved rows generate learning records and answers; there is no legacy archive or automatic record retention. Old MVP records and IDs are not preserved. Saves referencing removed answers or unrecognized guesses are excluded from playable restored state. Generated content is not hand-edited. Editing this spreadsheet does not change the accepted-guess dictionary or its ranking, or activate weekday-level scheduling. If the approved pool has no alternative to today's answer, practice explains that another approved word is needed.

### 6.3 Accepted-guess dictionary records

Every accepted-guess entry, not just answers, needs:

- Simplified and traditional forms.
- All valid readings, in normalized pinyin with tones. Words with more than one reading (多音) are reachable by each one.
- Suggestions display the matched reading. A pinyin-selected guess retains that reading for pronunciation feedback after reopening; native input and legacy saved guesses use the entry's primary reading.
- A frequency rank for suggestion ordering.
- A short gloss, if glosses are enabled.

**Bundled dictionary milestone:** accept and suggest supported two-character CC-CEDICT entries without adding them to the curated puzzle pool. Dictionary entries carry written variants, multiple normalized readings, and English glosses, but no topic, example, hint, difficulty, or answer-eligibility metadata. Alternate readings and scripts produce one suggestion per canonical simplified word. Dictionary IDs derive from canonical forms, not MVP starter identifiers.

CC-CEDICT is imported at build time, never queried through a live API. Only entries with two supported Han characters in both forms and two supported pinyin syllables are retained. Proper nouns may be accepted guesses; they are not automatically eligible answers. No MVP starter overrides are applied.

CC-CEDICT does not supply corpus frequencies. Until a separately licensed corpus is supplied, unknown frequency ranks are tied and suggestions use deterministic pinyin/form tie-breakers; starter answer order must not stand in for corpus frequency. A frequency overlay must include source attribution and license metadata.

Settings exposes CC-CEDICT contributor attribution, the source link, a description of modifications, and offline license/notices. The generated dictionary and its local overrides are distributed under **CC BY-SA 4.0**; this does not assign that license to unrelated app code or learning content.

---

## 7. Practice and review

Practice uses the same input, validation, six-guess limit, scoring, and hints.

Players can choose:

- **General practice:** a random eligible word, avoiding recent practice repeats where possible.
- **Saved-word review:** puzzles from their saved learning cards.

Practice results do not change daily statistics or streaks. After completion, players can start another round. If there are no saved words, explain how to save them rather than showing an empty game.

---

## 8. Screens and navigation

| Screen | Required content |
|---|---|
| **First-use setup** | Script choice, short rules, and an example of tile feedback. Skippable; no account required. |
| **Daily game** | Puzzle date, six-row grid, pending-guess preview row, input with pinyin/native mode indicator, suggestion list, submit control, hint controls, and navigation to help/settings. |
| **Results** | Outcome, learning card, share action, practice link, and next-puzzle countdown. |
| **Practice** | Mode selection, active puzzle, and results. |
| **History / saved words** | Previous daily outcomes and saved learning cards. |
| **Statistics** | Daily plays, wins, win rate, current/best streak, guess distribution, and assisted completions. |
| **Settings** | Script, default input mode, suggestion glosses, sound, accessibility preferences, privacy controls, and local-data reset. |

**Visual design:** The interface should feel like a calm nature-inspired notebook: warm paper tones, subtle ruled-paper details, ink-dark text, and bamboo/forest-green accents. Character tiles use a subtle dashed 米字格 (diagonal and center guides) behind the character, including when feedback colors are shown, and use a platform-native handwritten/calligraphic Chinese font distinct from the rest of the interface. The guess-character font follows the tile's simplified/traditional language; other Chinese text retains its normal font. Keep surfaces and decoration restrained so the puzzle remains easy to read; preserve clear contrast and usable feedback in both light and dark appearance modes.

- The help/setup modal uses a compact input-step strip, three labeled tile examples, a visual pronunciation example, and short hint captions instead of long explanatory paragraphs. Explain that topic is always visible and not a hint, sentence unlocks after three failed guesses, translation is optional, and hints mark results as assisted. Pronunciation matches use green text and differences use red text, consistent with gameplay. Script selection stays on the game screen and in Settings, not in help. The modal remains scrollable on small screens.
- Correct character backgrounds remain green in all appearance modes, including high contrast; high contrast uses blue for misplaced characters. Shared-result squares follow the same green/blue mapping.
- Character tiles have light paper-tinted feedback backgrounds and ink-colored characters, enlarged to visually occupy roughly 75-80% of the writing square (depending on the installed font). Tone markers sit centered outside the square with no background; space above every row prevents overlap. Tones 1-4 retain their compact calligraphic brush shapes, and the neutral dot retains its size. Keep pronunciation and position marks visible but visually subtle, alongside accessible feedback labels.
- On small screens, the suggestion list must stay visible above the on-screen keyboard.
- Resetting local data requires confirmation and explains that progress cannot be recovered.

---

## 9. Progress, streaks, and sharing

Progress persists locally after every accepted guess, hint unlock, and completion.

- One daily result is recorded per puzzle date.
- A win extends a streak only when the preceding puzzle date was also won.
- A loss or missed day breaks the streak.
- Practice does not affect daily statistics.
- Cross-device synchronization is not included in the MVP.

Sharing produces spoiler-free text containing the game name, puzzle date, guess count or loss indicator, tile pattern, assisted status, and game URL.

- Never include the answer, guessed characters, or hints.
- Use native sharing where available, with clipboard fallback and explicit failure feedback.

---

## 10. Advertising and monetization

**Advertising must not interrupt a guess or obstruct learning content.**

| Placement | Rules |
|---|---|
| **Post-game ad** | One clearly labeled placement below the learning card and primary actions. |
| **Android rewarded hint** | Not available; no ad unlocks full-pinyin clues. |
| **Forced interstitials** | Not permitted in the MVP. |

Additional requirements:

- No ads on launch, between guesses, or beside the input, suggestions, or submit controls.
- Reserve placement space to prevent layout jumps.
- Ad loading failures never block play or results.
- Apply consent and age-related requirements before requesting ads where required.
- Use test ads during development.

Ad-free purchases are deferred until monetization is validated.

---

## 11. Platform, offline, and accessibility

**Platforms:** responsive web/PWA and Android via Capacitor, sharing the same game logic.

### 11.1 Offline and content versioning

- Bundle vocabulary and a versioned daily schedule for offline play.
- Once started, a puzzle retains its answer and content version through completion.
- The daily schedule is a fixed, append-only list of dates and answers (`content/daily-schedule.csv`). Approving, adding, or reordering curated words never changes the answer of an already scheduled date, so every player on any app version gets the same word for the same date. Only future dates whose word is no longer approved are replaced; published dates are never rewritten automatically.
- New schedule dates use every approved word once, in a seeded pseudo-random order independent of spreadsheet order, before repeating the least recently scheduled word. Newly approved words are scheduled before any repeat.
- Until server-hosted content updates exist, a date beyond the bundled schedule falls back to a deterministic word derived from the date and the bundled approved pool, rather than blocking play. This fallback is not stable across content releases, so the schedule must be extended well ahead of its end before publishing (the build warns when fewer than 60 days remain). Once server updates exist, a missing date should show "Today's puzzle needs an internet connection" and keep offline practice available.
- Cache app updates without replacing an active puzzle mid-session.
- Offline audio is available only when downloaded or cached.
- Local dates and results are not tamper-proof; competitive rankings are therefore excluded.

### 11.2 Pinyin index

- The pinyin index is bundled and works fully offline. No server lookups.
- Index size target: **≤ 1.5 MB compressed**. Load it lazily after the first screen renders.
- The pinyin field disables browser autocorrect, autocapitalize, and spellcheck, and uses a Latin text input type, so the Android keyboard doesn't autocorrect `peng` to "Penguin."

### 11.3 Accessibility

- Readable Chinese typography.
- Screen-reader labels for tiles.
- Full keyboard navigation.
- Reduced-motion support.
- Controls remain usable when the mobile keyboard opens.
- The suggestion list follows the WAI-ARIA combobox pattern, with arrow-key navigation and the highlighted option tracked.
- Screen readers announce the number of suggestions, and each suggestion's characters and pinyin.

---

## 12. Success measures and launch acceptance

### 12.1 Metrics

Measure first-puzzle completion, next-day and seven-day return rates, hint usage, invalid-guess frequency, input mode used, suggestion selection rate, practice engagement, and pronunciation playback. Evaluate ad revenue alongside retention.

Analytics must not collect raw guesses, typed pinyin, or unnecessary identifying information.

### 12.2 Launch acceptance criteria

The MVP is ready when:

- [ ] Simplified and traditional equivalents produce consistent outcomes.
- [ ] Repeated-character scoring is correct.
- [ ] Native mode never submits during IME composition.
- [ ] Pinyin mode never submits without an explicit selection.
- [ ] Toneless, numbered, tone-marked, `v`-for-`ü`, abbreviated, and apostrophe-separated pinyin all return the correct suggestions.
- [ ] Suggestion ranking is identical regardless of today's answer (verified by an automated test comparing rankings across different answers).
- [ ] Words with more than one reading are reachable by each reading.
- [ ] Suggestions appear within 100 ms with no network connection.
- [ ] On Android (web and Capacitor app), the system keyboard doesn't autocorrect or capitalize pinyin, and the suggestion list stays usable while the keyboard is open.
- [ ] Closing and reopening restores the exact game state.
- [ ] Daily rollover follows the defined timezone and expires unfinished games correctly.
- [ ] Wins, losses, hints, streaks, and sharing agree with persisted results.
- [ ] Cached puzzles and practice work offline.
- [ ] Ad refusal, cancellation, or failure never prevents the free gameplay loop.
- [ ] Small-screen and assistive-technology users can complete a puzzle.

---

## 13. Out of scope for the MVP

- Accounts, cloud sync, and leaderboards
- Four-character idiom (成语) puzzles
- Pronunciation-scoring mode
- Subscriptions and ad-free purchase
- Multiplayer
- Push notifications
- Handwriting, Zhuyin (Bopomofo), and voice input
- Suggestions learned from the player's past choices
