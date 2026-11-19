import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { Booking, TripItem, User } from '@/api/types';
import type { ArkoseInfo } from '@/arkose/types';

/**
 * In-memory session. A production app would keep the token in the platform keychain
 * (expo-secure-store) and refresh it; the demo deliberately forgets on restart.
 */
interface SessionApi {
  user: User | null;
  authToken: string | null;
  signIn: (user: User, token: string) => void;
  signOut: () => void;

  /** Item chosen for checkout, plus quantity (travelers / rooms). */
  selection: { item: TripItem; quantity: number } | null;
  select: (item: TripItem, quantity: number) => void;

  lastBooking: { booking: Booking; arkose?: ArkoseInfo } | null;
  setLastBooking: (b: SessionApi['lastBooking']) => void;
}

const SessionContext = createContext<SessionApi | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [selection, setSelection] = useState<SessionApi['selection']>(null);
  const [lastBooking, setLastBooking] = useState<SessionApi['lastBooking']>(null);

  const signIn = useCallback((u: User, token: string) => {
    setUser(u);
    setAuthToken(token);
  }, []);
  const signOut = useCallback(() => {
    setUser(null);
    setAuthToken(null);
  }, []);
  const select = useCallback((item: TripItem, quantity: number) => setSelection({ item, quantity }), []);

  const value = useMemo(
    () => ({ user, authToken, signIn, signOut, selection, select, lastBooking, setLastBooking }),
    [user, authToken, signIn, signOut, selection, select, lastBooking],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionApi {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
