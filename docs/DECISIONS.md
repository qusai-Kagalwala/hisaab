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
