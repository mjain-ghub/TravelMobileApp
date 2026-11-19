# Demo script (~10 min)

Start the server (`cd server && npm start`) and the app. Open the floating shield (debug panel) for the whole demo.

## Scenarios (Settings → Demo scenario, mock mode)
| Scenario | Token | Expected |
|---|---|---|
| Clean | `mock.clean.*` | No challenge (suppressed), LOW risk, allowed |
| Challenge | `mock.challenged.*` | Challenge shown and solved, allowed |
| VPN | `mock.vpn.*` | MEDIUM: search allowed; sign-up/login/checkout require step-up (OTP `000000`) |
| Bot | `mock.bot.*` | HIGH, not solved: blocked with a vague message |
| Farm | `mock.farm.*` | FRD-FRM: blocked |
| Denylist | `mock.denylist.*` | DENYLIST: blocked |
| Invalid | other | Not solved / not legit: blocked |
| Arkose outage | `mock.timeout.*` | Search fails open; login/checkout fail closed |

## Flow
1. **Clean search** (Flights → Search). Debug panel: token lifecycle, decision allow, raw Verify JSON.
2. **Native vs WebView**: Settings → set sign-up to WebView; compare badges ("Arkose · Native SDK" / "Arkose · WebView").
3. **Challenge scenario**: search again, solve the challenge.
4. **VPN scenario**: search passes (low friction), then sign in → step-up dialog, try wrong code (2 attempts left), then `000000`. Book → step-up again.
5. **Confirmation** shows the "verified by Arkose" card with risk band, score, session.
6. **Bot scenario**: blocked; point out the user sees nothing about *why* while the debug panel shows the telltales.
7. **Outage**: search still works (fail open), login blocked (fail closed). Explain the business trade-off.

## Token replay (server side)
```bash
curl -s -X POST localhost:4000/api/auth/login -H 'content-type: application/json' \
  -H 'X-Arkose-Token: mock.clean.abc123' -H 'X-Arkose-Method: native' \
  -d '{"email":"demo@example.com","password":"Passw0rd!"}'
# repeat the exact same command: second call is rejected (previously_verified)
```
