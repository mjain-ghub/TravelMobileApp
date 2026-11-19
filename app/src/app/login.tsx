import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { api } from '@/api/endpoints';
import { useArkose } from '@/arkose/ArkoseProvider';
import { describeError, type UiError } from '@/components/errors';
import { Banner, Button, Card, Field, H1, Muted, ProtectionBadge, Screen } from '@/components/ui';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme';

export default function LoginScreen() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { protect, server } = useArkose();
  const { signIn } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiError | null>(null);

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) return setError({ kind: 'error', title: 'Missing details', message: 'Enter your email and password.' });
    setBusy(true);
    try {
      // The Arkose token is requested first; the server verifies it BEFORE it looks at the password.
      const res = await protect('login', (headers) => api.login({ email: email.trim(), password }, headers));
      signIn(res.user, res.token);
      router.replace(next === 'checkout' ? '/checkout' : '/');
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <H1>Welcome back</H1>
      <ProtectionBadge flow="login" />
      <Card style={{ gap: space.xs }}>
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" textContentType="username" autoComplete="email" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" autoComplete="password" />
        {error ? <Banner kind={error.kind} title={error.title}>{error.message}</Banner> : null}
        <Button title="Sign in" onPress={submit} loading={busy} icon="log-in-outline" />
        {server?.demoUser ? (
          <Pressable
            onPress={() => {
              setEmail(server.demoUser!.email);
              setPassword(server.demoUser!.password);
            }}
            accessibilityRole="button"
            style={{ paddingTop: space.md }}
          >
            <Text style={{ color: colors.primary, fontWeight: '700', textAlign: 'center' }}>Fill demo credentials</Text>
          </Pressable>
        ) : null}
      </Card>
      <Pressable onPress={() => router.replace({ pathname: '/signup', params: { next } })} accessibilityRole="button">
        <Muted style={{ textAlign: 'center' } as never}>
          New to Wayfarer? <Text style={{ color: colors.primary, fontWeight: '700' }}>Create an account</Text>
        </Muted>
      </Pressable>
    </Screen>
  );
}
