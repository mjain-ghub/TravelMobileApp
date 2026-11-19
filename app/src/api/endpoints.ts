import { request } from './client';
import type { Airport, Booking, Flight, Hotel, User, WithArkose } from './types';

type Headers = Record<string, string>;
const qs = (params: Record<string, string | number>) =>
  Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');

/**
 * Typed wrappers over the mock backend. Protected calls take the Arkose headers produced by
 * `useArkose().protect(...)` (X-Arkose-Token / X-Arkose-Method, or the step-up retry headers).
 */
export const api = {
  airports: () => request<{ airports: Airport[] }>('/api/airports'),

  searchFlights: (p: { from: string; to: string; date: string }, headers: Headers) =>
    request<{ results: Flight[] } & WithArkose>(`/api/flights/search?${qs(p)}`, { headers }),

  searchHotels: (p: { city: string; checkIn: string; checkOut: string }, headers: Headers) =>
    request<{ results: Hotel[] } & WithArkose>(`/api/hotels/search?${qs(p)}`, { headers }),

  flight: (id: string) => request<{ item: Flight }>(`/api/flights/${encodeURIComponent(id)}`),
  hotel: (id: string) => request<{ item: Hotel }>(`/api/hotels/${encodeURIComponent(id)}`),

  signup: (body: { name: string; email: string; password: string }, headers: Headers) =>
    request<{ user: User; token: string } & WithArkose>('/api/auth/signup', { method: 'POST', body, headers }),

  login: (body: { email: string; password: string }, headers: Headers) =>
    request<{ user: User; token: string } & WithArkose>('/api/auth/login', { method: 'POST', body, headers }),

  book: (
    body: {
      itemType: 'flight' | 'hotel';
      itemId: string;
      quantity: number;
      passenger: { name: string; email: string };
      payment: { brand: string; last4: string };
    },
    authToken: string,
    headers: Headers,
  ) => request<{ booking: Booking } & WithArkose>('/api/bookings', { method: 'POST', body, authToken, headers }),
};
