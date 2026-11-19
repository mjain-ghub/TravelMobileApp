# Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "Network request failed" on a phone | Server URL is `localhost`. Use the computer's LAN IP via `EXPO_PUBLIC_API_URL` or Settings → API URL; same Wi-Fi. |
| Android emulator can't reach server | Use `http://10.0.2.2:4000` (default). Cleartext is enabled for dev by `expo-build-properties`. |
| Native flows say "simulated" / SDK not installed | Install the `.tgz` from your CSM, then rebuild with `npm run prebuild && npm run ios/android`. Expo Go cannot load it. |
| Server exits at start in live mode | A key is still a placeholder. Set `ARKOSE_PUBLIC_KEY`/`ARKOSE_PRIVATE_KEY` (or per-flow keys). |
| WebView stays blank in live mode | Check `ARKOSE_CLIENT_API_BASE_URL`, that the public key is valid for that host, and the WebView origin (`WEBVIEW_BASE_URL`) is allowed for your key. |
| Every request blocked with replay | Tokens are single-use; don't retry with the same token. The app fetches a fresh one per attempt. |
| RN SDK: key-window / modal errors (iOS), `.aar` build errors (Android) | See the RN SDK troubleshooting section in Arkose's docs; confirm New Architecture and WebView version requirements. |
| Step-up code rejected | Demo code is `DEMO_STEPUP_CODE` (default `000000`); 3 attempts per challenge, 5-minute TTL. |
