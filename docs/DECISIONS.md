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

