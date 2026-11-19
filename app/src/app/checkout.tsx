import { Redirect, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Text } from 'react-native';
import { api } from '@/api/endpoints';
import { useArkose } from '@/arkose/ArkoseProvider';
import { describeError, type UiError } from '@/components/errors';
import { Banner, Button, Card, Field, H2, Muted, ProtectionBadge, Row, Screen } from '@/components/ui';
import { cardBrand, digitsOnly, expiryValid, formatCard, luhnValid } from '@/lib/format';
import { useSession } from '@/state/session';
import { colors, formatMoney, space } from '@/theme';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TAX_RATE = 0.11; // display estimate only: the server computes the real price

export default function CheckoutScreen() {
  const router = useRouter();
  const { protect } = useArkose();
  const { user, authToken, selection, setLastBooking } = useSession();

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [card, setCard] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<UiError | null>(null);

  if (!selection) return <Redirect href="/" />;
  if (!user || !authToken) return <Redirect href="/login?next=checkout" />;

  const { item, quantity } = selection;
  const subtotal = item.unitPriceCents * quantity;
  const estTax = Math.round(subtotal * TAX_RATE);

  const onExpiry = (v: string) => {
    const d = digitsOnly(v).slice(0, 4);
    setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
  };

  const submit = async () => {
    setError(null);
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = 'Enter the traveler name';
    if (!EMAIL.test(email.trim())) e.email = 'Enter a valid email';
    if (!luhnValid(card)) e.card = 'Enter a valid card number (demo: 4242 4242 4242 4242)';
    if (!expiryValid(expiry)) e.expiry = 'Use a future MM/YY';
    if (!/^\d{3,4}$/.test(cvc)) e.cvc = '3-4 digits';
    setErrors(e);
    if (Object.keys(e).length) return;

    setBusy(true);
    try {
      // Only the brand and last 4 digits leave the device. A real app would hand the card to a
      // payment processor SDK and send its token instead; the demo server never sees a PAN.
      const payment = { brand: cardBrand(card), last4: digitsOnly(card).slice(-4) };
      const res = await protect('checkout', (headers) =>
        api.book({ itemType: item.type, itemId: item.id, quantity, passenger: { name: name.trim(), email: email.trim() }, payment }, authToken, headers),
      );
      setLastBooking({ booking: res.booking, arkose: res.arkose });
      router.replace('/confirmation');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card style={{ gap: space.sm }}>
        <H2>{item.type === 'flight' ? `${item.from} → ${item.to} · ${item.airline} ${item.flightNumber}` : item.name}</H2>
        <Row style={{ justifyContent: 'space-between' }}>
          <Muted>Subtotal ({quantity} {item.type === 'flight' ? 'traveler' : 'room'}{quantity > 1 ? 's' : ''})</Muted>
          <Text>{formatMoney(subtotal, item.currency)}</Text>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Muted>Taxes &amp; fees (estimate)</Muted>
          <Text>{formatMoney(estTax, item.currency)}</Text>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ fontWeight: '800', color: colors.text }}>Estimated total</Text>
          <Text style={{ fontWeight: '800', fontSize: 18, color: colors.primary }}>{formatMoney(subtotal + estTax, item.currency)}</Text>
        </Row>
        <Muted>The final price is calculated by the server when you book.</Muted>
      </Card>

      <Card style={{ gap: space.xs }}>
        <H2>Traveler</H2>
        <Field label="Full name" value={name} onChangeText={setName} autoCapitalize="words" error={errors.name} />
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" error={errors.email} />
        <H2>Payment</H2>
        <Field
          label="Card number"
          value={card}
          onChangeText={(v) => setCard(formatCard(v))}
          keyboardType="number-pad"
          placeholder="4242 4242 4242 4242"
          error={errors.card}
          maxLength={23}
          autoComplete="cc-number"
        />
        <Row style={{ gap: space.md, alignItems: 'flex-start' }}>
          <Field label="Expiry (MM/YY)" value={expiry} onChangeText={onExpiry} keyboardType="number-pad" placeholder="12/29" error={errors.expiry} maxLength={5} autoComplete="cc-exp" />
          <Field label="CVC" value={cvc} onChangeText={(v) => setCvc(digitsOnly(v).slice(0, 4))} keyboardType="number-pad" secureTextEntry error={errors.cvc} maxLength={4} autoComplete="cc-csc" />
        </Row>
        <Muted>Demo only: no real payment is taken. Use any Luhn-valid test number.</Muted>
        {error ? <Banner kind={error.kind} title={error.title}>{error.message}</Banner> : null}
        <ProtectionBadge flow="checkout" />
        <Button title={`Book · ${formatMoney(subtotal + estTax, item.currency)}`} onPress={submit} loading={busy} icon="lock-closed" />
      </Card>
    </Screen>
  );
}
