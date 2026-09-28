# Installing Hisaab on your phone (APK)

Hisaab is **offline-first**: no server, no login, nothing to host. To use it every
day you install it as a normal Android app (an **APK**). Expo builds the APK for
you in the cloud, for free. You don't need Android Studio.

> While developing, keep using Expo Go (`npx expo start --tunnel`). The APK is for
> daily use, and it's needed for the home-screen widget (Phase 5).

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
minutes** (there can be a queue). When it's done you get:

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

## 5. Updating the app later

1. Get the new code (`git pull`, `npm install`).
2. In `app.json`, raise `"version"` (e.g. `1.0.0` → `1.1.0`) **and** `android.versionCode` (`1` → `2`).
3. Build again with the same command and install the new APK **over** the old one.
   Your data stays, because it's the same app signed with the same key.

⚠️ **Uninstalling the app deletes its data.** Export a backup first, and export
one now and then anyway.

---

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
