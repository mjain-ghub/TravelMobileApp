import React, { createContext, useContext, useMemo, useState } from 'react';
import type { Flight, Hotel } from '@/api/types';
import type { ArkoseInfo } from '@/arkose/types';

interface SearchBase {
  title: string;
  subtitle: string;
  /** Travelers (flights) or rooms (hotels): carried through to checkout. */
  quantity: number;
  /** The server's Arkose decision for this search, shown on the results screen. */
  arkose?: ArkoseInfo;
}

export type SearchState = (SearchBase & { kind: 'flights'; results: Flight[] }) | (SearchBase & { kind: 'hotels'; results: Hotel[] });

interface SearchApi {
  search: SearchState | null;
  setSearch: (s: SearchState | null) => void;
}

const SearchContext = createContext<SearchApi | null>(null);

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [search, setSearch] = useState<SearchState | null>(null);
  const value = useMemo(() => ({ search, setSearch }), [search]);
  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearchResults(): SearchApi {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error('useSearchResults must be used inside <SearchProvider>');
  return ctx;
}
