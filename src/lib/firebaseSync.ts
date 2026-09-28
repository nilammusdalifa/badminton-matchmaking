import { off, onValue, ref, set } from "firebase/database";
import { auth, database, firebaseConfigured } from "./firebase";
import type { PersistedState } from "./persistence";

export function generateSessionPin(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

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
 * Writes this session's `pin` and `ownerUid` to their own Firebase paths —
 * both write-once per the deployed security rules, so calling this again
 * for an already-stamped session is a harmless no-op rejection.
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
 * Outcome of an Umpire access claim.
 * - `ok`          — the PIN matched and this device now holds an editor claim.
 * - `wrong-pin`   — the database rejected the write, i.e. the PIN was wrong.
 * - `unavailable` — live sync isn't usable right now (not configured, or no
 *                   anonymous auth uid yet) — not the user's fault, must not
 *                   read as a bad PIN.
 */
export type UmpireClaimResult = "ok" | "wrong-pin" | "unavailable";

/**
 * Attempts to claim Umpire (edit) access for this device by submitting a
 * PIN. The write only succeeds if the PIN matches the one stored on the
 * session — enforced by the Realtime Database security rules, not by this
 * function.
 */
export async function claimUmpireAccess(sessionId: string, enteredPin: string): Promise<UmpireClaimResult> {
  if (!firebaseConfigured || !database) return "unavailable";
  const uid = auth?.currentUser?.uid;
  if (!uid) return "unavailable";
  try {
    await set(ref(database, `sessions/${sessionId}/editorClaims/${uid}`), enteredPin);
    return "ok";
  } catch {
    return "wrong-pin";
  }
}
