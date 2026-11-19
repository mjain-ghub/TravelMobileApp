import crypto from 'node:crypto';
import { VerifyError, verifyToken } from './verify.js';
import { FLOW_POLICY, evaluate } from './policy.js';

/**
 * Express middleware that protects a route with Arkose.
 *
 * Client contract (all via headers, so it works the same for GET and POST):
 *   X-Arkose-Token    the session token from the native SDK or the webview
 *   X-Arkose-Method   "native" | "webview" (analytics only; never trusted for decisions)
 *   X-StepUp-Id/Code  sent on the retry after a STEP_UP_REQUIRED response
 *
 * Outcomes:
 *   400 ARKOSE_TOKEN_MISSING    no token supplied
 *   403 ARKOSE_BLOCK            policy said block
 *   403 STEP_UP_REQUIRED        policy said step_up; retry with a step-up code
 *   503 ARKOSE_UNAVAILABLE      Verify API failed and this flow fails closed
 *   next()                      allowed; req.arkose holds the decision for the handler
 */

const MAX_TOKEN_LENGTH = 8192;
const STEP_UP_TTL_MS = 5 * 60 * 1000;
const STEP_UP_MAX_ATTEMPTS = 3;

export function arkoseGate(flow, ctx) {
  const { config, store } = ctx;

  return async (req, res, next) => {
    try {
      // ---- retry after step-up -------------------------------------------------------
      const stepUpId = req.get('x-stepup-id');
      if (stepUpId) return completeStepUp(req, res, next, flow, ctx, stepUpId);

      // ---- token intake --------------------------------------------------------------
      const token = req.get('x-arkose-token');
      const method = ['native', 'webview'].includes(req.get('x-arkose-method')) ? req.get('x-arkose-method') : 'unknown';
      if (!token) {
        return res.status(400).json({ error: 'Arkose token required', code: 'ARKOSE_TOKEN_MISSING', flow });
      }
      if (token.length > MAX_TOKEN_LENGTH) {
        return res.status(400).json({ error: 'Arkose token malformed', code: 'ARKOSE_TOKEN_MALFORMED', flow });
      }

      // log_data is stored with the Arkose session for later analysis. Keep PII out of it.
      const logData = JSON.stringify({ flow, method, uid: req.user?.sub ?? null });
      const started = Date.now();

      let verify;
      try {
        verify = await verifyToken({ token, flow, logData, ip: req.ip }, ctx);
      } catch (err) {
        if (!(err instanceof VerifyError)) throw err;
        console.warn(`[arkose] verify failed for flow=${flow}: ${err.code} ${err.message}`);
        if (FLOW_POLICY[flow].failMode === 'open') {
          req.arkose = buildInfo({ flow, method, token, decision: 'allow', failedOpen: true, error: err.code, verifyMs: Date.now() - started, config });
          return next();
        }
        return res.status(503).json({
          error: 'Security check unavailable, please try again',
          code: 'ARKOSE_UNAVAILABLE',
          arkose: buildInfo({ flow, method, token, decision: 'block', failedOpen: false, error: err.code, verifyMs: Date.now() - started, config }),
        });
      }

      // ---- decision ------------------------------------------------------------------
      const result = evaluate(flow, verify);
      const info = buildInfo({ flow, method, token, decision: result.action, result, verify, verifyMs: Date.now() - started, config });
      console.log(`[arkose] flow=${flow} method=${method} decision=${result.action} band=${result.risk.band} category=${result.risk.category}`);

      if (result.action === 'block') {
        return res.status(403).json({ error: 'Request blocked by security policy', code: 'ARKOSE_BLOCK', arkose: info });
      }
      if (result.action === 'step_up') {
        const id = crypto.randomUUID();
        store.stepUps.set(id, { flow, userId: req.user?.sub ?? null, ip: req.ip, expiresAt: Date.now() + STEP_UP_TTL_MS, attempts: 0, info });
        return res.status(403).json({ error: 'Additional verification required', code: 'STEP_UP_REQUIRED', stepUpId: id, arkose: info });
      }

      req.arkose = info;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

function completeStepUp(req, res, next, flow, { config, store }, stepUpId) {
  const rec = store.stepUps.get(stepUpId);
  const valid = rec && rec.flow === flow && rec.expiresAt > Date.now() && rec.userId === (req.user?.sub ?? null) && rec.ip === req.ip;
  if (!valid) {
    store.stepUps.delete(stepUpId);
    return res.status(403).json({ error: 'Step-up expired or invalid, please start again', code: 'STEP_UP_INVALID' });
  }
  if (req.get('x-stepup-code') !== config.stepUpCode) {
    rec.attempts += 1;
    if (rec.attempts >= STEP_UP_MAX_ATTEMPTS) store.stepUps.delete(stepUpId);
    return res.status(403).json({
      error: 'Incorrect verification code',
      code: 'STEP_UP_FAILED',
      attemptsLeft: Math.max(0, STEP_UP_MAX_ATTEMPTS - rec.attempts),
    });
  }
  store.stepUps.delete(stepUpId);
  req.arkose = { ...rec.info, decision: 'allow', stepUpCompleted: true };
  return next();
}

/** Shape sent back to the app. `raw` (the full Verify response) only when demo debug is on. */
function buildInfo({ flow, method, token, decision, result, verify, failedOpen = false, error, verifyMs, config }) {
  const d = verify?.session_details ?? {};
  return {
    flow,
    method,
    decision,
    reasons: result?.reasons ?? [],
    risk: result?.risk ?? null,
    session: d.session ?? null,
    solved: d.solved ?? null,
    suppressed: d.suppressed ?? null,
    challengeType: d.challenge_type ?? null,
    ip: verify?.ip_intelligence ?? null,
    tokenPreview: `${token.slice(0, 12)}…(${token.length} chars)`,
    verifyMs,
    failedOpen,
    verifyError: error ?? null,
    mode: config.arkose.mode,
    ...(config.demoDebug && verify ? { raw: verify } : {}),
  };
}
