/**
 * Optional loader for the Arkose React Native SDK (`react-native-arkoselabs`).
 *
 * The SDK is distributed as a .tgz by your Arkose CSM, so it is not a normal npm dependency.
 * Metro treats a `require()` inside try/catch as an optional dependency, so this file bundles
 * fine whether or not the package is installed. When it isn't, the native flows run in
 * simulation mode (see ArkoseProvider).
 *
 * API surface used (from the "React Native Mobile SDK" developer doc):
 *   ArkoseManager.initialize(config)             set the key / base URL and start a session
 *   ArkoseManager.showEnforcementChallenge(opts) display the challenge
 *   ArkoseEvents.addListener(name, handler)      onReady, onShow, onShown, onSuppress,
 *                                                onCompleted, onFailed, onError, onHide ...
 */

export interface ArkoseSdkConfig {
  apiKey: string;
  apiBaseUrl?: string;
  language?: string;
  noSuppress?: boolean;
  clientAPIRetryCount?: number;
  [key: string]: unknown;
}

export interface ArkoseSdk {
  ArkoseManager: {
    initialize(config: ArkoseSdkConfig): void;
    showEnforcementChallenge(params?: Record<string, unknown>): void;
    setLogLevel?(level: string): void;
    forceDismissEnforcementChallenge?(): void;
  };
  ArkoseEvents: {
    addListener(event: string, handler: (payload?: unknown) => void): unknown;
  };
}

let cached: ArkoseSdk | null | undefined;

export function loadArkoseSdk(): ArkoseSdk | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-arkoselabs');
    cached = mod?.ArkoseManager && mod?.ArkoseEvents ? (mod as ArkoseSdk) : null;
  } catch {
    cached = null;
  }
  return cached;
}
