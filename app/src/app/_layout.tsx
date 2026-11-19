import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ArkoseProvider } from '@/arkose/ArkoseProvider';
import { DebugPanel } from '@/components/DebugPanel';
import { SearchProvider } from '@/state/search';
import { SessionProvider, useSession } from '@/state/session';
import { SettingsProvider } from '@/state/settings';
import { colors } from '@/theme';

function HeaderRight() {
  const router = useRouter();
  const { user, signOut } = useSession();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
      <Pressable onPress={() => (user ? signOut() : router.push('/login'))} accessibilityRole="button" accessibilityLabel={user ? `Sign out ${user.name}` : 'Sign in'} hitSlop={8}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>{user ? 'Sign out' : 'Sign in'}</Text>
      </Pressable>
      <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel="Settings" hitSlop={8}>
        <Ionicons name="settings-outline" size={22} color="#fff" />
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <SessionProvider>
          <SearchProvider>
            <ArkoseProvider>
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  headerStyle: { backgroundColor: colors.primary },
                  headerTintColor: '#fff',
                  headerTitleStyle: { fontWeight: '700' },
                  contentStyle: { backgroundColor: colors.bg },
                }}
              >
                <Stack.Screen name="index" options={{ title: 'Wayfarer', headerRight: () => <HeaderRight /> }} />
                <Stack.Screen name="results" options={{ title: 'Results' }} />
                <Stack.Screen name="details" options={{ title: 'Details' }} />
                <Stack.Screen name="login" options={{ title: 'Sign in' }} />
                <Stack.Screen name="signup" options={{ title: 'Create account' }} />
                <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
                <Stack.Screen name="confirmation" options={{ title: 'Booking confirmed', headerBackVisible: false, headerLeft: () => null, gestureEnabled: false }} />
                <Stack.Screen name="settings" options={{ title: 'Demo settings' }} />
              </Stack>
              <DebugPanel />
            </ArkoseProvider>
          </SearchProvider>
        </SessionProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
