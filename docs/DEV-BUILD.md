# Moving from Expo Go to a Development Build

You do these steps once. After that, day-to-day work feels almost the same as Expo Go.

## Why we're switching

**Expo Go** is a ready-made app from the App Store. It only contains the native code that Expo put in it. Terbit MY will soon need its own native code for alarms (AlarmKit on iPhone), and Expo Go can't load code it doesn't already contain.

A **development build** is your own version of "Expo Go", made just for Terbit MY. It has Terbit MY's name, icon and bundle ID (`com.terbitmy.app`), and it can include any native code the app needs.

| | Expo Go | Development build |
|---|---|---|
| Where it comes from | App Store | Built for you in the cloud by EAS, then installed on your iPhone |
| Custom native code (alarms, Screen Time) | ❌ Not possible | ✅ Yes |
| Cost | Free | Needs the Apple Developer Program (US$99/year) |
| Edit code → see it on the phone instantly | ✅ | ✅ Same as before |
| When you must rebuild | Never | Only when native code or native settings change (new native library, `app.json` permissions). Normal screen and logic changes don't need a rebuild. |

## What changed in the project

- **`expo-dev-client`** was added. It adds the developer menu and the "pick a server" screen to your build.
- **`eas.json`** was added. It tells EAS how to build. The `development` profile is the one you'll use now.
- **`npm start` now opens the development build, not Expo Go.** To keep using Expo Go until your build is ready, run **`npm run start:go`**.

## What you need first

1. **An Expo account.** It's free: https://expo.dev/signup
2. **An Apple Developer Program membership.** It costs US$99/year: https://developer.apple.com/programs/enroll/
   Apple only lets you install your own apps on a real iPhone if you're a member. Approval can take a day or two.
3. **Your iPhone's iOS version.** Check in Settings → General → About. AlarmKit (Phase 1) needs iOS 26 or later.

## Step-by-step (Windows PowerShell)

Run these in the project folder (`cd $HOME\Documents\terbitMY\terbitMY`).

### 1. Log in to Expo
```powershell
npx eas-cli@latest login
```
Enter your Expo username and password.

### 2. Link the project to your Expo account
```powershell
npx eas-cli@latest init
```
This creates the project on expo.dev and adds a project ID to `app.json`. **Commit that change.** It isn't a secret.

### 3. Register your iPhone with Apple
```powershell
npx eas-cli@latest device:create
```
- Sign in with your Apple ID when it asks.
- Choose **Website**. It shows a QR code and a link.
- Open the link on your iPhone (camera → QR code), tap **Download Profile**, then go to **Settings → General → VPN & Device Management** and install the profile.

### 4. Turn on Developer Mode on the iPhone
Settings → **Privacy & Security** → **Developer Mode** → on. The iPhone restarts. After it restarts, tap **Turn On**.
(The Developer Mode option only appears after a development app or profile has been installed. If you can't see it yet, come back to this step after step 6.)

### 5. Build the app in the cloud
```powershell
npx eas-cli@latest build --platform ios --profile development
```
- On the first run it asks to sign in to Apple and to create certificates. Answer **Yes** and let EAS manage them.
- The build runs on Expo's servers, so you don't need a Mac. It usually takes 10–20 minutes. You can watch it on expo.dev.

### 6. Install it on your iPhone
When the build finishes, scan the QR code that appears in PowerShell (or on the build page on expo.dev) with your iPhone camera, then tap **Install**.
A newly registered iPhone may not be able to install builds straight away. Apple can take a while to process it.

### 7. Run it
```powershell
npm start
```
Open **Terbit MY** (your build, not Expo Go) on the iPhone. Tap **Fetch development servers** and choose the server shown, or scan the QR code in PowerShell.
If Wi-Fi doesn't work, use `npx expo start --tunnel`.

## Android development build (no Apple account needed)

You can make an Android development build at any time. It doesn't need the Apple Developer Program or a Google Play account. The `development` profile in `eas.json` already builds an **APK**, a file you can install straight onto an Android phone.

### On the Android phone (once)
1. Settings → **About phone** → tap **Build number** 7 times to turn on Developer options. (Not strictly required, but useful later.)
2. Be ready to allow **Install unknown apps** for your browser or camera app when Android asks. This lets you install an APK that isn't from the Play Store.

### Build and install
```powershell
npx eas-cli@latest login            # skip if you're already logged in
npx eas-cli@latest build --platform android --profile development
```
- On the first run, EAS asks to **generate a new Android keystore**. Answer **Yes**. EAS keeps it safe for you. (A keystore is the file that signs the app.)
- When the build finishes, scan the QR code with the Android phone and install the APK.

### Run it
```powershell
npm start
```
Open **Terbit MY** on the Android phone and connect to the development server, the same as on iPhone.

> Android alarm ringing (`AlarmManager`) isn't built yet. The build lets you test the alarm settings screens, local saving and the maths mission on a real Android phone.

## Day-to-day after this

- Normal coding: run `npm start`, open Terbit MY on your phone, and edits appear instantly, like Expo Go.
- Rebuild (step 5) only when we add a native library or change native settings. Claude will tell you when a change needs a rebuild.
