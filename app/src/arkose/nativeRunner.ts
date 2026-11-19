import { ArkoseClientError } from './types';
import type { ArkoseSdk } from './sdk';

/**
 * Runs one Arkose session through the native SDK (the real thing, not a simulation).
 *
 * Lifecycle, per the SDK docs:
 *   initialize(config) -> onReady -> showEnforcementChallenge()
 *     -> onSuppress (no challenge needed) and/or onShown (challenge visible)
 *     -> onCompleted(result)  contains the session token
 *     -> onFailed / onError / onHide(without completion) are the failure paths
 *
 * The SDK uses one global event emitter, so listeners are registered ONCE and routed to
 * whichever request is currently active (the app only ever runs one session at a time).
 * We call initialize() for every session because a token is single-use and each protected
 * action needs a fresh session. Confirm the re-initialization cost with the Arkose SDK
 * team for your SDK version and consider preloading if it matters for your UX.
 */

interface Active {
  resolve: (r: { token: string; suppressed: boolean }) => void;
  reject: (e: ArkoseClientError) => void;
  suppressed: boolean;
  requested: boolean; // showEnforcementChallenge already called
  done: boolean;
  timers: ReturnType<typeof setTimeout>[];
  readyTimer?: ReturnType<typeof setTimeout>;
}

let active: Active | null = null;
let registeredFor: ArkoseSdk | null = null;

const READY_TIMEOUT_MS = 20_000; // initialize() -> onReady
const OVERALL_TIMEOUT_MS = 180_000; // includes the time a human spends on the challenge

function settle(a: Active, fn: () => void) {
  if (a.done) return;
  a.done = true;
  a.timers.forEach(clearTimeout);
  if (active === a) active = null;
  fn();
}

/** The docs don't pin down the onCompleted payload shape, so accept the plausible variants. */
export function extractToken(payload: unknown): string | null {
  const visit = (value: unknown, depth: number): string | null => {
    if (depth > 3 || value == null) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.startsWith('{')) {
        try {
          return visit(JSON.parse(trimmed), depth + 1);
        } catch {
          return null;
        }
      }
      return trimmed.length >= 10 ? trimmed : null;
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      for (const key of ['token', 'sessionToken', 'session_token']) {
        const found = visit(obj[key], depth + 1);
        if (found) return found;
      }
      for (const key of ['response', 'result', 'data']) {
        const found = visit(obj[key], depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  return visit(payload, 0);
}

function registerListeners(sdk: ArkoseSdk) {
  if (registeredFor === sdk) return;
  registeredFor = sdk;
  const on = sdk.ArkoseEvents.addListener.bind(sdk.ArkoseEvents);

  on('onReady', () => {
    const a = active;
    if (!a || a.requested) return;
    a.requested = true;
    if (a.readyTimer) clearTimeout(a.readyTimer); // ready in time: only the overall timeout applies now
    sdk.ArkoseManager.showEnforcementChallenge({});
  });
  on('onSuppress', () => {
    if (active) active.suppressed = true;
  });
  on('onCompleted', (payload) => {
    const a = active;
    if (!a) return;
    const token = extractToken(payload);
    if (!token) {
      settle(a, () => a.reject(new ArkoseClientError('ERROR', 'Arkose completed but no token was found in the onCompleted payload. Check the payload shape for your SDK version.', payload)));
      return;
    }
    settle(a, () => a.resolve({ token, suppressed: a.suppressed }));
  });
  on('onFailed', (payload) => {
    const a = active;
    if (a) settle(a, () => a.reject(new ArkoseClientError('FAILED', 'The challenge was not passed', payload)));
  });
  on('onError', (payload) => {
    const a = active;
    if (a) settle(a, () => a.reject(new ArkoseClientError('ERROR', 'Arkose reported an error', payload)));
  });
  on('onHide', () => {
    // onHide also fires after a successful completion, so only treat it as a cancel if no
    // result arrives shortly afterwards.
    const a = active;
    if (!a || !a.requested) return;
    a.timers.push(setTimeout(() => settle(a, () => a.reject(new ArkoseClientError('CANCELLED', 'Challenge closed before completion'))), 600));
  });
}

export function runNativeSession(
  sdk: ArkoseSdk,
  opts: { apiKey: string; apiBaseUrl: string; noSuppress: boolean; language?: string },
): Promise<{ token: string; suppressed: boolean }> {
  if (active) return Promise.reject(new ArkoseClientError('BUSY', 'An Arkose session is already running'));
  registerListeners(sdk);

  return new Promise((resolve, reject) => {
    const a: Active = { resolve, reject, suppressed: false, requested: false, done: false, timers: [] };
    active = a;
    a.readyTimer = setTimeout(
      () => settle(a, () => reject(new ArkoseClientError('TIMEOUT', 'Arkose SDK never became ready (check the public key, apiBaseUrl and network)'))),
      READY_TIMEOUT_MS,
    );
    a.timers.push(a.readyTimer);
    a.timers.push(
      setTimeout(() => settle(a, () => {
        try {
          sdk.ArkoseManager.forceDismissEnforcementChallenge?.();
        } catch {
          /* best effort */
        }
        reject(new ArkoseClientError('TIMEOUT', 'Arkose session timed out'));
      }), OVERALL_TIMEOUT_MS),
    );
    try {
      sdk.ArkoseManager.initialize({
        apiKey: opts.apiKey,
        apiBaseUrl: opts.apiBaseUrl,
        noSuppress: opts.noSuppress,
        ...(opts.language ? { language: opts.language } : {}),
      });
    } catch (err) {
      settle(a, () => reject(new ArkoseClientError('ERROR', `ArkoseManager.initialize threw: ${String(err)}`, err)));
    }
  });
}
