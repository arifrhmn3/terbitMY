# Setting Up on Windows (Beginner Guide)

You do each of these steps once. Each one says what it is for.

## 1. Install the tools

| Tool | Why you need it | How |
|---|---|---|
| **Git** | Downloads the code and keeps its version history | Download from https://git-scm.com/download/win and run the installer. The default options are fine. |
| **Node.js (LTS)** | Runs the JavaScript tools that build the app | Download the **LTS** version from https://nodejs.org and run the installer with the defaults. |
| **Visual Studio Code** *(optional but recommended)* | Lets you read and edit the code | https://code.visualstudio.com. When you open the project, VS Code suggests the Expo extension; click **Install**. |
| **Expo Go** on your iPhone | Previews the app on your phone during Phase 0 | App Store → search "Expo Go" → Get |

Check that the installs worked. Open **PowerShell** (Start menu → type "PowerShell") and run:

```powershell
git --version
node --version
npm --version
```

Each command should print a version number.

> If PowerShell says *"running scripts is disabled on this system"*, run this once and answer **Y**:
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
> ```

## 2. Get the code

```powershell
cd $HOME\Documents
git clone https://github.com/arifrhmn3/terbitMY.git
cd terbitMY
git checkout claude/terbit-my-architecture-higujh   # skip this once the work is merged into main
npm install
```

`npm install` downloads the libraries the project uses into the `node_modules` folder. It takes a few minutes.

## 3. Preview the app

### Option A: in your web browser (quickest)
```powershell
npm run web
```
A browser tab opens at http://localhost:8081. To make it look like a phone, press **F12**, then click the phone/tablet icon.

### Option B: on your iPhone with Expo Go
```powershell
npm start
```
1. A QR code appears in PowerShell.
2. Make sure your PC and iPhone are on the **same Wi-Fi**.
3. Open the iPhone **Camera** app, point it at the QR code and tap the banner. The app opens in Expo Go.
4. If it can't connect (for example on office or university Wi-Fi), stop the server with **Ctrl + C** and run `npx expo start --tunnel` instead.

Edits you save in VS Code show up on the phone automatically.

> **Expo Go is only for Phase 0.** From Phase 1 the app has its own native code for alarms. Expo Go can't run that, so we will make a *development build* with EAS. See [DEV-BUILD.md](DEV-BUILD.md).

## 4. Run the checks

```powershell
npm run check
```

This runs lint (code style), typecheck (catches type mistakes) and the unit tests. All three should pass.

## 5. Coming later: accounts you will need

| When | Account | Cost |
|---|---|---|
| Phase 1 | **Expo account**: https://expo.dev/signup | Free |
| Phase 1 | **Apple Developer Program**: https://developer.apple.com/programs/ | US$99 / year |
| Phase 2 | **Supabase**: https://supabase.com | Free tier |
| Phase 6 | **Google Play Console**: https://play.google.com/console | US$25 once |

You won't need a Mac. EAS Build builds the iPhone version in the cloud.
