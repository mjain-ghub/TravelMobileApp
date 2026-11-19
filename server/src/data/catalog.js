// Deterministic mock travel inventory. Everything here is fictional: airline and hotel
// names are invented and prices are generated from route distance plus seeded noise.
// Item IDs encode their search parameters, so the server can regenerate (and re-price)
// an item without storing anything. The booking endpoint relies on that so it never
// trusts a price sent by the client.

export const AIRPORTS = {
  ATL: { city: 'Atlanta', name: 'Hartsfield-Jackson Atlanta Intl', lat: 33.64, lon: -84.43 },
  JFK: { city: 'New York', name: 'John F. Kennedy Intl', lat: 40.64, lon: -73.78 },
  LAX: { city: 'Los Angeles', name: 'Los Angeles Intl', lat: 33.94, lon: -118.41 },
  ORD: { city: 'Chicago', name: "O'Hare Intl", lat: 41.98, lon: -87.9 },
  MIA: { city: 'Miami', name: 'Miami Intl', lat: 25.79, lon: -80.29 },
  SFO: { city: 'San Francisco', name: 'San Francisco Intl', lat: 37.62, lon: -122.38 },
  SEA: { city: 'Seattle', name: 'Seattle-Tacoma Intl', lat: 47.45, lon: -122.31 },
  DEN: { city: 'Denver', name: 'Denver Intl', lat: 39.86, lon: -104.67 },
  BOS: { city: 'Boston', name: 'Logan Intl', lat: 42.36, lon: -71.01 },
  LHR: { city: 'London', name: 'Heathrow', lat: 51.47, lon: -0.45 },
  CDG: { city: 'Paris', name: 'Charles de Gaulle', lat: 49.01, lon: 2.55 },
  FCO: { city: 'Rome', name: 'Fiumicino', lat: 41.8, lon: 12.25 },
  NRT: { city: 'Tokyo', name: 'Narita Intl', lat: 35.77, lon: 140.39 },
};

const AIRLINES = [
  { code: 'AL', name: 'Aerolux' },
  { code: 'SB', name: 'SkyBridge' },
  { code: 'MA', name: 'Meridian Air' },
  { code: 'NW', name: 'Northwind' },
  { code: 'CJ', name: 'Coastline Jets' },
];

const HOTEL_BRANDS = ['Harbor & Pine', 'The Meridian', 'Juniper House', 'Skyline Suites', 'Cobalt Inn', 'Lantern Court', 'Foxglove Hotel', 'Brightwater Lodge'];
const AMENITIES = ['Free Wi-Fi', 'Pool', 'Breakfast included', 'Gym', 'Airport shuttle', 'Pet friendly', 'Spa', 'Free cancellation'];

const FLIGHT_ID = /^fl_([A-Z]{3})_([A-Z]{3})_(\d{4}-\d{2}-\d{2})_(\d+)$/;
const HOTEL_ID = /^ht_([A-Z]{3})_(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})_(\d+)$/;
const TAX_RATE = 0.11;

export const isAirport = (code) => Object.hasOwn(AIRPORTS, code);

export function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const nightsBetween = (checkIn, checkOut) =>
  Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000);

// ---- seeded randomness (FNV-1a hash -> mulberry32) -------------------------------------

function seededRandom(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function distanceKm(a, b) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const hhmm = (minutes) => {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

// ---- flights -------------------------------------------------------------------------

export function generateFlights({ from, to, date }) {
  const km = distanceKm(AIRPORTS[from], AIRPORTS[to]);
  const rnd = seededRandom(`flights:${from}:${to}:${date}`);
  const flights = [];
  for (let i = 0; i < 8; i += 1) {
    const airline = AIRLINES[Math.floor(rnd() * AIRLINES.length)];
    const stops = km > 1500 && rnd() < 0.35 ? 1 : 0;
    const departMin = 6 * 60 + Math.floor((rnd() * 15 * 60) / 15) * 15;
    const durationMin = Math.round((km / 800) * 60 + 35 + stops * 85);
    const arriveRaw = departMin + durationMin;
    const dollars = (60 + km * 0.11) * (0.8 + rnd() * 0.7) * (stops ? 0.9 : 1);
    flights.push({
      id: `fl_${from}_${to}_${date}_${i}`,
      type: 'flight',
      airline: airline.name,
      flightNumber: `${airline.code}${100 + Math.floor(rnd() * 900)}`,
      from,
      to,
      date,
      departTime: hhmm(departMin),
      arriveTime: hhmm(arriveRaw),
      arriveDayOffset: Math.floor(arriveRaw / 1440),
      durationMin,
      stops,
      cabin: 'Economy',
      unitPriceCents: Math.round(dollars) * 100,
      currency: 'USD',
    });
  }
  return flights.sort((x, y) => x.unitPriceCents - y.unitPriceCents);
}

export function getFlight(id) {
  const m = FLIGHT_ID.exec(id);
  if (!m) return null;
  const [, from, to, date, idx] = m;
  if (!isAirport(from) || !isAirport(to) || !isIsoDate(date)) return null;
  return generateFlights({ from, to, date })[Number(idx)] ?? null;
}

// ---- hotels --------------------------------------------------------------------------

export function generateHotels({ city, checkIn, checkOut }) {
  const nights = nightsBetween(checkIn, checkOut);
  const rnd = seededRandom(`hotels:${city}:${checkIn}:${checkOut}`);
  const label = AIRPORTS[city].city;
  const brands = [...HOTEL_BRANDS].sort(() => rnd() - 0.5).slice(0, 6);
  return brands.map((brand, i) => {
    const stars = 3 + Math.floor(rnd() * 3);
    const nightly = Math.round(70 + stars * 38 * (0.8 + rnd() * 0.5));
    return {
      id: `ht_${city}_${checkIn}_${checkOut}_${i}`,
      type: 'hotel',
      name: `${brand} ${label}`,
      city: label,
      stars,
      rating: Math.round((3.5 + rnd() * 1.4) * 10) / 10,
      amenities: [...AMENITIES].sort(() => rnd() - 0.5).slice(0, 3),
      checkIn,
      checkOut,
      nights,
      unitPriceCents: nightly * 100 * nights,
      nightlyPriceCents: nightly * 100,
      currency: 'USD',
    };
  });
}

export function getHotel(id) {
  const m = HOTEL_ID.exec(id);
  if (!m) return null;
  const [, city, checkIn, checkOut, idx] = m;
  if (!isAirport(city) || !isIsoDate(checkIn) || !isIsoDate(checkOut)) return null;
  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1 || nights > 30) return null;
  return generateHotels({ city, checkIn, checkOut })[Number(idx)] ?? null;
}

export const hotelStayIsValid = (checkIn, checkOut) => {
  const nights = nightsBetween(checkIn, checkOut);
  return nights >= 1 && nights <= 30;
};

// ---- pricing -------------------------------------------------------------------------

/** Server-side price quote. Always computed here, never taken from the request. */
export function quote(itemType, itemId, quantity) {
  const item = itemType === 'flight' ? getFlight(itemId) : itemType === 'hotel' ? getHotel(itemId) : null;
  if (!item) return null;
  const subtotalCents = item.unitPriceCents * quantity;
  const taxesCents = Math.round(subtotalCents * TAX_RATE);
  return { item, quantity, subtotalCents, taxesCents, totalCents: subtotalCents + taxesCents, currency: 'USD' };
}
