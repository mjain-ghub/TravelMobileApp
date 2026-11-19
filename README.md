# Wayfarer – travel booking demo with Arkose Titan

A React Native (Expo) travel booking app (flights + hotels, Orbitz/Expedia style) with **Arkose Titan**
protecting four flows, integrated **two ways side by side**:

| Method | How it works | Used by default for |
|---|---|---|
| **Native SDK** | `react-native-arkoselabs` (`ArkoseManager`, `ArkoseEvents`) | search, login, checkout |
| **WebView** | Arkose web client API (`api.js`) hosted in `react-native-webview`, token returned via `postMessage` | sign-up |

Every flow can be switched between methods at runtime in **Settings**, so a customer can compare them live.

```
app/      Expo app (TypeScript, Expo Router)
server/   Node/Express backend: mock travel data + Arkose Verify API v4 + policy engine
docs/     SETUP · ARCHITECTURE · INTEGRATION_GUIDE · DEMO_SCRIPT · TROUBLESHOOTING
```

## Quick start (mock mode, no Arkose keys needed)

```bash
# 1. backend
cd server && npm install && cp .env.example .env && npm start     # http://localhost:4000

# 2. app (new terminal)
cd app && npm install && npm run web        # fastest: browser preview
# or, with the native SDK installed (see docs/SETUP.md):  npm run ios / npm run android
```

Demo account: `demo@example.com` / `Passw0rd!`. Step-up code: `000000`.

Without the Arkose SDK installed, native flows run a **simulated** native challenge so the whole UX is
demonstrable; the Settings screen and debug panel label this clearly. Real native behaviour needs the SDK
(see [docs/SETUP.md](docs/SETUP.md)).

## What the demo shows

- Every protected action obtains an Arkose token, sends it to **our server**, and the server calls **Verify** (never the client).
- A per-flow **policy engine** turns the Verify response into allow / step-up / block, with fail-open (search) vs fail-closed (sign-up, login, checkout).
- Outcomes: no challenge (suppressed), challenge solved, step-up OTP, block, token replay rejection, Arkose outage.
- A floating **debug panel** shows the token lifecycle, decision, and the raw Verify JSON.
- Mock scenarios (clean, challenged, vpn, bot, farm, denylist, invalid, timeout) are selectable in Settings.

## Tests

```bash
cd server && npm test          # 31 tests: policy, gate, replay, pricing, live Verify request shape
cd app && npm test             # 26 tests: WebView page contract, native runner lifecycle, formatting
cd app && npm run typecheck
```

## Status and honest caveats

- Verified here: backend, policy, WebView page logic, SDK lifecycle (against a fake emitter), TypeScript, web and Android bundle export, browser end-to-end.
- **Not verified here:** the real native SDK, WebView on a physical iOS/Android device, and live Arkose keys. The author's environment has no Xcode/Android emulator. Run on a device or simulator before a customer demo.
- The RN SDK documentation was marked DRAFT; the `onCompleted` payload shape is parsed defensively (`extractToken`). Confirm against your SDK version.
- Policy thresholds are **demo values**, not recommendations. Tune with your Arkose team.
- Debug panel and raw Verify output are demo-only (`DEMO_DEBUG`); disable in anything customer-facing in production.

Docs: [SETUP](docs/SETUP.md) · [ARCHITECTURE](docs/ARCHITECTURE.md) · [INTEGRATION GUIDE](docs/INTEGRATION_GUIDE.md) · [DEMO SCRIPT](docs/DEMO_SCRIPT.md) · [TROUBLESHOOTING](docs/TROUBLESHOOTING.md)
