import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ArkoseInfo } from '@/arkose/types';
import { colors, radius, space } from '@/theme';
import { Icon, Muted, methodLabel } from './ui';

/**
 * Compact "what Arkose decided" card, shown after a protected action succeeds. Handy in a
 * customer demo because it makes the invisible check visible without opening the debug panel.
 */
export function ArkoseDecision({ info, title = 'Verified by Arkose' }: { info?: ArkoseInfo; title?: string }) {
  if (!info) return null;
  const risk = info.risk;
  const tone = info.failedOpen ? colors.warn : info.decision === 'allow' ? colors.ok : colors.danger;
  return (
    <View style={styles.card} accessibilityLabel={`${title}: ${info.decision}`}>
      <View style={styles.head}>
        <Icon name={info.failedOpen ? 'warning' : 'shield-checkmark'} size={18} color={tone} />
        <Text style={[styles.title, { color: tone }]}>{info.failedOpen ? 'Allowed (Arkose unreachable, failed open)' : title}</Text>
      </View>
      <Muted>
        {info.method === 'unknown' ? 'Unknown method' : methodLabel(info.method)}
        {info.suppressed != null ? ` · ${info.suppressed ? 'no challenge needed (suppressed)' : `challenge ${info.solved ? 'solved' : 'shown'}`}` : ''}
        {info.stepUpCompleted ? ' · step-up completed' : ''}
      </Muted>
      {risk ? (
        <Muted>
          Risk {risk.band} · score {risk.score}
          {risk.category !== 'NONE' ? ` · ${risk.category}` : ''}
        </Muted>
      ) : null}
      {info.session ? <Text style={styles.mono}>session {info.session}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.okSoft + '66', borderRadius: radius, padding: space.md, gap: 3, borderWidth: 1, borderColor: colors.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontWeight: '800', fontSize: 14 },
  mono: { fontSize: 11, color: colors.muted },
});
