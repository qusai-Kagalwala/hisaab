# CLAUDE.md — Hisaab

> "Log it as fast as you pay it."

This file is read automatically at the start of every Claude Code session.
Keep it short. Details live in `docs/`.

## Read first
1. `docs/SPEC.md` — full product and technical specification (source of truth)
2. `docs/PROGRESS.md` — what is done, what is next
3. `docs/DECISIONS.md` — decisions already made; do not re-litigate them

## Non-negotiable rules
- **Speed first:** logging an expense takes ≤3 taps and <3 seconds.
- **Offline-first:** no login, no server; core features never need internet.
- **Manual entry only:** no bank, UPI or SMS integration.
- **AI is optional:** every core feature must work with AI switched off.
- **Engine calculates, AI explains:** AI never does money arithmetic.
- **Money is integer paise.** Never use floats for money. Use `src/engine/money.ts` helpers.
- **Transactions are immutable.** Edits create correction entries. Balances are computed, never stored.
- **Buckets are planned money, not expenses.** Invariant: `sum(buckets) + unallocated == account totals`.
- **Send minimum data to AI.** Only via the Context Builder (`src/ai/context.ts`).

## Tech stack
- React Native (Expo) + TypeScript (strict)
- expo-sqlite (local DB), expo-secure-store (API key)
- Zustand (state)
- Jest (tests)
- Gemini REST API (single provider) with configurable model fallback chain

## Folder structure
```
src/
  db/          schema, migrations, queries
  engine/      money math, parser, insights, buckets, goals, rollover (pure TS, fully tested)
  ai/          gemini client, fallback chain, context builder, prompts
  features/    capture, home, buckets, goals, chat, ideas, settings, onboarding
  components/  shared UI
  store/       zustand stores
  utils/       formatting (₹ Indian grouping), dates
docs/          SPEC, PROGRESS, DECISIONS
```

## Commands
- Start dev: `npx expo start --go --tunnel` (Expo Go) — `--go` is needed because expo-dev-client is installed
- Tests: `npm test`
- Type check: `npx tsc --noEmit` (or `npm run typecheck`)
- Lint: `npm run lint`
- APK: `npx eas-cli@latest build -p android --profile preview` (see docs/INSTALL.md)
- Dev build (widget, mic): `--profile development`, then `npx expo start --dev-client --tunnel`

## Working style
- Build **one phase at a time** (see `docs/SPEC.md` → Build phases).
- Before coding a phase, present a short plan and wait for approval.
- Keep business logic in `src/engine/` as pure functions with unit tests.
- Keep UI components thin; no money math inside components.
- Prefer small, reviewable changes over large rewrites.
- After finishing a phase:
  1. Run tests and type check; fix failures.
  2. Update `docs/PROGRESS.md`.
  3. Record any new decision in `docs/DECISIONS.md`.
  4. Stop and summarise what to test manually.

## UX rules
- Mobile-first, thumb-reachable, large tap targets.
- Only the amount is mandatory; everything else has a smart default.
- Undo toast (5s) instead of confirmation dialogs.
- Friendly, non-judgmental microcopy. No red "shame" states.
- ₹ with Indian grouping (1,00,000). Light and dark mode.

## Never
- Never add login, a backend, or bank/SMS permissions.
- Never auto-add recurring entries silently; always "Expected ₹X — received?".
- Never let AI invent numbers or recommend stocks, funds or loans.
- Never execute an AI-suggested action without a user confirm tap.
