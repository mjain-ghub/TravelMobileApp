# Integration guide: native SDK vs WebView

Both methods produce the same thing: a single-use **session token** sent to your server and verified with the Verify API.

## Native SDK (`react-native-arkoselabs`)
Code: `app/src/arkose/nativeRunner.ts`.

Lifecycle: `ArkoseManager.initialize(config)` → `onReady` → `showEnforcementChallenge()` → `onSuppress` (no challenge) and/or `onShown` → `onCompleted(result)` (token) | `onFailed` | `onError` | `onHide` without completion (user cancelled).

Notes from this implementation:
- Listeners are registered once (global emitter) and routed to the active request.
- Ready and overall timeouts guard against a hung SDK.
- `onHide` is treated as cancellation after a short grace period, since it can fire around completion.
- The `onCompleted` payload is parsed defensively (`extractToken`) because the doc was DRAFT. Pin this down against your SDK version.
- "Always show challenge" in the demo (`forceChallenge`) maps to the native `noSuppress` option.

## WebView (Arkose web client API)
Code: `app/src/arkose/webviewHtml.ts`, `overlays.tsx`.

A small HTML page loads `<base>/<PUBLIC_KEY>/api.js` with `data-callback="setupEnforcement"`, calls `setConfig({selector:'#challenge', mode:'inline', onReady, onShown, onSuppress, onCompleted, onError, ...})`, and posts events to React Native via `window.ReactNativeWebView.postMessage`.
- The WebView is mounted invisibly and revealed only when a challenge is actually shown.
- Messages carry a `requestId`; stale or foreign messages are ignored.
- Navigation is restricted; only https script URLs are accepted; config is embedded as safely escaped JSON.
- There is no documented web equivalent of `noSuppress`, so "force challenge" does not apply in live WebView mode (key-level configuration via Arkose).

## Trade-offs

| | Native SDK | WebView |
|---|---|---|
| Signals | Device/app-level mobile signals | Browser-level web signals |
| UX | Native modal | Embedded web content |
| Update path | App release (SDK version) | Server-side/Arkose-side, no app release |
| Setup | `.tgz`, dev build, native build | `react-native-webview` only; works in Expo Go |
| Typical use | Primary on mobile apps | Fallback, or flows already shared with a web front end |

Prefer native where available: the mobile SDK collects mobile-specific signals the web client cannot. Confirm key/configuration implications with your Arkose team (mobile vs web keys).

## Handling Verify responses
Fields the demo uses: `session_details.{solved, suppressed, previously_verified, session_is_legit, session_timed_out, challenge_type}`, `session_risk.{risk_band, risk_category, global.score}`, `ip_intelligence`. Bands: LOW 0–40, MEDIUM 41–80, HIGH 81–100. Always check `solved` and replay indicators *before* risk.

## Production hardening checklist
- Persist sessions/bookings in a real datastore; replace the demo auth and OTP.
- Store used-token state and step-up state in shared storage (Redis) if running multiple instances.
- Rate limit; keep `DEMO_DEBUG` off; do not expose raw Verify output.
- Choose fail-open/closed per business risk; alert on Arkose outage rates.
- Tune thresholds from real traffic with your Arkose team.
- Use real payments tokenization (never handle PAN).
