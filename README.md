# Hisaab

> Log it as fast as you pay it.

A private, offline-first personal finance app for India. Log expenses in
under 3 seconds, split leftover money into buckets, track goals, and
optionally ask AI what your money can do.

## Features
- ⚡ 3-tap expense logging (keypad, typing, voice) and a home-screen widget
- 🔁 Recurring income and bills with one-tap confirm
- 🪣 Flexible buckets for leftover money (% and ₹)
- 🎯 Goals with ETA and what-if slider
- 📊 Offline insights and "Can I afford this?"
- 💬 Hisaab Assistant — ask about your money in English, Hindi or Hinglish
- 💡 Ideas — ballpark things to do under ₹100 / ₹200 / ₹500
- 🔒 No login, no bank access, data stays on your phone

## Tech
React Native (Expo) · TypeScript · SQLite · Zustand · Gemini (optional)

## Getting started
```bash
npm install
npx expo start
```
Scan the QR code with Expo Go on your phone.

## Install on your phone
See **[docs/INSTALL.md](docs/INSTALL.md)**: build a free APK with Expo (EAS) and install it.

## Docs
- [Specification](docs/SPEC.md)
- [Progress](docs/PROGRESS.md)
- [Decisions](docs/DECISIONS.md)

## Privacy
All data is stored locally. AI features are optional and send only the
minimum numbers needed to answer a question.
