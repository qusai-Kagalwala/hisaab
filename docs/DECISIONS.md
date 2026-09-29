# DECISIONS — Hisaab

Decisions already made. Do not revisit unless the owner asks.
Add new entries at the bottom: date, decision, reason.

| # | Decision | Reason |
|---|---|---|
| 1 | Manual entry only; no bank, UPI or SMS integration | Simplicity, privacy; SMS access is Android-only and Play Store-restricted |
| 2 | Offline-first, no login, no server | No dependence on external services |
| 3 | AI is optional; app fully works without it | Reliability and honest privacy |
| 4 | Single AI provider (Gemini) with model fallback chain | Simple architecture, efficient free-tier use |
| 5 | Engine calculates, AI only explains | LLMs are unreliable at arithmetic |
| 6 | Money stored as integer paise | Avoid floating-point errors |
| 7 | Immutable transactions; computed balances | Traceable, bug-resistant ledger |
| 8 | Buckets = planned money, never expenses | Avoid fake spending |
| 9 | Recurring entries need a confirm tap | Keep numbers accurate if payments are late or differ |
| 10 | Templates are starting points, never advice; no assumed family % | Users' situations differ |
| 11 | Ideas give ballpark price-band suggestions, no booking APIs | Avoid fragile external dependencies |
| 12 | Offline heuristic engine as base layer; AI enhances | Works without internet |
| 13 | Chatbot never recommends financial products | Safety; not a financial advisor |
| 14 | React Native (Expo) + SQLite | Fits existing React skills; local storage |
| 15 | Edit = correction row holding the **full** new values, `corrects_id` → original; latest correction (highest id) wins; delete = correction with amount 0 | Diff-style corrections can't express category/account changes |
| 16 | Undo within the 5s window after **creating** an entry hard-deletes that row (only if uncorrected); undo of an edit/delete appends a restoring correction | A mistaken tap never happened; everything else stays append-only |
| 17 | `transactions.amount_paise` is always ≥ 0; the sign comes from `type`. DB trigger blocks every UPDATE on transactions | Enforce immutability at the lowest level |
| 18 | Timestamps are INTEGER epoch ms; a correction's `created_at` is when it was made, the entry's date stays the original's | Clear audit trail; date editing deferred |
| 19 | Added `categories.kind` (expense/income) to the SPEC schema; default category ids are fixed so engine rules survive renames | Capture shows only relevant categories; guesses need stable ids |
| 20 | Capture has a "Spent / Money in" toggle (expense default) | Balances need income before recurring arrives in Phase 2 |
| 21 | Routes in `src/app/` (Expo Router) are thin wrappers over `src/features/` screens | Satisfies both AGENTS.md (router) and CLAUDE.md (features folders) |
| 22 | Category guess is time-of-day only for expenses; no guess for income or late night | Don't assume salary vs pocket money; a wrong highlight is worse than none |
| 23 | App still opens on the keypad; a "Today ₹X" pill (with a badge for pending items) opens Home | Speed rule #1 beats SPEC §7.5's home-first layout |
| 24 | `unallocated = account totals − reserved bills − Σ bucket remaining`; reserved = pending bill cards + bill occurrences left this month; income is never counted before it's confirmed | Makes `sum(buckets) + reserved + unallocated == totals` hold by construction |
| 25 | Safe to spend = (Flexible remaining + unallocated − uncovered overspends) ÷ days left incl. today, rounded down, never below ₹0 | Never overstate; overspends must be paid from the free pool |
| 26 | An expense's bucket is fixed at save time from the category→bucket list (else Flexible); changeable in Edit as a correction. Expenses before buckets existed don't count | Keeps capture at 3 taps and avoids double counting |
| 27 | Recurring confirmations are dated when confirmed and never drawn from a bucket | Money moved then; bills are reserved outside buckets |
| 28 | Every month has one Flexible bucket (Student's "Other" plays it) and templates' Savings is the Savings role; neither can be deleted | Overspend cover and safe-to-spend need a defined free pool |
| 29 | Bucket allocations are editable plan numbers (not ledger entries); moves/covers/plan saves are undoable by restoring previous allocations | Buckets are plans, not money movements |
| 30 | Rollover copies last month's buckets at ₹0 and routes positive leftovers (Keep/Savings/Flexible); overspent buckets start fresh; remembered choices auto-apply only when every leftover has one | User decides; nothing silent unless they opted in |
| 31 | "Update balance" writes the difference as a normal income/expense under a hidden category | Needed for real starting balances; keeps ledger immutable |
| 32 | Any bucket (incl. Savings/Flexible, even with spending) can be removed; removal hides it (`buckets.removed`, migration 3) so history keeps pointing at it, and its leftover returns to unallocated. "Turn off buckets" removes all of the month's and stops suggesting them; a month whose buckets were all removed doesn't roll over. Undo restores exactly | Owner asked to remove/deselect buckets freely; immutable history must stay intact |
| 33 | Text entry uses the phone's own keyboard (incl. its mic for voice) behind an "Aa Type" toggle; the keypad stays default; the last mode is remembered | Owner: no custom keyboard; works in Expo Go; voice without a native module |
| 34 | Goals are set-aside money: `buckets + bills + goals + unallocated == totals`; contributions come from the Savings bucket first, then free money; "Done"/"Remove" releases it back | Keeps the invariant and never double-counts |
| 35 | Goal ETA uses net contributions over the last 90 days (window ≥30 days) scaled to a month, rounded down; ETA months rounded up | Conservative, never over-promises |
| 36 | Insights compare this month so far with the same days last month (≥₹500 base, ≥25% change), plus bucket ≥80% and pace projections from day 5; balance updates and confirmed bills excluded | Fair comparisons, no noise, no shame |
| 37 | Merchant memory learns only when the user picks/changes a category for a noted entry; a correction replaces the old mapping | Learns from real choices, not from guesses |
| 38 | Offline chat answers only from engine numbers via templates; products (stocks/funds/loans/insurance) are always declined; tips carry "not financial advice" | Guardrails from SPEC §7.8 before any AI exists |
| 39 | Gemini key is the user's own, stored only in expo-secure-store; sent as a header, only to Google; not in backups | Privacy; no server |
| 40 | Model chain is picked from the key's own `models.list` (no hard-coded model names); fallback on 429/5xx/404 only | Model names change; avoids stale IDs |
| 41 | AI replies are discarded unless every ₹ amount / number ≥100 appears in the facts sent, and they mention no financial products; product questions never reach the AI | Engine calculates, AI explains; no advice |
| 42 | Suggested actions (e.g. "Move ₹X from Flexible") are produced by the engine, shown under the answer, and run only on a tap (with undo) | AI never executes or invents actions |
| 43 | Charts: ranked horizontal bars for categories (not a donut), one-axis grouped bars for in/out, daily bars with a safe-to-spend reference line; blue/orange validated for CVD in both themes | Readability and accessibility |
| 44 | Backup/restore moved into Phase 4; restore replaces everything in one DB transaction and keeps a safety copy for Undo | Needed to move data from Expo Go to the APK |
| 45 | Distribution: EAS cloud build → APK (`preview` profile); no hosting needed. Optional static web export with COOP/COEP `_headers` | Offline-first app has no server |
| 46 | Home shows "Safe to spend today" with an expandable breakdown: accounts − bills − goals − still planned in non-Flexible buckets = free money; ÷ days left (today included). The breakdown is computed by the engine and must equal the safe-to-spend pool (tested) | Owner found the single number hard to understand |
| 47 | In-app "How Hisaab works" page (/about) with a step-by-step AI key guide; linked from Home, Settings and the chat empty state | Owner asked where to add the key and how to use the app |
| 48 | No emojis in the UI: one icon family (Material Community Icons via @expo/vector-icons) everywhere; categories store icon names (migration 5), with text fallback for old emoji values | Owner: emojis look "AI-like" and unpolished |
| 49 | App logo: white ₹ whose leg flows into a mint tick on brand green (#1F7A5C), used for launcher, adaptive and monochrome icons, favicon | A real identity for the APK instead of Expo placeholders |
| 50 | Home-screen widget logs only preset quick chips (Android widgets can't take text input); + opens the keypad; Undo lasts 2 minutes on the widget | Honest platform limit; keeps logging to one tap |
| 51 | Native-only features (widget, in-app mic) are loaded lazily and only if their native module exists; Expo Go and web keep working without them | Expo Go crashes on missing native modules |
| 52 | One `readSnapshot()` derives everything from the DB for both the app store and the widget background task | No duplicated money logic |
| 53 | Quick-settings tile not built (only library is v0.1.0 with an iOS-only dependency) | Avoid fragile native code that could break the APK build |
| 54 | Onboarding = balances + the SPEC's 3 questions, all skippable; shown only on a truly fresh install (no entries, bills or buckets) | Safe-to-spend needs a starting balance; existing users never see it |
| 55 | `expo-system-ui` added so `userInterfaceStyle: automatic` (dark mode) works in native builds | Found by `expo prebuild` |
| 56 | 2026-09-29 — Transfers reuse the existing `transfer` type with new columns (migration 6): `to_account_id` for a move between your accounts; `debt_id` + `direction` ('in'/'out') for borrow & lend. Corrections may change the destination account, never the person or direction | No table rebuild; old rows untouched; ledger stays immutable |
| 57 | Transfers and borrow/lend are never spending or income: excluded from insights, charts, % saved, buckets and quick picks automatically because they aren't `expense`/`income` | One rule instead of many special cases |
| 58 | Borrow & lend: a `debts` row holds only who + the plan; principal and repayments are ledger rows, so what's owed is always computed. Lent money has no plan | Balances computed, never stored |
| 59 | Repayment plans have no interest ever: N months split evenly to the paisa (first months carry odd paise) or a fixed amount per month (last instalment = remainder), max 120; same day each month, clamped for short months; payments fill instalments in order | Owner: "ask how many months and how much, break it down, no interest" |
| 60 | Borrowed money counts as money you have, but the unpaid instalments due by month-end are kept aside like a bill (`repayments_paise` in the money picture; invariant now Σ buckets + bills + repayments + goals + unallocated == totals). Due instalments show "₹X due to Rahul — paid?"; nothing is repaid without a tap | Safe-to-spend never counts money that must go back this month |
| 61 | Accounts can be removed (incl. Cash): money still in it is moved to another account (a transfer) or written off (balance update); bills/income move along; the account is hidden (`archived`), never deleted, and can be brought back | History keeps pointing at it; totals stay true |
| 62 | Import is optional and lives under More: pasted lines or a CSV (incl. the budget.io export) are shown for review, likely duplicates unticked, saved only on "Import" (undo 5s). Transfer rows aren't imported. Never SMS/bank access. Refines #1: still manual — the user chooses and confirms every row | Owner: "keep this optional" |
| 63 | Import AI help only on a tap, only for unread lines, only those lines sent (via `buildImportLines` in the Context Builder); an AI amount is kept only if its digits appear in the user's line | AI transcribes, never invents numbers |
| 64 | Navigation: bottom tabs Home · History · (+ Add, raised centre) · Insights · More; app still opens on Add; Android back returns to Add | Hisaabat-style dock without slowing logging |
| 65 | Month browsing lives in Insights (‹ month ›) with in/out, % saved, average/day, top days, largest spend; Home shows "kept X% so far". History gets search + type/account filters and a month/category filter from Insights | budget.io features that fit; Home stays about today |
| 66 | Theme: Same as phone / Light / Dark, stored in settings; applied in-app and via `Appearance.setColorScheme` for native parts | budget.io had a toggle; owner wants light & dark |
| 67 | New app icon: a cream khata (account book) with a green ₹ and gold ribbon on a green gradient; monochrome icon = ₹ only; branded splash (expo-splash-screen) that fades into a short fade/slide-in (skipped with Reduce motion, 0.9s safety) | Owner asked for a nicer home-screen icon and a slight opening animation |
| 68 | Preview APK builds only arm64-v8a (`ORG_GRADLE_PROJECT_reactNativeArchitectures` in eas.json) — roughly a third of the universal APK; Play Store builds (AAB) are split per device anyway | Owner: 103 MB APK is too big; arm64 covers phones from the last ~7 years |
| 69 | 2026-09-29 — The resolved ledger is cached per database and extended with only new rows (append-only); a fingerprint (row count, max id, amount total) detects undo/restore and forces a full rebuild; restore also clears it. Dev builds cross-check the cache against a full read on every load | Save + reload with 10,000 entries went from ~100 ms to ~7 ms (Node); correctness proven by a randomized test |
| 70 | History search uses React's deferred value, list rendering is windowed | Typing never waits for filtering |
| 71 | PNG assets palette-compressed (≈1 MB → ≈0.3 MB); the in-app logo stays full quality (gradient banding) | Smaller APK with no visible change |
| 72 | Android code shrinking (R8) is opt-in via the `preview-small` EAS profile (`app.config.js` adds expo-build-properties only when HISAAB_SHRINK=1) | Saves more MB but can break native libraries; must be tested on a device before becoming the default |
| 73 | Backup reminder on Home: 7 days after the first entry if never backed up, then every 30 days; "Later" hides it for 7 days; exporting a backup resets it | Data lives only on the phone; uninstall deletes it |
| 74 | Light haptic tap on save (keypad, quick chips, confirm cards); big amounts shrink to fit; keypad and category labels cap font scaling at 1.3× | Confirms without looking; large system fonts don't break layouts |
| 75 | Ledger store split by topic (`src/store/ledger/*`: accounts, people, goals, buckets, recurring, types); `useLedgerStore` API unchanged | Easier to change safely |
| 76 | CI (GitHub Actions, Node 22): type check, lint, tests on every push and PR. On-device tap-through tests (Maestro) not added: they need a phone/emulator run by the owner | Catch mistakes before an APK build |
