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

