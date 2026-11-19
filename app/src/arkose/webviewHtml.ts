/**
 * Builds the HTML page that hosts Arkose inside a WebView.
 *
 * Live mode follows the documented web integration: load
 *   <clientApiBaseUrl>/<PUBLIC_KEY>/api.js   with   data-callback="setupEnforcement"
 * then call setConfig({ selector, mode: 'inline', onReady, onShown, onSuppress, onCompleted, ... }).
 * Inline mode starts the session as soon as the page loads, which suits a WebView.
 *
 * Mock mode swaps api.js for a tiny stand-in that drives the SAME callbacks, so the bridge
 * code below (and the React Native side that consumes it) is exercised identically without
 * an Arkose account.
 *
 * Every callback posts a JSON message to React Native via window.ReactNativeWebView.postMessage.
 * Each message carries the request id, so stray or replayed messages are ignored.
 */

export interface WebViewPage {
  html: string;
  baseUrl: string;
}

export type PageSource =
  | { kind: 'live'; scriptUrl: string }
  | { kind: 'mock'; scenario: string; forceChallenge: boolean };

/** Origin the WebView reports to the page. If your key restricts allowed domains, allow this host. */
export const WEBVIEW_BASE_URL = process.env.EXPO_PUBLIC_WEBVIEW_BASE_URL ?? 'https://travel-demo.test';

// JSON that is safe to embed inside an inline <script>.
const js = (value: unknown) =>
  JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const attr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function liveScriptUrl(clientApiBaseUrl: string, publicKey: string): string {
  const url = new URL(`${clientApiBaseUrl.replace(/\/+$/, '')}/${encodeURIComponent(publicKey)}/api.js`);
  if (url.protocol !== 'https:') throw new Error('Arkose client API URL must use https');
  return url.toString();
}

export function buildEnforcementPage(opts: { requestId: string; source: PageSource; language?: string }): WebViewPage {
  const { requestId, source, language } = opts;

  const bridge = `
    (function () {
      var RID = ${js(requestId)};
      var LANG = ${js(language ?? null)};
      function safe(v) { try { return typeof v === 'string' ? v : JSON.stringify(v); } catch (e) { return String(v); } }
      function post(type, extra) {
        var m = extra || {}; m.type = type; m.requestId = RID;
        try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch (e) {}
      }
      window.__post = post;
      window.addEventListener('error', function (e) { post('error', { detail: 'page error: ' + (e && e.message) }); });
      window.setupEnforcement = function (enforcement) {
        var config = {
          selector: '#challenge',
          mode: 'inline',
          onReady: function () { post('ready'); },
          onShow: function () { post('show'); },
          onShown: function () { post('shown'); },
          onSuppress: function () { post('suppress'); },
          onCompleted: function (r) { post('completed', { token: r && r.token }); },
          onFailed: function (r) { post('failed', { detail: safe(r) }); },
          onError: function (r) { post('error', { detail: safe(r) }); },
          onHide: function () { post('hide'); }
        };
        if (LANG) config.language = LANG;
        enforcement.setConfig(config);
      };
    })();`;

  const liveScript =
    source.kind === 'live'
      ? `<script src="${attr(source.scriptUrl)}" data-callback="setupEnforcement" async defer onerror="window.__post('error',{detail:'Failed to load the Arkose client script'})"></script>`
      : '';

  const mockScript =
    source.kind === 'mock'
      ? `<script>
    (function () {
      var SCENARIO = ${js(source.scenario)};
      var FORCE = ${js(source.forceChallenge)};
      function tok(s) { return 'mock.' + s + '.' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
      var cfg;
      var enforcement = {
        setConfig: function (c) { cfg = c; setTimeout(function () { cfg.onReady && cfg.onReady(); begin(); }, 200); },
        run: function () {}, reset: function () {}
      };
      function begin() {
        if (SCENARIO === 'clean' && !FORCE) {
          cfg.onSuppress && cfg.onSuppress();
          setTimeout(function () { cfg.onCompleted && cfg.onCompleted({ token: tok('clean') }); }, 500);
          return;
        }
        cfg.onShow && cfg.onShow();
        document.querySelector(cfg.selector).innerHTML =
          '<div style="margin:12px;padding:18px;border:1px solid #DCE4E9;border-radius:12px;text-align:center">' +
          '<div style="font-weight:700;font-size:16px;color:#14232B">Arkose Labs challenge</div>' +
          '<div style="font-size:12px;color:#5B6B75;margin:6px 0 14px">Simulated web enforcement (mock mode). In live mode the real challenge renders here, inside this WebView.</div>' +
          '<button id="mock-go" style="background:#0B5563;color:#fff;border:0;border-radius:10px;padding:12px 22px;font-size:15px;font-weight:600">Verify I am human</button></div>';
        cfg.onShown && cfg.onShown();
        document.getElementById('mock-go').onclick = function () {
          cfg.onCompleted && cfg.onCompleted({ token: tok(SCENARIO === 'clean' ? 'challenged' : SCENARIO) });
        };
      }
      document.addEventListener('DOMContentLoaded', function () { window.setupEnforcement(enforcement); });
    })();
  </script>`
      : '';

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <style>html,body{margin:0;padding:0;background:#fff;font-family:-apple-system,Roboto,sans-serif}#challenge{width:100%}</style>
  <script>${bridge}</script>
  ${liveScript}
</head>
<body>
  <div id="challenge"></div>
  ${mockScript}
</body>
</html>`;

  return { html, baseUrl: WEBVIEW_BASE_URL };
}
