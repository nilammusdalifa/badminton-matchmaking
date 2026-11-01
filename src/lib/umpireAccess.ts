/** How a remote umpire's pushes are going, and when to stop trusting a
 * remembered umpire claim. Pure logic, no Firebase, so it can be unit-tested. */

/** What a push to `sessions/{id}/data` came back with. `code` is Firebase's
 * error code, upper case (e.g. "PERMISSION_DENIED"), or "UNKNOWN". */
export type PushResult = { ok: true } | { ok: false; code: string };

/** Refused pushes in a row before a remembered umpire is sent back to the PIN
 * step. A single refusal can be a transient stale-`rev` race with another
 * device (also PERMISSION_DENIED), so it never drops the umpire on its own. */
export const UMPIRE_DROP_DENIALS = 2;

/** The run of consecutive PERMISSION_DENIED pushes after this result: reset by
 * a push that landed, one longer after a denial, unchanged by any other
 * failure (offline, network), which says nothing about access. */
export function nextDenialCount(prev: number, result: PushResult): number {
  if (result.ok) return 0;
  return result.code === "PERMISSION_DENIED" ? prev + 1 : prev;
}

/** True once the umpire's pushes have been refused often enough in a row that
 * their claim no longer works (the PIN changed, or this device lost its
 * anonymous uid while localStorage survived). */
export function shouldDropUmpire(denials: number): boolean {
  return denials >= UMPIRE_DROP_DENIALS;
}
