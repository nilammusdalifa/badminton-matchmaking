/** The umpire PIN and its guess limit: pure logic, no Firebase, so it can be
 * unit-tested. The database rules (database.rules.json) enforce the same
 * window and limit on the server; these only let the client predict them. */

export const PIN_DIGITS = 6;
/** Tries per device before the lock. */
export const MAX_PIN_TRIES = 5;
/** How long the lock lasts: 10 minutes after the last try. */
export const PIN_LOCK_MS = 600_000;

/** Six digits from a secure random source, zero-padded. Never Math.random. */
export function generateSessionPin(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(PIN_DIGITS, "0");
}

/** 6 digits, or 4 for sessions made before the PIN got longer. */
export function isPinLength(pin: string): boolean {
  return /^(\d{4}|\d{6})$/.test(pin);
}

/** The count this device's next try gets: 1 if there is no earlier try or the
 * last one was a lock period ago, otherwise one more than before. */
export function nextAttempt(prev: { count: number; at: number } | null, nowMs: number): number {
  if (!prev || nowMs - prev.at >= PIN_LOCK_MS) return 1;
  return prev.count + 1;
}
