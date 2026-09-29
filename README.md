<p align="center">
  <img src="docs/logo.png" width="96" alt="Hisaab logo" />
</p>

<h1 align="center">Hisaab</h1>

<p align="center"><em>Log it as fast as you pay it.</em></p>

<p align="center">
  A private, offline-first money diary for India — no login, no server, no bank or SMS access.
</p>

---

## What it does

| | |
|---|---|
| **3-tap logging** | Type the amount, tap a category — done. Or type “chai 20”, use your keyboard's mic, tap a quick chip, or log from the home-screen widget. |
| **Safe to spend today** | One number: what you can spend today and still be fine for the month — with a step-by-step “how is this worked out?”. |
| **Bills & income** | Rent, salary, recharges. On the day: “Expected ₹X — received?” Nothing is ever added without your tap. |
| **Buckets (optional)** | Plan the month like envelopes: Savings, Personal, Fun, Flexible… Cover overspends, roll leftovers over. |
| **Goals** | Save up for something; see when you'll get there and how a bit more each month changes it. |
| **Borrow & lend** | Borrowed or lent money isn't spending or income. Borrowed money gets a **no-interest repayment plan** (by months or amount per month) and each month's payment is kept aside. |
| **Move money** | Bank → Cash and back, without it counting as spending. Add or remove accounts any time. |
| **History & Insights** | Search and filter everything; browse months with money in/out, % saved, biggest days and category charts. |
| **Ask Hisaab** | Questions in English, Hindi or Hinglish — answered from your own numbers, offline. Optional Gemini AI makes answers friendlier. |
| **Backup, CSV, import** | JSON backup/restore, spreadsheet export, and an optional reviewed import (pasted text or CSV). |
| **Light & dark** | Follows your phone, or pick one. |

## Principles

- **Offline-first & private** — everything lives on the phone; no account, no server.
- **Manual entry** — you log it (or import and confirm it). No bank, UPI or SMS reading.
- **Money is exact** — stored as integer paise, never floating point.
- **History never changes** — edits and deletes are corrections; balances are always computed.
- **AI is optional** — the app does the maths, AI only explains; it never invents numbers or acts without your tap.

## Tech

React Native (Expo SDK 57) · TypeScript (strict) · expo-router · expo-sqlite · Zustand · Jest · Gemini REST (optional)

```
src/
  engine/     money math, ledger, buckets, goals, debts, insights, parser — pure & tested
  db/         schema, migrations, queries, cached ledger
  ai/         Gemini client, fallback chain, context builder, guards
  features/   screens (capture, home, history, insights, people, …)
  store/      Zustand store, split by topic
  widget/     Android home-screen widget
docs/         SPEC, PROGRESS, DECISIONS, INSTALL
```

## Run it

```bash
npm install
npm run dev          # Expo Go over a tunnel (scan the QR code)
npm test             # 280 unit tests
npm run typecheck
npm run lint
```

## Install on your phone

Build a free APK in the cloud with Expo and install it — see **[docs/INSTALL.md](docs/INSTALL.md)**.

```bash
npx eas-cli@latest build -p android --profile preview
```

## Docs

- [Specification](docs/SPEC.md) — what and why
- [Progress](docs/PROGRESS.md) — what's done
- [Decisions](docs/DECISIONS.md) — choices already made, and why
- [Install](docs/INSTALL.md) — APK, widget, updates, backups

## Author

**Qusai Kagalwala** — Saifee Technologies

[GitHub](https://github.com/qusai-Kagalwala) · [LinkedIn](https://www.linkedin.com/in/qusai-kagalwala/)

Designed and built Hisaab: product idea, UX and the full app.

## Privacy

All data stays on your phone. With AI switched on (your own free Gemini key), only the few totals a question
needs are sent — never your entries, notes or account names.
