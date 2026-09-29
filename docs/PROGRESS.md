# PROGRESS — Hisaab

Claude updates this file at the end of every phase.
Status: ⬜ not started · 🟨 in progress · ✅ done

## Current phase
Phase 6 — Best of budget.io + Hisaabat ✅ (awaiting owner review on the APK)

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

## Phase 5 — Polish ✅
- [x] Android widget "Hisaab quick log" (react-native-android-widget): safe to spend today, one-tap logging from quick chips with 2-minute Undo, + opens the keypad. Logic in `src/widget/actions.ts` (tested); UI/handler load only when the native module exists
- [x] In-app mic (expo-speech-recognition, on-device when supported) in typing mode; hidden where unavailable (Expo Go/web) — keyboard mic still works
- [ ] Quick-settings tile — skipped: the only library is v0.1.0 with an iOS-only dependency; widget + icon cover the need
- [x] Onboarding: balances + 3 questions (income, fixed bills, bucket template), all skippable; only on a fresh install
- [x] JSON export/import (done in Phase 4)
- [x] Final UX pass: icons instead of emojis, app logo, dark-mode check, expo-system-ui for native dark mode, dev-build profile
- [ ] 3-second chai test — to be timed by the owner on the installed APK

Notes:
- Not verifiable here: native compile/run of the widget and mic (no Android SDK in this environment). `expo prebuild` was run in a scratch copy and generated the widget receiver, font, preview and mic permission correctly.
- Entry is now `index.ts` (registers the widget task, then `expo-router/entry`).

## Phase 6 — Best of the references ✅
- [x] Move money between accounts (Bank → Cash): not spending, totals unchanged; editable/deletable like any entry
- [x] Borrow & lend: I borrowed / I lent, per-person totals, partial repayments, settled list
- [x] Repayment plans for borrowed money: by months or amount per month, full breakdown, no interest; this month's instalment kept aside; "₹X due to Rahul — paid?" card (never automatic); change plan later
- [x] Remove any account (incl. Cash): move its money or set to ₹0; bills move along; bring back later
- [x] Bottom tab bar: Home · History · + · Insights · More (app still opens on +)
- [x] History: search (notes, categories, accounts, people), type and account filters, recurring mark, clear labels for moves and borrow/lend
- [x] Insights: month browsing, money in/out, % saved, average a day, biggest days, largest spend; CSV download
- [x] Optional import (paste or CSV, incl. budget.io export) with review, duplicate detection and undo; optional AI help for unread lines only
- [x] Theme: Same as phone / Light / Dark
- [x] New app icon (khata + ₹), branded splash, gentle opening animation, animated undo toast, tab fade
- [x] Smaller APK: preview build is arm64-only; version 1.1.0 (versionCode 2)

Notes:
- Migration 6 adds columns/table only; tested upgrading a Phase 5 database with corrections (balances unchanged).
- Not verifiable here: APK size and on-device look of the splash/icon (needs the EAS build).

## Optimisation pass (after Phase 6) ✅
- [x] Speed: cached, append-only ledger (only new rows read), faster balances, debts grouped once; deferred History search; windowed list
- [x] Size: compressed images; optional `preview-small` build with Android code shrinking (test before using)
- [x] Data safety: backup reminder card; dev-only self-checks (cache vs full read, money invariant)
- [x] Feel: haptic tap on save; large-font caps; onboarding mentions borrow & lend
- [x] Code: ledger store split by topic; GitHub Actions CI (tsc, lint, tests)
- [ ] On-device automated tap tests (Maestro) — needs a phone/emulator; skipped for now
- [x] Widget + opens the app even when it's closed (library patch: activity PendingIntent)
- [x] Crash-proofing: lock-safe migrations, widget fallback render, root error screen, retry on load failure
- Version 1.2.0 (versionCode 3)

## Session log
<!-- Newest first. One line per session: date — what was done — what's next -->
- 2026-09-29 — Crash on consecutive deletes (react-native-screens header update on a closing screen) → titles set only on change, Edit screen frozen; 1.2.3 — next: owner rebuilds from main.
- 2026-09-29 — Widget chips now show recent spends until frequent ones exist; 1.2.2 — next: owner rebuilds from main.
- 2026-09-29 — Owner crash on 1.2.0 ("NativeDatabase.execAsync rejected — NullPointerException"): the widget shared and then closed the app's DB connection → widget now uses its own connection; 1.2.1 — next: owner rebuilds and re-tests with the widget on the home screen.
- 2026-09-29 — Owner report: widget + only worked with the app in the background → patched the widget library to open via an activity intent; hardened migrations/widget/error screens; 280 tests green — next: owner builds 1.2.0 and tests + with the app fully closed.
- 2026-09-29 — Optimisation pass: ledger cache (~14× faster reload at 10k entries), image compression, optional R8 profile, backup reminder, haptics, store split, CI; 278 tests, tsc, lint green; browser run-through passed — next: owner tests APK 1.1.0, then builds 1.2.0.
- 2026-09-29 — Phase 6: transfers, borrow & lend with no-interest plans, removable accounts, tab bar, History search/filters, month stats, CSV export/import, theme setting, new icon + splash + motion, arm64 APK; 274 tests, tsc, lint green; Android bundle + prebuild OK; browser run-through passed — next: owner builds APK 1.1.0.
- 2026-09-28 — Phase 5: home-screen widget (tested logic + guarded native UI), in-app mic, onboarding, shared DB snapshot for app+widget, expo-system-ui, dev-build profile, INSTALL updates; quick tile skipped; 226 tests, tsc, lint green; Android+web bundles and prebuild OK — next: owner builds APK and tests widget/mic.
- 2026-09-28 — Replaced all UI emojis with Material Community Icons (migration 5 for categories), new ₹-tick app logo and adaptive icons, friendlier no-balance Home state — next: Phase 5.
- 2026-09-28 — Owner feedback: redesigned Ask Hisaab (chip row stretched the screen), Home now explains safe-to-spend step by step (engine `explainSafeToSpend`, always equals the number), new How-it-works page incl. where to add the AI key; 222 tests — next: Phase 5 after APK.
- 2026-09-28 — Phase 4 built: Gemini (own key, fallback chain, context builder, number guard), AI chat/weekly/Ideas with offline fallbacks, Insights charts, backup export/import, EAS APK config + INSTALL.md; 221 tests, tsc, lint green; Android+web bundles build; browser run-through passed — next: owner builds APK, then Phase 5 (widget).
- 2026-09-28 — Phase 3 Smarts offline built: text/voice-via-keyboard entry with parser + merchant learning, quick chips, repeat last, goals + what-if, insights, can-I-afford, offline Hinglish chat; 191 tests, tsc, lint green; browser run-through passed — next: owner review, then Phase 4 plan.
- 2026-09-28 — Buckets can be removed any time (card "Remove", detail screen) or all turned off, with undo; fixed bucket-detail crash (unstable zustand selector), nested buttons, and back navigation after template pick; 102 tests — next: owner re-tests, then Phase 3 plan.
- 2026-09-28 — Phase 2 Money model built: recurring + confirm cards, buckets/templates/plan/move/cover, rollover, Home + safe-to-spend, balance updates; 97 tests, tsc, lint green; browser run-through incl. month change passed — next: owner review, then Phase 3 plan.
- 2026-09-28 — Fix: pinned reanimated/worklets/gesture-handler to SDK 57 versions (npm had pulled newer ones → Expo Go crash); metro.config.js for expo-sqlite on web (wasm + COOP/COEP); boxShadow instead of shadow* — next: owner re-tests on phone.
- 2026-09-28 — Phase 1 Foundation built: schema+migrations, money utils, capture, undo, history, edit via corrections, accounts; 53 tests, tsc, lint green; web smoke test passed — next: owner review, then Phase 2 plan.
