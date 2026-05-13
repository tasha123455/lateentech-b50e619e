# Full coverage translation — AI fallback for everything not in the dictionary

## Why the previous build left text untranslated

The dashboard translator only swaps phrases that exist in the hand-curated dictionary. The two dashboard HTML bodies + their dynamic JS contain hundreds of unique English strings (product copy, balance labels, chart legends, drawer items, sheet headings, status pills, helper text, "Add product" sheet fields, currency picker rows, etc.). Hand-translating every one of them × 50 languages is not realistic.

## Fix: Lovable AI fills every gap, cached forever

Keep the existing static dictionary for instant common UI (Home, Sign in, Continue…) and add a Lovable AI translator that handles **everything else**, with a permanent cache so each phrase is translated once per language and reused forever.

### Flow

1. DOM walker collects every English text node inside the page (dashboards, modals, drawers, sheets, charts) plus `placeholder/title/aria-label`.
2. Static dictionary lookup first — instant.
3. Anything missing is batched and sent to Lovable AI Gateway (Gemini 2.5 Flash) in one request: `{lang, phrases: ["…", "…"]}` → `{translations: ["…", "…"]}`.
4. Results stored in `localStorage` under `lateen_t_<lang>` and applied to the DOM. Next visit / next language switch reads from cache instantly — no AI call.
5. Numbers, currency codes, and pure-symbol strings (`$1,234`, `100%`, `12:30`) are detected by regex and skipped — they stay English.

### What you'll see

- Switch to *日本語* the first time → ~1 second loading shimmer on the dashboard while AI translates the new strings, then the entire screen is in Japanese including every product card, every menu item, every status, every sheet, every chart label.
- Switch back to *English* → instant.
- Switch to *日本語* again later → instant (cached).
- Numbers stay as digits everywhere; only words translate.

### Technical bits

- New TanStack server function `src/lib/translate.functions.ts` calls Lovable AI Gateway with the AI-translation system prompt ("Translate UI strings to <lang>. Return JSON array, same length, preserve placeholders, do not translate numbers/proper nouns/currency codes.").
- New `src/i18n/aiCache.ts` — read/write `localStorage[lateen_t_<lang>]` as `Record<english, translated>`.
- `translateDOM()` in `LanguageContext.tsx` is upgraded:
  - phase 1 (sync): apply dictionary + cache
  - phase 2 (async): collect untranslated phrases, call server fn, write to cache, apply
- A small skip-regex (`^[\d\s.,:%$€£¥₹\-/+()]+$`) keeps numbers and money intact.
- The walker also runs on a `MutationObserver` so dashboard content created after mount (charts, drawers opened later) gets translated automatically.
- `LATEEN_AI_*` secrets already provisioned via Lovable Cloud; no user setup.

### Out of scope (kept English on purpose, per your instruction)

- Numbers, percentages, money amounts, dates expressed as digits.
- User-typed content (their own product names, their own notes) — only the app chrome translates.

## Verification

1. New language → loading flicker once, then **every** word in the UI is translated, including the parts that were still English before.
2. Numbers (`$1,290`, `42%`, `12:30`) stay English in every language.
3. Re-pick the same language later → instant, no flicker.
4. Open a sheet that wasn't visible at first load → its contents also translate.
