/**
 * Demo decision policy: turns a Verify API v4 response into allow / step_up / block.
 *
 * IMPORTANT: Arkose documents the response fields and the risk bands (LOW 0-40,
 * MEDIUM 41-80, HIGH 81-100, set by the higher of the global and custom scores) but does
 * not prescribe actions per band. The thresholds below are an illustrative starting point.
 * Tune them with your Arkose CSM against real traffic before using them in production,
 * and confirm how suppressed sessions are reported for your keys (this demo treats
 * `session_details.solved === true` as "passed").
 */

export const SEVERITY = { allow: 0, step_up: 1, block: 2 };
const worst = (a, b) => (SEVERITY[a] >= SEVERITY[b] ? a : b);

/**
 * mediumBand / highBand: action when session_risk.risk_band is MEDIUM / HIGH.
 * ipFlag:               action when ip_intelligence reports a proxy, VPN or Tor exit.
 * failMode:             what to do if the Verify API itself can't be reached.
 *                       "open" keeps the business flowing; "closed" protects money movement.
 */
export const FLOW_POLICY = {
  search: { mediumBand: 'allow', highBand: 'block', ipFlag: 'allow', failMode: 'open' },
  signup: { mediumBand: 'step_up', highBand: 'block', ipFlag: 'step_up', failMode: 'closed' },
  login: { mediumBand: 'step_up', highBand: 'block', ipFlag: 'allow', failMode: 'closed' },
  checkout: { mediumBand: 'step_up', highBand: 'block', ipFlag: 'step_up', failMode: 'closed' },
};

export function summarizeRisk(verify) {
  const risk = verify?.session_risk ?? {};
  const score = Math.max(risk.global?.score ?? 0, risk.custom?.score ?? 0);
  return {
    band: String(risk.risk_band ?? 'LOW').toUpperCase(),
    category: risk.risk_category ?? 'NONE', // Arkose omits the category when both scores are 0
    score,
  };
}

export function evaluate(flow, verify) {
  const policy = FLOW_POLICY[flow];
  if (!policy) throw new Error(`No policy configured for flow "${flow}"`);

  const d = verify?.session_details ?? {};
  const ip = verify?.ip_intelligence ?? {};
  const risk = summarizeRisk(verify);
  const reasons = [];
  const add = (code, action, detail) => reasons.push({ code, action, detail });

  // Hard failures: these block regardless of risk or allowlisting.
  if (d.previously_verified === true) add('TOKEN_REPLAYED', 'block', 'Session token was already verified (tokens are single-use)');
  if (d.session_timed_out === true) add('SESSION_TIMED_OUT', 'block', 'Arkose session expired before verification');
  if (d.solved !== true) add('NOT_SOLVED', 'block', 'Challenge was not solved / session did not pass');
  if (d.session_is_legit === false) add('SESSION_NOT_LEGIT', 'block', 'Arkose marked the session as not legitimate');
  if (risk.category === 'DENYLIST') add('DENYLIST', 'block', 'A denylist telltale fired');

  // Soft rules. An ALLOWLIST category overrides every other risk category.
  if (risk.category !== 'ALLOWLIST') {
    if (risk.category === 'FRD-FRM' && risk.band !== 'LOW') add('FRAUD_FARM', 'block', 'Fraud-farm (human solver) telltales fired');
    if (risk.band === 'HIGH') add('RISK_HIGH', policy.highBand, `Risk band HIGH (score ${risk.score}, category ${risk.category})`);
    if (risk.band === 'MEDIUM') add('RISK_MEDIUM', policy.mediumBand, `Risk band MEDIUM (score ${risk.score}, category ${risk.category})`);
    if (ip.is_tor || ip.is_vpn || ip.is_proxy) {
      const kinds = ['is_tor', 'is_vpn', 'is_proxy'].filter((k) => ip[k]).map((k) => k.slice(3));
      add('IP_ANONYMIZER', policy.ipFlag, `IP flagged as ${kinds.join('/')}`);
    }
  }

  const action = reasons.reduce((acc, r) => worst(acc, r.action), 'allow');
  return { action, reasons: reasons.filter((r) => r.action !== 'allow'), risk };
}
