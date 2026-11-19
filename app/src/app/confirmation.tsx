import { Redirect, useRouter } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { ArkoseDecision } from '@/components/ArkoseDecision';
import { Button, Card, H1, H2, Icon, Muted, Row, Screen } from '@/components/ui';
import { useSession } from '@/state/session';
import { colors, formatMoney, space } from '@/theme';

export default function ConfirmationScreen() {
  const router = useRouter();
  const { lastBooking } = useSession();
  if (!lastBooking) return <Redirect href="/" />;
  const { booking: b, arkose } = lastBooking;
  const item = b.item;

  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.lg }}>
        <Icon name="checkmark-circle" size={64} color={colors.ok} />
        <H1>You're booked!</H1>
        <Muted>Confirmation {b.id}</Muted>
      </View>

      <Card style={{ gap: space.sm }}>
        <H2>{item.type === 'flight' ? `${item.from} → ${item.to}` : item.name}</H2>
        <Muted>
          {item.type === 'flight'
            ? `${item.airline} ${item.flightNumber} · ${item.date} · ${item.departTime}`
            : `${item.checkIn} → ${item.checkOut} · ${item.nights} night${item.nights > 1 ? 's' : ''}`}
        </Muted>
        <Muted>
          {b.passenger.name} · {b.passenger.email}
        </Muted>
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space.xs }} />
        <Row style={{ justifyContent: 'space-between' }}>
          <Muted>Subtotal</Muted>
          <Text>{formatMoney(b.subtotalCents, b.currency)}</Text>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Muted>Taxes &amp; fees</Muted>
          <Text>{formatMoney(b.taxesCents, b.currency)}</Text>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ fontWeight: '800' }}>Total charged</Text>
          <Text style={{ fontWeight: '800', color: colors.primary }}>{formatMoney(b.totalCents, b.currency)}</Text>
        </Row>
        <Muted>
          Paid with {b.payment.brand} ending {b.payment.last4}
        </Muted>
      </Card>

      <ArkoseDecision info={arkose} title="Checkout verified by Arkose" />

      <Button title="Back to search" onPress={() => router.replace('/')} variant="secondary" />
    </Screen>
  );
}
