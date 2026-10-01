# Installing Hisaab on your phone (APK)

Hisaab is **offline-first**: no server, no login, nothing to host. To use it every
day you install it as a normal Android app (an **APK**). Expo builds the APK for
you in the cloud, for free. You don't need Android Studio.

> While developing you can keep using Expo Go (`npx expo start --go --tunnel` — note the `--go`). The APK
> is for daily use, and it's the only way to get the **home-screen widget** and the
> **in-app mic** (they're native features Expo Go doesn't include).

---

## 1. One-time setup (5 minutes)

1. Create a free account at **https://expo.dev/signup**.
2. In the VS Code terminal, inside the `hisaab` folder:
   ```bash
   git pull
   npm install
   npx eas-cli@latest login
   ```
   Log in with the Expo account you just made.

## 2. Build the APK

```bash
npx eas-cli@latest build -p android --profile preview
```

The first time, it asks a few questions. Answer:

| Question | Answer |
|---|---|
| Create an EAS project for @you/hisaab? | **Yes** (it adds a `projectId` to `app.json`; commit that change) |
| Generate a new Android Keystore? | **Yes** (Expo stores it safely; it signs every future update) |

Then Expo builds in the cloud. On the free plan this usually takes **10–30
minutes** (there can be a queue). The APK is built for 64-bit ARM phones only
(every Android phone from roughly 2017 on), which keeps it about a third of the
size of an "all phones" APK. When it's done you get:

- a **link** and a **QR code** in the terminal, and
- the build on **https://expo.dev** → your project → Builds.

## 3. Install it on your phone

1. Open the link (or scan the QR code) **on your phone** and tap **Install / Download**.
2. Open the downloaded `.apk`.
3. Android asks to allow installing from this source → **Settings → Allow from this source**, go back, tap **Install**.
4. If Play Protect warns about an unknown app → **More details → Install anyway**. (It's your own app; it just isn't on the Play Store.)

Hisaab now has its own icon. It works with no laptop, no Wi-Fi and no tunnel.

## 4. Move your data from Expo Go to the installed app

Expo Go and the installed app keep **separate** data. Move it with a backup:

1. In **Expo Go**: Home → **Settings & backup** → **Export backup** → save it to Drive / WhatsApp yourself / email.
2. In the **installed Hisaab**: Home → **Settings & backup** → **Restore from file** → pick that file → **Replace with backup**.
3. Your Gemini key is not in the backup (on purpose). Paste it again in Settings if you use AI.

## 5. Add the home-screen widget

1. Long-press an empty spot on your home screen → **Widgets**.
2. Find **Hisaab** → **Hisaab quick log**, and drag it onto the home screen.
3. It shows **Safe to spend today** and your top quick spends (like Chai ₹20).
   - Tap a spend chip → it's logged instantly, without opening the app. **Undo** shows for 2 minutes.
   - Tap **+** → the app opens on the keypad.
   - Tap anywhere else → the app opens.

The chips show your frequent and recent spends.

There's a second widget too: **Hisaab this month** — spent so far, safe to spend today
and a day-by-day chart. Tap it to open Insights.

## 6. Updating the app later

1. Get the new code (`git pull`, `npm install`).
2. In `app.json`, raise `"version"` (e.g. `1.1.0` → `1.2.0`) **and** `android.versionCode` (`2` → `3`).
   (Already done for 1.1.0 / versionCode 2.)
3. Build again with the same command and install the new APK **over** the old one.
   Your data stays, because it's the same app signed with the same key. The
   database upgrades itself on first open (e.g. 1.1.0 adds borrow & lend).

> Want it even smaller? `npx eas-cli@latest build -p android --profile preview-small`
> also turns on Android's code shrinker. Test that APK fully (open every screen,
> log, widget, mic) before using it every day — it can break a library.
>
> Very old 32-bit phone and the APK won't install? Remove the `env` block from
> the `preview` profile in `eas.json` and build again (bigger, but runs everywhere).

⚠️ **Uninstalling the app deletes its data on the phone.** Three things protect you:
1. **Google backup** (automatic): keep phone Settings → Google → Backup on. Reinstalling
   with the same Google account brings your hisaab back.
2. **Backup password** (Settings → Backup): protects every backup file.
3. **Weekly copy to a folder** you choose, and **Back up now** to save a copy to Drive.

---

## For development: a development build (instead of Expo Go)

Expo Go can't run the widget or the in-app mic. To keep live-editing with those:

```bash
npx eas-cli@latest build -p android --profile development
```

Install that APK once (it's a "custom Expo Go" just for Hisaab). Then, instead of
`npx expo start --go --tunnel`, run:

```bash
npx expo start --dev-client --tunnel
```

and open the project from the Hisaab development app. Code changes reload as before.
You only need a new development build when a native package is added.

## Optional: the Play Store

When you want other people to install it:
`npx eas-cli@latest build -p android --profile production` makes an `.aab` for
Google Play. A Google Play developer account costs a one-time US$25, and the
listing needs a privacy policy. Hisaab collects nothing, which keeps that simple.

## Optional: a web version

There's nothing to host for the phone app. If you also want a website version
(no widget, no AI key storage, data stays in that browser only):

```bash
npx expo export --platform web
```

Upload the `dist/` folder to **Cloudflare Pages** or **Netlify** (both free).
The `public/_headers` file adds the two headers the web database needs.
