import { Platform } from 'react-native';
import type { ArkoseInfo } from '@/arkose/types';

/**
 * iOS simulator and Expo web reach the dev machine at localhost. The Android emulator uses
 * 10.0.2.2. A physical phone needs your computer's LAN IP: set EXPO_PUBLIC_API_URL or edit
 * it in the app's Settings screen.
 */
export const DEFAULT_API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');

let baseUrl = DEFAULT_API_URL;
export const setBaseUrl = (url: string) => {
  baseUrl = url.replace(/\/+$/, '');
};
export const getBaseUrl = () => baseUrl;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly arkose?: ArkoseInfo,
    public readonly stepUpId?: string,
    public readonly attemptsLeft?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
  authToken?: string | null;
  timeoutMs?: number;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, authToken, timeoutMs = 15_000 } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON body */
    }
    if (!res.ok) {
      throw new ApiError(res.status, json?.code ?? 'HTTP_ERROR', json?.error ?? `Request failed (HTTP ${res.status})`, json?.arkose, json?.stepUpId, json?.attemptsLeft);
    }
    return json as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const reason = (err as Error)?.name === 'AbortError' ? 'timed out' : 'is unreachable';
    throw new ApiError(0, 'NETWORK', `The server at ${baseUrl} ${reason}. Is it running, and is the URL right for this device? (See Settings)`);
  } finally {
    clearTimeout(timer);
  }
}
