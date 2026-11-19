import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_API_URL, setBaseUrl } from '@/api/client';
import type { Flow, Method } from '@/arkose/types';

export type Integration = 'mixed' | 'native' | 'webview';

export interface Settings {
  apiUrl: string;
  /** "mixed" uses the per-flow choices below, the others force every flow onto one method. */
  integration: Integration;
  mixed: Record<Flow, Method>;
  /** Mock mode only: which Verify API scenario the simulated Arkose should produce. */
  scenario: string;
  /** Native: sets noSuppress so a challenge always shows. Mock web: same. (No documented web equivalent in live mode.) */
  forceChallenge: boolean;
  debugPanel: boolean;
}

/** Default split used for the demo: native SDK for the three high-frequency flows, webview for sign-up. */
export const DEFAULT_MIXED: Record<Flow, Method> = { search: 'native', login: 'native', checkout: 'native', signup: 'webview' };

const DEFAULTS: Settings = {
  apiUrl: DEFAULT_API_URL,
  integration: 'mixed',
  mixed: DEFAULT_MIXED,
  scenario: 'clean',
  forceChallenge: false,
  debugPanel: true,
};

const STORAGE_KEY = 'wayfarer.settings.v1';

interface SettingsApi {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  setFlowMethod: (flow: Flow, method: Method) => void;
  methodFor: (flow: Flow) => Method;
  reset: () => void;
}

const SettingsContext = createContext<SettingsApi | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<Settings>;
          const merged = { ...DEFAULTS, ...saved, mixed: { ...DEFAULTS.mixed, ...saved.mixed } };
          setBaseUrl(merged.apiUrl);
          setSettings(merged);
        }
      } catch {
        /* fall back to defaults */
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const persist = useCallback((next: Settings) => {
    setBaseUrl(next.apiUrl);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
    return next;
  }, []);

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => persist({ ...s, ...patch })), [persist]);
  const setFlowMethod = useCallback(
    (flow: Flow, method: Method) => setSettings((s) => persist({ ...s, mixed: { ...s.mixed, [flow]: method } })),
    [persist],
  );
  const reset = useCallback(() => setSettings(persist(DEFAULTS)), [persist]);

  const value = useMemo<SettingsApi>(
    () => ({
      settings,
      update,
      setFlowMethod,
      reset,
      methodFor: (flow) => (settings.integration === 'mixed' ? settings.mixed[flow] : settings.integration),
    }),
    [settings, update, setFlowMethod, reset],
  );

  if (!loaded) return null;
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsApi {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}
