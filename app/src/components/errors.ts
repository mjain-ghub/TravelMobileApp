import { ApiError } from '@/api/client';
import { ArkoseClientError } from '@/arkose/types';

export interface UiError {
  kind: 'error' | 'warn' | 'info';
  title: string;
  message: string;
}

/**
 * Converts any failure into something safe to show an end user.
 *
 * Deliberately vague about WHY a request was blocked: telling an attacker which signal
 * tripped teaches them what to change. The precise reasons are available to you in the
 * debug panel and server logs instead.
 */
export function describeError(e: unknown): UiError | null {
  if (e instanceof ArkoseClientError) {
    switch (e.code) {
      case 'CANCELLED':
        return null; // user chose to back out: nothing to report
      case 'FAILED':
        return { kind: 'error', title: 'Verification not completed', message: 'We could not complete the security check. Please try again.' };
      case 'SDK_UNAVAILABLE':
      case 'WEBVIEW_UNSUPPORTED':
      case 'CONFIG_UNAVAILABLE':
        return { kind: 'warn', title: 'Setup needed', message: e.message };
      case 'TIMEOUT':
      case 'ERROR':
      case 'BUSY':
      default:
        return { kind: 'error', title: 'Security check problem', message: `${e.message}${e.code === 'ERROR' || e.code === 'TIMEOUT' ? ' Please try again.' : ''}` };
    }
  }
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'ARKOSE_BLOCK':
        return { kind: 'error', title: "We couldn't verify this request", message: 'For your security this request was declined. If you are a real traveler, please try again later or contact support.' };
      case 'ARKOSE_UNAVAILABLE':
        return { kind: 'warn', title: 'Security check unavailable', message: 'We could not complete a required security check right now. Please try again in a moment.' };
      case 'STEP_UP_FAILED':
      case 'STEP_UP_INVALID':
        return { kind: 'error', title: 'Verification failed', message: 'The extra verification did not succeed. Please start again.' };
      case 'BAD_CREDENTIALS':
        return { kind: 'error', title: 'Sign-in failed', message: 'Invalid email or password.' };
      default:
        return { kind: 'error', title: 'Something went wrong', message: e.message };
    }
  }
  return { kind: 'error', title: 'Something went wrong', message: (e as Error)?.message ?? 'Unexpected error' };
}
