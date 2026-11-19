import crypto from 'node:crypto';

// Minimal demo auth: scrypt password hashes and HMAC-signed session tokens.
// Production systems should use a vetted auth provider instead of this.

const b64url = (buf) => Buffer.from(buf).toString('base64url');

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

// A fixed hash lets us do equal work when the account doesn't exist, so response
// timing doesn't reveal which emails are registered.
const DUMMY_HASH = hashPassword('not-a-real-password');

export function verifyPassword(password, stored) {
  const [scheme, saltB64, hashB64] = (stored ?? DUMMY_HASH).split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64url'), expected.length);
  return crypto.timingSafeEqual(actual, expected) && stored !== undefined;
}

export function signSession(payload, secret, ttlSeconds = 3600) {
  const body = b64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function readSession(token, secret) {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
  } catch {
    return null;
  }
}

/** Populates req.user when a valid bearer token is present. Never rejects by itself. */
export function attachUser(secret) {
  return (req, _res, next) => {
    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    req.user = token ? readSession(token, secret) : null;
    next();
  };
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in required', code: 'AUTH_REQUIRED' });
  return next();
}
