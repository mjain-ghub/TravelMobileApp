import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useArkose, type LogEntry } from '@/arkose/ArkoseProvider';
import { useSettings } from '@/state/settings';
import { colors, radius, space } from '@/theme';
import { Button, Muted, methodLabel } from './ui';

const OUTCOME = {
  allow: { label: 'ALLOWED', fg: colors.ok, bg: colors.okSoft },
  step_up: { label: 'STEP-UP', fg: colors.warn, bg: colors.warnSoft },
  block: { label: 'BLOCKED', fg: colors.danger, bg: colors.dangerSoft },
  error: { label: 'ERROR', fg: colors.danger, bg: colors.dangerSoft },
  cancelled: { label: 'CANCELLED', fg: colors.muted, bg: colors.bg },
} as const;

/**
 * Demo aid: floating button that opens a timeline of every Arkose session in the app, with the
 * server's decision, risk details, and (in mock / demo-debug mode) the raw Verify API response.
 * Hide it from Settings for a clean customer walkthrough.
 */
export function DebugPanel() {
  const { settings } = useSettings();
  const { log, clearLog, server } = useArkose();
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  if (!settings.debugPanel) return null;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Open Arkose debug panel, ${log.length} events`}
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
      >
        <Ionicons name="shield-half" size={22} color="#fff" />
        {log.length > 0 ? (
          <View style={styles.count}>
            <Text style={styles.countText}>{log.length > 9 ? '9+' : log.length}</Text>
          </View>
        ) : null}
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space.md }]}>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Arkose session log</Text>
                <Muted>
                  Server mode: {server?.mode ?? 'unreachable'} · {log.length} event{log.length === 1 ? '' : 's'}
                </Muted>
              </View>
              <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close debug panel" hitSlop={12}>
                <Ionicons name="close" size={26} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: space.sm, paddingBottom: space.lg }}>
              {log.length === 0 ? <Muted>Nothing yet. Run a search, sign in, or book a trip and each Arkose session appears here.</Muted> : null}
              {log.map((e) => (
                <Entry key={e.id} e={e} />
              ))}
            </ScrollView>
            {log.length > 0 ? <Button title="Clear log" variant="secondary" onPress={clearLog} /> : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

function Entry({ e }: { e: LogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const o = OUTCOME[e.outcome];
  const native = e.method === 'native';
  const a = e.arkose;

  const copy = async (label: string, value: string) => {
    await Clipboard.setStringAsync(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <Pressable onPress={() => setExpanded((x) => !x)} style={styles.entry} accessibilityRole="button" accessibilityLabel={`${e.flow} ${o.label}. Tap for details`}>
      <View style={styles.rowWrap}>
        <Text style={styles.flow}>{e.flow}</Text>
        {e.method ? (
          <View style={[styles.chip, { backgroundColor: native ? colors.nativeSoft : colors.webviewSoft }]}>
            <Text style={{ color: native ? colors.native : colors.webview, fontSize: 11, fontWeight: '700' }}>{methodLabel(e.method)}</Text>
          </View>
        ) : null}
        {e.simulated ? (
          <View style={[styles.chip, { backgroundColor: colors.infoSoft }]}>
            <Text style={{ color: colors.info, fontSize: 11, fontWeight: '700' }}>SIMULATED</Text>
          </View>
        ) : null}
        <View style={[styles.chip, { backgroundColor: o.bg, marginLeft: 'auto' }]}>
          <Text style={{ color: o.fg, fontSize: 11, fontWeight: '800' }}>
            {o.label}
            {e.stepUp === 'completed' ? ' +OTP' : ''}
          </Text>
        </View>
      </View>

      <Text style={styles.line}>
        {a?.risk ? `risk ${a.risk.band} (${a.risk.score}, ${a.risk.category})` : e.message ?? e.code ?? '—'}
        {a?.suppressed != null ? ` · ${a.suppressed ? 'suppressed' : `challenge: ${a.challengeType ?? 'shown'}`}` : ''}
      </Text>
      <Text style={styles.sub}>
        {new Date(e.at).toLocaleTimeString()}
        {e.clientMs != null ? ` · device ${e.clientMs}ms` : ''}
        {a ? ` · verify ${a.verifyMs}ms` : ''}
        {e.httpStatus ? ` · HTTP ${e.httpStatus}` : ''}
      </Text>

      {expanded ? (
        <View style={{ marginTop: space.sm, gap: 4 }}>
          {a?.failedOpen ? <Text style={styles.warn}>Verify API failed ({a.verifyError}); this flow fails OPEN, so the request proceeded.</Text> : null}
          {a?.reasons?.map((r) => (
            <Text key={r.code} style={styles.warn}>
              {r.code}: {r.detail}
            </Text>
          ))}
          {a?.session ? <Text style={styles.mono}>session: {a.session}</Text> : null}
          {e.tokenPreview ? <Text style={styles.mono}>token: {e.tokenPreview}</Text> : null}
          {a?.ip ? <Text style={styles.mono}>ip: {JSON.stringify(a.ip)}</Text> : null}
          {a?.raw ? <Text style={styles.mono}>{JSON.stringify(a.raw, null, 2)}</Text> : null}
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: 4, flexWrap: 'wrap' }}>
            {e.token ? (
              <Pressable onPress={() => copy('token', e.token!)} style={styles.copyBtn} accessibilityRole="button">
                <Text style={styles.copyText}>{copied === 'token' ? 'Copied' : 'Copy token (replay demo)'}</Text>
              </Pressable>
            ) : null}
            {a?.raw ? (
              <Pressable onPress={() => copy('raw', JSON.stringify(a.raw, null, 2))} style={styles.copyBtn} accessibilityRole="button">
                <Text style={styles.copyText}>{copied === 'raw' ? 'Copied' : 'Copy Verify JSON'}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    zIndex: 500,
  },
  count: { position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  countText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '82%', backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: space.lg, gap: space.md },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  entry: { backgroundColor: '#fff', borderRadius: radius, padding: space.md, borderWidth: 1, borderColor: colors.border },
  rowWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  flow: { fontWeight: '800', fontSize: 15, color: colors.text, textTransform: 'capitalize' },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  line: { marginTop: 6, color: colors.text, fontSize: 13 },
  sub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  warn: { color: colors.warn, fontSize: 12 },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 11, color: colors.text },
  copyBtn: { backgroundColor: colors.primarySoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  copyText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
});
