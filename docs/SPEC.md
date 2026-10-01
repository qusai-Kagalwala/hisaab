# Hisaab — Product & Technical Specification

> "Log it as fast as you pay it."

## 1. Vision
A private, offline-first personal finance app for India where logging an
expense is faster than the UPI payment itself. Users can allocate leftover
money into buckets, track goals, and optionally use AI to understand their
money and find ballpark ideas for what their remaining budget can do.

**One-line vision:** A private, local-first personal finance app that makes it
effortless to capture transactions, understand your money, allocate what
remains, plan your goals, and use AI to explore what you can realistically do
with your budget.

## 2. Principles
1. **Speed:** logging an expense takes ≤3 taps and <3 seconds.
2. **Offline-first:** no login, no server, no internet required for core use.
3. **Manual entry:** users type numbers; no bank, UPI or SMS integration.
4. **AI is optional:** every core feature works with AI switched off.
5. **User decides:** templates and suggestions are never financial advice.
6. **Engine calculates, AI explains:** AI never performs money arithmetic.
7. **Simple surface:** power lives under the hood, never in the user's face.

## 3. Tech stack
| Area | Choice |
|---|---|
| App | React Native (Expo) + TypeScript |
| Storage | expo-sqlite |
| Secrets | expo-secure-store (user-provided Gemini key) |
| State | Zustand |
| Widget | react-native-android-widget (needs dev build) |
| Voice | On-device speech-to-text |
| AI | Gemini REST API, single provider, Search grounding for Ideas |
| Tests | Jest |

## 4. Data rules
- All money stored as **INTEGER paise**. Never floats.
- Transactions are **immutable**. Edits create correction entries.
- Balances are **computed**, never stored.
- Buckets are **virtual sub-accounts**: `sum(buckets) + unallocated = account total`.
- A bucket allocation is **planned money**, never an expense.

## 5. Data model (SQLite)
```
accounts(id, name, type[cash|upi_bank|other], created_at)
categories(id, name, icon, keywords_json, is_default)
transactions(id, account_id, category_id, bucket_id?, amount_paise,
             type[expense|income|transfer|correction], note, created_at,
             corrects_id?)
recurring(id, type[income|expense], amount_paise, account_id, category_id,
          rule[monthly|weekly|custom], next_due, active)
pending_recurring(id, recurring_id, due_date, status[pending|confirmed|skipped])
buckets(id, name, period_month, allocated_paise)
goals(id, name, target_paise, target_date?, created_at)
goal_contributions(id, goal_id, amount_paise, created_at)
merchant_memory(id, text_pattern, category_id, hit_count)
chat_history(id, role, content, created_at)
settings(key, value)   -- ai_enabled, city, model chain, template, etc.
```

## 6. Concepts
| Concept | Meaning | Example |
|---|---|---|
| Goal | Long-term target | Laptop → ₹80,000 |
| Bucket | This month's spending intention | Entertainment → ₹3,000 |
| Transaction | Actual money spent | Movie → ₹450 |

Flow: `₹30,000 remaining → ₹3,000 Entertainment → ₹450 movie → ₹2,550 left`

Loop: **MONEY → ALLOCATION → SPENDING → REMAINING → IDEAS**

## 7. Features

### 7.1 Capture (build first, make it perfect)
- App opens directly to a numeric keypad.
- Flow: type amount → tap category → saved.
- Category pre-selected by guess (time of day + merchant_memory).
- Defaults: date = now, account = last used.
- Quick-add chips learned from frequent entries (e.g., "Chai ₹20").
- Long-press to repeat last entry.
- Text entry: "₹200 lunch", "chai 20", "auto 50 cash", "2k rent".
- Voice entry via on-device speech-to-text using the same parser.
- Undo toast (5s) instead of confirmation dialogs.
- Android home-screen widget: amount + category without opening app.
- (Later) Android quick-settings tile.

### 7.2 Accounts & recurring
- Accounts: Cash, UPI/Bank, custom. Numbers only.
- Recurring income/expenses behave like autopay. On due date show:
  **"Expected ₹X — received?"** [Confirm] [Edit amount] [Skip].
- Never add recurring entries silently.
- Fixed commitments are reserved first; the rest is **Unallocated**.

### 7.3 Buckets (flexible allocation) — optional
- Prompt: "You have ₹X unallocated. Divide it into buckets?"
- Allocate by % or ₹; always display both.
- Templates (editable, labelled "starting point, not advice"):
  - **Custom** — user sets everything
  - **Balanced** — Savings 30, Family 20, Personal 20, Entertainment 10, Education/Activities 10, Flexible 10
  - **Student** — Education 25, Savings 30, Personal 20, Entertainment 10, Transport 10, Other 5
- Never assume any family percentage.
- Expenses draw down a bucket: allocated → spent → remaining.
- Move money between buckets anytime.
- Overspend: ask "Cover ₹X from which bucket?" (Flexible pre-selected).
- Month-end rollover per bucket: Keep / Move to Savings / Move to Flexible,
  with "remember my choice".

### 7.4 Goals
- Progress bar and ETA at current pace ("Laptop by March").
- "What if +₹500/month?" slider → instant ETA update (pure math).

### 7.5 Home screen
- One big number: **Safe to spend today**
  = Flexible/unallocated remaining ÷ days left in month.
- Bucket fill bars below (₹2,550 of ₹3,000 left).
- Buttons: Add, Chat, Ideas. Everything else one tap deeper.

### 7.6 Offline heuristic engine
- Parser: regex for amounts (₹200, 200rs, 2k, 1.5k) + keyword dictionary
  incl. Hindi/Hinglish (chai, khana, auto, kiraya, sabzi, doodh, etc.).
- Category learning via merchant_memory.
- Rule-based insights:
  - "Food is 30% higher than last month"
  - "Entertainment bucket at 80%"
  - "At this pace you'll overspend Food by ₹600"
- **Can I afford this?** → impact on buckets, safe-to-spend, goal ETAs.

### 7.7 AI layer (optional, online only)
- Single provider (Gemini) with configurable chain:
  `PRIMARY_MODEL → FALLBACK_1 → FALLBACK_2 → FALLBACK_3`
- On quota/unavailable errors (e.g., 429, 503) move down the chain.
- Respect provider terms; never rotate keys to bypass limits.
- Task tiers: light model for parsing edge cases/short replies; stronger
  model for monthly analysis and goal planning.
- **Context Builder** sends only numbers the question needs.
- Weekly 3-line summary (opt-in).
- Global AI-off switch.
- Settings screen explains what data is sent and to whom.

### 7.8 Hisaab Assistant (chatbot)
- Answers in English, Hindi or Hinglish about:
  - Holdings: "How much do I have?", "What's left in Entertainment?"
  - Spending: "Where did my money go this month?"
  - Goals: "When will I reach my laptop goal?"
  - Decisions: "Can I afford ₹2,000 shoes this week?"
  - Personalised saving techniques from real patterns
  - General money education (emergency fund, 50/30/20)
- Pipeline: **Intent detection → Context Builder → Engine calculates → Gemini explains**
- Offline mode: keyword intents + templated answers (balance, bucket
  remaining, top category, goal ETA, can-I-afford).
- Guardrails:
  - Never invent numbers; say when data is missing.
  - No stock/fund/loan/product recommendations; general info carries a
    short "not financial advice" note.
  - Suggested actions run only after a confirm tap.
- Quick chips: "What's left?", "Can I afford…", "How do I save more?"

### 7.9 Ideas — "What can I do under ₹X?"
- Amount defaults to a bucket's remaining.
- Online: Gemini + Search grounding. Send only amount, city, optional mood
  (outdoor / food / chill / social).
- Output grouped in bands: under ₹100, ₹100–200, ₹200–500, ₹500+.
  All prices labelled "approximate".
- No booking APIs, no BookMyShow integration.
- Offline fallback: built-in evergreen ideas per price band.

### 7.10 Backup
- Local export/import as JSON.
- (Future) optional encrypted cloud backup.

## 8. Onboarding (max 3 questions, all skippable)
1. How do you usually get money? → add recurring income
2. Any fixed payments? → add recurring expenses
3. Pick a bucket template

## 9. UX rules
- Mobile-first, thumb-reachable controls, large tap targets.
- Only amount is mandatory.
- Light/dark mode; ₹ with Indian grouping.
- Friendly, non-judgmental microcopy.

## 10. Out of scope
Bank/UPI/SMS integration, live booking APIs, multiple AI providers,
login/accounts, investment advice.

## 11. Build phases
Complete each phase, run tests, update PROGRESS.md, then **stop for review**.

1. **Foundation:** setup, DB schema, money utils (paise), Capture screen, accounts, history, undo.
2. **Money model:** recurring + confirm flow, buckets, rollover, Home + Safe-to-spend.
3. **Smarts offline:** goals + what-if, heuristic parser & insights, Can-I-afford, offline chat intents.
4. **AI:** Gemini service + fallback chain, Context Builder, Assistant chat, weekly summary, Ideas + offline fallback.
5. **Polish:** Android widget, quick tile, onboarding, backup, final UX pass.
7. **Simpler, safer, more trusted (tester feedback):** privacy promise first, pick-your-features, simple Savings, buckets as an explained advanced feature, app lock, Google backup that includes the ledger, password-protected and weekly backups, "This month" widget, calm motion.
6. **Best of the references (budget.io, Hisaabat):** transfers between accounts, borrow & lend with no-interest repayment plans, removable accounts, bottom tab bar, History search/filters, month browsing + month stats, CSV export, optional reviewed import, theme setting, new app icon, splash + light motion, smaller APK.

## 12. Quality
- Unit tests: money math, parser, bucket reconciliation, rollover, goal ETA, safe-to-spend.
- Invariant check: `sum(buckets) + unallocated == account totals`.
- Success test: a new user logs "₹40 chai" in under 3 seconds.
