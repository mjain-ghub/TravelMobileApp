import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api } from '@/api/endpoints';
import { useArkose } from '@/arkose/ArkoseProvider';
import { FLOWS } from '@/arkose/types';
import { AirportField } from '@/components/AirportField';
import { describeError, type UiError } from '@/components/errors';
import { Banner, Button, Card, Field, H1, H2, Muted, ProtectionBadge, Row, Screen, Segmented } from '@/components/ui';
import { isIsoDate, isoInDays, nightsBetween } from '@/lib/format';
import { useSearchResults } from '@/state/search';
import { colors, space } from '@/theme';

const FLOW_COPY: Record<(typeof FLOWS)[number], { title: string; why: string }> = {
  search: { title: 'Search', why: 'Stops scrapers harvesting fares and inventory' },
  signup: { title: 'Sign-up', why: 'Blocks fake and bulk-created accounts' },
  login: { title: 'Login', why: 'Stops credential stuffing and account takeover' },
  checkout: { title: 'Checkout', why: 'Catches card testing and booking fraud' },
};

export default function SearchScreen() {
  const router = useRouter();
  const { protect, serverError, reloadConfig } = useArkose();
  const { setSearch } = useSearchResults();

  const [tab, setTab] = useState<'flights' | 'hotels'>('flights');
  const [from, setFrom] = useState('ATL');
  const [to, setTo] = useState('LAX');
  const [date, setDate] = useState(() => isoInDays(30));
  const [pax, setPax] = useState(1);
  const [city, setCity] = useState('LAX');
  const [checkIn, setCheckIn] = useState(() => isoInDays(30));
  const [checkOut, setCheckOut] = useState(() => isoInDays(33));
  const [rooms, setRooms] = useState(1);

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [error, setError] = useState<UiError | null>(null);

  const onSearch = async () => {
    setError(null);
    setFormError(null);
    try {
      if (tab === 'flights') {
        if (from === to) return setFormError('Choose different origin and destination airports.');
        if (!isIsoDate(date)) return setFormError('Enter the departure date as YYYY-MM-DD.');
        setBusy(true);
        const res = await protect('search', (h) => api.searchFlights({ from, to, date }, h));
        setSearch({ kind: 'flights', title: `${from} → ${to}`, subtitle: `${date} · ${pax} traveler${pax > 1 ? 's' : ''}`, quantity: pax, results: res.results, arkose: res.arkose });
      } else {
        if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) return setFormError('Enter dates as YYYY-MM-DD.');
        const nights = nightsBetween(checkIn, checkOut);
        if (nights < 1 || nights > 30) return setFormError('Stays must be between 1 and 30 nights.');
        setBusy(true);
        const res = await protect('search', (h) => api.searchHotels({ city, checkIn, checkOut }, h));
        setSearch({ kind: 'hotels', title: `Stays in ${city}`, subtitle: `${checkIn} → ${checkOut} · ${nights} night${nights > 1 ? 's' : ''} · ${rooms} room${rooms > 1 ? 's' : ''}`, quantity: rooms, results: res.results, arkose: res.arkose });
      }
      router.push('/results');
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <H1>Where to next?</H1>

      {serverError ? (
        <Banner kind="warn" title="Can't reach the demo server">
          <Text style={{ color: colors.text }}>{serverError}</Text>
          <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.sm }}>
            <Pressable onPress={reloadConfig} accessibilityRole="button">
              <Text style={{ color: colors.primary, fontWeight: '700' }}>Retry</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/settings')} accessibilityRole="button">
              <Text style={{ color: colors.primary, fontWeight: '700' }}>Open settings</Text>
            </Pressable>
          </View>
        </Banner>
      ) : null}

      <Card style={{ gap: space.md }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'flights', label: 'Flights' },
            { value: 'hotels', label: 'Hotels' },
          ]}
        />

        {tab === 'flights' ? (
          <>
            <Row style={{ gap: space.md, alignItems: 'flex-start' }}>
              <AirportField label="From" value={from} onChange={setFrom} />
              <AirportField label="To" value={to} onChange={setTo} />
            </Row>
            <Field label="Departure date (YYYY-MM-DD)" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" maxLength={10} />
            <Stepper label="Travelers" value={pax} onChange={setPax} />
          </>
        ) : (
          <>
            <AirportField label="Destination" value={city} onChange={setCity} />
            <Row style={{ gap: space.md, alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Field label="Check-in" value={checkIn} onChangeText={setCheckIn} keyboardType="numbers-and-punctuation" maxLength={10} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Check-out" value={checkOut} onChangeText={setCheckOut} keyboardType="numbers-and-punctuation" maxLength={10} />
              </View>
            </Row>
            <Stepper label="Rooms" value={rooms} onChange={setRooms} />
          </>
        )}

        {formError ? <Banner kind="error">{formError}</Banner> : null}
        {error ? <Banner kind={error.kind} title={error.title}>{error.message}</Banner> : null}

        <ProtectionBadge flow="search" />
        <Button title={tab === 'flights' ? 'Search flights' : 'Search hotels'} onPress={onSearch} loading={busy} icon="search" />
      </Card>

      <Card style={{ gap: space.sm }}>
        <H2>Where Arkose protects this app</H2>
        <Muted>Each flow below gets a fresh single-use token that our server verifies. Change the method per flow in Settings.</Muted>
        {FLOWS.map((f) => (
          <View key={f} style={{ gap: 4, paddingTop: space.sm }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '700', color: colors.text }}>{FLOW_COPY[f].title}</Text>
              <ProtectionBadge flow={f} />
            </Row>
            <Muted>{FLOW_COPY[f].why}</Muted>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  const btn = (sym: string, delta: number, disabled: boolean) => (
    <Pressable
      onPress={() => onChange(value + delta)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${delta > 0 ? 'Increase' : 'Decrease'} ${label}`}
      style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 }}
    >
      <Text style={{ fontSize: 22, color: colors.primary, fontWeight: '700' }}>{sym}</Text>
    </Pressable>
  );
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Text style={{ fontWeight: '600', color: colors.text }}>{label}</Text>
      <Row style={{ gap: space.lg }}>
        {btn('−', -1, value <= 1)}
        <Text style={{ fontSize: 18, fontWeight: '700', minWidth: 20, textAlign: 'center' }}>{value}</Text>
        {btn('+', 1, value >= 6)}
      </Row>
    </Row>
  );
}
