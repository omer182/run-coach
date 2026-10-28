# Run Coach for iPhone

Expo SDK 58 app: interval runs with GPS, instant voice cues, the AI coach, and run history with a map, elevation and per-round paces.

## Try it in a browser first

The same app runs in a browser with simulated GPS (no install). From the repo root on the server:

```bash
docker run --rm -u $(id -u):$(id -g) -e HOME=/tmp -e CI=1 -v "$PWD":/app -w /app/apps/mobile node:22-bookworm-slim npx expo export --platform web --output-dir dist-web
```

Then serve `apps/mobile/dist-web` (any static server) and open it. In Settings, enter the coach server address and app key.

## Install on your iPhone from the Mac (free Apple ID)

You need: the Mac, a USB cable, and the iPhone. About 30 minutes the first time.

### 1. Mac setup (once)

1. Update macOS as far as it goes: Apple menu → System Settings → General → Software Update.
2. Install **Xcode 26.4 or newer** from the App Store (Expo SDK 58 needs it). Open it once; when it asks which platforms to download, tick **iOS** and let it finish.
   - If the App Store says your macOS is too old for this Xcode, stop here and tell Claude: the fix is either an older Expo SDK or the paid Apple account with cloud builds.
3. Point the command-line tools at that Xcode (asks for your Mac password):

   ```bash
   sudo xcode-select -s /Applications/Xcode.app && sudo xcodebuild -license accept
   ```

4. Install [Homebrew](https://brew.sh), then Node 22, git, the GitHub CLI and CocoaPods:

   ```bash
   brew install node@22 git gh cocoapods
   ```

   Homebrew doesn't put `node@22` on your PATH by itself:

   ```bash
   echo 'export PATH="$(brew --prefix node@22)/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
   node -v   # should print v22.x
   ```

5. Turn on pnpm: `corepack enable`
6. In Xcode: **Settings → Accounts → +** → add your Apple ID. This creates a free "Personal Team".

### 2. iPhone setup (once)

1. Connect the iPhone with the cable, unlock it, tap **Trust This Computer**.
2. Settings → Privacy & Security → **Developer Mode** → on, then restart the iPhone.

### 3. Build and install

```bash
gh auth login
gh repo clone omer182/run-coach
cd run-coach
pnpm install
cd apps/mobile
npx expo run:ios --device --configuration Release
```

- The first build on an Intel Mac takes roughly 15–30 minutes. Later builds are much faster.
- Pick your iPhone from the list.
- **Release** puts the whole app on the phone, so it runs without the Mac nearby.
- If it stops with a signing error: open `ios/RunCoach.xcworkspace` in Xcode, click the **RunCoach** target → **Signing & Capabilities** → Team: your Personal Team. Close Xcode and run the command again.
- First launch on the phone: Settings → General → **VPN & Device Management** → your Apple ID → **Trust**.

### 4. First run setup in the app

1. **Settings** in the app → Coach server address `http://192.168.0.147:3020` and the app key → **Test connection**. To get the key without typing it: on the Mac run `ssh rio@192.168.0.147 'grep APP_API_KEY ~/projects/run-coach/.env'`, copy the value, and paste it on the iPhone (Universal Clipboard works when both are signed into the same Apple ID).
2. Optionally load and fill in **Your why**.
3. Start a run. When iOS asks for location, choose **Allow While Using**, then **Change to Always Allow** when asked. "Always" keeps recording with the phone locked in your pocket.

### Every 7 days

A free Apple ID install expires after 7 days. Plug in and run the same `npx expo run:ios --device --configuration Release` again (pull first: `git pull && pnpm install`). Your runs stay on the phone.

## Good to know

- **The coach only works where the phone can reach the server.** `192.168.0.147` is your home network. Outside, cues, recording and the map all work; the coach falls back to silence until the server is reachable from the internet (next step: expose it over HTTPS on your domain).
- Indoors, turn on **Simulated GPS** in Settings to try a workout on the couch.
- Runs are stored only on the phone (SQLite). Syncing to the server is a later phase.
