import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { api } from '@/api/endpoints';
import { useArkose } from '@/arkose/ArkoseProvider';
import { describeError, type UiError } from '@/components/errors';
import { Banner, Button, Card, Field, H1, Muted, ProtectionBadge, Screen } from '@/components/ui';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function SignupScreen() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { protect } = useArkose();
  const { signIn } = useSession();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({});
  const [error, setError] = useState<UiError | null>(null);

  const submit = async () => {
    setError(null);
    const next_: typeof errors = {};
    if (name.trim().length < 2) next_.name = 'Enter your full name';
    if (!EMAIL.test(email.trim())) next_.email = 'Enter a valid email address';
    if (password.length < 8) next_.password = 'Use at least 8 characters';
    setErrors(next_);
    if (Object.keys(next_).length) return;

    setBusy(true);
    try {
      const res = await protect('signup', (headers) => api.signup({ name: name.trim(), email: email.trim(), password }, headers));
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
      <H1>Create your account</H1>
      <ProtectionBadge flow="signup" />
      <Card style={{ gap: space.xs }}>
        <Field label="Full name" value={name} onChangeText={setName} autoCapitalize="words" error={errors.name} textContentType="name" />
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" error={errors.email} textContentType="emailAddress" />
        <Field label="Password (8+ characters)" value={password} onChangeText={setPassword} secureTextEntry error={errors.password} textContentType="newPassword" />
        {error ? <Banner kind={error.kind} title={error.title}>{error.message}</Banner> : null}
        <Button title="Create account" onPress={submit} loading={busy} icon="person-add-outline" />
      </Card>
      <Pressable onPress={() => router.replace({ pathname: '/login', params: { next } })} accessibilityRole="button">
        <Muted style={{ textAlign: 'center' } as never}>
          Already have an account? <Text style={{ color: colors.primary, fontWeight: '700' }}>Sign in</Text>
        </Muted>
      </Pressable>
    </Screen>
  );
}
