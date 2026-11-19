import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { ApiError, request } from '@/api/client';
import type { WithArkose } from '@/api/types';
import { useSettings } from '@/state/settings';
import { WebViewHost, SimulatedNativeChallenge, StepUpModal, type SimRequest, type StepUpRequest, type WebRequest } from './overlays';
import { runNativeSession } from './nativeRunner';
import { loadArkoseSdk } from './sdk';
import { ArkoseClientError, type ArkoseInfo, type ArkoseResult, type Flow, type Method, type ServerConfig } from './types';
import { buildEnforcementPage, liveScriptUrl } from './webviewHtml';

/** One row in the in-app debug timeline. */
export interface LogEntry {
  id: string;
  at: number;
  flow: Flow;
  method: Method | null;
  simulated: boolean;
  clientMs: number | null;
  outcome: 'allow' | 'step_up' | 'block' | 'error' | 'cancelled';
  httpStatus?: number;
  code?: string;
  message?: string;
  tokenPreview?: string;
  /** Full token, kept only when the server runs with demo debug on, so a replay attempt can be demonstrated. */
  token?: string;
  stepUp?: 'completed' | 'failed';
  arkose?: ArkoseInfo;
}

interface ArkoseApi {
  server: ServerConfig | null;
  serverError: string | null;
  reloadConfig: () => Promise<void>;
  /** True when the real react-native-arkoselabs package is installed in this build. */
  sdkInstalled: boolean;
  log: LogEntry[];
  clearLog: () => void;
  /** Runs one Arkose session on the device and returns the single-use token. */
  getToken: (flow: Flow) => Promise<ArkoseResult>;
  /**
   * The full client pattern for a protected action:
   *   1. get a fresh Arkose token via the method configured for this flow (native or webview)
   *   2. call your API with it in headers
   *   3. if the server answers STEP_UP_REQUIRED, collect the second factor and retry
   *   4. record the outcome for the debug panel
   */
  protect: <T extends WithArkose>(flow: Flow, send: (headers: Record<string, string>) => Promise<T>) => Promise<T>;
}

const ArkoseContext = createContext<ArkoseApi | null>(null);

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const mockToken = (scenario: string) => `mock.${scenario}.${newId()}`;
const preview = (token: string) => `${token.slice(0, 12)}…(${token.length} chars)`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_LOG = 60;

export function ArkoseProvider({ children }: { children: React.ReactNode }) {
  const { settings, methodFor } = useSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const methodForRef = useRef(methodFor);
  methodForRef.current = methodFor;

  const [server, setServer] = useState<ServerConfig | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [webReq, setWebReq] = useState<WebRequest | null>(null);
  const [simReq, setSimReq] = useState<SimRequest | null>(null);
  const [stepUpReq, setStepUpReq] = useState<StepUpRequest | null>(null);
  const busy = useRef(false);
  const serverRef = useRef<ServerConfig | null>(null);
  serverRef.current = server;

  const sdkInstalled = loadArkoseSdk() !== null;

  const reloadConfig = useCallback(async () => {
    try {
      const cfg = await request<ServerConfig>('/api/config', { timeoutMs: 6000 });
      setServer(cfg);
      setServerError(null);
    } catch (err) {
      setServer(null);
      setServerError((err as Error).message);
    }
  }, []);

  // Reload whenever the API URL changes (Settings) and on first launch.
  useEffect(() => {
    reloadConfig();
  }, [reloadConfig, settings.apiUrl]);

  const addLog = useCallback((entry: Omit<LogEntry, 'id' | 'at'>) => {
    setLog((prev) => [{ ...entry, id: newId(), at: Date.now() }, ...prev].slice(0, MAX_LOG));
  }, []);

  // ---- the three ways to obtain a token --------------------------------------------------

  const simulatedNative = useCallback(async (scenario: string, force: boolean) => {
    if (scenario === 'clean' && !force) {
      await sleep(350); // pretend the SDK analysed the session and suppressed the challenge
      return { token: mockToken('clean'), suppressed: true };
    }
    return new Promise<{ token: string; suppressed: boolean }>((resolve, reject) => {
      setSimReq({
        scenario,
        complete: () => {
          setSimReq(null);
          resolve({ token: mockToken(scenario === 'clean' ? 'challenged' : scenario), suppressed: false });
        },
        cancel: () => {
          setSimReq(null);
          reject(new ArkoseClientError('CANCELLED', 'Challenge closed by user'));
        },
      });
    });
  }, []);

  const webviewSession = useCallback((cfg: ServerConfig, flow: Flow, s: typeof settings) => {
    const id = newId();
    const source =
      cfg.mode === 'mock'
        ? ({ kind: 'mock', scenario: s.scenario, forceChallenge: s.forceChallenge } as const)
        : ({ kind: 'live', scriptUrl: liveScriptUrl(cfg.clientApiBaseUrl, cfg.publicKeys[flow]) } as const);
    const page = buildEnforcementPage({ requestId: id, source });
    return new Promise<{ token: string; suppressed: boolean }>((resolve, reject) => {
      setWebReq({
        id,
        page,
        resolve: (r) => {
          setWebReq(null);
          resolve(r);
        },
        reject: (e) => {
          setWebReq(null);
          reject(e);
        },
      });
    });
  }, []);

  const getToken = useCallback(
    async (flow: Flow): Promise<ArkoseResult> => {
      const cfg = serverRef.current;
      if (!cfg) throw new ArkoseClientError('CONFIG_UNAVAILABLE', 'Cannot reach the server to load the Arkose configuration. Check the API URL in Settings.');
      if (busy.current) throw new ArkoseClientError('BUSY', 'Another security check is already running');
      const s = settingsRef.current;
      const method = methodForRef.current(flow);
      busy.current = true;
      const started = Date.now();
      try {
        let out: { token: string; suppressed: boolean };
        let simulated = false;

        if (method === 'native') {
          if (cfg.mode === 'mock') {
            simulated = true;
            out = await simulatedNative(s.scenario, s.forceChallenge);
          } else {
            const sdk = loadArkoseSdk();
            if (!sdk) {
              throw new ArkoseClientError(
                'SDK_UNAVAILABLE',
                'The Arkose React Native SDK (react-native-arkoselabs) is not installed in this build. Install the .tgz from your CSM (see docs/SETUP.md), or switch this flow to WebView in Settings.',
              );
            }
            out = await runNativeSession(sdk, {
              apiKey: cfg.publicKeys[flow],
              apiBaseUrl: cfg.clientApiBaseUrl,
              noSuppress: s.forceChallenge,
            });
          }
        } else if (Platform.OS === 'web') {
          // react-native-webview has no web implementation, so Expo web can only preview mock mode.
          if (cfg.mode !== 'mock') throw new ArkoseClientError('WEBVIEW_UNSUPPORTED', 'The WebView method needs iOS or Android. Run the app on a simulator or device.');
          simulated = true;
          await sleep(350);
          out = { token: mockToken(s.scenario === 'clean' && s.forceChallenge ? 'challenged' : s.scenario), suppressed: s.scenario === 'clean' && !s.forceChallenge };
        } else {
          simulated = cfg.mode === 'mock';
          out = await webviewSession(cfg, flow, s);
        }

        return { token: out.token, method, suppressed: out.suppressed, simulated, elapsedMs: Date.now() - started };
      } finally {
        busy.current = false;
      }
    },
    [simulatedNative, webviewSession],
  );

  // ---- the full protected-call pattern ---------------------------------------------------

  const promptStepUp = useCallback(
    (info: ArkoseInfo | undefined, error?: string) =>
      new Promise<string | null>((resolve) => {
        setStepUpReq({
          info,
          error,
          hint: serverRef.current?.stepUpHint,
          submit: (code) => {
            setStepUpReq(null);
            resolve(code);
          },
          cancel: () => {
            setStepUpReq(null);
            resolve(null);
          },
        });
      }),
    [],
  );

  const protect = useCallback(
    async <T extends WithArkose>(flow: Flow, send: (headers: Record<string, string>) => Promise<T>): Promise<T> => {
      const base = { flow, method: methodForRef.current(flow) as Method | null, simulated: false, clientMs: null as number | null };

      let tokenResult: ArkoseResult;
      try {
        tokenResult = await getToken(flow);
      } catch (e) {
        const err = e as ArkoseClientError;
        addLog({ ...base, outcome: err.code === 'CANCELLED' ? 'cancelled' : 'error', code: err.code, message: err.message });
        throw e;
      }

      const entry = { ...base, method: tokenResult.method, simulated: tokenResult.simulated, clientMs: tokenResult.elapsedMs, tokenPreview: preview(tokenResult.token), token: serverRef.current?.demoDebug ? tokenResult.token : undefined };
      const headers = { 'X-Arkose-Token': tokenResult.token, 'X-Arkose-Method': tokenResult.method };

      try {
        const res = await send(headers);
        addLog({ ...entry, outcome: 'allow', arkose: res.arkose });
        return res;
      } catch (e) {
        if (e instanceof ApiError && e.code === 'STEP_UP_REQUIRED' && e.stepUpId) {
          addLog({ ...entry, outcome: 'step_up', httpStatus: e.status, code: e.code, arkose: e.arkose });
          let error: string | undefined;
          for (;;) {
            const code = await promptStepUp(e.arkose, error);
            if (code === null) throw new ArkoseClientError('CANCELLED', 'Extra verification was cancelled');
            try {
              const res = await send({ 'X-StepUp-Id': e.stepUpId, 'X-StepUp-Code': code });
              addLog({ ...entry, outcome: 'allow', stepUp: 'completed', arkose: res.arkose });
              return res;
            } catch (e2) {
              if (e2 instanceof ApiError && e2.code === 'STEP_UP_FAILED' && (e2.attemptsLeft ?? 0) > 0) {
                error = `Incorrect code. ${e2.attemptsLeft} attempt${e2.attemptsLeft === 1 ? '' : 's'} left.`;
                continue;
              }
              if (e2 instanceof ApiError && e2.code === 'STEP_UP_FAILED') addLog({ ...entry, outcome: 'block', stepUp: 'failed', httpStatus: e2.status, code: e2.code, message: e2.message });
              else if (e2 instanceof ApiError) addLog({ ...entry, outcome: e2.arkose?.decision === 'block' ? 'block' : 'allow', httpStatus: e2.status, code: e2.code, message: e2.message, arkose: e2.arkose });
              throw e2;
            }
          }
        }
        if (e instanceof ApiError) {
          const blocked = e.code === 'ARKOSE_BLOCK' || e.code === 'ARKOSE_TOKEN_MISSING' || e.code === 'ARKOSE_TOKEN_MALFORMED';
          const outcome: LogEntry['outcome'] = blocked ? 'block' : e.code === 'ARKOSE_UNAVAILABLE' || !e.arkose ? 'error' : 'allow';
          addLog({ ...entry, outcome, httpStatus: e.status, code: e.code, message: e.message, arkose: e.arkose });
        } else {
          addLog({ ...entry, outcome: 'error', message: (e as Error).message });
        }
        throw e;
      }
    },
    [addLog, getToken, promptStepUp],
  );

  const value = useMemo<ArkoseApi>(
    () => ({ server, serverError, reloadConfig, sdkInstalled, log, clearLog: () => setLog([]), getToken, protect }),
    [server, serverError, reloadConfig, sdkInstalled, log, getToken, protect],
  );

  return (
    <ArkoseContext.Provider value={value}>
      {children}
      {webReq ? <WebViewHost key={webReq.id} req={webReq} /> : null}
      {simReq ? <SimulatedNativeChallenge req={simReq} /> : null}
      {stepUpReq ? <StepUpModal req={stepUpReq} /> : null}
    </ArkoseContext.Provider>
  );
}

export function useArkose(): ArkoseApi {
  const ctx = useContext(ArkoseContext);
  if (!ctx) throw new Error('useArkose must be used inside <ArkoseProvider>');
  return ctx;
}
