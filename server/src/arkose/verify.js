import crypto from 'node:crypto';

/**
 * Verify API v4 client.
 *
 *   POST {verifyUrl}   Content-Type: application/json
 *   { "private_key": "...", "session_token": "...", "log_data": "..." }
 *
 * `session_token` is the `token` the client receives when the challenge completes
 * (native SDK `onCompleted` result, or `response.token` in the web client API).
 * Tokens are single-use, so verify each one exactly once, on the server.
 */

export class VerifyError extends Error {
  constructor(message, { code = 'VERIFY_FAILED', status } = {}) {
    super(message);
    this.name = 'VerifyError';
    this.code = code;
    this.status = status;
  }
}

/** Scenarios the mock verifier understands. Token format: mock.<scenario>.<nonce> */
export const MOCK_SCENARIOS = ['clean', 'challenged', 'vpn', 'bot', 'farm', 'denylist', 'invalid', 'timeout'];

export async function verifyToken({ token, flow, logData, ip }, ctx) {
  const { config } = ctx;
  if (config.arkose.mode === 'mock') return mockVerify({ token, ip }, ctx);
  return liveVerify({ token, flow, logData }, ctx);
}

async function liveVerify({ token, flow, logData }, { config, fetchImpl }) {
  const { privateKey } = config.arkose.keys[flow];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.arkose.timeoutMs);
  try {
    const res = await fetchImpl(config.arkose.verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ private_key: privateKey, session_token: token, log_data: logData }),
      signal: controller.signal,
    });
    let body;
    try {
      body = await res.json();
    } catch {
      throw new VerifyError(`Verify API returned a non-JSON response (HTTP ${res.status})`, { code: 'BAD_RESPONSE', status: res.status });
    }
    if (!res.ok || typeof body?.error === 'string') {
      // The private key is never included in this message or in logs.
      throw new VerifyError(`Verify API error (HTTP ${res.status}): ${body?.error ?? 'unknown'}`, { code: 'VERIFY_REJECTED', status: res.status });
    }
    return body;
  } catch (err) {
    if (err instanceof VerifyError) throw err;
    if (err?.name === 'AbortError') throw new VerifyError('Verify API timed out', { code: 'TIMEOUT' });
    throw new VerifyError(`Verify API unreachable: ${err?.message ?? err}`, { code: 'NETWORK' });
  } finally {
    clearTimeout(timer);
  }
}

// ---- mock verifier ---------------------------------------------------------------------
// Produces responses with the same shape as Verify API v4 so the policy engine, debug panel
// and tests exercise real field names. Telltale names are prefixed "mock-" on purpose,
// except the two the public docs use as examples.

function mockVerify({ token, ip }, { store }) {
  const [prefix, scenarioRaw] = String(token).split('.');
  const scenario = prefix === 'mock' && MOCK_SCENARIOS.includes(scenarioRaw) ? scenarioRaw : 'invalid';

  if (scenario === 'timeout') throw new VerifyError('Verify API timed out (mock scenario)', { code: 'TIMEOUT' });

  const replayed = store.usedTokens.has(token);
  store.usedTokens.add(token);

  const now = new Date().toISOString();
  const session = `${crypto.randomBytes(8).toString('hex')}.${Math.floor(Math.random() * 1e10)}`;
  const userIp = ip || '203.0.113.10';

  const response = {
    session_details: {
      solved: true,
      session,
      verified: now,
      attempted: false,
      security_level: 0,
      session_is_legit: true,
      previously_verified: false,
      session_timed_out: false,
      suppressed: true,
      telltale_list: [],
      challenge_type: null,
      ip_rep_list: null,
    },
    session_risk: { risk_band: 'LOW', global: { score: 0, telltales: [] }, custom: { score: 0, telltales: [] } },
    ip_intelligence: { user_ip: userIp, is_proxy: false, is_vpn: false, is_tor: false },
  };

  const d = response.session_details;
  const risk = response.session_risk;
  const challenged = () => Object.assign(d, { suppressed: false, attempted: true, challenge_type: 'visual', security_level: 20 });

  switch (scenario) {
    case 'challenged':
      challenged();
      risk.risk_category = 'BOT-STD';
      risk.global = { score: 22, telltales: [{ name: 'mock-automation-signal', weight: 22 }] };
      d.telltale_list = ['mock-automation-signal'];
      break;
    case 'vpn':
      challenged();
      risk.risk_band = 'MEDIUM';
      risk.risk_category = 'BOT-STD';
      risk.global = { score: 55, telltales: [{ name: 'g-reputation-vpn', weight: 55 }] };
      d.telltale_list = ['g-reputation-vpn'];
      response.ip_intelligence.is_vpn = true;
      break;
    case 'bot':
      challenged();
      d.solved = false;
      risk.risk_band = 'HIGH';
      risk.risk_category = 'BOT-ADV';
      risk.global = { score: 92, telltales: [{ name: 'mock-headless-browser', weight: 92 }] };
      d.telltale_list = ['mock-headless-browser'];
      break;
    case 'farm':
      challenged();
      risk.risk_band = 'HIGH';
      risk.risk_category = 'FRD-FRM';
      risk.global = { score: 95, telltales: [{ name: 'mock-solver-farm-pattern', weight: 95 }] };
      d.telltale_list = ['mock-solver-farm-pattern'];
      break;
    case 'denylist':
      challenged();
      risk.risk_band = 'HIGH';
      risk.risk_category = 'DENYLIST';
      risk.global = { score: 100, telltales: [{ name: 'mock-denylist-match', weight: 100 }] };
      d.telltale_list = ['mock-denylist-match'];
      break;
    case 'invalid':
      Object.assign(d, { solved: false, session_is_legit: false, suppressed: false });
      break;
    default: // clean
      break;
  }

  if (replayed) {
    Object.assign(d, { solved: false, previously_verified: true, session_is_legit: false });
  }
  return response;
}
