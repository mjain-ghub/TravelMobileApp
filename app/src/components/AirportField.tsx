import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '@/api/endpoints';
import type { Airport } from '@/api/types';
import { colors, space } from '@/theme';

let cache: Airport[] | null = null;

/** Tap-to-pick field backed by the server's airport/city list (cached for the session). */
export function AirportField({ label, value, onChange }: { label: string; value: string; onChange: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [airports, setAirports] = useState<Airport[]>(cache ?? []);

  useEffect(() => {
    if (cache) return;
    api
      .airports()
      .then((r) => {
        cache = r.airports;
        setAirports(r.airports);
      })
      .catch(() => {});
  }, []);

  const selected = airports.find((a) => a.code === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? airports.filter((a) => `${a.code} ${a.city} ${a.name}`.toLowerCase().includes(q)) : airports;
  }, [airports, query]);

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={() => setOpen(true)} style={styles.field} accessibilityRole="button" accessibilityLabel={`${label}: ${selected ? `${selected.city} ${selected.code}` : 'not set'}`}>
        <Text style={[styles.value, !selected && { color: '#9AA9B2' }]} numberOfLines={1}>
          {selected ? `${selected.city} (${selected.code})` : value || 'Select'}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.muted} />
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{label}</Text>
            <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}>
              <Ionicons name="close" size={26} color={colors.text} />
            </Pressable>
          </View>
          <TextInput value={query} onChangeText={setQuery} placeholder="Search city or code" style={styles.search} autoCorrect={false} autoFocus />
          <FlatList
            data={filtered}
            keyExtractor={(a) => a.code}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={{ color: colors.muted, padding: space.lg }}>{airports.length === 0 ? 'Could not load locations. Is the server reachable?' : 'No matches'}</Text>}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onChange(item.code);
                  setOpen(false);
                  setQuery('');
                }}
                style={styles.item}
                accessibilityRole="button"
              >
                <Text style={styles.code}>{item.code}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.city}>{item.city}</Text>
                  <Text style={styles.name}>{item.name}</Text>
                </View>
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 6 },
  field: { minHeight: 48, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff' },
  value: { fontSize: 16, color: colors.text, flexShrink: 1 },
  modal: { flex: 1, backgroundColor: colors.bg, paddingTop: 56, paddingHorizontal: space.lg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.md },
  modalTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  search: { minHeight: 48, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, paddingHorizontal: space.md, fontSize: 16, backgroundColor: '#fff', marginBottom: space.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  code: { width: 52, fontSize: 18, fontWeight: '800', color: colors.primary },
  city: { fontSize: 16, color: colors.text, fontWeight: '600' },
  name: { fontSize: 12, color: colors.muted },
});
