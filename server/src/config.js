import crypto from 'node:crypto';

/** Flows protected by Arkose. Each can use its own public/private key pair. */
export const FLOWS = ['search', 'signup', 'login', 'checkout'];

const PLACEHOLDER_PUBLIC_KEY = 'YOUR_PUBLIC_KEY';

const toBool = (value, fallback) =>
  value === undefined || value === '' ? fallback : ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());

export function loadConfig(env = process.env) {
  const mode = (env.ARKOSE_MODE || 'mock').toLowerCase();
  if (!['mock', 'live'].includes(mode)) {
    throw new Error(`ARKOSE_MODE must be "mock" or "live" (got "${mode}")`);
  }

  const keys = {};
  for (const flow of FLOWS) {
    const suffix = flow.toUpperCase();
    keys[flow] = {
      publicKey: env[`ARKOSE_PUBLIC_KEY_${suffix}`] || env.ARKOSE_PUBLIC_KEY || PLACEHOLDER_PUBLIC_KEY,
      privateKey: env[`ARKOSE_PRIVATE_KEY_${suffix}`] || env.ARKOSE_PRIVATE_KEY || '',
    };
  }

  if (mode === 'live') {
    const missing = FLOWS.filter(
      (flow) => !keys[flow].privateKey || keys[flow].privateKey === 'YOUR_PRIVATE_KEY' || keys[flow].publicKey === PLACEHOLDER_PUBLIC_KEY,
    );
    if (missing.length > 0) {
      throw new Error(
        `ARKOSE_MODE=live needs real Arkose keys, but these flows still have placeholders or missing values: ${missing.join(', ')}. ` +
          'Set ARKOSE_PUBLIC_KEY / ARKOSE_PRIVATE_KEY (or the per-flow ARKOSE_*_KEY_<FLOW> variants), or use ARKOSE_MODE=mock.',
      );
    }
  }

  const authSecret = env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');

  return {
    port: Number(env.PORT || 4000),
    authSecret,
    authSecretIsEphemeral: !env.AUTH_SECRET,
    demoDebug: toBool(env.DEMO_DEBUG, mode === 'mock'),
    stepUpCode: env.DEMO_STEPUP_CODE || '000000',
    arkose: {
      mode,
      verifyUrl: env.ARKOSE_VERIFY_URL || 'https://verify-api.arkoselabs.com/api/v4/verify/',
      clientApiBaseUrl: (env.ARKOSE_CLIENT_API_BASE_URL || 'https://client-api.arkoselabs.com/v2').replace(/\/+$/, ''),
      timeoutMs: Number(env.ARKOSE_VERIFY_TIMEOUT_MS || 4000),
      keys,
    },
  };
}
