import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluate } from '../src/arkose/policy.js';

const verify = ({ band = 'LOW', category, score = 0, solved = true, extra = {}, ip = {} } = {}) => ({
  session_details: { solved, session_is_legit: true, previously_verified: false, session_timed_out: false, ...extra },
  session_risk: { risk_band: band, ...(category ? { risk_category: category } : {}), global: { score }, custom: { score: 0 } },
  ip_intelligence: { is_proxy: false, is_vpn: false, is_tor: false, ...ip },
});

const action = (flow, v) => evaluate(flow, v).action;

test('clean sessions are allowed on every flow', () => {
  for (const flow of ['search', 'signup', 'login', 'checkout']) assert.equal(action(flow, verify()), 'allow');
});

test('unsolved or replayed tokens are always blocked', () => {
  for (const flow of ['search', 'signup', 'login', 'checkout']) {
    assert.equal(action(flow, verify({ solved: false })), 'block');
    assert.equal(action(flow, verify({ extra: { previously_verified: true } })), 'block');
    assert.equal(action(flow, verify({ extra: { session_is_legit: false } })), 'block');
  }
});

test('MEDIUM risk: search allows, money/identity flows step up', () => {
  const v = verify({ band: 'MEDIUM', category: 'BOT-STD', score: 55 });
  assert.equal(action('search', v), 'allow');
  assert.equal(action('signup', v), 'step_up');
  assert.equal(action('login', v), 'step_up');
  assert.equal(action('checkout', v), 'step_up');
});

test('HIGH risk blocks everywhere', () => {
  const v = verify({ band: 'HIGH', category: 'BOT-ADV', score: 92 });
  for (const flow of ['search', 'signup', 'login', 'checkout']) assert.equal(action(flow, v), 'block');
});

test('fraud-farm and denylist categories block even if the band looks tame', () => {
  assert.equal(action('search', verify({ band: 'MEDIUM', category: 'FRD-FRM', score: 60 })), 'block');
  assert.equal(action('checkout', verify({ band: 'LOW', category: 'DENYLIST' })), 'block');
});

test('anonymizing IPs step up on signup/checkout but not on search/login', () => {
  const v = verify({ ip: { is_vpn: true } });
  assert.equal(action('search', v), 'allow');
  assert.equal(action('login', v), 'allow');
  assert.equal(action('signup', v), 'step_up');
  assert.equal(action('checkout', v), 'step_up');
});

test('ALLOWLIST overrides soft rules but not hard failures', () => {
  const soft = verify({ band: 'HIGH', category: 'ALLOWLIST', score: 90, ip: { is_tor: true } });
  assert.equal(action('checkout', soft), 'allow');
  const hard = verify({ band: 'LOW', category: 'ALLOWLIST', solved: false });
  assert.equal(action('checkout', hard), 'block');
});

test('worst action wins and reasons explain it', () => {
  const result = evaluate('checkout', verify({ band: 'MEDIUM', category: 'BOT-STD', score: 50, ip: { is_proxy: true } }));
  assert.equal(result.action, 'step_up');
  assert.deepEqual(result.reasons.map((r) => r.code).sort(), ['IP_ANONYMIZER', 'RISK_MEDIUM']);
  assert.equal(result.risk.score, 50);
});
