import { get, off, onValue, ref, serverTimestamp, set } from "firebase/database";
import { auth, database, firebaseConfigured } from "./firebase";
import type { PersistedState } from "./persistence";
import { isLocked, MAX_PIN_TRIES, nextAttempt } from "./pin";

/** What actually lives at `sessions/{id}/data` — the shared game data plus a
 * `rev` counter used purely to detect stale writes (see useSessionStore's
 * merge-guard refs). `rev` can't live at its own sibling path instead: the
 * deployed security rules only grant `.read` on `data` itself, and changing
 * that means hand-editing rules in the Firebase Console, which isn't
 * something this app can do for you. */
export type FirebasePayload = PersistedState & { rev: number };

/**
 * Mirrors this device's session to Firebase so anyone subscribed to
 * `sessions/{id}/data` sees it live. Fire-and-forget: localStorage remains
 * the source of truth for the organizer's own device even if this fails
 * (e.g. offline, or Firebase never configured at all).
 *
 * `pin`/`ownerUid` live at their own sibling paths (see
 * `pushSessionOwnership`), not inside this blob — the security rules read
 * them from there, and duplicating the PIN inside the world-readable `data`
 * node would leak it to every viewer.
 */
export function pushSessionToFirebase(sessionId: string, data: PersistedState, rev: number): void {
  if (!firebaseConfigured || !database || !auth?.currentUser) return;
  try {
    const payload: FirebasePayload = { ...data, rev };
    // JSON round-trip drops `undefined`-valued properties, which Firebase's
    // synchronous `set()` validation rejects outright (throws, not rejects).
    const clean = JSON.parse(JSON.stringify(payload));
    set(ref(database, `sessions/${sessionId}/data`), clean).catch((err) => {
      console.error("Failed to sync session to Firebase:", err);
    });
  } catch (err) {
    console.error("Failed to sync session to Firebase:", err);
  }
}

/**
 * Writes this session's `pin` and `ownerUid` to their own Firebase paths.
 * `ownerUid` is write-once, so calling this again for an already-stamped
 * session is a harmless no-op rejection for it. `pin` can be rewritten by
 * the owner (a 4-digit PIN from before is replaced by a 6-digit one when the
 * next session starts); for anyone else it is write-once too.
 */
export function pushSessionOwnership(sessionId: string, pin: string, ownerUid: string): void {
  if (!firebaseConfigured || !database) return;
  set(ref(database, `sessions/${sessionId}/pin`), pin).catch(() => {});
  set(ref(database, `sessions/${sessionId}/ownerUid`), ownerUid).catch(() => {});
}

/**
 * Subscribes to a session's live data in Firebase — used by the read-only
 * Player view, by an Umpire device once it's claimed access, and by the
 * organizer's own device (so an Umpire's edits from elsewhere don't get
 * silently overwritten the next time the organizer's device saves its own
 * change — see the merge-guard refs in useSessionStore). Returns an
 * unsubscribe function.
 */
export function subscribeToRemoteSession(sessionId: string, callback: (payload: FirebasePayload | null) => void): () => void {
  if (!firebaseConfigured || !database) {
    callback(null);
    return () => {};
  }
  const sessionRef = ref(database, `sessions/${sessionId}/data`);
  const handleValue = (snapshot: { exists: () => boolean; val: () => unknown }) => {
    callback(snapshot.exists() ? (snapshot.val() as FirebasePayload) : null);
  };
  onValue(sessionRef, handleValue);
  return () => off(sessionRef, "value", handleValue);
}

/**
 * One-shot read of a session's name and schedule, so the join screen can say
 * which session the link opens before anyone picks a role. Both live inside
 * the world-readable `data` node. Never throws: with no Firebase, no such
 * session, no name, or a failed read (offline), it resolves `null` and the
 * join screen keeps its generic title.
 */
export async function fetchSessionLabel(sessionId: string): Promise<{ name: string; schedule: string } | null> {
  if (!firebaseConfigured || !database) return null;
  try {
    const [nameSnap, scheduleSnap] = await Promise.all([get(ref(database, `sessions/${sessionId}/data/sessionName`)), get(ref(database, `sessions/${sessionId}/data/sessionSchedule`))]);
    const name = nameSnap.val();
    if (typeof name !== "string" || !name.trim()) return null;
    const schedule = scheduleSnap.val();
    return { name, schedule: typeof schedule === "string" ? schedule : "" };
  } catch {
    return null;
  }
}

/**
 * Outcome of an Umpire access claim.
 * - `ok`          — the PIN matched and this device now holds an editor claim.
 * - `wrong-pin`   — the database rejected the claim, i.e. the PIN was wrong.
 * - `locked`      — this device used up its tries; it has to wait out the lock.
 * - `unavailable` — live sync isn't usable right now (not configured, no
 *                   anonymous auth uid yet, or the try couldn't be counted) —
 *                   not the user's fault, must not read as a bad PIN.
 */
export type UmpireClaimResult = "ok" | "wrong-pin" | "locked" | "unavailable";

/** The stored try at `attempts/{uid}`, or null when there is none or it has an unexpected shape. */
function readAttempt(value: unknown): { count: number; at: number } | null {
  if (!value || typeof value !== "object") return null;
  const { count, at } = value as { count?: unknown; at?: unknown };
  return typeof count === "number" && typeof at === "number" ? { count, at } : null;
}

/**
 * Attempts to claim Umpire (edit) access for this device by submitting a
 * PIN. Every guess is first counted at `attempts/{uid}`; the claim at
 * `editorClaims/{uid}` only succeeds if it matches both the session's PIN and
 * the guess just counted, and the count is within `MAX_PIN_TRIES` — all
 * enforced by the Realtime Database security rules, not by this function.
 */
export async function claimUmpireAccess(sessionId: string, enteredPin: string): Promise<UmpireClaimResult> {
  if (!firebaseConfigured || !database) return "unavailable";
  const uid = auth?.currentUser?.uid;
  if (!uid) return "unavailable";
  const attemptRef = ref(database, `sessions/${sessionId}/attempts/${uid}`);

  let prev: { count: number; at: number } | null;
  try {
    prev = readAttempt((await get(attemptRef)).val());
  } catch {
    return "unavailable";
  }

  // Out of tries: say so without counting another one, so pressing again
  // never pushes the end of the lock further out.
  const nowMs = Date.now();
  if (isLocked(prev, nowMs)) return "locked";

  // The rules check the count against the server's clock, not this device's.
  // If the two disagree about whether the lock period has passed, the first
  // write is rejected; the other count is then the one the server expects.
  const first = nextAttempt(prev, nowMs);
  const other = first === 1 ? (prev ? prev.count + 1 : 1) : 1;
  let count = first;
  try {
    await set(attemptRef, { count, at: serverTimestamp(), guess: enteredPin });
  } catch {
    if (other === first) return "unavailable";
    count = other;
    try {
      await set(attemptRef, { count, at: serverTimestamp(), guess: enteredPin });
    } catch {
      return "unavailable";
    }
  }
  if (count > MAX_PIN_TRIES) return "locked";

  try {
    await set(ref(database, `sessions/${sessionId}/editorClaims/${uid}`), enteredPin);
    return "ok";
  } catch {
    return "wrong-pin";
  }
}
