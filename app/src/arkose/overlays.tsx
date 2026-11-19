import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Button, Muted } from '@/components/ui';
import { colors, radius, space } from '@/theme';
import { ArkoseClientError, type ArkoseInfo } from './types';
import { WEBVIEW_BASE_URL, type WebViewPage } from './webviewHtml';

// ---------------------------------------------------------------------------------------
// WebView host: the "webview" integration method
// ---------------------------------------------------------------------------------------

export interface WebRequest {
  id: string;
  page: WebViewPage;
  resolve: (r: { token: string; suppressed: boolean }) => void;
  reject: (e: ArkoseClientError) => void;
}

type LoadRequest = Parameters<NonNullable<React.ComponentProps<typeof WebView>['onShouldStartLoadWithRequest']>>[0];

const PAGE_ALIVE_TIMEOUT_MS = 15_000;
const OVERALL_TIMEOUT_MS = 180_000;
const MAX_TOKEN_LENGTH = 8192;

/**
 * Hosts the Arkose web client in a react-native-webview.
 *
 * The page is mounted invisibly. Arkose often decides no challenge is needed (the session is
 * "suppressed"), and in that case the user should never see a flash of UI. The overlay only
 * becomes visible when the page reports `onShown`, i.e. a challenge is actually on screen.
 */
export function WebViewHost({ req }: { req: WebRequest }) {
  const [visible, setVisible] = useState(false);
  const suppressed = useRef(false);
  const settled = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const aliveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const settle = (fn: () => void) => {
    if (settled.current) return;
    settled.current = true;
    timers.current.forEach(clearTimeout);
    fn();
  };

  useEffect(() => {
    aliveTimer.current = setTimeout(
      () => settle(() => req.reject(new ArkoseClientError('TIMEOUT', 'The challenge page never became ready (offline, blocked script, or wrong public key / base URL?)'))),
      PAGE_ALIVE_TIMEOUT_MS,
    );
    timers.current.push(aliveTimer.current);
    timers.current.push(setTimeout(() => settle(() => req.reject(new ArkoseClientError('TIMEOUT', 'Arkose session timed out'))), OVERALL_TIMEOUT_MS));
    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: any;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    // Ignore anything that isn't addressed to this exact request (stale pages, injected frames).
    if (!msg || msg.requestId !== req.id || typeof msg.type !== 'string') return;

    if (['ready', 'show', 'shown', 'suppress', 'completed'].includes(msg.type) && aliveTimer.current) clearTimeout(aliveTimer.current);

    switch (msg.type) {
      case 'shown':
        setVisible(true);
        break;
      case 'suppress':
        suppressed.current = true;
        break;
      case 'completed': {
        const token = msg.token;
        if (typeof token !== 'string' || token.length < 10 || token.length > MAX_TOKEN_LENGTH) {
          settle(() => req.reject(new ArkoseClientError('ERROR', 'Arkose completed but returned no usable token', msg)));
        } else {
          settle(() => req.resolve({ token, suppressed: suppressed.current }));
        }
        break;
      }
      case 'failed':
        settle(() => req.reject(new ArkoseClientError('FAILED', 'The challenge was not passed', msg.detail)));
        break;
      case 'error':
        settle(() => req.reject(new ArkoseClientError('ERROR', 'Arkose reported an error', msg.detail)));
        break;
      default:
        break; // ready / show / hide / etc. are informational
    }
  };

  // Block top-level navigations away from the page we loaded. Sub-frames (the challenge
  // iframe) must be allowed; only iOS reports isTopFrame, and Android only surfaces top-level loads.
  const allowNavigation = (r: LoadRequest) => r.isTopFrame === false || r.url === 'about:blank' || r.url.startsWith(WEBVIEW_BASE_URL);

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: visible ? 'rgba(0,0,0,0.55)' : 'transparent' }]} pointerEvents={visible ? 'auto' : 'none'}>
      <View style={[styles.sheet, { opacity: visible ? 1 : 0 }]}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Security check</Text>
          <Pressable onPress={() => settle(() => req.reject(new ArkoseClientError('CANCELLED', 'Challenge closed by user')))} accessibilityRole="button" accessibilityLabel="Cancel challenge" hitSlop={12}>
            <Ionicons name="close" size={24} color={colors.muted} />
          </Pressable>
        </View>
        <WebView
          testID="arkose-webview"
          source={{ html: req.page.html, baseUrl: req.page.baseUrl }}
          originWhitelist={['https://*', 'about:*']}
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          mixedContentMode="never"
          allowFileAccess={false}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={allowNavigation}
          onError={(ev) => settle(() => req.reject(new ArkoseClientError('ERROR', `WebView failed to load: ${ev.nativeEvent.description}`, ev.nativeEvent)))}
          style={{ flex: 1, backgroundColor: '#fff' }}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------------------
// Simulated native view: stands in for ArkoseManager.showEnforcementChallenge() in mock mode
// ---------------------------------------------------------------------------------------

export interface SimRequest {
  scenario: string;
  complete: () => void;
  cancel: () => void;
}

export function SimulatedNativeChallenge({ req }: { req: SimRequest }) {
  return (
    <Modal transparent animationType="fade" onRequestClose={req.cancel}>
      <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.55)', flex: 1 }]}>
        <View style={styles.dialog}>
          <Text style={styles.sheetTitle}>Arkose Labs challenge</Text>
          <Muted style={{ marginVertical: space.sm }}>
            Simulated native SDK view (mock mode). In a real build this full-screen view is presented by ArkoseManager.showEnforcementChallenge(), and the token arrives via the onCompleted event.
          </Muted>
          <Muted style={{ marginBottom: space.md }}>Scenario: {req.scenario}</Muted>
          <View style={{ gap: space.sm }}>
            <Button title="Verify I am human" onPress={req.complete} icon="checkmark-circle" />
            <Button title="Cancel" onPress={req.cancel} variant="secondary" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------
// Step-up prompt: shown when the server answers STEP_UP_REQUIRED
// ---------------------------------------------------------------------------------------

export interface StepUpRequest {
  info?: ArkoseInfo;
  error?: string;
  hint?: string | null;
  submit: (code: string) => void;
  cancel: () => void;
}

export function StepUpModal({ req }: { req: StepUpRequest }) {
  const [code, setCode] = useState('');
  return (
    <Modal transparent animationType="fade" onRequestClose={req.cancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.55)', flex: 1 }]}>
        <View style={styles.dialog}>
          <Text style={styles.sheetTitle}>Extra verification needed</Text>
          <Muted style={{ marginVertical: space.sm }}>
            Our security check flagged something unusual about this request. Enter the code we sent you to continue.
          </Muted>
          {req.info?.reasons.map((r) => (
            <Text key={r.code} style={{ color: colors.warn, fontSize: 12, marginBottom: 2 }}>
              • {r.detail}
            </Text>
          ))}
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            placeholder="6-digit code"
            accessibilityLabel="Verification code"
            style={styles.codeInput}
            autoFocus
            maxLength={6}
          />
          {req.error ? <Text style={{ color: colors.danger, marginBottom: space.sm }}>{req.error}</Text> : null}
          {req.hint ? <Muted style={{ marginBottom: space.sm }}>Demo code: {req.hint}</Muted> : null}
          <View style={{ gap: space.sm }}>
            <Button title="Verify" onPress={() => req.submit(code)} disabled={code.length !== 6} />
            <Button title="Cancel" onPress={req.cancel} variant="secondary" />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: space.lg },
  sheet: { width: '100%', maxWidth: 440, height: 560, backgroundColor: '#fff', borderRadius: radius, overflow: 'hidden' },
  dialog: { width: '100%', maxWidth: 440, backgroundColor: '#fff', borderRadius: radius, overflow: 'hidden', padding: space.lg },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  codeInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    padding: space.md,
    fontSize: 22,
    letterSpacing: 6,
    textAlign: 'center',
    marginVertical: space.md,
    color: colors.text,
  },
});
