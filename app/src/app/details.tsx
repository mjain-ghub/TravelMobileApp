import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { api } from '@/api/endpoints';
import type { TripItem } from '@/api/types';
import { Banner, Button, Card, H1, H2, Muted, Row, Screen } from '@/components/ui';
import { prettyDate } from '@/lib/format';
import { useSession } from '@/state/session';
import { colors, formatDuration, formatMoney, space } from '@/theme';

export default function DetailsScreen() {
  const { type, id, qty } = useLocalSearchParams<{ type: string; id: string; qty: string }>();
  const router = useRouter();
  const { user, select } = useSession();
  const quantity = Math.max(1, Math.min(6, Number(qty) || 1));

  const [item, setItem] = useState<TripItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = type === 'hotel' ? api.hotel(id) : api.flight(id);
    load
      .then((r) => !cancelled && setItem(r.item))
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [type, id]);

  if (error) return <Screen><Banner kind="error" title="Could not load this item">{error}</Banner></Screen>;
  if (!item) return <Screen><ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} /></Screen>;

  const subtotal = item.unitPriceCents * quantity;
  const onContinue = () => {
    select(item, quantity);
    router.push(user ? '/checkout' : { pathname: '/login', params: { next: 'checkout' } });
  };

  return (
    <Screen>
      {item.type === 'flight' ? (
        <>
          <H1>
            {item.from} → {item.to}
          </H1>
          <Card style={{ gap: space.sm }}>
            <H2>
              {item.airline} · {item.flightNumber}
            </H2>
            <Text style={{ fontSize: 22, color: colors.text }}>
              {item.departTime} → {item.arriveTime}
              {item.arriveDayOffset > 0 ? ` +${item.arriveDayOffset}` : ''}
            </Text>
            <Muted>
              {prettyDate(item.date)} · {formatDuration(item.durationMin)} · {item.stops === 0 ? 'Nonstop' : `${item.stops} stop`} · {item.cabin}
            </Muted>
            <Muted>Illustrative times. This is a mock inventory for the demo.</Muted>
          </Card>
        </>
      ) : (
        <>
          <H1>{item.name}</H1>
          <Card style={{ gap: space.sm }}>
            <H2>
              {item.stars}-star · {item.rating.toFixed(1)} rating
            </H2>
            <Muted>
              {prettyDate(item.checkIn)} – {prettyDate(item.checkOut)} · {item.nights} night{item.nights > 1 ? 's' : ''}
            </Muted>
            <Muted>{item.amenities.join(' · ')}</Muted>
          </Card>
        </>
      )}

      <Card style={{ gap: space.sm }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Muted>
            {item.type === 'flight' ? `${quantity} traveler${quantity > 1 ? 's' : ''}` : `${quantity} room${quantity > 1 ? 's' : ''}`} (before tax)
          </Muted>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.primary }}>{formatMoney(subtotal, item.currency)}</Text>
        </Row>
        <View style={{ height: space.sm }} />
        <Button title={user ? 'Continue to checkout' : 'Sign in to book'} onPress={onContinue} icon="arrow-forward" />
      </Card>
    </Screen>
  );
}
