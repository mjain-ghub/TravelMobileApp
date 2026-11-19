import { Redirect, useRouter } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import type { Flight, Hotel } from '@/api/types';
import { ArkoseDecision } from '@/components/ArkoseDecision';
import { Card, H1, Icon, Muted, Row, Screen } from '@/components/ui';
import { prettyDate } from '@/lib/format';
import { useSearchResults } from '@/state/search';
import { colors, formatDuration, formatMoney, space } from '@/theme';

export default function ResultsScreen() {
  const router = useRouter();
  const { search } = useSearchResults();
  if (!search) return <Redirect href="/" />;

  const open = (type: 'flight' | 'hotel', id: string) => router.push({ pathname: '/details', params: { type, id, qty: String(search.quantity) } });

  return (
    <Screen>
      <View>
        <H1>{search.title}</H1>
        <Muted>{search.subtitle}</Muted>
      </View>
      <ArkoseDecision info={search.arkose} title="Search verified by Arkose" />

      {search.kind === 'flights'
        ? search.results.map((f) => <FlightCard key={f.id} f={f} qty={search.quantity} onPress={() => open('flight', f.id)} />)
        : search.results.map((h) => <HotelCard key={h.id} h={h} onPress={() => open('hotel', h.id)} />)}
    </Screen>
  );
}

function FlightCard({ f, qty, onPress }: { f: Flight; qty: number; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={{ gap: space.sm }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ fontWeight: '700', color: colors.text }}>
          {f.airline} · {f.flightNumber}
        </Text>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.primary }}>{formatMoney(f.unitPriceCents, f.currency)}</Text>
      </Row>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 18, color: colors.text }}>
          {f.departTime} → {f.arriveTime}
          {f.arriveDayOffset > 0 ? ` +${f.arriveDayOffset}` : ''}
        </Text>
        <Muted>per traveler</Muted>
      </Row>
      <Row style={{ justifyContent: 'space-between' }}>
        <Muted>
          {formatDuration(f.durationMin)} · {f.stops === 0 ? 'Nonstop' : `${f.stops} stop`} · {f.cabin}
        </Muted>
        {qty > 1 ? <Muted>{formatMoney(f.unitPriceCents * qty, f.currency)} for {qty}</Muted> : null}
      </Row>
    </Card>
  );
}

function HotelCard({ h, onPress }: { h: Hotel; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={{ gap: space.sm }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ fontWeight: '700', color: colors.text, flex: 1 }}>{h.name}</Text>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.primary }}>{formatMoney(h.nightlyPriceCents, h.currency)}</Text>
      </Row>
      <Row style={{ gap: 4 }}>
        {Array.from({ length: h.stars }).map((_, i) => (
          <Icon key={i} name="star" size={14} color={colors.accent} />
        ))}
        <Muted>  {h.rating.toFixed(1)} guest rating · per night</Muted>
      </Row>
      <Muted>{h.amenities.join(' · ')}</Muted>
      <Muted>
        {prettyDate(h.checkIn)} – {prettyDate(h.checkOut)} · {h.nights} night{h.nights > 1 ? 's' : ''} · {formatMoney(h.unitPriceCents, h.currency)} total before tax
      </Muted>
    </Card>
  );
}
