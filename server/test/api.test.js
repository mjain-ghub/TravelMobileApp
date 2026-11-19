import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createApp, DEMO_USER } from '../src/app.js';
import { loadConfig } from '../src/config.js';

let server;
let base;
let counter = 0;
const tok = (scenario) => `mock.${scenario}.${Date.now()}-${(counter += 1)}`;

async function call(path, { method = 'GET', body, token, arkose, auth, extra = {} } = {}) {
  const headers = { ...extra };
  if (body) headers['Content-Type'] = 'application/json';
  if (arkose) headers['X-Arkose-Token'] = arkose;
  if (arkose) headers['X-Arkose-Method'] = token ?? 'native';
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json() };
}

const search = (arkose, extra) => call('/api/flights/search?from=ATL&to=LAX&date=2026-12-15', { arkose, extra });
const login = (arkose, extra) => call('/api/auth/login', { method: 'POST', body: { email: DEMO_USER.email, password: DEMO_USER.password }, arkose, extra });

before(async () => {
  const app = createApp({ config: loadConfig({ ARKOSE_MODE: 'mock', AUTH_SECRET: 'test-secret' }) });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

describe('config', () => {
  test('public config never exposes private keys', async () => {
    const { json } = await call('/api/config');
    assert.equal(json.mode, 'mock');
    assert.ok(json.publicKeys.checkout);
    assert.doesNotMatch(JSON.stringify(json), /private/i);
  });

  test('live mode refuses to start with placeholder keys', () => {
    assert.throws(() => loadConfig({ ARKOSE_MODE: 'live' }), /placeholders or missing/);
    assert.doesNotThrow(() => loadConfig({ ARKOSE_MODE: 'live', ARKOSE_PUBLIC_KEY: 'AAAA-1111', ARKOSE_PRIVATE_KEY: 'secret' }));
  });
});

describe('search flow (fails open)', () => {
  test('requires a token', async () => {
    const r = await search(undefined);
    assert.equal(r.status, 400);
    assert.equal(r.json.code, 'ARKOSE_TOKEN_MISSING');
  });

  test('clean suppressed session returns results plus the decision', async () => {
    const r = await search(tok('clean'));
    assert.equal(r.status, 200);
    assert.equal(r.json.results.length, 8);
    assert.equal(r.json.arkose.decision, 'allow');
    assert.equal(r.json.arkose.suppressed, true);
    assert.equal(r.json.arkose.method, 'native');
    assert.ok(r.json.arkose.raw.session_details.session, 'raw Verify response present in mock/debug mode');
  });

  test('a token cannot be replayed', async () => {
    const t = tok('clean');
    assert.equal((await search(t)).status, 200);
    const again = await search(t);
    assert.equal(again.status, 403);
    assert.equal(again.json.code, 'ARKOSE_BLOCK');
    assert.ok(again.json.arkose.reasons.some((x) => x.code === 'TOKEN_REPLAYED'));
  });

  test('bots are blocked', async () => {
    const r = await search(tok('bot'));
    assert.equal(r.status, 403);
    assert.equal(r.json.arkose.risk.band, 'HIGH');
  });

  test('MEDIUM risk is allowed on search', async () => {
    assert.equal((await search(tok('vpn'))).status, 200);
  });

  test('Verify API outage fails OPEN for search', async () => {
    const r = await search(tok('timeout'));
    assert.equal(r.status, 200);
    assert.equal(r.json.arkose.failedOpen, true);
  });

  test('input is validated before a token is spent', async () => {
    const r = await call('/api/flights/search?from=ATL&to=ATL&date=2026-12-15', { arkose: tok('clean') });
    assert.equal(r.status, 400);
  });
});

describe('login flow (fails closed, steps up)', () => {
  test('clean session logs in', async () => {
    const r = await login(tok('clean'));
    assert.equal(r.status, 200);
    assert.ok(r.json.token);
  });

  test('the gate runs before credentials are checked, and bad credentials still consume a token', async () => {
    const t = tok('clean');
    const r = await call('/api/auth/login', { method: 'POST', body: { email: DEMO_USER.email, password: 'wrong-password' }, arkose: t });
    assert.equal(r.status, 401);
    assert.equal(r.json.code, 'BAD_CREDENTIALS');
    assert.equal((await login(t)).status, 403, 'same token cannot be reused for a second attempt');
  });

  test('VPN session requires step-up; wrong code fails; right code succeeds once', async () => {
    const first = await login(tok('vpn'));
    assert.equal(first.status, 403);
    assert.equal(first.json.code, 'STEP_UP_REQUIRED');
    const id = first.json.stepUpId;

    const wrong = await login(undefined, { 'X-StepUp-Id': id, 'X-StepUp-Code': '111111' });
    assert.equal(wrong.json.code, 'STEP_UP_FAILED');

    const ok = await login(undefined, { 'X-StepUp-Id': id, 'X-StepUp-Code': '000000' });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.arkose.stepUpCompleted, true);

    const reuse = await login(undefined, { 'X-StepUp-Id': id, 'X-StepUp-Code': '000000' });
    assert.equal(reuse.json.code, 'STEP_UP_INVALID');
  });

  test('Verify API outage fails CLOSED for login', async () => {
    const r = await login(tok('timeout'));
    assert.equal(r.status, 503);
    assert.equal(r.json.code, 'ARKOSE_UNAVAILABLE');
  });
});

describe('signup flow', () => {
  const signup = (arkose, email = `new${Date.now()}${counter}@example.com`) =>
    call('/api/auth/signup', { method: 'POST', body: { name: 'Test User', email, password: 'Sup3rSecret!' }, arkose, token: 'webview' });

  test('works from the webview path and records the method', async () => {
    const r = await signup(tok('challenged'));
    assert.equal(r.status, 201);
    assert.equal(r.json.arkose.method, 'webview');
    assert.equal(r.json.arkose.challengeType, 'visual');
  });

  test('fraud-farm solves are rejected', async () => {
    assert.equal((await signup(tok('farm'))).status, 403);
  });

  test('duplicate email is rejected', async () => {
    const email = `dupe${Date.now()}@example.com`;
    assert.equal((await signup(tok('clean'), email)).status, 201);
    assert.equal((await signup(tok('clean'), email)).status, 409);
  });
});

describe('checkout flow', () => {
  let auth;
  before(async () => {
    auth = (await login(tok('clean'))).json.token;
  });

  const book = (arkose, body = {}, extra) =>
    call('/api/bookings', {
      method: 'POST',
      auth,
      arkose,
      extra,
      body: {
        itemType: 'flight',
        itemId: 'fl_ATL_LAX_2026-12-15_0',
        quantity: 2,
        passenger: { name: 'Demo Traveler', email: 'demo@example.com' },
        payment: { brand: 'Visa', last4: '4242' },
        ...body,
      },
    });

  test('requires sign-in', async () => {
    const r = await call('/api/bookings', { method: 'POST', body: {}, arkose: tok('clean') });
    assert.equal(r.status, 401);
  });

  test('prices server-side and ignores any client-supplied total', async () => {
    const detail = await call('/api/flights/fl_ATL_LAX_2026-12-15_0');
    const r = await book(tok('clean'), { totalCents: 1, price: 1 });
    assert.equal(r.status, 201);
    assert.equal(r.json.booking.subtotalCents, detail.json.item.unitPriceCents * 2);
    assert.equal(r.json.booking.totalCents, r.json.booking.subtotalCents + r.json.booking.taxesCents);
    assert.ok(r.json.booking.arkoseSession, 'Arkose session id stored on the booking');
    assert.equal(r.json.booking.payment.last4, '4242');
  });

  test('rejects anything that looks like a full card number', async () => {
    const r = await book(tok('clean'), { payment: { brand: 'Visa', last4: '4242424242424242' } });
    assert.equal(r.status, 400);
  });

  test('VPN triggers step-up, completing it books the trip', async () => {
    const first = await book(tok('vpn'));
    assert.equal(first.status, 403);
    assert.equal(first.json.code, 'STEP_UP_REQUIRED');
    const done = await book(undefined, {}, { 'X-StepUp-Id': first.json.stepUpId, 'X-StepUp-Code': '000000' });
    assert.equal(done.status, 201);
  });

  test('an unauthenticated caller cannot complete someone else\'s step-up', async () => {
    const first = await book(tok('vpn'));
    const anon = await call('/api/bookings', { method: 'POST', body: {}, extra: { 'X-StepUp-Id': first.json.stepUpId, 'X-StepUp-Code': '000000' } });
    assert.equal(anon.status, 401, 'requireAuth rejects before the gate is reached');
  });

  test('denylisted sessions and outages both stop the booking', async () => {
    assert.equal((await book(tok('denylist'))).status, 403);
    assert.equal((await book(tok('timeout'))).status, 503);
  });
});

describe('live mode wiring', () => {
  test('calls the Verify API v4 with the documented request shape', async () => {
    const calls = [];
    const fakeFetch = async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          session_details: { solved: true, session_is_legit: true, previously_verified: false, session: 'abc.123' },
          session_risk: { risk_band: 'LOW', global: { score: 3 }, custom: { score: 0 } },
        }),
      };
    };
    const config = loadConfig({
      ARKOSE_MODE: 'live',
      ARKOSE_VERIFY_URL: 'https://acme-verify.arkoselabs.com/api/v4/verify/',
      ARKOSE_PUBLIC_KEY: 'PUB-DEFAULT',
      ARKOSE_PRIVATE_KEY: 'PRIV-DEFAULT',
      ARKOSE_PRIVATE_KEY_CHECKOUT: 'PRIV-CHECKOUT',
      ARKOSE_PUBLIC_KEY_CHECKOUT: 'PUB-CHECKOUT',
      AUTH_SECRET: 'x',
    });
    const liveApp = createApp({ config, fetchImpl: fakeFetch });
    const s = await new Promise((resolve) => {
      const inst = liveApp.listen(0, () => resolve(inst));
    });
    try {
      const url = `http://127.0.0.1:${s.address().port}`;
      const res = await fetch(`${url}/api/flights/search?from=ATL&to=LAX&date=2026-12-15`, { headers: { 'X-Arkose-Token': 'real-looking-token', 'X-Arkose-Method': 'webview' } });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, 'https://acme-verify.arkoselabs.com/api/v4/verify/');
      assert.equal(calls[0].init.method, 'POST');
      assert.equal(calls[0].body.private_key, 'PRIV-DEFAULT', 'search uses the default key');
      assert.equal(calls[0].body.session_token, 'real-looking-token');
      assert.deepEqual(JSON.parse(calls[0].body.log_data), { flow: 'search', method: 'webview', uid: null });
      assert.equal(body.arkose.mode, 'live');
      assert.equal(body.arkose.raw, undefined, 'raw Verify response is not returned in live mode by default');

      const cfg = await (await fetch(`${url}/api/config`)).json();
      assert.equal(cfg.publicKeys.checkout, 'PUB-CHECKOUT');
      assert.doesNotMatch(JSON.stringify(cfg), /PRIV-/);
    } finally {
      s.close();
    }
  });
});
