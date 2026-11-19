import crypto from 'node:crypto';
import cors from 'cors';
import express from 'express';
import { attachUser, hashPassword, requireAuth, signSession, verifyPassword } from './auth.js';
import { FLOWS, loadConfig } from './config.js';
import { AIRPORTS, generateFlights, generateHotels, getFlight, getHotel, hotelStayIsValid, isAirport, isIsoDate, quote } from './data/catalog.js';
import { arkoseGate } from './arkose/gate.js';
import { MOCK_SCENARIOS } from './arkose/verify.js';
import { createStore } from './store.js';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
export const DEMO_USER = { name: 'Demo Traveler', email: 'demo@example.com', password: 'Passw0rd!' };

const bad = (res, message, code = 'BAD_REQUEST') => res.status(400).json({ error: message, code });

export function createApp({ config = loadConfig(), fetchImpl = globalThis.fetch } = {}) {
  const app = express();
  const store = createStore();
  const ctx = { config, store, fetchImpl };

  store.users.set(DEMO_USER.email, {
    id: 'u_demo',
    name: DEMO_USER.name,
    email: DEMO_USER.email,
    passwordHash: hashPassword(DEMO_USER.password),
  });

  const gate = (flow) => arkoseGate(flow, ctx);
  const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });
  const sessionFor = (u) => signSession({ sub: u.id, email: u.email }, config.authSecret);

  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use(
    cors({
      origin: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Arkose-Token', 'X-Arkose-Method', 'X-StepUp-Id', 'X-StepUp-Code'],
    }),
  );
  app.use(express.json({ limit: '16kb' }));
  app.use(attachUser(config.authSecret));

  // ---- meta ----------------------------------------------------------------------------

  app.get('/api/health', (_req, res) => res.json({ ok: true, arkoseMode: config.arkose.mode }));

  // Only PUBLIC values are exposed here. Private keys never leave the server.
  app.get('/api/config', (_req, res) => {
    res.json({
      mode: config.arkose.mode,
      clientApiBaseUrl: config.arkose.clientApiBaseUrl,
      publicKeys: Object.fromEntries(FLOWS.map((f) => [f, config.arkose.keys[f].publicKey])),
      demoDebug: config.demoDebug,
      scenarios: config.arkose.mode === 'mock' ? MOCK_SCENARIOS : [],
      demoUser: config.arkose.mode === 'mock' ? { email: DEMO_USER.email, password: DEMO_USER.password } : null,
      stepUpHint: config.arkose.mode === 'mock' ? config.stepUpCode : null,
    });
  });

  app.get('/api/airports', (_req, res) =>
    res.json({ airports: Object.entries(AIRPORTS).map(([code, a]) => ({ code, city: a.city, name: a.name })) }),
  );

  // ---- search (flow: search) -----------------------------------------------------------

  const validateFlightSearch = (req, res, next) => {
    const { from, to, date } = req.query;
    if (!isAirport(from) || !isAirport(to)) return bad(res, 'from/to must be supported airport codes');
    if (from === to) return bad(res, 'Origin and destination must differ');
    if (!isIsoDate(date)) return bad(res, 'date must be YYYY-MM-DD');
    return next();
  };

  app.get('/api/flights/search', validateFlightSearch, gate('search'), (req, res) => {
    const { from, to, date } = req.query;
    res.json({ results: generateFlights({ from, to, date }), arkose: req.arkose });
  });

  const validateHotelSearch = (req, res, next) => {
    const { city, checkIn, checkOut } = req.query;
    if (!isAirport(city)) return bad(res, 'city must be a supported city code');
    if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) return bad(res, 'checkIn/checkOut must be YYYY-MM-DD');
    if (!hotelStayIsValid(checkIn, checkOut)) return bad(res, 'Stay must be between 1 and 30 nights');
    return next();
  };

  app.get('/api/hotels/search', validateHotelSearch, gate('search'), (req, res) => {
    const { city, checkIn, checkOut } = req.query;
    res.json({ results: generateHotels({ city, checkIn, checkOut }), arkose: req.arkose });
  });

  // Details are cheap, non-sensitive reads: not gated.
  app.get('/api/flights/:id', (req, res) => {
    const item = getFlight(req.params.id);
    return item ? res.json({ item }) : res.status(404).json({ error: 'Flight not found', code: 'NOT_FOUND' });
  });
  app.get('/api/hotels/:id', (req, res) => {
    const item = getHotel(req.params.id);
    return item ? res.json({ item }) : res.status(404).json({ error: 'Hotel not found', code: 'NOT_FOUND' });
  });

  // ---- accounts (flows: signup, login) -------------------------------------------------

  const validateSignup = (req, res, next) => {
    const { name, email, password } = req.body ?? {};
    if (typeof name !== 'string' || name.trim().length < 2 || name.length > 80) return bad(res, 'Name must be 2-80 characters');
    if (typeof email !== 'string' || !EMAIL.test(email)) return bad(res, 'Enter a valid email address');
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) return bad(res, 'Password must be 8-128 characters');
    return next();
  };

  app.post('/api/auth/signup', validateSignup, gate('signup'), (req, res) => {
    const email = req.body.email.trim().toLowerCase();
    if (store.users.has(email)) {
      return res.status(409).json({ error: 'An account with this email already exists', code: 'EMAIL_TAKEN', arkose: req.arkose });
    }
    const user = { id: `u_${crypto.randomBytes(6).toString('hex')}`, name: req.body.name.trim(), email, passwordHash: hashPassword(req.body.password) };
    store.users.set(email, user);
    return res.status(201).json({ user: publicUser(user), token: sessionFor(user), arkose: req.arkose });
  });

  const validateLogin = (req, res, next) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) return bad(res, 'Email and password are required');
    return next();
  };

  // The gate runs BEFORE the credential check, so every guess costs the attacker a fresh
  // single-use Arkose token. That is what makes credential stuffing expensive.
  app.post('/api/auth/login', validateLogin, gate('login'), (req, res) => {
    const user = store.users.get(req.body.email.trim().toLowerCase());
    const ok = verifyPassword(req.body.password, user?.passwordHash);
    if (!user || !ok) return res.status(401).json({ error: 'Invalid email or password', code: 'BAD_CREDENTIALS', arkose: req.arkose });
    return res.json({ user: publicUser(user), token: sessionFor(user), arkose: req.arkose });
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    const user = store.users.get(req.user.email);
    return user ? res.json({ user: publicUser(user) }) : res.status(401).json({ error: 'Unknown user', code: 'AUTH_REQUIRED' });
  });

  // ---- bookings (flow: checkout) -------------------------------------------------------

  const validateBooking = (req, res, next) => {
    const { itemType, itemId, quantity, passenger, payment } = req.body ?? {};
    if (!['flight', 'hotel'].includes(itemType)) return bad(res, 'itemType must be "flight" or "hotel"');
    if (typeof itemId !== 'string' || !quote(itemType, itemId, 1)) return bad(res, 'Unknown item');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 6) return bad(res, 'quantity must be 1-6');
    if (typeof passenger?.name !== 'string' || passenger.name.trim().length < 2) return bad(res, 'Traveler name is required');
    if (typeof passenger?.email !== 'string' || !EMAIL.test(passenger.email)) return bad(res, 'Traveler email is invalid');
    // The app never sends a full card number: only brand and last 4 (a real system would pass a
    // payment-processor token). Anything longer is rejected so a PAN can't be logged by accident.
    if (!/^\d{4}$/.test(payment?.last4 ?? '') || typeof payment?.brand !== 'string') return bad(res, 'payment must contain brand and last4 only');
    return next();
  };

  app.post('/api/bookings', requireAuth, validateBooking, gate('checkout'), (req, res) => {
    const { itemType, itemId, quantity, passenger, payment } = req.body;
    const priced = quote(itemType, itemId, quantity); // price comes from the server, never the client
    const booking = {
      id: `BK${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      userId: req.user.sub,
      status: 'CONFIRMED',
      createdAt: new Date().toISOString(),
      itemType,
      item: priced.item,
      quantity,
      subtotalCents: priced.subtotalCents,
      taxesCents: priced.taxesCents,
      totalCents: priced.totalCents,
      currency: priced.currency,
      passenger: { name: passenger.name.trim(), email: passenger.email.trim() },
      payment: { brand: payment.brand, last4: payment.last4 },
      arkoseSession: req.arkose?.session ?? null, // keep the Arkose session id for fraud investigations
    };
    store.bookings.set(booking.id, booking);
    return res.status(201).json({ booking, arkose: req.arkose });
  });

  app.get('/api/bookings', requireAuth, (req, res) => {
    res.json({ bookings: [...store.bookings.values()].filter((b) => b.userId === req.user.sub) });
  });

  // ---- errors --------------------------------------------------------------------------

  app.use((_req, res) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.parse.failed') return bad(res, 'Invalid JSON body');
    console.error('[server] unhandled error:', err);
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL' });
  });

  return app;
}
