# Setup

## Prerequisites
- Node 20.12+ (server uses `process.loadEnvFile`)
- For native runs: Xcode (iOS, macOS only) and/or Android Studio + an emulator, or a physical device
- For live mode: Arkose public/private keys and the React Native SDK `.tgz` from your Arkose CSM

## 1. Backend
```bash
cd server
npm install
cp .env.example .env
npm start            # http://localhost:4000
```
Default `ARKOSE_MODE=mock` needs no keys. `GET /api/health` and `GET /api/config` confirm it is up.

### Live mode
In `server/.env`:
```
ARKOSE_MODE=live
ARKOSE_PUBLIC_KEY=<public key>          # or per flow: _SEARCH / _SIGNUP / _LOGIN / _CHECKOUT
ARKOSE_PRIVATE_KEY=<private key>
ARKOSE_CLIENT_API_BASE_URL=<your client API host>   # for the WebView method
ARKOSE_VERIFY_URL=<your Verify API v4 URL>
```
The server refuses to start in live mode if any key is still a placeholder. Private keys never leave the server; `/api/config` returns public keys only.

## 2. App

```bash
cd app
npm install
npm run web                   # browser preview, simulated native challenge
```

### Pointing the app at the server
- iOS simulator / web: `http://localhost:4000` (default)
- Android emulator: `http://10.0.2.2:4000` (default)
- Physical device: use your computer's LAN IP: `EXPO_PUBLIC_API_URL=http://192.168.1.20:4000 npm start`, or set it in Settings → API URL.

### Installing the native Arkose SDK
1. Get `react-native-arkoselabs-<version>.tgz` from your CSM (it is not on public npm).
2. `cd app && npm install /path/to/react-native-arkoselabs-<version>.tgz`
3. `app.config.js` detects the package and automatically adds its Expo config plugin (`react-native-arkoselabs/app.plugin.js`). Nothing to edit.
4. The SDK is native code, so Expo Go will not work. Build a dev client:
   ```bash
   npm run prebuild      # expo prebuild --clean
   npm run ios           # or: npm run android
   ```
5. In Settings the native flows will no longer say "simulated".

Check the SDK's current requirements (New Architecture, minimum OS versions, WebView version) in the Arkose React Native SDK docs; they are versioned.

### Keys in the app
The app fetches **public** keys from the server (`/api/config`), so there is nothing to paste into the app code.

## 3. Verify
```bash
cd server && npm test
cd app && npm run typecheck && npm test
```
