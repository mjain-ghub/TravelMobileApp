/** The four flows this app protects with Arkose. */
export type Flow = 'search' | 'signup' | 'login' | 'checkout';
export const FLOWS: Flow[] = ['search', 'signup', 'login', 'checkout'];

/** The two integration methodologies the demo contrasts. */
export type Method = 'native' | 'webview';

/** Result of one Arkose session on the device: a single-use token for the server to verify. */
export interface ArkoseResult {
  token: string;
  method: Method;
  /** True when Arkose decided no visible challenge was needed (the session was suppressed). */
  suppressed: boolean;
  /** True when no real Arkose code ran (mock server mode, or the native SDK isn't installed). */
  simulated: boolean;
  elapsedMs: number;
}

export type ArkoseErrorCode =
  | 'CANCELLED' // user closed the challenge
  | 'FAILED' // user failed the challenge repeatedly (onFailed)
  | 'ERROR' // SDK / script error (onError)
  | 'TIMEOUT' // challenge never became ready
  | 'BUSY' // another Arkose session is already running
  | 'SDK_UNAVAILABLE' // native SDK .tgz not installed
  | 'WEBVIEW_UNSUPPORTED' // react-native-webview does not run on Expo web
  | 'CONFIG_UNAVAILABLE'; // could not load /api/config from the server

export class ArkoseClientError extends Error {
  constructor(
    public readonly code: ArkoseErrorCode,
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'ArkoseClientError';
  }
}

/** Public configuration served by the backend: no secrets. */
export interface ServerConfig {
  mode: 'mock' | 'live';
  clientApiBaseUrl: string;
  publicKeys: Record<Flow, string>;
  demoDebug: boolean;
  scenarios: string[];
  demoUser: { email: string; password: string } | null;
  stepUpHint: string | null;
}

/** Decision details the server returns alongside every protected response. */
export interface ArkoseInfo {
  flow: Flow;
  method: Method | 'unknown';
  decision: 'allow' | 'step_up' | 'block';
  reasons: { code: string; action: string; detail: string }[];
  risk: { band: string; category: string; score: number } | null;
  session: string | null;
  solved: boolean | null;
  suppressed: boolean | null;
  challengeType: string | null;
  ip: { user_ip?: string; is_proxy?: boolean; is_vpn?: boolean; is_tor?: boolean } | null;
  tokenPreview: string;
  verifyMs: number;
  failedOpen: boolean;
  verifyError: string | null;
  mode: 'mock' | 'live';
  stepUpCompleted?: boolean;
  raw?: unknown;
}
