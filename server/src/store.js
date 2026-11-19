// In-memory state. Replace with a real database in production.

export function createStore() {
  return {
    users: new Map(), // email -> { id, name, email, passwordHash }
    bookings: new Map(), // id -> booking
    usedTokens: new Set(), // mock-mode only: Arkose enforces one-time tokens itself in live mode
    stepUps: new Map(), // id -> pending step-up challenge
  };
}
