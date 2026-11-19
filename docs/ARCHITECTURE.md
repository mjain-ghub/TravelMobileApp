# Architecture

```
 App (Expo)                                   Server (Express)                         Arkose
 ──────────                                   ────────────────                         ──────
 ArkoseProvider.protect(flow, send)
   ├─ getToken(flow) ── native SDK ────────────────────────────────────────────────►  client SDK / API
   │                 └─ WebView (api.js) ────────────────────────────────────────►  client API
   │      ◄──────────── token (single use) ───────────────────────────────────────
   └─ send(headers: X-Arkose-Token, X-Arkose-Method) ─►  arkoseGate(flow)
                                                          ├─ verifyToken ── POST Verify v4 ──►  verdict
                                                          ├─ policy.evaluate(flow, verdict)
                                                          └─ allow │ 403 STEP_UP_REQUIRED │ 403 BLOCK │ 503
                                                       route handler runs only on allow
```

## Key decisions
- **Verify is server-side only.** The client never decides. The token is meaningless until the server verifies it.
- **Single-use tokens.** A fresh session is started per protected action. Replays come back from Verify with `previously_verified: true`, and policy blocks them.
- **Gate before business logic.** On login the gate runs *before* the credential check, so Arkose protects the endpoint rather than leaking credential validity to bots.
- **Per-flow policy** (`server/src/arkose/policy.js`):

| Flow | MEDIUM | HIGH | IP flag | Arkose unreachable |
|---|---|---|---|---|
| search | allow | block | allow | **fail open** |
| signup | step-up | block | step-up | fail closed |
| login | step-up | block | allow | fail closed |
| checkout | step-up | block | step-up | fail closed |

  Hard failures (replay, timeout, not solved, session not legit, `DENYLIST`) block everywhere; `FRD-FRM` blocks; `ALLOWLIST` overrides soft rules. **These are demo values.**
- **Step-up** is a demo OTP (`000000`): 5 min TTL, 3 attempts, bound to IP and user. Replace with real MFA.
- **`log_data`** sent to Verify is JSON `{flow, method, uid}` for tracing in the Arkose portal.
- **Server-side pricing** on checkout; the client sends only item id and quantity. Only card brand + last4 are accepted/stored (never PAN/CVC).
- **End-user errors are vague** (`describeError`); risk detail is only visible in the debug panel.

## App layout
- `src/arkose/` – `ArkoseProvider` (routing + step-up loop), `nativeRunner` (SDK lifecycle), `webviewHtml` (page builder), `overlays` (WebView host, simulated challenge, step-up modal), `sdk` (optional require).
- `src/app/` – Expo Router screens. `src/state/` – settings (persisted), session, search.
- `src/components/` – UI, `DebugPanel`, `ArkoseDecision`.

## Server layout
- `src/arkose/{verify,policy,gate}.js`, `src/app.js`, `src/data/catalog.js`, `src/auth.js`, `src/store.js` (in-memory).

## Mock mode
Tokens look like `mock.<scenario>.<nonce>`. The mock verifier emits the real Verify v4 shape (`session_details`, `session_risk`, `ip_intelligence`) so policy, tests, and the debug panel use real field names. Telltale names are prefixed `mock-`.
