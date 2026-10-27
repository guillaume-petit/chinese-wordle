# Design Guidelines — Chinese Daily Word Puzzle

These guidelines set the visual and interaction style of the game. They complement [`SPEC.md`](./SPEC.md) (what the game does) and [`TECH_SPEC.md`](./TECH_SPEC.md) (how it is built).

**Working name:** 词语 Daily (cíyǔ Daily). Replace it everywhere once a final name is chosen.

---

## 1. Design principles

1. **Calm, not noisy.** A short daily ritual. No flashing rewards, confetti storms, or pressure.
2. **Characters first.** Chinese characters are the hero of every screen. Everything else supports them.
3. **Teach on every screen.** Feedback, hints, and results should leave the player knowing a little more.
4. **Fair and readable.** Every state is clear at a glance, in any script, on any screen size, with or without color vision.
5. **Respect the player's time.** Fast to open, fast to play, and ads never in the way.

### Visual concept: *ink and paper*

The look borrows from a calligraphy desk, in a modern, flat way:

- **Rice-paper background** and **ink-black text**.
- **Jade** and **amber** for game feedback.
- A small **vermilion seal** (印章) as the brand accent.

Avoid clichés: no dragons, lanterns, bamboo borders, fake brush fonts for UI text, or "chopstick" lettering.

---

## 2. Brand

### 2.1 Logo

- **Mark:** a square vermilion seal containing the character **词** in white, with slightly rounded corners (radius 12% of the size). It works as the app icon and the favicon.
- **Wordmark:** "词语 Daily", set in the UI typefaces (§4): Chinese in the CJK font at weight 700, "Daily" in the Latin font at weight 600.
- **Lockup:** seal on the left, wordmark on the right, with a gap equal to 25% of the seal's width.

| Rule | Value |
|---|---|
| Clear space | At least 25% of the seal's width on every side |
| Minimum size | Seal 24 px; full lockup 120 px wide |
| Backgrounds | Paper, white, or dark ink background only |

**Don't:** stretch, rotate, outline, add shadows or gradients, recolor the seal, or place the logo on photos.

### 2.2 App icon (Android and PWA)

- Full-bleed vermilion background with a white **词** centered in the safe zone.
- **Android adaptive icon:** the foreground fits in the central 66 × 66 dp safe zone of the 108 × 108 dp canvas.
- **Monochrome icon** (Android 13+): the 词 shape only.
- **PWA:** provide 192 px, 512 px, and a 512 px maskable version.
- **Simplified and traditional players see the same icon.** 词 is the simplified form; a traditional 詞 variant can be offered later, but don't ship two icons in the MVP.

---

## 3. Color

All values are checked against WCAG 2.2 contrast requirements. Contrast ratios in the tables are measured against the relevant background.

### 3.1 Light theme (default)

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--color-bg` | `#FAF7F0` | App background (rice paper) | — |
| `--color-surface` | `#FFFFFF` | Cards, dialogs, suggestion list | — |
| `--color-text` | `#1F1D1A` | Primary text (ink) | 15.7 : 1 |
| `--color-text-muted` | `#5C5750` | Secondary text, pinyin, captions | 6.7 : 1 |
| `--color-border` | `#8A8378` | Empty tile borders, input outline | 3.5 : 1 |
| `--color-divider` | `#E6E0D4` | Decorative separators only | — |
| `--color-brand` | `#B83227` | Seal, primary buttons, links | 5.6 : 1 |
| `--color-on-brand` | `#FFFFFF` | Text on brand color | 6.0 : 1 |
| `--color-focus` | `#1D4ED8` | Keyboard focus ring | 6.3 : 1 |
| `--color-error` | `#A3352B` | Validation messages | 6.3 : 1 |

### 3.2 Dark theme

Follows the system setting by default; can be forced in Settings.

| Token | Hex | Contrast |
|---|---|---|
| `--color-bg` | `#17150F` | — |
| `--color-surface` | `#24211B` | — |
| `--color-text` | `#F2EEE6` | 15.8 : 1 |
| `--color-text-muted` | `#B5AEA3` | 8.3 : 1 |
| `--color-border` | `#6E685F` | 3.3 : 1 |
| `--color-divider` | `#34302A` | — |
| `--color-brand` | `#E8695C` | 5.7 : 1 |
| `--color-on-brand` | `#17150F` | — |
| `--color-focus` | `#7AA2F7` | 7.3 : 1 |
| `--color-error` | `#F08A7E` | 7.5 : 1 |

### 3.3 Tile feedback colors

The same tile colors are used in both themes. Text on tiles is always white.

| State | Token | Hex | White text | Against dark bg | Icon |
|---|---|---|---|---|---|
| **Correct** | `--tile-correct` | `#2E7253` (jade) | 5.8 : 1 | 3.2 : 1 | ✓ check |
| **Present** | `--tile-present` | `#9A5B0B` (amber) | 5.4 : 1 | 3.4 : 1 | ↔ swap arrows |
| **Absent** | `--tile-absent` | `#6B655E` (stone) | 5.8 : 1 | 3.1 : 1 | — (none) |

**High-contrast mode** (Settings toggle, for color-vision deficiencies):

| State | Hex | White text |
|---|---|---|
| Correct | `#C2410C` (orange) | 5.2 : 1 |
| Present | `#1D4ED8` (blue) | 6.7 : 1 |
| Absent | unchanged | 5.8 : 1 |

### 3.4 Color rules

- **Never use color alone.** Correct and present tiles always show their icon (§6.1).
- **Red is not "wrong."** In Chinese culture red means luck and celebration. Use vermilion only for the brand and primary actions; for errors, use `--color-error` **with an icon and text**, never a red tile.
- **No gradients** on UI elements. Flat colors only.
- Text on any colored surface must reach **4.5 : 1**. Non-text elements (borders, icons, tile edges) must reach **3 : 1**.

---

## 4. Typography

### 4.1 Typefaces

The game uses **system fonts** to avoid downloading large CJK font files.

| Use | Font stack |
|---|---|
| Chinese (simplified) | `"PingFang SC", "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif` |
| Chinese (traditional) | `"PingFang TC", "Noto Sans CJK TC", "Source Han Sans TC", "Microsoft JhengHei", sans-serif` |
| Latin UI and pinyin | `system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif` |

- Always set `lang="zh-Hans"` or `lang="zh-Hant"` on Chinese text, so the browser picks the right glyph forms.
- **Pinyin uses the Latin font**, never the CJK font. CJK fonts often draw tone marks badly. Check that `ǚ ǜ ā é ǐ ò` all display correctly.
- Don't use brush or calligraphy fonts for UI text. A brush style may be used only in the logo or illustrations, as an image.

### 4.2 Type scale

Based on a 16 px root size. Sizes are in `rem` so browser zoom and Android font scaling work.

| Style | Size | Weight | Line height | Use |
|---|---|---|---|---|
| `tile` | 2.25 rem (36 px) | 500 | 1 | Characters in guess tiles |
| `display-zh` | 3 rem (48 px) | 500 | 1.2 | Answer on the learning card |
| `title` | 1.375 rem (22 px) | 700 | 1.3 | Screen titles |
| `heading` | 1.125 rem (18 px) | 600 | 1.4 | Card and section headings |
| `body` | 1 rem (16 px) | 400 | 1.5 | Default text |
| `body-zh` | 1.125 rem (18 px) | 400 | 1.7 | Chinese sentences (examples, hints) |
| `pinyin` | 0.9375 rem (15 px) | 400 | 1.4 | Pinyin under characters, suggestions |
| `caption` | 0.8125 rem (13 px) | 400 | 1.4 | Labels, timestamps, ad label |

**Rules:**

- Chinese body text is one step larger than Latin text, with more line height, because characters are dense.
- **Never set Chinese text below 14 px.**
- Chinese text is never bold for emphasis; use color or a background highlight instead.
- Chinese characters in tiles use weight 500 so complex characters such as 赢 or 鬱 stay readable.

---

## 5. Layout and spacing

### 5.1 Spacing scale

A 4 px base unit. Use only these values:

`4 · 8 · 12 · 16 · 24 · 32 · 48 · 64` px (`--space-1` … `--space-8`)

### 5.2 Shape

| Element | Corner radius |
|---|---|
| Tiles | 8 px |
| Buttons, input, chips | 12 px |
| Cards, dialogs, suggestion list | 16 px |
| Bottom sheets | 20 px (top corners only) |

**Elevation:** use borders and background color, not shadows. One soft shadow is allowed for floating elements (suggestion list, dialogs): `0 4px 16px rgb(0 0 0 / 0.12)`.

### 5.3 Breakpoints

| Name | Width | Layout |
|---|---|---|
| Compact | < 600 px | Single column, full width (most phones) |
| Medium | 600–1023 px | Content centered, max width 480 px |
| Expanded | ≥ 1024 px | Game column 480 px; results and learning card can sit in a second column |

Design and test at **360 × 640** first. The game must work down to **320 px** wide.

### 5.4 Daily game screen layout (compact)

```
┌────────────────────────────────┐
│ ☰   [seal] 词语 Daily   ? ⚙︎   │  Header, 56 px
│      2026-10-11 · #42           │
├────────────────────────────────┤
│                                │
│        ┌────┐ ┌────┐           │
│        │ 朋 │ │ 友 │           │  Six guess rows
│        └────┘ └────┘           │  (pending row highlighted)
│            … × 6               │
│                                │
│  [💡 Topic] [Sentence 🔒] [Pinyin 🔒] │  Hint chips
├────────────────────────────────┤
│ ┌ suggestions ───────────────┐ │  Floats above input
│ │ 朋友  péngyou   friend     │ │
│ │ 蓬佑  …                    │ │
│ └────────────────────────────┘ │
│ [ 拼 | pengyou________ ] [Go]  │  Input bar, sticks above keyboard
└────────────────────────────────┘
        (system keyboard)
```

- The **input bar sticks to the bottom** and moves up with the on-screen keyboard.
- When the keyboard is open, the grid scrolls so that the **pending row stays visible**.
- **No ads appear on this screen.**

---

## 6. Components

### 6.1 Guess tile

| Property | Value |
|---|---|
| Size | 64 × 64 px (compact), 72 × 72 px (medium and up); never below 56 px |
| Gap between tiles | 8 px; gap between rows 8 px |
| Character | `tile` style, centered |
| State icon | 14 px, top-right corner, 4 px inset, white |

**States:**

| State | Look |
|---|---|
| Empty | Transparent; 2 px `--color-border` outline |
| Pending (selected but not submitted) | Surface background; 2 px `--color-text` outline; character shown; small pinyin underneath in `--color-text-muted` |
| Correct | `--tile-correct` fill, white character, ✓ icon |
| Present | `--tile-present` fill, white character, ↔ icon |
| Absent | `--tile-absent` fill, white character, no icon |
| Invalid (rejected guess) | Pending style plus a horizontal shake (§8) |

- The two tiles of a row are close together, so they read as **one word**. Optionally show the row number in `caption` style on the left.
- **Accessible label example:** "Guess 2: 朋, correct position. 友, not in the word."

### 6.2 Input bar

- **Height:** 56 px. Background `--color-surface`, 1 px `--color-border` top edge.
- **Mode badge** on the left: `拼` for pinyin mode, `中` for native mode, in a 32 px rounded square. Tapping it opens a short explanation; it doesn't switch the keyboard.
- **Field:** 16 px or larger text (smaller text causes zoom on some mobile browsers). Placeholder: "Type pinyin, e.g. pengyou".
- **Submit button:** 48 × 48 px, brand color, check-mark icon, label "Submit guess" for screen readers. It's disabled (40% opacity) until a two-character guess is pending.
- **Inline errors** appear in a single line above the field: `⚠` icon + message in `--color-error`, `caption` size. They clear on the next keystroke.

### 6.3 Suggestion list

- Floating card attached to the top of the input bar, 16 px radius, with the floating shadow.
- **At most 8 rows visible,** then scrolls. Row height 52 px.
- **Row layout:**

  ```
  朋友    péngyou            friend
  └ 20px  └ pinyin style     └ caption, muted, truncated with "…"
  ```

- **Highlighted row:** `--color-bg` background and a 3 px brand-colored bar on the left edge.
- **Already-tried row:** 50% opacity and a small "Already tried" label on the right; not selectable.
- **Typed letters are bold in the pinyin** so players see why a word matches (`**peng**you`).
- **Empty state:** one row of muted text: "No two-character word matches this pinyin."

### 6.4 Buttons

| Type | Look | Use |
|---|---|---|
| Primary | Brand fill, `--color-on-brand` text, weight 600 | One per screen at most: "Share result", "Start practice" |
| Secondary | Transparent, 1.5 px `--color-text` border | "View history", "Play again" |
| Tertiary | Text only, brand color, underline on hover/focus | Links, "Learn more" |
| Icon | 48 × 48 px touch area, 24 px icon | Header actions |

- **Minimum height 48 px.** Minimum touch area **48 × 48 px** (above the 44 px floor in the tech spec).
- **Pressed:** darken by 8% with a 100 ms transition. **Disabled:** 40% opacity, no hover effect.
- **Labels** use sentence case: "Share result", not "SHARE RESULT".

### 6.5 Hint chips

- Pill-shaped (full radius), 36 px tall, inside a 48 px touch area.
- **Locked:** muted text and a 🔒 icon, plus the unlock condition on tap: "Unlocks after 2 guesses."
- **Available:** `--color-text` border with a 💡 icon.
- **Used:** filled with `--color-surface`, ✓ icon; the hint text appears in a card below the grid.
- **Rewarded option (Android):** a secondary line on the pronunciation chip: "▶ Watch an ad to unlock now." It's never styled as a primary button.

### 6.6 Learning card

The most important screen after the game. It should look like a **vocabulary flashcard**.

```
┌──────────────────────────────┐
│           朋友                │  display-zh
│         péngyou  🔊          │  pinyin + audio button
│        繁體: 朋友              │  caption, alternate script
│ ──────────────────────────── │
│  friend                      │  heading
│ ──────────────────────────── │
│  他是我最好的朋友。             │  body-zh
│  He is my best friend.       │  body, muted
│ ──────────────────────────── │
│  # Relationships   ☆ Save    │  topic tag + save button
└──────────────────────────────┘
```

- Surface background, 16 px radius, 24 px padding.
- The answer characters in the example sentence are underlined with a 2 px brand-colored line.
- **Audio button:** 48 px circle with a speaker icon; shows a progress ring while playing and a "No audio available offline" note when needed.
- **Save button:** outline star ☆ that becomes a filled star ★ in brand color once saved.

### 6.7 Results screen order

From top to bottom, in this order:

1. Outcome heading — "Solved in 3/6" or "Today's word was…"
2. Mini grid (tiles at 40 px, no characters, icons only).
3. Learning card.
4. Primary action: **Share result**. Secondary: **Practice more**.
5. Countdown: "Next word in 05:42:10" (tabular numbers).
6. Ad slot (§6.9).

### 6.8 Toasts and dialogs

- **Toasts:** dark ink background (`#1F1D1A`) with white text in both themes, 12 px radius, centered above the input bar. Shown for 2.5 seconds; announced with `aria-live="polite"`. Use for "Copied to clipboard" or "You already tried this word."
- **Dialogs:** use bottom sheets on compact screens and centered dialogs on larger screens. Always have a visible close button and close with the back button or Escape.
- **Destructive confirmation** ("Reset all data"): the confirming button uses `--color-error` outline style, never filled brand red.

### 6.9 Ad slot

- **Fixed height** (e.g. 100 px for a mobile banner) reserved even when no ad loads, so the layout doesn't jump.
- **Label:** "Advertisement" above the slot, `caption`, muted.
- At least **24 px** of space from any button above it.
- When no ad is shown, collapse the slot to a neutral divider rather than leaving an empty box. Collapse it **before** the results screen first renders, not afterward.
- Never place it next to the input, the suggestions, hint chips, or the share button.

### 6.10 Statistics

- Big numbers in `title` size with labels in `caption` underneath: Played · Win % · Current streak · Best streak.
- **Guess distribution:** horizontal bars, one per guess count (1–6). Bars use `--tile-absent`; today's result bar uses `--tile-correct`. The count is written at the end of each bar, not inside it.
- **Assisted wins:** a light striped pattern inside the bars, explained in a legend.

---

## 7. Iconography

- **Style:** outline icons, 1.75 px stroke, rounded caps and joins, on a 24 px grid. Recommended set: **Lucide** (ISC license) or Material Symbols Rounded (Apache 2.0). Use only one set.
- **Sizes:** 24 px (standard), 20 px (inline), 14 px (tile states).
- Icons always have a text label or an accessible name.

| Meaning | Icon |
|---|---|
| Correct | check |
| Present | arrow-left-right |
| Hint | lightbulb |
| Locked | lock |
| Audio | volume-2 |
| Save / saved | star / star (filled) |
| Share | share-2 |
| Stats | bar-chart-2 |
| Settings | settings |
| Help | circle-help |
| Rewarded ad | play-circle |

---

## 8. Motion

Motion explains what changed; it is never decoration.

| Moment | Animation | Duration | Easing |
|---|---|---|---|
| Tile reveal | Flip on the X axis, color changes at the midpoint; second tile starts 150 ms after the first | 300 ms per tile | `ease-in-out` |
| Invalid guess | Horizontal shake, 3 cycles, ±6 px | 300 ms | linear |
| Pending tile appears | Scale from 0.9 to 1 | 120 ms | `ease-out` |
| Win | Both tiles bounce once (translate Y −8 px), 100 ms apart | 250 ms | `ease-out` |
| Suggestion list open | Fade in + 4 px upward slide | 120 ms | `ease-out` |
| Screen change | Cross-fade | 150 ms | `ease-in-out` |
| Seal stamp (after first win of the day) | Seal scales from 1.3 to 1 with a slight rotation (−4° → 0°), like pressing a stamp | 250 ms | `cubic-bezier(.2,.8,.2,1)` |

**Rules:**

- **Reduced motion** (system setting or in-app option): replace all movement with a 150 ms color/opacity fade. No flips, shakes, or bounces.
- The input stays usable while tiles animate; animations never block typing.
- Nothing flashes more than 3 times per second.
- No confetti or particle effects.

---

## 9. Sound

Sound is **off by default**, except pronunciation audio, which plays only when tapped.

If sound effects are turned on in Settings:

- Short, soft sounds (under 200 ms), inspired by wood blocks or a light brush tap — not arcade beeps.
- One sound for submitting a guess, and one gentle chime for winning. No sound for losing.
- Sound effects never play over pronunciation audio.

---

## 10. Writing style

### 10.1 Voice

**A friendly, patient tutor.** Encouraging but never childish; precise but never academic.

| Do | Don't |
|---|---|
| "Not in our dictionary. Try another word." | "Invalid input!" |
| "So close! Today's word was 朋友." | "You lost. Game over." |
| "Solved in 3 — nice work." | "AMAZING!!! 🎉🎉🎉" |
| "Unlocks after 2 guesses." | "You can't use this yet." |

### 10.2 Rules

- **Sentence case** for everything: titles, buttons, labels.
- **Short:** messages fit on one line on a 360 px screen where possible.
- **Use "you"**, and present tense.
- **Show pinyin with tone marks** in the interface (`péngyou`), never tone numbers. Tone numbers are only an input method.
- **Chinese punctuation** in Chinese sentences (`，。！？“”`), Latin punctuation in English text.
- Use the selected script for all Chinese text, including example sentences and hints.
- **Dates:** `YYYY-MM-DD` in share text; elsewhere follow the device locale.
- Avoid idioms and slang in English text; many players are not native English speakers.
- Emoji appear only in share text, never in UI messages.

---

## 11. Share format

The share text is defined in `TECH_SPEC.md` §6.6. Visual rules:

- Use 🟩 / 🟨 / ⬜ by default, matching jade, amber and stone. In high-contrast mode, use 🟧 / 🟦 / ⬜.
- One line per guess, two squares per line.
- Optional (post-MVP): a share **image**, 1080 × 1350 px, with the paper background, seal, puzzle number, and the grid without characters.

---

## 12. Accessibility checklist

- [ ] Text contrast is at least 4.5 : 1; non-text UI elements at least 3 : 1.
- [ ] Every tile state uses an icon or label in addition to color.
- [ ] High-contrast tile mode is available.
- [ ] All touch targets are at least 48 × 48 px.
- [ ] Layout works at 200% zoom and with the largest Android font size.
- [ ] Chinese text has the correct `lang` attribute.
- [ ] Focus is always visible: 2 px `--color-focus` ring with a 2 px offset.
- [ ] Reduced motion replaces all movement with fades.
- [ ] Screen readers announce tile results, suggestion counts, and toasts.
- [ ] Nothing depends on hover.

---

## 13. Store and marketing assets

| Asset | Spec |
|---|---|
| Play Store icon | 512 × 512 px, from the app icon (§2.2) |
| Feature graphic | 1024 × 500 px: paper background, seal on the left, tagline on the right; no screenshots or small text |
| Screenshots | 1080 × 1920 px phone captures, at least 4: game in progress, pinyin suggestions, learning card, statistics. Show one simplified and one traditional screenshot. |
| Tagline | "One Chinese word a day." |
| Web social preview (`og:image`) | 1200 × 630 px, same style as the feature graphic |

Screenshots use real game screens with readable example words. Don't show a real future answer.

---

## 14. Design tokens (CSS)

Starting point for `src/ui/tokens.css`:

```css
:root {
  /* Color — light */
  --color-bg: #FAF7F0;
  --color-surface: #FFFFFF;
  --color-text: #1F1D1A;
  --color-text-muted: #5C5750;
  --color-border: #8A8378;
  --color-divider: #E6E0D4;
  --color-brand: #B83227;
  --color-on-brand: #FFFFFF;
  --color-focus: #1D4ED8;
  --color-error: #A3352B;

  /* Tiles */
  --tile-correct: #2E7253;
  --tile-present: #9A5B0B;
  --tile-absent: #6B655E;
  --tile-text: #FFFFFF;

  /* Type */
  --font-zh-hans: "PingFang SC", "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif;
  --font-zh-hant: "PingFang TC", "Noto Sans CJK TC", "Source Han Sans TC", "Microsoft JhengHei", sans-serif;
  --font-latin: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif;

  /* Spacing */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 24px; --space-6: 32px; --space-7: 48px; --space-8: 64px;

  /* Shape */
  --radius-tile: 8px;
  --radius-control: 12px;
  --radius-card: 16px;
  --radius-sheet: 20px;
  --shadow-float: 0 4px 16px rgb(0 0 0 / 0.12);

  /* Motion */
  --duration-fast: 120ms;
  --duration-base: 150ms;
  --duration-flip: 300ms;
}

[data-theme="dark"] {
  --color-bg: #17150F;
  --color-surface: #24211B;
  --color-text: #F2EEE6;
  --color-text-muted: #B5AEA3;
  --color-border: #6E685F;
  --color-divider: #34302A;
  --color-brand: #E8695C;
  --color-on-brand: #17150F;
  --color-focus: #7AA2F7;
  --color-error: #F08A7E;
}

[data-contrast="high"] {
  --tile-correct: #C2410C;
  --tile-present: #1D4ED8;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-flip: 0ms;
  }
}
```

Dark mode follows `prefers-color-scheme` unless the player picks a theme in Settings, which sets `data-theme` on `<html>`.
