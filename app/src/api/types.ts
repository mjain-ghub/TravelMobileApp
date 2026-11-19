import type { ArkoseInfo } from '@/arkose/types';

export interface Airport {
  code: string;
  city: string;
  name: string;
}

export interface Flight {
  id: string;
  type: 'flight';
  airline: string;
  flightNumber: string;
  from: string;
  to: string;
  date: string;
  departTime: string;
  arriveTime: string;
  arriveDayOffset: number;
  durationMin: number;
  stops: number;
  cabin: string;
  unitPriceCents: number;
  currency: string;
}

export interface Hotel {
  id: string;
  type: 'hotel';
  name: string;
  city: string;
  stars: number;
  rating: number;
  amenities: string[];
  checkIn: string;
  checkOut: string;
  nights: number;
  unitPriceCents: number;
  nightlyPriceCents: number;
  currency: string;
}

export type TripItem = Flight | Hotel;

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Booking {
  id: string;
  status: string;
  createdAt: string;
  itemType: 'flight' | 'hotel';
  item: TripItem;
  quantity: number;
  subtotalCents: number;
  taxesCents: number;
  totalCents: number;
  currency: string;
  passenger: { name: string; email: string };
  payment: { brand: string; last4: string };
  arkoseSession: string | null;
}

/** Every protected response carries the server's Arkose decision. */
export interface WithArkose {
  arkose?: ArkoseInfo;
}
