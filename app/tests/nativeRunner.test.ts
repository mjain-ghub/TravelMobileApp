import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import { extractToken, runNativeSession } from '../src/arkose/nativeRunner';
import type { ArkoseSdk } from '../src/arkose/sdk';
import { ArkoseClientError } from '../src/arkose/types';

/** A fake SDK: a plain event emitter plus recorders for the two methods the app calls. */
function fakeSdk() {
  const handlers = new Map<string, ((p?: unknown) => void)[]>();
  const calls = { initialize: [] as any[], show: [] as any[] };
  const sdk: ArkoseSdk = {
    ArkoseManager: {
      initialize: (c) => void calls.initialize.push(c),
      showEnforcementChallenge: (p) => void calls.show.push(p),
    },
    ArkoseEvents: {
      addListener: (name, fn) => {
        handlers.set(name, [...(handlers.get(name) ?? []), fn]);
        return { remove() {} };
      },
    },
  };
  const emit = (name: string, payload?: unknown) => (handlers.get(name) ?? []).forEach((h) => h(payload));
  return { sdk, emit, calls };
}
const opts = { apiKey: 'PUB', apiBaseUrl: 'https://client-api.arkoselabs.com/v2', noSuppress: false };
const tick = () => new Promise((r) => setImmediate(r));

describe('extractToken tolerates the plausible onCompleted payload shapes', () => {
  const T = 'abcdefghij-token-1234567890';
  test('shapes', () => {
    assert.equal(extractToken({ token: T }), T);
    assert.equal(extractToken({ response: { token: T } }), T);
    assert.equal(extractToken({ sessionToken: T }), T);
    assert.equal(extractToken({ response: JSON.stringify({ token: T }) }), T);
    assert.equal(extractToken(JSON.stringify({ token: T })), T);
    assert.equal(extractToken(T), T);
  });
  test('rejects payloads without a usable token', () => {
    assert.equal(extractToken(undefined), null);
    assert.equal(extractToken({}), null);
    assert.equal(extractToken({ token: 'short' }), null);
    assert.equal(extractToken({ response: { nested: { deeper: { deepest: { token: T } } } } }), null);
  });
});

describe('native session lifecycle', () => {
  test('initialize -> onReady -> show -> suppress -> completed resolves with suppressed=true', async () => {
    const { sdk, emit, calls } = fakeSdk();
    const p = runNativeSession(sdk, opts);
    assert.deepEqual(calls.initialize, [{ apiKey: 'PUB', apiBaseUrl: opts.apiBaseUrl, noSuppress: false }]);
    assert.equal(calls.show.length, 0, 'must not show before onReady');
    emit('onReady');
    emit('onReady'); // duplicate ready events must not show twice
    assert.equal(calls.show.length, 1);
    emit('onSuppress');
    emit('onCompleted', { token: 'tok-1234567890-abc' });
    assert.deepEqual(await p, { token: 'tok-1234567890-abc', suppressed: true });
  });

  test('a shown challenge that completes reports suppressed=false and passes noSuppress through', async () => {
    const { sdk, emit, calls } = fakeSdk();
    const p = runNativeSession(sdk, { ...opts, noSuppress: true, language: 'es' });
    assert.equal(calls.initialize[0].noSuppress, true);
    assert.equal(calls.initialize[0].language, 'es');
    emit('onReady');
    emit('onShown');
    emit('onCompleted', { response: { token: 'tok-1234567890-xyz' } });
    assert.deepEqual(await p, { token: 'tok-1234567890-xyz', suppressed: false });
  });

  test('onFailed and onError reject with typed errors', async () => {
    for (const [event, code] of [['onFailed', 'FAILED'], ['onError', 'ERROR']] as const) {
      const { sdk, emit } = fakeSdk();
      const p = runNativeSession(sdk, opts);
      emit('onReady');
      emit(event, { why: 'test' });
      await assert.rejects(p, (e: ArkoseClientError) => e instanceof ArkoseClientError && e.code === code);
    }
  });

  test('completion without a token is an error, not a silent empty token', async () => {
    const { sdk, emit } = fakeSdk();
    const p = runNativeSession(sdk, opts);
    emit('onReady');
    emit('onCompleted', { unexpected: true });
    await assert.rejects(p, (e: ArkoseClientError) => e.code === 'ERROR');
  });

  test('closing the challenge (onHide with no result) is a cancel, after a grace period', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const { sdk, emit } = fakeSdk();
      const p = runNativeSession(sdk, opts);
      emit('onReady');
      emit('onHide');
      mock.timers.tick(700);
      await assert.rejects(p, (e: ArkoseClientError) => e.code === 'CANCELLED');
    } finally {
      mock.timers.reset();
    }
  });

  test('onHide that arrives just before onCompleted does not cancel a successful session', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const { sdk, emit } = fakeSdk();
      const p = runNativeSession(sdk, opts);
      emit('onReady');
      emit('onHide');
      emit('onCompleted', { token: 'tok-1234567890-late' });
      mock.timers.tick(700); // the pending cancel timer fires but the session is already settled
      assert.equal((await p).token, 'tok-1234567890-late');
    } finally {
      mock.timers.reset();
    }
  });

  test('never becoming ready times out; becoming ready cancels that timeout', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const a = fakeSdk();
      const never = runNativeSession(a.sdk, opts);
      mock.timers.tick(21_000);
      await assert.rejects(never, (e: ArkoseClientError) => e.code === 'TIMEOUT');

      const b = fakeSdk();
      const slowHuman = runNativeSession(b.sdk, opts);
      b.emit('onReady');
      mock.timers.tick(60_000); // a person taking a minute on the challenge is fine
      b.emit('onCompleted', { token: 'tok-1234567890-slow' });
      assert.equal((await slowHuman).token, 'tok-1234567890-slow');
    } finally {
      mock.timers.reset();
    }
  });

  test('only one session at a time', async () => {
    const { sdk, emit } = fakeSdk();
    const first = runNativeSession(sdk, opts);
    await assert.rejects(runNativeSession(sdk, opts), (e: ArkoseClientError) => e.code === 'BUSY');
    emit('onReady');
    emit('onCompleted', { token: 'tok-1234567890-one' });
    await first;
    await tick();
    const next = runNativeSession(sdk, opts); // slot is free again
    emit('onReady');
    emit('onCompleted', { token: 'tok-1234567890-two' });
    assert.equal((await next).token, 'tok-1234567890-two');
  });

  test('an initialize() that throws rejects instead of hanging', async () => {
    const { sdk } = fakeSdk();
    sdk.ArkoseManager.initialize = () => {
      throw new Error('native module missing');
    };
    await assert.rejects(runNativeSession(sdk, opts), (e: ArkoseClientError) => e.code === 'ERROR' && /native module missing/.test(e.message));
  });
});
