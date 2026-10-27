# Third-party dictionary notices

## CC-CEDICT

The bundled `src/generated/dictionary.json` is derived from **CC-CEDICT**, a
community-maintained Chinese–English dictionary published by **MDBG**. CC-CEDICT
continues CEDICT, started by Paul Andrew Denisowski in 1997.

- Publisher and download page: <https://www.mdbg.net/chinese/dictionary?page=cedict>
- Project: <https://cc-cedict.org/wiki/>
- Official source: <https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz>
- License: **Creative Commons Attribution-ShareAlike 4.0 International**,
  <https://creativecommons.org/licenses/by-sa/4.0/>
- Full unmodified official legal text: `public/licenses/CC-BY-SA-4.0.txt`,
  downloaded from <https://creativecommons.org/licenses/by-sa/4.0/legalcode.txt>.
- Offline attribution: `public/licenses/CC-CEDICT-NOTICE.txt`, regenerated with
  the dictionary and shipped in the app at `licenses/CC-CEDICT-NOTICE.txt`.

The source header explicitly identifies CC BY-SA 4.0. Source release date,
original comment header, compressed-source SHA-256, decompressed-text SHA-256,
entry counts and filtering statistics are preserved
in generated metadata. No local dictionary overrides are included; all entries,
readings, and glosses come from the source. The derived dictionary
is distributed under CC BY-SA 4.0. This data license is separate
from, and does not relicense, the application source code.

Changes: retain only two-character forms in U+3400–U+9FFF with supported
two-syllable Mandarin readings; normalize lowercase pinyin, `u:`/`ü` to `v`,
and tone 0 to neutral 5; display tone marks without a neutral-tone digit
(syllabic consonants such as `n` retain tone digits 1–4 because the app's
tone-mark map supports vowels only; unsupported `ê` readings are filtered);
merge readings and definitions by canonical simplified form; deterministically
choose traditional spelling and resolve conflicting aliases; optionally overlay
attributed frequency ranks. All IDs use `cedict_<codepoints>` and depend only on
simplified-form code points. Ambiguous aliases belong to canonical simplified
forms first, then the lexicographically first canonical entry. A conflicting
alias is omitted from other entries; distinct simplified forms are never merged
through local reserved mappings.

The current source release (2026-10-11T08:29:27Z) contains 125,262 source entries.
Filtering keeps 62,103 supported source entries, skips 63,075 unsupported forms
and 84 unsupported readings, and merges 923 duplicate simplified-form entries
into 61,180 dictionary entries. Nine conflicting aliases are resolved by the
ownership rules above.

No endorsement by MDBG, the CC-CEDICT contributors, or Creative Commons is
implied. See the full license for attribution, share-alike, warranty, and other
conditions.

## Rebuilding the offline dictionary

Download the official compressed source explicitly into
`content\cedict-source.txt.gz`, then run:

```powershell
node tools\build-dictionary.mjs --source content\cedict-source.txt.gz
node --test tools\build-dictionary.test.mjs
```

The importer uses only Node built-ins, never downloads anything, and is not
required by normal app builds. Commit the generated JSON and public notices,
not the downloaded source. Generation is deterministic for identical inputs;
there is no current-time timestamp. Compressed and decompressed sources are
limited to 64 MiB; optional frequency files to 8 MiB. Malformed noncomment
source lines fail with line numbers; unsupported forms/readings are counted
and skipped. An empty or unsupported-only source fails before output is written.

## Optional frequency overlay

No frequency corpus is currently bundled. Unknown frequency is `null`; curated
game ordering is **not** treated as a corpus frequency rank.

```powershell
node tools\build-dictionary.mjs --source content\cedict-source.txt.gz --frequency content\frequency.json
```

The input must be JSON in this format (illustrative attribution, not a bundled
dataset):

```json
{
  "metadata": {
    "source": "Name of frequency corpus",
    "url": "https://example.org/corpus",
    "attribution": "Corpus authors and required credit",
    "license": "CC0-1.0"
  },
  "ranks": {
    "朋友": 1,
    "天气": 2
  }
}
```

All four metadata fields must be nonempty strings. Rank keys must be exactly
two supported Han characters; ranks must be positive safe integers (smaller
means more frequent). Absent keys stay `null`; ranks for unused valid forms
have no effect. Metadata and a hash of the overlay file are recorded in the
generated dictionary, and attribution/license information is also included in
the regenerated public offline notice. Duplicate ranks are allowed (ties).
Only supply overlays legally compatible with CC BY-SA 4.0 distribution:
validation checks structure, not legal compatibility. The overlay retains its
own stated license and attribution; the combined derived dictionary remains
CC BY-SA 4.0. If an overlay requires an additional full license or notices,
bundle those in `public/licenses/` before distributing it.
