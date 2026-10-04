import type { Court, Match, Player, QueueItem, ResultMode, SessionHistoryEntry } from "../types";

const STORAGE_KEY = "smashmatch.v1";

export interface PersistedState {
  players: Player[];
  matches: Match[];
  courts: Court[];
  completedCount: number;
  totalEstimate: number;
  sessionName: string;
  sessionSchedule: string;
  sessionEnded: boolean;
  sessionResultMode: ResultMode;
  requestedPairs: [string, string][];
  history: SessionHistoryEntry[];
  photoReminderShown: boolean;
  /** The locked part of the plan (Up next, Then): one match per open court. */
  queue: QueueItem[];
  /** "Lock planned matches". Off: the plan is only a preview that keeps updating. */
  planAhead: boolean;
  /** The "Hard games" switch. Missing (saved before it existed) means on. */
  hardGames?: boolean;
}

/** Identity for this device's own session — stable across refreshes so the
 * Firebase mirror path and the share link/PIN don't change every reload.
 * Deliberately a separate localStorage key from `PersistedState`, not part
 * of it: it must never be overwritten by data received from a *remote*
 * session (see the Firebase sync effects in useSessionStore), and it's
 * never pushed to Firebase either — a remote viewer has no business knowing
 * a session's local identity fields, only its shared game data. */
export interface LocalSessionIdentity {
  sessionId: string;
  sessionPin: string;
}

const IDENTITY_KEY = "smashmatch.identity.v1";

export function loadIdentity(): LocalSessionIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.sessionId !== "string" || typeof parsed.sessionPin !== "string") return null;
    return parsed as LocalSessionIdentity;
  } catch {
    return null;
  }
}

export function saveIdentity(identity: LocalSessionIdentity): void {
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    // Storage full or unavailable — live sharing just won't persist across
    // a refresh on this device; the rest of the app still works.
  }
}

/** A refresh, crash, or backgrounded phone tab must never lose a live
 * session — but a corrupt or stale-shape blob must never crash the app
 * either, so every read is guarded and simply falls back to "nothing saved". */
export function load(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.players) || !Array.isArray(parsed.matches)) {
      return null;
    }
    return parsed as PersistedState;
  } catch {
    return null;
  }
}

export function save(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable (private browsing, etc.) — the live app
    // still works, it just won't survive a refresh. Not worth surfacing.
  }
}
