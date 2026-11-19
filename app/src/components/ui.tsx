import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import type { Flow, Method } from '@/arkose/types';
import { useSettings } from '@/state/settings';
import { colors, radius, space } from '@/theme';

/** Decorative icon: hidden from screen readers so the glyph is not announced as part of a button's name. */
export function Icon(props: React.ComponentProps<typeof Ionicons>) {
  return <Ionicons {...props} aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden />;
}

export function Screen({ children, scroll = true, style }: { children: React.ReactNode; scroll?: boolean; style?: StyleProp<ViewStyle> }) {
  if (!scroll) return <View style={[styles.screen, style]}>{children}</View>;
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={[styles.screen, style]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const body = <View style={[styles.card, style]}>{children}</View>;
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })} accessibilityRole="button">
      {body}
    </Pressable>
  ) : (
    body
  );
}

export function H1({ children }: { children: React.ReactNode }) {
  return <Text style={styles.h1}>{children}</Text>;
}
export function H2({ children }: { children: React.ReactNode }) {
  return <Text style={styles.h2}>{children}</Text>;
}
export function Muted({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <Text style={[styles.muted, style as object]}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const bg = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : colors.card;
  const fg = variant === 'secondary' ? colors.primary : '#fff';
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: variant === 'secondary' ? colors.primary : bg, opacity: inactive ? 0.6 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string | null }) {
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor="#9AA9B2"
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
        style={[styles.input, error ? { borderColor: colors.danger } : null, props.style]}
        accessibilityLabel={label}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const BANNER = {
  error: { bg: colors.dangerSoft, fg: colors.danger, icon: 'alert-circle' },
  warn: { bg: colors.warnSoft, fg: colors.warn, icon: 'warning' },
  info: { bg: colors.infoSoft, fg: colors.info, icon: 'information-circle' },
  success: { bg: colors.okSoft, fg: colors.ok, icon: 'checkmark-circle' },
} as const;

export function Banner({ kind = 'info', title, children }: { kind?: keyof typeof BANNER; title?: string; children?: React.ReactNode }) {
  const t = BANNER[kind];
  return (
    <View style={[styles.banner, { backgroundColor: t.bg }]} accessibilityRole="alert">
      <Icon name={t.icon} size={20} color={t.fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        {title ? <Text style={{ color: t.fg, fontWeight: '700', marginBottom: 2 }}>{title}</Text> : null}
        {typeof children === 'string' ? <Text style={{ color: colors.text }}>{children}</Text> : children}
      </View>
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.segment, on && { backgroundColor: colors.primary }]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text style={{ color: on ? '#fff' : colors.primary, fontWeight: '600', fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const methodLabel = (m: Method) => (m === 'native' ? 'Native SDK' : 'WebView');

/** Small pill showing which Arkose integration method protects a given flow right now. */
export function ProtectionBadge({ flow }: { flow: Flow }) {
  const { methodFor } = useSettings();
  const m = methodFor(flow);
  const native = m === 'native';
  return (
    <View style={[styles.pill, { backgroundColor: native ? colors.nativeSoft : colors.webviewSoft }]}>
      <Icon name="shield-checkmark" size={14} color={native ? colors.native : colors.webview} />
      <Text style={{ color: native ? colors.native : colors.webview, fontWeight: '700', fontSize: 12 }}>Arkose · {methodLabel(m)}</Text>
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { padding: space.lg, paddingBottom: 96, gap: space.md, backgroundColor: colors.bg, flexGrow: 1 },
  card: { backgroundColor: colors.card, borderRadius: radius, padding: space.lg, borderWidth: 1, borderColor: colors.border },
  h1: { fontSize: 26, fontWeight: '800', color: colors.text },
  h2: { fontSize: 17, fontWeight: '700', color: colors.text },
  muted: { color: colors.muted, fontSize: 13 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: 48,
    paddingHorizontal: space.lg,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 6 },
  input: {
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: space.md,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#fff',
  },
  fieldError: { color: colors.danger, fontSize: 12, marginTop: 4 },
  banner: { flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: 12 },
  segmented: { flexDirection: 'row', borderRadius: 12, borderWidth: 1.5, borderColor: colors.primary, overflow: 'hidden' },
  segment: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
});
