# PROGRESS — Hisaab

Claude updates this file at the end of every phase.
Status: ⬜ not started · 🟨 in progress · ✅ done

## Current phase
Phase 4 — AI + charts + backup ✅ (awaiting owner review) · next: Phase 5 — Widget & polish (needs the APK)

## Phase 1 — Foundation ✅
- [x] Expo + TypeScript project setup, lint, Jest
- [x] SQLite schema + migrations
- [x] Money utils (paise, ₹ Indian formatting) + tests
- [x] Accounts (Cash, UPI/Bank, custom)
- [x] Capture screen: keypad → category → save
- [x] Category guess (time of day)
- [x] Undo toast
- [x] Transaction history list
- [x] Correction entries for edits

Notes:
- Where things live: routes `src/app/` (thin) → screens `src/features/`;
  ledger/money/guess logic `src/engine/`; SQL `src/db/`; state `src/store/`.
- The full SPEC §5 schema is created in migration 1, so later phases mostly add queries.
- DB tests run the real migrations/queries against Node's built-in SQLite
  (`src/db/__tests__/nodeSqliteDb.ts`).
- Known gaps (by design, later phases): no transfers between accounts
  (engine throws if one appears), no opening balance (log "Money in" instead),
  entry date can't be edited yet, history loads everything (fine for now; page it later).

## Phase 2 — Money model ✅
- [x] Recurring income/expenses (monthly with short-month clamping, weekly; pause/resume)
- [x] "Expected ₹X — received?" confirm flow (Confirm / Edit amount / Skip, all undoable)
- [x] Unallocated calculation (account totals − bills kept aside − bucket remaining)
- [x] Buckets (% and ₹) + templates (Balanced, Student, Custom — "starting point, not advice")
- [x] Move money between buckets
- [x] Overspend "cover from which bucket?" (Flexible pre-selected, non-blocking)
- [x] Month-end rollover (Keep / Savings / Flexible, "remember my choice")
- [x] Home screen + Safe to spend today (pill on the keypad screen opens Home)
- [x] Reconciliation invariant test (randomised, 200 rounds, incl. moves and covers)

Notes:
- Engine: `src/engine/{calendar,recurring,buckets,rollover}.ts`; data: `src/db/moneyQueries.ts`; migration 2.
- "Update balance" on Accounts logs only the difference under the hidden
  "Balance update" category (id 17) — Phase 3 insights must exclude it.
- "Custom" recurring rule from SPEC is not built yet (monthly/weekly only).
- Dev tip: run with `npx expo start --tunnel` if the phone can't reach the laptop.

## Phase 3 — Smarts offline ✅
- [x] Goals + ETA (pace = last 90 days, Savings bucket first, then free money)
- [x] What-if slider (+₹0…₹20,000/month → ETA)
- [x] Text parser (₹200 lunch, 2k, 1.5k, 1,00,000, Hinglish/Devanagari keywords + spoken numbers) + tests
- [x] Voice entry — via the phone keyboard's own mic in text mode (in-app mic moves to Phase 5 dev build)
- [x] merchant_memory learning (tap a category for a noted entry, or change it in Edit)
- [x] Quick-add chips (1 tap) + long-press amount to repeat last
- [x] Rule-based insights (pace, bucket ≥80%, category vs same days last month)
- [x] Can I afford this? (bucket, safe-to-spend, days of free money, goal delay)
- [x] Offline chat intents + templated answers (English + Hinglish, basic Devanagari)

Notes:
- Engine: `src/engine/{parser,goals,insights,afford,quickPicks,chat}.ts`; data: `src/db/smartQueries.ts`; migration 4.
- Typing uses the phone's own keyboard (no custom keyboard); the capture screen remembers keypad vs text mode.
- Chat context builder for Phase 4 already exists as `chatContext()` in `src/store/chatStore.ts` — move/trim into `src/ai/context.ts`.

## Phase 4 — AI (+ charts, backup, APK setup) ✅
- [x] Gemini client + configurable fallback chain (429/5xx/404 → next model; one key, never rotated)
- [x] Task tiering (goal/tips/weekly prefer "pro"-style models; the rest in chain order)
- [x] Context Builder (`src/ai/context.ts`) — only intent-specific engine totals; never notes/entries/account names
- [x] Hisaab Assistant chat + quick chips (AI explains; offline fallback)
- [x] Guardrails: number guard (AI numbers must come from facts), product filter, product questions never sent, actions only on confirm tap
- [x] Weekly summary (opt-in, once per week, cached)
- [x] Ideas: price bands with Google Search grounding + offline evergreen list
- [x] AI-off switch + "what is sent" explainer; key in expo-secure-store; models chosen from the key's own list
- [x] Charts (Insights): category ranking, day-by-day vs safe-to-spend, 6-month in vs out (palette validated for CVD, light+dark)
- [x] Backup export/import (moved up from Phase 5) with preview + undo
- [x] APK build config (`eas.json`, `android.package`) + `docs/INSTALL.md`

## Phase 5 — Polish ⬜
- [ ] Android widget (dev build)
- [ ] Quick-settings tile
- [ ] Onboarding (3 questions)
- [x] JSON export/import (done in Phase 4)
- [ ] Final UX pass + 3-second chai test

## Session log
<!-- Newest first. One line per session: date — what was done — what's next -->
- 2026-09-28 — Replaced all UI emojis with Material Community Icons (migration 5 for categories), new ₹-tick app logo and adaptive icons, friendlier no-balance Home state — next: Phase 5.
- 2026-09-28 — Owner feedback: redesigned Ask Hisaab (chip row stretched the screen), Home now explains safe-to-spend step by step (engine `explainSafeToSpend`, always equals the number), new How-it-works page incl. where to add the AI key; 222 tests — next: Phase 5 after APK.
- 2026-09-28 — Phase 4 built: Gemini (own key, fallback chain, context builder, number guard), AI chat/weekly/Ideas with offline fallbacks, Insights charts, backup export/import, EAS APK config + INSTALL.md; 221 tests, tsc, lint green; Android+web bundles build; browser run-through passed — next: owner builds APK, then Phase 5 (widget).
- 2026-09-28 — Phase 3 Smarts offline built: text/voice-via-keyboard entry with parser + merchant learning, quick chips, repeat last, goals + what-if, insights, can-I-afford, offline Hinglish chat; 191 tests, tsc, lint green; browser run-through passed — next: owner review, then Phase 4 plan.
- 2026-09-28 — Buckets can be removed any time (card "Remove", detail screen) or all turned off, with undo; fixed bucket-detail crash (unstable zustand selector), nested buttons, and back navigation after template pick; 102 tests — next: owner re-tests, then Phase 3 plan.
- 2026-09-28 — Phase 2 Money model built: recurring + confirm cards, buckets/templates/plan/move/cover, rollover, Home + safe-to-spend, balance updates; 97 tests, tsc, lint green; browser run-through incl. month change passed — next: owner review, then Phase 3 plan.
- 2026-09-28 — Fix: pinned reanimated/worklets/gesture-handler to SDK 57 versions (npm had pulled newer ones → Expo Go crash); metro.config.js for expo-sqlite on web (wasm + COOP/COEP); boxShadow instead of shadow* — next: owner re-tests on phone.
- 2026-09-28 — Phase 1 Foundation built: schema+migrations, money utils, capture, undo, history, edit via corrections, accounts; 53 tests, tsc, lint green; web smoke test passed — next: owner review, then Phase 2 plan.
