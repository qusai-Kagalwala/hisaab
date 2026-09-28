# PROGRESS — Hisaab

Claude updates this file at the end of every phase.
Status: ⬜ not started · 🟨 in progress · ✅ done

## Current phase
Phase 2 — Money model ✅ (awaiting owner review) · next: Phase 3 — Smarts offline

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

## Phase 3 — Smarts offline ⬜
- [ ] Goals + ETA
- [ ] What-if slider
- [ ] Text parser (₹200 lunch, 2k, Hinglish keywords) + tests
- [ ] Voice entry
- [ ] merchant_memory learning
- [ ] Quick-add chips + repeat last
- [ ] Rule-based insights
- [ ] Can I afford this?
- [ ] Offline chat intents + templated answers

## Phase 4 — AI ⬜
- [ ] Gemini client + configurable fallback chain
- [ ] Task tiering (light vs strong model)
- [ ] Context Builder (minimum data)
- [ ] Hisaab Assistant chat + quick chips
- [ ] Guardrails (no invented numbers, no product advice, confirm actions)
- [ ] Weekly summary (opt-in)
- [ ] Ideas: price-band suggestions + offline fallback
- [ ] AI-off switch + data disclosure screen

## Phase 5 — Polish ⬜
- [ ] Android widget (dev build)
- [ ] Quick-settings tile
- [ ] Onboarding (3 questions)
- [ ] JSON export/import
- [ ] Final UX pass + 3-second chai test

## Session log
<!-- Newest first. One line per session: date — what was done — what's next -->
- 2026-09-28 — Buckets can be removed any time (card "Remove", detail screen) or all turned off, with undo; fixed bucket-detail crash (unstable zustand selector), nested buttons, and back navigation after template pick; 102 tests — next: owner re-tests, then Phase 3 plan.
- 2026-09-28 — Phase 2 Money model built: recurring + confirm cards, buckets/templates/plan/move/cover, rollover, Home + safe-to-spend, balance updates; 97 tests, tsc, lint green; browser run-through incl. month change passed — next: owner review, then Phase 3 plan.
- 2026-09-28 — Fix: pinned reanimated/worklets/gesture-handler to SDK 57 versions (npm had pulled newer ones → Expo Go crash); metro.config.js for expo-sqlite on web (wasm + COOP/COEP); boxShadow instead of shadow* — next: owner re-tests on phone.
- 2026-09-28 — Phase 1 Foundation built: schema+migrations, money utils, capture, undo, history, edit via corrections, accounts; 53 tests, tsc, lint green; web smoke test passed — next: owner review, then Phase 2 plan.
