import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { buildEnforcementPage, liveScriptUrl, type PageSource } from '../src/arkose/webviewHtml';

type Msg = { type: string; requestId: string; token?: string; detail?: string };

function load(source: PageSource, requestId = 'req-1') {
  const { html } = buildEnforcementPage({ requestId, source });
  const messages: Msg[] = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    beforeParse(window) {
      (window as any).ReactNativeWebView = { postMessage: (m: string) => messages.push(JSON.parse(m)) };
    },
  });
  return { dom, messages, win: dom.window as any, html };
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('mock page drives the same callbacks the real client API does', () => {
  test('clean session is suppressed: ready -> suppress -> completed, never shown', async () => {
    const { messages } = load({ kind: 'mock', scenario: 'clean', forceChallenge: false });
    await wait(1000);
    assert.deepEqual(messages.map((m) => m.type), ['ready', 'suppress', 'completed']);
    assert.match(messages[2].token!, /^mock\.clean\./);
    assert.ok(messages.every((m) => m.requestId === 'req-1'));
  });

  test('risky scenario shows a challenge and completes only after the user acts', async () => {
    const { messages, win } = load({ kind: 'mock', scenario: 'bot', forceChallenge: false });
    await wait(500);
    assert.deepEqual(messages.map((m) => m.type), ['ready', 'show', 'shown']);
    win.document.getElementById('mock-go').click();
    assert.equal(messages.at(-1)!.type, 'completed');
    assert.match(messages.at(-1)!.token!, /^mock\.bot\./);
  });

  test('forcing a challenge on a clean session yields a "challenged" token', async () => {
    const { messages, win } = load({ kind: 'mock', scenario: 'clean', forceChallenge: true });
    await wait(500);
    assert.ok(messages.some((m) => m.type === 'shown'));
    win.document.getElementById('mock-go').click();
    assert.match(messages.at(-1)!.token!, /^mock\.challenged\./);
  });
});

describe('live page follows the documented web integration', () => {
  const key = 'AAAA-BBBB-CCCC';
  const scriptUrl = liveScriptUrl('https://client-api.arkoselabs.com/v2', key);

  test('script tag uses <base>/<public key>/api.js with data-callback', () => {
    assert.equal(scriptUrl, 'https://client-api.arkoselabs.com/v2/AAAA-BBBB-CCCC/api.js');
    const { win } = load({ kind: 'live', scriptUrl });
    const script = win.document.querySelector('script[src]');
    assert.equal(script.getAttribute('src'), scriptUrl);
    assert.equal(script.getAttribute('data-callback'), 'setupEnforcement');
    assert.ok(win.document.querySelector('#challenge'));
  });

  test('setupEnforcement configures inline mode on #challenge and relays every callback', () => {
    const { messages, win } = load({ kind: 'live', scriptUrl });
    let captured: any;
    win.setupEnforcement({ setConfig: (c: any) => (captured = c) });
    assert.equal(captured.selector, '#challenge');
    assert.equal(captured.mode, 'inline');

    captured.onReady();
    captured.onSuppress({});
    captured.onShown();
    captured.onCompleted({ token: 'tok_1234567890' });
    captured.onFailed({ reason: 'x' });
    captured.onError({ code: 7 });
    captured.onHide();
    assert.deepEqual(messages.map((m) => m.type), ['ready', 'suppress', 'shown', 'completed', 'failed', 'error', 'hide']);
    assert.equal(messages[3].token, 'tok_1234567890');
    assert.equal(messages[5].detail, '{"code":7}');
  });

  test('the language option is only set when provided', () => {
    const withLang = buildEnforcementPage({ requestId: 'r', source: { kind: 'live', scriptUrl }, language: 'fr' });
    const dom = new JSDOM(withLang.html, { runScripts: 'dangerously', beforeParse: (w: any) => (w.ReactNativeWebView = { postMessage() {} }) });
    let cfg: any;
    (dom.window as any).setupEnforcement({ setConfig: (c: any) => (cfg = c) });
    assert.equal(cfg.language, 'fr');
    const none = load({ kind: 'live', scriptUrl });
    let cfg2: any;
    none.win.setupEnforcement({ setConfig: (c: any) => (cfg2 = c) });
    assert.equal('language' in cfg2, false);
  });

  test('refuses non-https script URLs', () => {
    assert.throws(() => liveScriptUrl('http://client-api.arkoselabs.com/v2', key), /https/);
  });

  test('hostile values cannot break out of the script tag or attribute', () => {
    const evil = liveScriptUrl('https://client-api.arkoselabs.com/v2', '"><script>alert(1)</script>');
    const { win, html } = load({ kind: 'live', scriptUrl: evil }, '</script><script>alert(2)</script>');
    assert.equal(win.document.querySelectorAll('script[src]').length, 1, 'only the one intended external script');
    assert.doesNotMatch(html, /<script>alert\(1\)/);
    assert.doesNotMatch(html, /<\/script><script>alert\(2\)/);
  });

  test('a failed script load is reported as an error', async () => {
    const { win, messages } = load({ kind: 'live', scriptUrl });
    win.document.querySelector('script[src]').dispatchEvent(new win.Event('error'));
    assert.equal(messages.at(-1)!.type, 'error');
  });
});
