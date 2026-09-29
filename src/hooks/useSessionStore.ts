import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MATCHES_INIT, PAUSE_LABELS, PLAYERS_INIT } from "../data/seed";
import { auth, ensureAnonymousAuth, firebaseConfigured } from "../lib/firebase";
import { claimUmpireAccess, type FirebasePayload, generateSessionPin, pushSessionOwnership, pushSessionToFirebase, subscribeToRemoteSession } from "../lib/firebaseSync";
import { load, loadIdentity, save, saveIdentity, type PersistedState } from "../lib/persistence";
import {
  buildCounterSnapshot,
  buildSessionSummary,
  buildSuggestion,
  formatElapsed,
  initialsFor,
  isOverTarget,
  isPlaying as isPlayingFn,
  makeBlankPlayer,
  parseScheduleEndTime,
  playerPriority,
  readyPool as readyPoolFn,
  recomputePlayerStats,
  resetPlayersForNewSession,
  reverseCounterSnapshot,
  teamNames,
} from "../lib/session";
import type { Court, Match, PauseReason, Player, ResultMode, SessionHistoryEntry, SkillLevel, Suggestion, Tab } from "../types";
import type {
  CourtViewModel,
  ManagePlayerEntry,
  MatchLogEntry,
  NotInRotationEntry,
  RankingEntry,
  RecentResultEntry,
  RequestedPairEntry,
  SessionHealth,
  ShareRankingEntry,
  TopPriorityEntry,
  UpNextEntry,
  WaitingEntry,
} from "../types.viewmodel";

interface AppState {
  activeTab: Tab;
  players: Player[];
  matches: Match[];
  courts: Court[];
  suggestSeed: Record<string, number>;
  tick: number;
  completedCount: number;
  totalEstimate: number;
  sessionName: string;
  sessionSchedule: string;
  sessionEnded: boolean;
  sessionResultMode: ResultMode;
  history: SessionHistoryEntry[];
  photoReminderShown: boolean;
  scorekeeperMatchId: string | null;
  scorekeeperT1: number;
  scorekeeperT2: number;
  scorekeeperHistory: { t1: number; t2: number }[];
  editCourtId: string | null;
  editT1A: string;
  editT1B: string;
  editT2A: string;
  editT2B: string;
  setupOpen: boolean;
  setupStep: 0 | 1 | 2 | 3;
  setupName: string;
  setupSchedule: string;
  setupResultMode: ResultMode;
  newPlayerName: string;
  newPlayerLevel: SkillLevel;
  toastMsg: string | null;
  confirmAction: "end" | "reset" | "deleteMatch" | null;
  pendingDeleteMatchId: string | null;
  requestedPairs: [string, string][];
  requestA: string;
  requestB: string;
  shareRankingsOpen: boolean;
  /** This device's own identity for live sharing — stable across refreshes
   * (see LocalSessionIdentity), never overwritten by remote data. */
  sessionId: string;
  sessionPin: string;
}

const MAX_COURTS = 6;

function initialState(): AppState {
  const identity = loadIdentity() ?? { sessionId: "s" + Date.now(), sessionPin: generateSessionPin() };
  saveIdentity(identity);
  return {
    activeTab: "session",
    sessionId: identity.sessionId,
    sessionPin: identity.sessionPin,
    players: PLAYERS_INIT,
    matches: MATCHES_INIT,
    courts: [],
    suggestSeed: {},
    tick: 0,
    completedCount: 0,
    totalEstimate: 0,
    sessionName: "New Session",
    sessionSchedule: "",
    sessionEnded: false,
    sessionResultMode: "score",
    history: [],
    photoReminderShown: false,
    scorekeeperMatchId: null,
    scorekeeperT1: 0,
    scorekeeperT2: 0,
    scorekeeperHistory: [],
    editCourtId: null,
    editT1A: "",
    editT1B: "",
    editT2A: "",
    editT2B: "",
    setupOpen: false,
    setupStep: 0,
    setupName: "",
    setupSchedule: "",
    setupResultMode: "score",
    newPlayerName: "",
    newPlayerLevel: "B",
    toastMsg: null,
    confirmAction: null,
    pendingDeleteMatchId: null,
    requestedPairs: [],
    requestA: "",
    requestB: "",
    shareRankingsOpen: false,
  };
}

export function useSessionStore() {
  const [state, setState] = useState<AppState>(() => {
    const persisted = load();
    return persisted ? { ...initialState(), ...persisted } : initialState();
  });
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const shareCardRef = useRef<HTMLDivElement>(null);

  // ---- live sharing (Firebase) ------------------------------------------
  // `?view=<sessionId>` in the URL means this load is someone joining a
  // *shared* session (Player or Umpire), not opening their own — read once,
  // stable for the life of this mount.
  const [viewSessionId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("view"));
  const isRemoteMode = viewSessionId !== null;
  const [authReady, setAuthReady] = useState(false);
  const [remoteRole, setRemoteRole] = useState<"player" | "umpire" | null>(null);
  const [remoteRoleStep, setRemoteRoleStep] = useState<"choose" | "pin">("choose");
  const [remotePinError, setRemotePinError] = useState("");
  const [remoteChecking, setRemoteChecking] = useState(false);
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [remoteMissing, setRemoteMissing] = useState(false);

  // Merge-guard for two-way sync: every device that can write (the
  // organizer, or an Umpire elsewhere) tags its own pushes with a `rev` that
  // only ever increases. `localRevRef` is the highest rev *this* device has
  // authored; `lastKnownRemoteRevRef` is the highest rev it's seen from
  // anywhere. An incoming update is only applied if it's actually newer than
  // this device's own last write — otherwise it's either this device's own
  // echo coming back, or a stale/out-of-order snapshot, and applying it
  // would silently clobber a more recent local edit. `isApplyingRemoteRef`
  // tells the persistence effect "this state change came from a merge, not
  // a fresh local action" so it doesn't re-push it (which would otherwise
  // ping-pong forever) or double-count it as a new revision.
  const localRevRef = useRef(0);
  const lastKnownRemoteRevRef = useRef(0);
  const isApplyingRemoteRef = useRef(false);
  // P0 fix: a device that can write (organizer, or Umpire) must never push
  // before it has heard back from its OWN subscription at least once —
  // otherwise the persistence effect's very first run, on mount, fires with
  // nothing but blank initial state (no players/matches yet) and pushes
  // that over whatever the real shared session already has, before the
  // async Firebase read that would have pulled the real data down even had
  // a chance to land. Reproduced directly: an Umpire whose PIN was accepted
  // could overwrite an organizer's live 6-player session with an empty one
  // in the moment between claiming access and the first snapshot arriving.
  // Sits at "has this device's subscription delivered its first callback
  // yet" (true even for a null payload — a genuinely new/missing session is
  // also a real answer, not something to keep waiting on).
  const hasHydratedRef = useRef(false);

  const applyRemoteUpdate = useCallback((payload: FirebasePayload) => {
    if (payload.rev <= localRevRef.current) return; // our own echo, or older than what we already have
    lastKnownRemoteRevRef.current = payload.rev;
    isApplyingRemoteRef.current = true;
    setState((s) => ({ ...s, ...payload }));
  }, []);

  useEffect(() => {
    ensureAnonymousAuth()
      .then(() => setAuthReady(true))
      .catch(() => setAuthReady(true)); // don't block the app forever — local-only mode still works
  }, []);

  // Stamp this device's own session's pin/ownerUid to Firebase once auth is
  // ready, so the security rules have something to resolve a share link
  // against. Both nodes are write-once, so re-running this is a harmless
  // no-op rejection — safe to fire on every relevant render.
  useEffect(() => {
    if (!authReady || isRemoteMode || !firebaseConfigured) return;
    const uid = auth?.currentUser?.uid;
    if (uid) pushSessionOwnership(state.sessionId, state.sessionPin, uid);
  }, [authReady, isRemoteMode, state.sessionId, state.sessionPin]);

  const chooseRemoteRole = useCallback((role: "player" | "umpire") => {
    if (role === "player") {
      setRemoteRole("player");
      return;
    }
    setRemoteRoleStep("pin");
  }, []);
  const submitUmpirePin = useCallback(
    async (pin: string) => {
      if (!viewSessionId) return;
      setRemoteChecking(true);
      setRemotePinError("");
      const result = await claimUmpireAccess(viewSessionId, pin.trim());
      setRemoteChecking(false);
      if (result === "ok") setRemoteRole("umpire");
      else if (result === "unavailable") setRemotePinError("Live sync isn't available right now — try again in a moment.");
      else setRemotePinError("Incorrect PIN. Ask the organizer for the right code.");
    },
    [viewSessionId],
  );
  const backToRoleChoice = useCallback(() => {
    setRemoteRoleStep("choose");
    setRemotePinError("");
  }, []);

  // Once a role is picked, subscribe to the shared session's live data —
  // both Player and Umpire read it the same way; only write access differs.
  // Overlaying only the shared/persisted fields onto local state never
  // touches this device's own UI-only fields (active tab, open modals,
  // toast, sessionId/sessionPin identity).
  useEffect(() => {
    if (!isRemoteMode || !viewSessionId || !remoteRole || !authReady) return;
    const unsubscribe = subscribeToRemoteSession(viewSessionId, (payload) => {
      hasHydratedRef.current = true;
      setRemoteConnected(true);
      if (!payload) {
        setRemoteMissing(true);
        return;
      }
      setRemoteMissing(false);
      applyRemoteUpdate(payload);
    });
    return unsubscribe;
  }, [isRemoteMode, viewSessionId, remoteRole, authReady, applyRemoteUpdate]);

  // The organizer's own device is normally push-only — but that means an
  // Umpire editing the same session from elsewhere would have their change
  // invisible here, and silently overwritten the next time this device
  // pushes its own (stale) copy. Subscribing here too closes that gap: any
  // rev newer than what this device has authored gets merged in.
  useEffect(() => {
    if (isRemoteMode || !authReady || !firebaseConfigured) return;
    const unsubscribe = subscribeToRemoteSession(state.sessionId, (payload) => {
      hasHydratedRef.current = true;
      if (payload) applyRemoteUpdate(payload);
    });
    return unsubscribe;
  }, [isRemoteMode, authReady, state.sessionId, applyRemoteUpdate]);

  // Live match clock: a single shared ticker avoids one interval per court.
  useEffect(() => {
    const id = setInterval(() => setState((s) => ({ ...s, tick: s.tick + 1 })), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // First load with nothing set up yet (no courts) — open the New Session
  // wizard automatically instead of leaving the organizer on a blank screen.
  // Runs once on mount; closing it without finishing won't reopen it until
  // the next full page load.
  useEffect(() => {
    if (isRemoteMode) return; // joining someone else's session — never assume it needs first-time setup
    setState((s) => (s.courts.length === 0 ? { ...s, setupOpen: true, setupStep: 0 } : s));
  }, [isRemoteMode]);

  // Persist everything that must survive a refresh/crash — never the
  // transient modal/wizard/toast fields, so a reload always closes any open
  // dialog but never loses the roster, scores, or match history.
  //
  // In remote mode this device isn't the session's owner, so nothing gets
  // saved to its own localStorage — a Player never writes at all (its own
  // pushes would be rejected by the security rules anyway, see
  // database.rules.json), and an Umpire mirrors straight back to the same
  // Firebase session it's editing instead.
  useEffect(() => {
    const persisted: PersistedState = {
      players: state.players,
      matches: state.matches,
      courts: state.courts,
      completedCount: state.completedCount,
      totalEstimate: state.totalEstimate,
      sessionName: state.sessionName,
      sessionSchedule: state.sessionSchedule,
      sessionEnded: state.sessionEnded,
      sessionResultMode: state.sessionResultMode,
      requestedPairs: state.requestedPairs,
      history: state.history,
      photoReminderShown: state.photoReminderShown,
    };
    // This change arrived FROM a merge (see applyRemoteUpdate) rather than a
    // fresh local action — adopt it locally but don't push it right back to
    // Firebase (it came from there) or count it as a new revision this
    // device authored.
    if (isApplyingRemoteRef.current) {
      isApplyingRemoteRef.current = false;
      if (!isRemoteMode) save(persisted);
      return;
    }
    const rev = Math.max(localRevRef.current, lastKnownRemoteRevRef.current) + 1;
    localRevRef.current = rev;
    lastKnownRemoteRevRef.current = rev;
    if (isRemoteMode) {
      // hasHydratedRef guard: never push before this device's own
      // subscription has delivered its first callback (see the ref's
      // definition above) — otherwise this can be the still-blank state
      // from the instant Umpire access was claimed, about to overwrite the
      // real session it hasn't finished loading yet.
      if (remoteRole === "umpire" && viewSessionId && hasHydratedRef.current) pushSessionToFirebase(viewSessionId, persisted, rev);
      return;
    }
    save(persisted);
    if (!firebaseConfigured || hasHydratedRef.current) pushSessionToFirebase(state.sessionId, persisted, rev);
  }, [
    isRemoteMode,
    remoteRole,
    viewSessionId,
    state.sessionId,
    state.players,
    state.matches,
    state.courts,
    state.completedCount,
    state.totalEstimate,
    state.sessionName,
    state.sessionSchedule,
    state.sessionEnded,
    state.sessionResultMode,
    state.requestedPairs,
    state.history,
    state.photoReminderShown,
  ]);

  // Rankings/matchmaking always read this instead of state.players directly —
  // games/wins/losses/diff/trend/favPartner/toughOpp/rating are derived fresh
  // from completed matches every render rather than incrementally mutated, so
  // correcting or deleting a match can never leave a stale running total behind.
  const livePlayers = useMemo(() => recomputePlayerStats(state.players, state.matches), [state.players, state.matches]);

  const getPlayer = useCallback((id: string) => state.players.find((p) => p.id === id), [state.players]);

  const showToast = useCallback((msg: string, durationMs = 2400) => {
    clearTimeout(toastTimer.current);
    setState((s) => ({ ...s, toastMsg: msg }));
    toastTimer.current = setTimeout(() => setState((s) => ({ ...s, toastMsg: null })), durationMs);
  }, []);

  // Best-effort "take a group photo" nudge. There's no real signal for
  // "2 games left" without tracking match pace, which this app doesn't do —
  // so this uses a fixed lead time (roughly what 2 games tend to take)
  // before the schedule's parsed end time instead. Silently does nothing if
  // the schedule text doesn't contain a recognizable end time.
  const PHOTO_REMINDER_LEAD_MINUTES = 30;
  const scheduleEndTime = useMemo(() => {
    const parsed = parseScheduleEndTime(state.sessionSchedule);
    if (!parsed) return null;
    const d = new Date();
    d.setHours(parsed.hour, parsed.minute, 0, 0);
    return d;
  }, [state.sessionSchedule]);
  useEffect(() => {
    if (!scheduleEndTime || state.sessionEnded || state.courts.length === 0 || state.photoReminderShown) return;
    const leadMs = PHOTO_REMINDER_LEAD_MINUTES * 60 * 1000;
    const now = Date.now();
    const end = scheduleEndTime.getTime();
    // Window: from 30 min before the parsed end time, up to 30 min after
    // it (covers opening the app a bit late without firing a stale
    // reminder hours after the session presumably wrapped up).
    if (now >= end - leadMs && now <= end + leadMs) {
      setState((s) => ({ ...s, photoReminderShown: true }));
      showToast("About 30 minutes left — good time for a group photo!", 6000);
    }
    // Re-checks every second via the shared tick, cheaply, without needing
    // its own interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.tick, scheduleEndTime, state.sessionEnded, state.courts.length, state.photoReminderShown]);

  const isPlaying = useCallback((id: string, matches?: Match[]) => isPlayingFn(id, matches ?? state.matches), [state.matches]);

  const readyPool = useCallback(() => readyPoolFn(livePlayers, state.matches), [livePlayers, state.matches]);

  // ---- tabs -----------------------------------------------------------
  const setActiveTab = useCallback((tab: Tab) => setState((s) => ({ ...s, activeTab: tab })), []);

  // ---- scorekeeper ------------------------------------------------------
  const openScorekeeper = useCallback(
    (matchId: string) => {
      const m = state.matches.find((x) => x.id === matchId);
      if (!m) return;
      setState((s) => ({
        ...s,
        scorekeeperMatchId: matchId,
        scorekeeperT1: m.s1,
        scorekeeperT2: m.s2,
        scorekeeperHistory: [{ t1: m.s1, t2: m.s2 }],
      }));
    },
    [state.matches],
  );
  const closeScorekeeper = useCallback(() => setState((s) => ({ ...s, scorekeeperMatchId: null })), []);
  const skFocusSelect = useCallback((e: React.FocusEvent<HTMLInputElement>) => e.target.select(), []);
  const skPoint = useCallback((team: 1 | 2) => {
    setState((s) => {
      const t1 = team === 1 ? s.scorekeeperT1 + 1 : s.scorekeeperT1;
      const t2 = team === 2 ? s.scorekeeperT2 + 1 : s.scorekeeperT2;
      return { ...s, scorekeeperT1: t1, scorekeeperT2: t2, scorekeeperHistory: [...s.scorekeeperHistory, { t1, t2 }] };
    });
  }, []);
  const skSetT1 = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.max(0, Math.min(99, parseInt(e.target.value, 10) || 0));
    setState((s) => ({ ...s, scorekeeperT1: v, scorekeeperHistory: [...s.scorekeeperHistory, { t1: v, t2: s.scorekeeperT2 }] }));
  }, []);
  const skSetT2 = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.max(0, Math.min(99, parseInt(e.target.value, 10) || 0));
    setState((s) => ({ ...s, scorekeeperT2: v, scorekeeperHistory: [...s.scorekeeperHistory, { t1: s.scorekeeperT1, t2: v }] }));
  }, []);
  const skUndo = useCallback(() => {
    setState((s) => {
      if (s.scorekeeperHistory.length <= 1) return s;
      const h = s.scorekeeperHistory.slice(0, -1);
      const last = h[h.length - 1];
      return { ...s, scorekeeperHistory: h, scorekeeperT1: last.t1, scorekeeperT2: last.t2 };
    });
  }, []);
  const skSaveFinal = useCallback(() => {
    const matchId = state.scorekeeperMatchId;
    if (!matchId) return;
    // A tie can never be a genuine badminton result — guarded here too, not
    // just in the sheet's button, since this is what actually writes the
    // match. If it can't be finished, Cancel Match is the honest action.
    if (state.scorekeeperT1 === state.scorekeeperT2) {
      showToast("Scores can't tie — cancel the match instead if it can't be finished");
      return;
    }
    // Reopening an already-completed match (to fix a mis-entered score) must
    // not count it a second time — only a genuine in_progress → completed
    // transition increments the total.
    const wasCompleted = state.matches.find((m) => m.id === matchId)?.status === "completed";
    setState((s) => ({
      ...s,
      matches: s.matches.map((m) => (m.id === matchId ? { ...m, s1: s.scorekeeperT1, s2: s.scorekeeperT2, status: "completed" as const } : m)),
      completedCount: wasCompleted ? s.completedCount : s.completedCount + 1,
      scorekeeperMatchId: null,
    }));
    showToast(wasCompleted ? "Result updated" : "Result saved — court is available");
  }, [state.scorekeeperMatchId, state.matches, state.scorekeeperT1, state.scorekeeperT2, showToast]);

  // One-tap completion for the "winner only" and "no score" result modes —
  // no scorekeeper sheet at all, just record the outcome and free the
  // court. Nominal 1–0/0–1 scores for a winner call are enough for
  // win/loss and rankings math without claiming a real point total; a
  // "none" call stays 0–0, which recomputePlayerStats treats as a game
  // played with no winner (matchLogVM.isTie only reads that as an actual
  // tie for `resultMode === "score"`, so it won't be mislabeled).
  const quickWin = useCallback(
    (matchId: string, winner: "t1" | "t2") => {
      setState((s) => ({
        ...s,
        matches: s.matches.map((m) => (m.id === matchId ? { ...m, s1: winner === "t1" ? 1 : 0, s2: winner === "t2" ? 1 : 0, status: "completed" as const } : m)),
        completedCount: s.completedCount + 1,
      }));
      showToast("Result saved — court is available");
    },
    [showToast],
  );
  const quickFinish = useCallback(
    (matchId: string) => {
      setState((s) => ({
        ...s,
        matches: s.matches.map((m) => (m.id === matchId ? { ...m, s1: 0, s2: 0, status: "completed" as const } : m)),
        completedCount: s.completedCount + 1,
      }));
      showToast("Match finished — court is available");
    },
    [showToast],
  );

  // ---- match lifecycle --------------------------------------------------
  // Invariants enforced here regardless of caller: a court already running a
  // match can't start another, and a player already on a court can't be
  // placed on a second one. The suggestion engine and the manual-assign
  // modal already filter these out upstream, but every path that can start a
  // match funnels through this one function, so checking again here is what
  // actually guarantees it — not just a UI convention two callers happen to follow.
  const startMatchWithPlayers = useCallback(
    (courtId: string, ids1: [string, string], ids2: [string, string]) => {
      const allFour = [...ids1, ...ids2];
      if (new Set(allFour).size < 4) {
        showToast("Pick 4 different players");
        return;
      }
      if (state.matches.some((m) => m.status === "in_progress" && m.courtId === courtId)) {
        showToast("That court already has a match in progress");
        return;
      }
      const alreadyPlaying = allFour.find((id) => isPlayingFn(id, state.matches));
      if (alreadyPlaying) {
        const name = getPlayer(alreadyPlaying)?.name || "That player";
        showToast(name + " is already on another court");
        return;
      }
      setState((s) => {
        const four = [...ids1, ...ids2];
        const newMatch: Match = {
          id: "m" + Date.now(),
          round: 0, // vestigial — the header no longer surfaces a "round" concept
          num: s.matches.length + 1,
          courtId,
          status: "in_progress",
          t1: ids1,
          t2: ids2,
          s1: 0,
          s2: 0,
          elapsedAtTick0: -s.tick,
          resultMode: s.sessionResultMode,
          // Captured before the mutation below touches anyone, so cancelling
          // this match later can put everyone back exactly where they were.
          counterSnapshot: buildCounterSnapshot(s.players, s.matches, four),
        };
        const players = s.players.map((p) => {
          if (four.includes(p.id)) {
            const consecutiveGames = (p.consecutiveGames || 0) + 1;
            return { ...p, skipped: 0, consecutiveGames, skipNextRound: false, maxConsecutive: Math.max(p.maxConsecutive || 0, consecutiveGames) };
          }
          if (p.status === "ready" && !isPlayingFn(p.id, s.matches)) return { ...p, skipped: p.skipped + 1, consecutiveGames: 0, skipNextRound: false };
          return p;
        });
        const requestedPairs = s.requestedPairs.filter(
          ([a, b]) => !((ids1.includes(a) && ids1.includes(b)) || (ids2.includes(a) && ids2.includes(b))),
        );
        return { ...s, matches: [...s.matches, newMatch], players, requestedPairs };
      });
      showToast("Match started on Court " + courtId);
    },
    [state.matches, getPlayer, showToast],
  );

  const startMatch = useCallback(
    (courtId: string) => {
      const seed = state.suggestSeed[courtId] || 0;
      const sug = buildSuggestion(livePlayers, state.matches, state.requestedPairs, [], seed);
      if (!sug) return;
      startMatchWithPlayers(courtId, [sug.team1[0].id, sug.team1[1].id], [sug.team2[0].id, sug.team2[1].id]);
    },
    [state.suggestSeed, livePlayers, state.matches, state.requestedPairs, startMatchWithPlayers],
  );

  const rerollSuggestion = useCallback(
    (courtId: string) => {
      setState((s) => ({ ...s, suggestSeed: { ...s.suggestSeed, [courtId]: (s.suggestSeed[courtId] || 0) + 1 } }));
      showToast("New match suggested");
    },
    [showToast],
  );

  // ---- edit match ---------------------------------------------------
  // Always opens — manually assigning players is a first-class way to start
  // a match, not just a tweak on top of an auto-suggestion. When a
  // suggestion happens to exist it prefills the pickers; when there aren't
  // enough ready players for one, the pickers just start empty and the
  // organizer fills them by hand (onEditStart still validates 4 distinct
  // players before letting the match start).
  const openEdit = useCallback(
    (courtId: string) => {
      const seed = state.suggestSeed[courtId] || 0;
      const sug = buildSuggestion(livePlayers, state.matches, state.requestedPairs, [], seed);
      setState((s) => ({
        ...s,
        editCourtId: courtId,
        editT1A: sug ? sug.team1[0].id : "",
        editT1B: sug ? sug.team1[1].id : "",
        editT2A: sug ? sug.team2[0].id : "",
        editT2B: sug ? sug.team2[1].id : "",
      }));
    },
    [state.suggestSeed, livePlayers, state.matches, state.requestedPairs],
  );
  // Refills all 4 pickers with a fresh balanced suggestion — the same logic
  // behind "Shuffle", but reachable from inside the manual-assign modal so
  // organizers who opened it empty (or changed their mind) don't have to
  // pick all 4 players by hand. Bumps the seed so repeated clicks cycle
  // through different combinations rather than repeating the same one.
  const autoFillEdit = useCallback(() => {
    const courtId = state.editCourtId;
    if (!courtId) return;
    const seed = state.suggestSeed[courtId] || 0;
    const sug = buildSuggestion(livePlayers, state.matches, state.requestedPairs, [], seed);
    if (!sug) {
      showToast("Not enough ready players to auto-fill");
      return;
    }
    setState((s) => ({
      ...s,
      editT1A: sug.team1[0].id,
      editT1B: sug.team1[1].id,
      editT2A: sug.team2[0].id,
      editT2B: sug.team2[1].id,
      suggestSeed: { ...s.suggestSeed, [courtId]: (s.suggestSeed[courtId] || 0) + 1 },
    }));
  }, [state.editCourtId, state.suggestSeed, livePlayers, state.matches, state.requestedPairs, showToast]);
  const closeEdit = useCallback(() => setState((s) => ({ ...s, editCourtId: null })), []);
  const onEditStart = useCallback(() => {
    const { editCourtId, editT1A, editT1B, editT2A, editT2B } = state;
    const ids = [editT1A, editT1B, editT2A, editT2B];
    if (!editCourtId || ids.some((x) => !x) || new Set(ids).size < 4) {
      showToast("Pick 4 different players");
      return;
    }
    startMatchWithPlayers(editCourtId, [editT1A, editT1B], [editT2A, editT2B]);
    setState((s) => ({ ...s, editCourtId: null }));
  }, [state, showToast, startMatchWithPlayers]);

  // ---- roster / player state --------------------------------------------
  const checkIn = useCallback(
    (id: string) => {
      const p = getPlayer(id);
      setState((s) => ({ ...s, players: s.players.map((pl) => (pl.id === id ? { ...pl, status: "ready" as const } : pl)) }));
      showToast((p ? p.name : "Player") + " checked in");
    },
    [getPlayer, showToast],
  );
  const checkInAll = useCallback(() => {
    setState((s) => ({ ...s, players: s.players.map((p) => (p.status === "expected" ? { ...p, status: "ready" as const } : p)) }));
    showToast("Everyone checked in");
  }, [showToast]);
  const pausePlayer = useCallback(
    (id: string, reason: PauseReason = "rest") => {
      const p = getPlayer(id);
      setState((s) => ({ ...s, players: s.players.map((pl) => (pl.id === id ? { ...pl, status: "paused" as const, pauseReason: reason } : pl)) }));
      showToast((p ? p.name : "Player") + " paused");
    },
    [getPlayer, showToast],
  );
  const resumePlayer = useCallback(
    (id: string) => {
      setState((s) => ({
        ...s,
        players: s.players.map((p) => (p.id === id ? { ...p, status: "ready" as const, pauseReason: null, consecutiveGames: 0 } : p)),
      }));
      showToast("Back in the rotation");
    },
    [showToast],
  );
  const skipNext = useCallback(
    (id: string) => {
      setState((s) => ({ ...s, players: s.players.map((p) => (p.id === id ? { ...p, skipNextRound: true } : p)) }));
      showToast("Will sit out the next match, then return automatically");
    },
    [showToast],
  );
  const cancelSkip = useCallback((id: string) => {
    setState((s) => ({ ...s, players: s.players.map((p) => (p.id === id ? { ...p, skipNextRound: false } : p)) }));
  }, []);
  const leavePlayer = useCallback(
    (id: string) => {
      const p = getPlayer(id);
      setState((s) => ({ ...s, players: s.players.map((pl) => (pl.id === id ? { ...pl, status: "left" as const } : pl)) }));
      showToast((p ? p.name : "Player") + " left — stats kept");
    },
    [getPlayer, showToast],
  );
  const rejoinPlayer = useCallback(
    (id: string) => {
      setState((s) => ({ ...s, players: s.players.map((p) => (p.id === id ? { ...p, status: "ready" as const } : p)) }));
      showToast("Welcome back");
    },
    [showToast],
  );

  const onNewPlayerNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setState((s) => ({ ...s, newPlayerName: e.target.value }));
  }, []);
  const setNewPlayerLevel = useCallback((level: SkillLevel) => setState((s) => ({ ...s, newPlayerLevel: level })), []);
  const addPlayer = useCallback(
    (status: "ready" | "expected") => {
      const name = state.newPlayerName.trim();
      if (!name) return;
      // A silent duplicate (two "Budi"s, say) would split one person's
      // attendance/stats across two roster entries with no way to tell them
      // apart in a dropdown — better to ask for a quick disambiguator now
      // than untangle two players' worth of games afterward.
      if (state.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        showToast(`${name} is already on the roster — add a last initial to tell them apart`);
        return;
      }
      const player = makeBlankPlayer("p" + Date.now(), name, state.newPlayerLevel, status);
      setState((s) => ({ ...s, players: [...s.players, player], newPlayerName: "" }));
      showToast(name + (status === "expected" ? " added — checks in on arrival" : " added to the roster"));
    },
    [state.newPlayerName, state.newPlayerLevel, state.players, showToast],
  );
  const addPlayers = useCallback(
    (names: string[], status: "ready" | "expected") => {
      const trimmed = names.map((n) => n.trim()).filter(Boolean);
      if (trimmed.length === 0) return;
      const existing = new Set(state.players.map((p) => p.name.toLowerCase()));
      const seenInBatch = new Set<string>();
      const toAdd: string[] = [];
      let skipped = 0;
      for (const name of trimmed) {
        const key = name.toLowerCase();
        if (existing.has(key) || seenInBatch.has(key)) {
          skipped += 1;
          continue;
        }
        seenInBatch.add(key);
        toAdd.push(name);
      }
      setState((s) => {
        const newPlayers = toAdd.map((name, i) => makeBlankPlayer("p" + Date.now() + "_" + i, name, s.newPlayerLevel, status));
        return { ...s, players: [...s.players, ...newPlayers], newPlayerName: "" };
      });
      showToast(skipped > 0 ? `${toAdd.length} players added, ${skipped} skipped (already on roster)` : `${toAdd.length} players added`);
    },
    [state.players, showToast],
  );

  const setPlayerTier = useCallback(
    (id: string, level: SkillLevel) => {
      setState((s) => ({ ...s, players: s.players.map((p) => (p.id === id ? { ...p, level } : p)) }));
      showToast("Skill tier updated");
    },
    [showToast],
  );

  // ---- sharing ------------------------------------------------------
  const onShareRankings = useCallback(() => setState((s) => ({ ...s, shareRankingsOpen: true })), []);

  // A read-only "Player" link anyone can open to watch this session live —
  // whoever opens it later can also claim "Umpire" (full scoring) access by
  // entering `state.sessionPin`. Requires Firebase to actually be configured
  // (see firebaseConfigured); this device's own session id/pin still exist
  // without it, they just wouldn't resolve to anything live.
  const shareUrl = `${window.location.origin}${window.location.pathname}?view=${state.sessionId}`;
  const copyShareLink = useCallback(() => {
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => showToast("Live link copied"))
      .catch(() => showToast("Couldn't copy — select the link below and copy it"));
  }, [shareUrl, showToast]);
  const closeShareRankings = useCallback(() => setState((s) => ({ ...s, shareRankingsOpen: false })), []);
  const downloadRankingsImage = useCallback(async () => {
    const node = shareCardRef.current;
    const html2canvas = (await import("html2canvas")).default;
    if (!node || !html2canvas) {
      showToast("Image export unavailable");
      return;
    }
    try {
      // html2canvas can rasterize the card before its custom webfonts (the
      // display heading font especially) have actually finished loading,
      // producing doubled/ghosted glyphs in the exported PNG even though the
      // live DOM looks correct. Waiting for the Font Loading API, plus a
      // couple of paint frames for the resulting layout to settle, avoids
      // capturing mid-swap.
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      // Card's base size is a 270px-wide 9:16 frame — scale 4 lands on a
      // real 1080x1920 Instagram/WhatsApp Story resolution.
      const canvas = await html2canvas(node, { backgroundColor: "#1a1712", scale: 4 });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = "smashmatch-rankings.png";
      a.click();
      showToast("Image downloaded");
    } catch {
      showToast("Could not generate image");
    }
  }, [showToast]);

  // ---- partner requests --------------------------------------------
  const onRequestAChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => setState((s) => ({ ...s, requestA: e.target.value })), []);
  const onRequestBChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => setState((s) => ({ ...s, requestB: e.target.value })), []);
  const onAddPartnerRequest = useCallback(() => {
    const requestA = state.requestA;
    const requestB = state.requestB;
    if (!requestA || !requestB || requestA === requestB) {
      showToast("Pick two different players");
      return;
    }
    setState((s) => ({ ...s, requestedPairs: [...s.requestedPairs, [requestA, requestB]], requestA: "", requestB: "" }));
    showToast("Partner request saved");
  }, [state.requestA, state.requestB, showToast]);
  const removeRequestedPair = useCallback(
    (idx: number) => {
      setState((s) => ({ ...s, requestedPairs: s.requestedPairs.filter((_, i) => i !== idx) }));
      showToast("Partner request removed");
    },
    [showToast],
  );

  // ---- courts ---------------------------------------------------------
  const onAddCourt = useCallback(() => {
    setState((s) => {
      if (s.courts.length >= MAX_COURTS) return s;
      const n = s.courts.length + 1;
      return { ...s, courts: [...s.courts, { id: String(n), name: "Court " + n }] };
    });
    showToast("Court added");
  }, [showToast]);
  const onRemoveCourt = useCallback(() => {
    if (state.courts.length <= 1) return;
    const last = state.courts[state.courts.length - 1];
    const busy = state.matches.some((m) => m.status === "in_progress" && m.courtId === last.id);
    if (busy) {
      showToast("Finish the match on " + last.name + " first");
      return;
    }
    setState((s) => ({ ...s, courts: s.courts.slice(0, -1) }));
    showToast(last.name + " removed");
  }, [state.courts, state.matches, showToast]);

  // Temporarily takes a court out of rotation (wet floor, net down) without
  // losing it outright the way Remove would — its name/id/history stay put,
  // and it simply stops being offered a suggestion until resumed. Refuses
  // to pause a court that's mid-match, since there'd be nowhere for that
  // match to go; resuming is always allowed.
  const togglePauseCourt = useCallback(
    (courtId: string) => {
      const court = state.courts.find((c) => c.id === courtId);
      if (!court) return;
      if (!court.paused) {
        const busy = state.matches.some((m) => m.status === "in_progress" && m.courtId === courtId);
        if (busy) {
          showToast("Finish or cancel the match on " + court.name + " first");
          return;
        }
      }
      setState((s) => ({ ...s, courts: s.courts.map((c) => (c.id === courtId ? { ...c, paused: !c.paused } : c)) }));
      showToast(court.paused ? court.name + " resumed" : court.name + " paused");
    },
    [state.courts, state.matches, showToast],
  );

  // ---- session lifecycle ------------------------------------------------
  const openEndConfirm = useCallback(() => setState((s) => ({ ...s, confirmAction: "end" })), []);
  const openResetConfirm = useCallback(() => setState((s) => ({ ...s, confirmAction: "reset" })), []);
  const openDeleteMatchConfirm = useCallback(
    (matchId: string) => setState((s) => ({ ...s, confirmAction: "deleteMatch", pendingDeleteMatchId: matchId })),
    [],
  );
  const closeConfirm = useCallback(() => setState((s) => ({ ...s, confirmAction: null, pendingDeleteMatchId: null })), []);
  const confirmActionRun = useCallback(() => {
    setState((s) => {
      if (s.confirmAction === "end") {
        // Any match still in progress at end-of-session never counted toward
        // completedCount (only a genuine save-final does that), so dropping
        // it here doesn't need a completedCount adjustment — but it DOES
        // still need its rotation-fairness effects undone, same as
        // cancelling it individually would (see "deleteMatch" below).
        // Reversed newest-first so a nested unwind (two courts starting
        // close together, each recording the other's players in its own
        // snapshot) restores correctly.
        const stillActive = [...s.matches].reverse().filter((m) => m.status === "in_progress");
        const players = stillActive.reduce((acc, m) => reverseCounterSnapshot(acc, m.counterSnapshot), s.players);
        return { ...s, players, matches: s.matches.filter((m) => m.status !== "in_progress"), sessionEnded: true, confirmAction: null };
      }
      if (s.confirmAction === "reset") {
        return {
          ...s,
          matches: [],
          players: resetPlayersForNewSession(s.players),
          completedCount: 0,
          requestedPairs: [],
          suggestSeed: {},
          photoReminderShown: false,
          confirmAction: null,
        };
      }
      if (s.confirmAction === "deleteMatch") {
        const target = s.matches.find((m) => m.id === s.pendingDeleteMatchId);
        if (!target) return { ...s, confirmAction: null, pendingDeleteMatchId: null };
        return {
          ...s,
          matches: s.matches.filter((m) => m.id !== target.id),
          // A completed match already counted toward completedCount; an
          // in-progress one never did, so only back it out in that case.
          completedCount: target.status === "completed" ? Math.max(0, s.completedCount - 1) : s.completedCount,
          // Cancelling a match that never actually finished should restore
          // the rotation priority everyone had right before it started —
          // otherwise a mis-started match leaves permanent fairness drift
          // even after being cancelled. A completed match's players really
          // did play, so deleting its *result* never touches rotation state.
          players: target.status === "in_progress" ? reverseCounterSnapshot(s.players, target.counterSnapshot) : s.players,
          confirmAction: null,
          pendingDeleteMatchId: null,
          // If the deleted match happened to be open in the scorekeeper,
          // close that too rather than pointing it at a match that no longer exists.
          scorekeeperMatchId: s.scorekeeperMatchId === target.id ? null : s.scorekeeperMatchId,
        };
      }
      return s;
    });
    if (state.confirmAction === "reset") showToast("Session reset");
    if (state.confirmAction === "deleteMatch") showToast("Match deleted");
  }, [state.confirmAction, showToast]);

  const openSetup = useCallback(() => {
    setState((s) => ({
      ...s,
      setupOpen: true,
      setupStep: 0,
      // Reconfiguring an existing session (courts already set up) starts
      // from its current name/schedule so a recurring organizer can just
      // tweak the date — a brand-new setup starts blank instead.
      setupName: s.courts.length > 0 ? s.sessionName : "",
      setupSchedule: s.courts.length > 0 ? s.sessionSchedule : "",
      setupResultMode: s.sessionResultMode,
    }));
  }, []);
  const closeSetup = useCallback(() => setState((s) => ({ ...s, setupOpen: false })), []);
  const setupNext = useCallback(() => setState((s) => ({ ...s, setupStep: Math.min(3, s.setupStep + 1) as AppState["setupStep"] })), []);
  const setupBack = useCallback(() => setState((s) => ({ ...s, setupStep: Math.max(0, s.setupStep - 1) as AppState["setupStep"] })), []);
  const onSetupNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setState((s) => ({ ...s, setupName: e.target.value })), []);
  const onSetupScheduleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setState((s) => ({ ...s, setupSchedule: e.target.value })), []);
  const setSetupResultMode = useCallback((mode: ResultMode) => setState((s) => ({ ...s, setupResultMode: mode })), []);
  const finishSetup = useCallback(() => {
    setState((s) => {
      const summary = buildSessionSummary({
        id: "s" + Date.now(),
        name: s.sessionName,
        schedule: s.sessionSchedule,
        completedCount: s.completedCount,
        courtsCount: s.courts.length,
        players: recomputePlayerStats(s.players, s.matches),
      });
      return {
        ...s,
        setupOpen: false,
        setupStep: 0,
        setupName: "",
        setupSchedule: "",
        sessionEnded: false,
        sessionName: s.setupName.trim() ? s.setupName.trim() : s.sessionName,
        sessionSchedule: s.setupSchedule.trim() ? s.setupSchedule.trim() : s.sessionSchedule,
        sessionResultMode: s.setupResultMode,
        // Roster identity (name/level) and courts carry over for next time;
        // everything scoped to "this event" resets, and the outgoing
        // session's results are archived rather than silently discarded.
        players: resetPlayersForNewSession(s.players),
        matches: [],
        completedCount: 0,
        requestedPairs: [],
        suggestSeed: {},
        photoReminderShown: false,
        history: [...s.history, summary],
      };
    });
    showToast("New session started");
  }, [showToast]);
  const onStartNewFromReview = useCallback(() => {
    setState((s) => ({ ...s, sessionEnded: false }));
    openSetup();
  }, [openSetup]);

  // ------------------------------------------------------------------
  // Derived view models
  // ------------------------------------------------------------------

  const rankingsVM = useMemo<RankingEntry[]>(() => {
    const sorted = [...livePlayers].sort((a, b) => b.rating - a.rating);
    return sorted.map((p, i) => ({
      id: p.id,
      rank: i + 1,
      name: p.name,
      level: p.level,
      initials: initialsFor(p.name),
      played: p.games,
      wins: p.wins,
      losses: p.losses,
      rating: p.rating,
      diffLabel: p.diff >= 0 ? "+" + p.diff : String(p.diff),
      positiveDiff: p.diff >= 0,
      trendLabel: p.trend > 0 ? "▲" + p.trend : p.trend < 0 ? "▼" + Math.abs(p.trend) : "—",
      trend: p.trend,
      recentForm: p.recentForm,
      favPartner: p.favPartner,
      favPartnerWin: p.favPartnerWin,
      favPartnerGames: p.favPartnerGames,
      toughOpp: p.toughOpp,
      toughOppLoss: p.toughOppLoss,
      toughOppGames: p.toughOppGames,
      avgWait: p.avgWait,
      maxConsecutive: p.maxConsecutive,
      onSetLevel: (level) => setPlayerTier(p.id, level),
    }));
  }, [livePlayers, setPlayerTier]);

  // The tier-balance note names tiers, which the read-only Player view hides
  // everywhere else — so it's dropped from the reason line there.
  const hideTiers = isRemoteMode && remoteRole === "player";
  const suggestionReason = useCallback(
    (sug: Suggestion) => [...sug.reasons, ...(sug.balanceNote && !hideTiers ? [sug.balanceNote] : [])].join(" · "),
    [hideTiers],
  );

  const courtsVM = useMemo<CourtViewModel[]>(() => {
    const claimed: string[] = [];
    return state.courts.map((court) => {
      const activeMatch = state.matches.find((m) => m.status === "in_progress" && m.courtId === court.id);
      if (activeMatch) {
        const resultMode = activeMatch.resultMode ?? "score";
        // "Score needed" (the target-reached nudge) only makes sense when
        // there's a real running score to reach a target with — winner/none
        // modes complete in one tap, they never sit in that in-between state.
        const over = resultMode === "score" && isOverTarget(activeMatch.s1, activeMatch.s2);
        const t1 = teamNames(activeMatch.t1, livePlayers);
        const t2 = teamNames(activeMatch.t2, livePlayers);
        return {
          id: court.id,
          name: court.name,
          state: over ? "scoreNeeded" : "playing",
          match: {
            matchNumber: activeMatch.num,
            elapsed: formatElapsed(activeMatch, state.tick),
            t1p1: t1[0],
            t1p2: t1[1],
            t2p1: t2[0],
            t2p2: t2[1],
            s1: activeMatch.s1,
            s2: activeMatch.s2,
            resultMode,
            onEnterScore: () => openScorekeeper(activeMatch.id),
            onWinT1: () => quickWin(activeMatch.id, "t1"),
            onWinT2: () => quickWin(activeMatch.id, "t2"),
            onQuickFinish: () => quickFinish(activeMatch.id),
          },
          suggestion: null,
        };
      }
      if (court.paused) {
        return {
          id: court.id,
          name: court.name,
          state: "paused",
          suggestion: null,
          onTogglePause: () => togglePauseCourt(court.id),
        };
      }
      const seed = state.suggestSeed[court.id] || 0;
      const suggestion = buildSuggestion(livePlayers, state.matches, state.requestedPairs, claimed, seed);
      if (suggestion) claimed.push(...suggestion.four.map((p) => p.id));
      // Same pool buildSuggestion itself computes (ready, unskipped, not
      // already playing, minus whoever earlier courts already claimed) —
      // recomputed here only to report the exact shortfall when it comes
      // back empty, never to second-guess whether a suggestion exists.
      const eligibleCount = suggestion ? 0 : readyPoolFn(livePlayers, state.matches).filter((p) => !claimed.includes(p.id)).length;
      return {
        id: court.id,
        name: court.name,
        state: "available",
        suggestion: suggestion
          ? {
              team1Label: suggestion.team1.map((p) => p.name).join(" & "),
              team2Label: suggestion.team2.map((p) => p.name).join(" & "),
              reason: suggestionReason(suggestion),
              onStart: () => startMatch(court.id),
              onRegenerate: () => rerollSuggestion(court.id),
            }
          : null,
        insufficientPlayers: suggestion ? undefined : { eligibleCount, missing: Math.max(0, 4 - eligibleCount) },
        // Always available on an open court — manual assignment doesn't
        // depend on a suggestion existing.
        onEdit: () => openEdit(court.id),
        onTogglePause: () => togglePauseCourt(court.id),
      };
    });
  }, [
    state.courts,
    state.matches,
    livePlayers,
    state.suggestSeed,
    state.requestedPairs,
    state.tick,
    openScorekeeper,
    startMatch,
    rerollSuggestion,
    openEdit,
    togglePauseCourt,
    quickWin,
    quickFinish,
    suggestionReason,
  ]);

  // A preview of the next match once every court is occupied — otherwise
  // "who's up next" only ever showed up on a free court's own card, so with
  // e.g. 1 court running, waiting players had no visibility into who's next
  // until that court actually finished. Non-binding: doesn't reserve a court
  // or mark anyone as playing, just previews what buildSuggestion would pick
  // right now. Recomputes automatically as availability/results change.
  const upNext = useMemo<UpNextEntry | null>(() => {
    if (state.courts.length === 0) return null;
    const anyCourtFree = state.courts.some((c) => !c.paused && !state.matches.some((m) => m.status === "in_progress" && m.courtId === c.id));
    if (anyCourtFree) return null; // a free court's own card already shows this suggestion
    const seed = state.suggestSeed["upnext"] || 0;
    const sug = buildSuggestion(livePlayers, state.matches, state.requestedPairs, [], seed);
    if (!sug) return null;
    return {
      team1Label: sug.team1.map((p) => p.name).join(" & "),
      team2Label: sug.team2.map((p) => p.name).join(" & "),
      reason: suggestionReason(sug),
      onRegenerate: () => rerollSuggestion("upnext"),
    };
  }, [state.courts, state.matches, livePlayers, state.suggestSeed, state.requestedPairs, rerollSuggestion, suggestionReason]);

  const managePlayersVM = useMemo<ManagePlayerEntry[]>(() => {
    return [...state.players]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => {
        const playing = isPlaying(p.id);
        let statusLabel: string;
        let statusTone: ManagePlayerEntry["statusTone"] = "default";
        let actions: ManagePlayerEntry["actions"] = [];
        // "Playing" wins over every other status, including "left" — a
        // player who tapped Leave mid-match is still occupying a court
        // right now, and Manage shouldn't claim otherwise until they're done.
        if (playing) {
          statusLabel = p.status === "left" ? "On court · leaving after this game" : "On court";
          statusTone = "accent";
        } else if (p.status === "left") {
          statusLabel = "Left session";
          actions = [{ label: "Rejoin", onClick: () => rejoinPlayer(p.id) }];
        } else if (p.status === "expected") {
          statusLabel = "Not checked in";
          statusTone = "warning";
          actions = [{ label: "Check In", onClick: () => checkIn(p.id) }];
        } else if (p.status === "paused") {
          // "Resting" reads as its own state (matches how the audit's
          // Waiting/Playing/Resting/Left model names it); other pause
          // reasons are less common exceptions, so they keep the explicit label.
          statusLabel = p.pauseReason === "rest" || !p.pauseReason ? "Resting" : "Paused · " + (PAUSE_LABELS[p.pauseReason] || "Rest");
          actions = [
            { label: "Back to Waiting", onClick: () => resumePlayer(p.id) },
            { label: "Leave", onClick: () => leavePlayer(p.id) },
          ];
        } else if (p.skipNextRound) {
          statusLabel = "Sitting out next";
          statusTone = "warning";
          actions = [
            { label: "Cancel Skip", onClick: () => cancelSkip(p.id) },
            { label: "Leave", onClick: () => leavePlayer(p.id) },
          ];
        } else {
          statusLabel = "Waited " + p.skipped + (p.skipped === 1 ? " match" : " matches");
          statusTone = "warning";
          actions = [
            { label: "Skip Next", onClick: () => skipNext(p.id) },
            { label: "Rest", onClick: () => pausePlayer(p.id, "rest") },
            { label: "Leave", onClick: () => leavePlayer(p.id) },
          ];
        }
        return { id: p.id, name: p.name, level: p.level, statusLabel, statusTone, actions };
      });
  }, [state.players, isPlaying, rejoinPlayer, checkIn, resumePlayer, leavePlayer, cancelSkip, skipNext, pausePlayer]);

  const readyPlayers = useMemo(() => readyPool(), [readyPool]);
  const orderedReady = useMemo(() => playerPriority(readyPlayers), [readyPlayers]);

  const topPriorityWaiting = useMemo<TopPriorityEntry[]>(
    () =>
      orderedReady.slice(0, 3).map((p, i) => ({
        name: p.name,
        initials: initialsFor(p.name),
        level: p.level,
        reason:
          i === 0
            ? p.skipped === 0
              ? "First in line"
              : "Waited " + p.skipped + (p.skipped === 1 ? " match" : " matches") + " — top priority"
            : p.consecutiveGames >= 2
              ? p.name + " played back-to-back"
              : p.games <= 3
                ? "Only " + p.games + (p.games === 1 ? " game" : " games") + " played"
                : "Waited " + p.skipped + (p.skipped === 1 ? " match" : " matches"),
      })),
    [orderedReady],
  );

  const waitingVM = useMemo<WaitingEntry[]>(
    () =>
      orderedReady.map((p) => ({
        id: p.id,
        name: p.name,
        level: p.level,
        initials: initialsFor(p.name),
        skipped: p.skipped,
        games: p.games,
        hasStreak: p.consecutiveGames >= 2,
        consec: p.consecutiveGames,
        onSkip: () => skipNext(p.id),
        onPause: () => pausePlayer(p.id, "rest"),
      })),
    [orderedReady, skipNext, pausePlayer],
  );

  const notInRotationVM = useMemo<NotInRotationEntry[]>(() => {
    const notInRotation = state.players.filter((p) => p.status === "paused" || (p.skipNextRound && p.status === "ready" && !isPlaying(p.id)));
    return notInRotation.map((p) =>
      p.status === "paused"
        ? {
            id: p.id,
            name: p.name,
            tag: p.pauseReason === "rest" || !p.pauseReason ? "Resting" : "Paused · " + (PAUSE_LABELS[p.pauseReason] || "Rest"),
            actionLabel: "Back to Waiting",
            onAction: () => resumePlayer(p.id),
          }
        : { id: p.id, name: p.name, tag: "Sitting out next round", actionLabel: "Cancel", onAction: () => cancelSkip(p.id) },
    );
  }, [state.players, isPlaying, resumePlayer, cancelSkip]);

  const recentResultsVM = useMemo<RecentResultEntry[]>(() => {
    const completed = state.matches.filter((m) => m.status === "completed").slice(-4).reverse();
    return completed.map((m) => {
      const t1 = teamNames(m.t1, state.players);
      const t2 = teamNames(m.t2, state.players);
      const winner: "t1" | "t2" | null = m.s1 === m.s2 ? null : m.s1 > m.s2 ? "t1" : "t2";
      const resultMode = m.resultMode ?? "score";
      return { t1Names: t1.join(" & "), t2Names: t2.join(" & "), score: resultMode === "score" ? m.s1 + "–" + m.s2 : "", winner, resultMode };
    });
  }, [state.matches, state.players]);

  // A chronological log of every match this session (in-progress and
  // completed) — replaces the Matches tab's old "suggested next match"
  // cards, which just duplicated what's already on the Session tab's courts.
  const matchLogVM = useMemo<MatchLogEntry[]>(() => {
    return [...state.matches].reverse().map((m) => {
      const court = state.courts.find((c) => c.id === m.courtId);
      const t1 = teamNames(m.t1, state.players);
      const t2 = teamNames(m.t2, state.players);
      const resultMode = m.resultMode ?? "score";
      const winner: "t1" | "t2" | null = m.status === "completed" && m.s1 !== m.s2 ? (m.s1 > m.s2 ? "t1" : "t2") : null;
      return {
        id: m.id,
        courtName: court ? court.name : "Court " + m.courtId,
        matchNumber: m.num,
        status: m.status,
        t1Names: t1.join(" & "),
        t2Names: t2.join(" & "),
        score: resultMode === "score" ? m.s1 + "–" + m.s2 : "",
        winner,
        // A tie is only meaningful where there's a real score to tie with —
        // a "winner only"/"none" match's nominal 0-0/1-0 stand-ins would
        // otherwise get mislabeled as a genuine tied game.
        isTie: m.status === "completed" && m.s1 === m.s2 && resultMode === "score",
        resultMode,
        onEditScore: () => openScorekeeper(m.id),
        onDelete: () => openDeleteMatchConfirm(m.id),
      };
    });
  }, [state.matches, state.courts, state.players, openScorekeeper, openDeleteMatchConfirm]);

  const requestedPairsVM = useMemo<RequestedPairEntry[]>(
    () =>
      state.requestedPairs.map((pair, idx) => {
        const a = getPlayer(pair[0]);
        const b = getPlayer(pair[1]);
        return { label: (a ? a.name : "?") + " + " + (b ? b.name : "?"), onRemove: () => removeRequestedPair(idx) };
      }),
    [state.requestedPairs, getPlayer, removeRequestedPair],
  );

  const editablePlayers = useMemo(() => {
    const inMatch = state.editCourtId ? [state.editT1A, state.editT1B, state.editT2A, state.editT2B].map((id) => getPlayer(id)).filter((p): p is Player => Boolean(p)) : [];
    const seen = new Set<string>();
    return [...readyPlayers, ...inMatch]
      .filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({ id: p.id, name: p.name }));
  }, [readyPlayers, state.editCourtId, state.editT1A, state.editT1B, state.editT2A, state.editT2B, getPlayer]);

  const sk = state.scorekeeperMatchId ? state.matches.find((m) => m.id === state.scorekeeperMatchId) : null;
  const skT1Names = sk ? teamNames(sk.t1, state.players) : ["", ""];
  const skT2Names = sk ? teamNames(sk.t2, state.players) : ["", ""];
  const skGameOver = sk ? isOverTarget(state.scorekeeperT1, state.scorekeeperT2) : false;
  // A tie can never be a real badminton result — hard-blocked, no override.
  // A score that just hasn't reached the winning threshold yet might still
  // be a real result (an early forfeit/injury with a genuine winner), so
  // that case only gets a soft second-tap confirmation, not a hard block.
  const skIsTie = sk ? state.scorekeeperT1 === state.scorekeeperT2 : false;
  const skLikelyIncomplete = sk ? skIsTie || (state.scorekeeperT1 < 21 && state.scorekeeperT2 < 21) : false;

  const playingCount = useMemo(() => state.players.filter((p) => isPlaying(p.id)).length, [state.players, isPlaying]);
  const pausedCount = useMemo(() => state.players.filter((p) => p.status === "paused").length, [state.players]);

  // A compact "is anyone being neglected" readout — the longest-waiting
  // player and the spread between whoever's played the most vs. least, both
  // computed only from players actually in the rotation (excludes anyone not
  // yet checked in or who's left, since neither has a meaningful wait/game
  // count to compare against everyone else's).
  const sessionHealth = useMemo<SessionHealth>(() => {
    const inRotation = livePlayers.filter((p) => p.status !== "left" && p.status !== "expected");
    const longestWaiter = [...readyPlayers].sort((a, b) => b.skipped - a.skipped)[0] || null;
    const gameCounts = inRotation.map((p) => p.games);
    const gameSpread = gameCounts.length > 0 ? Math.max(...gameCounts) - Math.min(...gameCounts) : 0;
    const longestWaitMatches = longestWaiter ? longestWaiter.skipped : 0;
    return {
      longestWaitName: longestWaiter ? longestWaiter.name : null,
      longestWaitMatches,
      gameSpread,
      hasWarning: longestWaitMatches >= 2 || gameSpread >= 2,
    };
  }, [livePlayers, readyPlayers]);
  const expectedCount = useMemo(() => state.players.filter((p) => p.status === "expected").length, [state.players]);
  const activeMatchesCount = useMemo(() => state.matches.filter((m) => m.status === "in_progress").length, [state.matches]);
  const pendingDeleteMatch = state.pendingDeleteMatchId ? state.matches.find((m) => m.id === state.pendingDeleteMatchId) : null;
  const pendingDeleteCourtName = pendingDeleteMatch ? state.courts.find((c) => c.id === pendingDeleteMatch.courtId)?.name || "the court" : "";

  const shareRankingsTop = useMemo<ShareRankingEntry[]>(
    () =>
      rankingsVM.slice(0, 5).map((r) => ({
        rank: r.rank,
        name: r.name,
        initials: r.initials,
        level: r.level,
        wins: r.wins,
        losses: r.losses,
        winRate: r.wins + r.losses > 0 ? Math.round((r.wins / (r.wins + r.losses)) * 100) : 0,
      })),
    [rankingsVM],
  );

  return {
    isActiveMode: !state.sessionEnded,
    isReviewMode: state.sessionEnded,

    remote: {
      isRemoteMode,
      firebaseConfigured,
      authReady,
      role: remoteRole,
      roleStep: remoteRoleStep,
      pinError: remotePinError,
      checking: remoteChecking,
      connected: remoteConnected,
      missing: remoteMissing,
      chooseRole: chooseRemoteRole,
      submitPin: submitUmpirePin,
      back: backToRoleChoice,
    },

    header: {
      sessionName: state.sessionName,
      sessionSchedule: state.sessionSchedule,
      matchesCompleted: state.completedCount,
      // No estimate yet (fresh session), or actual play has outpaced the
      // initial one ("17/16" reads like a bug) — just show the count alone.
      matchesTotal: state.totalEstimate > 0 && state.completedCount <= state.totalEstimate ? state.totalEstimate : null,
      progressWidth: (state.totalEstimate > 0 ? Math.min(100, Math.round((state.completedCount / state.totalEstimate) * 100)) : 0) + "%",
      needsSetup: state.courts.length === 0,
      onOpenSetup: openSetup,
    },

    tabs: { active: state.activeTab, setActiveTab },

    session: {
      playersCount: state.players.length,
      courtsCount: state.courts.length,
      playingCount,
      readyWaitingCount: readyPlayers.length,
      pausedCount,
      expectedCount,
      hasExpected: expectedCount > 0,
      onCheckInAll: checkInAll,
      topPriorityWaiting,
      courtsVM,
      upNext,
      waitingVM,
      waitingCount: waitingVM.length,
      hasNotInRotation: notInRotationVM.length > 0,
      notInRotationVM,
      recentResultsVM,
      sessionHealth,
    },

    matches: { matchLogVM },

    rankings: { rankingsVM, onShareRankings },

    manage: {
      playersCount: state.players.length,
      courtsCount: state.courts.length,
      newPlayerName: state.newPlayerName,
      newPlayerLevel: state.newPlayerLevel,
      onNewPlayerNameChange,
      setNewPlayerLevel,
      onAddPlayer: () => addPlayer("ready"),
      onAddPlayers: (names: string[]) => addPlayers(names, "ready"),
      managePlayersVM,
      players: state.players,
      requestA: state.requestA,
      requestB: state.requestB,
      onRequestAChange,
      onRequestBChange,
      onAddPartnerRequest,
      hasRequestedPairs: requestedPairsVM.length > 0,
      requestedPairsVM,
      onAddCourt,
      onRemoveCourt,
      onOpenSetup: openSetup,
      onEndSession: openEndConfirm,
      onResetSession: openResetConfirm,
      resultMode: state.sessionResultMode,
      shareEnabled: firebaseConfigured,
      shareUrl,
      sessionPin: state.sessionPin,
      onCopyShareLink: copyShareLink,
    },

    scorekeeper: {
      open: !!sk,
      courtLabel: sk ? "Court " + sk.courtId : "",
      t1p1: skT1Names[0],
      t1p2: skT1Names[1],
      t2p1: skT2Names[0],
      t2p2: skT2Names[1],
      t1: state.scorekeeperT1,
      t2: state.scorekeeperT2,
      isGameOver: skGameOver,
      isLikelyIncomplete: skLikelyIncomplete,
      isTie: skIsTie,
      isEditingCompleted: sk?.status === "completed",
      addT1: () => skPoint(1),
      addT2: () => skPoint(2),
      setT1: skSetT1,
      setT2: skSetT2,
      focusSelect: skFocusSelect,
      undo: skUndo,
      saveFinal: skSaveFinal,
      close: closeScorekeeper,
      onCancelMatch: () => {
        if (state.scorekeeperMatchId) openDeleteMatchConfirm(state.scorekeeperMatchId);
      },
    },

    editMatch: {
      open: !!state.editCourtId,
      courtLabel: state.editCourtId || "",
      editablePlayers,
      t1A: state.editT1A,
      t1B: state.editT1B,
      t2A: state.editT2A,
      t2B: state.editT2B,
      onT1AChange: (e: React.ChangeEvent<HTMLSelectElement>) => setState((s) => ({ ...s, editT1A: e.target.value })),
      onT1BChange: (e: React.ChangeEvent<HTMLSelectElement>) => setState((s) => ({ ...s, editT1B: e.target.value })),
      onT2AChange: (e: React.ChangeEvent<HTMLSelectElement>) => setState((s) => ({ ...s, editT2A: e.target.value })),
      onT2BChange: (e: React.ChangeEvent<HTMLSelectElement>) => setState((s) => ({ ...s, editT2B: e.target.value })),
      onStart: onEditStart,
      onAutoFill: autoFillEdit,
      close: closeEdit,
    },

    confirm: {
      open: !!state.confirmAction,
      title:
        state.confirmAction === "end"
          ? activeMatchesCount > 0
            ? `${activeMatchesCount} match${activeMatchesCount > 1 ? "es" : ""} still in progress`
            : "End this session?"
          : state.confirmAction === "reset"
            ? "Reset this session?"
            : pendingDeleteMatch?.status === "in_progress"
              ? "Cancel this match?"
              : "Delete this result?",
      body:
        state.confirmAction === "end"
          ? activeMatchesCount > 0
            ? `${activeMatchesCount > 1 ? "They" : "It"} will be cancelled with no score saved if you end now — go back and tap "Enter Score" ` +
              `to finish ${activeMatchesCount > 1 ? "them" : "it"} first, or end anyway and cancel ${activeMatchesCount > 1 ? "them" : "it"}.`
            : "This closes the session and shows the final standings. You can start a new session afterward."
          : state.confirmAction === "reset"
            ? "Everyone stays on the roster, but all matches, scores and stats are erased and players go back to not checked in. This can't be undone."
            : pendingDeleteMatch?.status === "in_progress"
              ? `This frees up ${pendingDeleteCourtName} immediately and removes it from the match log. The score entered so far won't be saved.`
              : "This permanently removes the result from the match log and adjusts the completed count. It can't be undone.",
      actionLabel:
        state.confirmAction === "end"
          ? activeMatchesCount > 0
            ? `Cancel ${activeMatchesCount > 1 ? "Them" : "It"} & End Session`
            : "End Session"
          : state.confirmAction === "reset"
            ? "Reset Session"
            : pendingDeleteMatch?.status === "in_progress"
              ? "Cancel Match"
              : "Delete Match",
      onConfirm: confirmActionRun,
      close: closeConfirm,
    },

    setup: {
      open: state.setupOpen,
      step: state.setupStep,
      stepLabel: state.setupStep + 1,
      progressWidth: ((state.setupStep + 1) / 4) * 100 + "%",
      name: state.setupName,
      schedule: state.setupSchedule,
      onNameChange: onSetupNameChange,
      onScheduleChange: onSetupScheduleChange,
      reviewName: state.setupName.trim() || state.sessionName,
      reviewSchedule: state.setupSchedule.trim() || state.sessionSchedule,
      reviewHasHistory: state.completedCount > 0 || state.players.some((p) => p.status !== "expected"),
      reviewConsequence:
        `Starting fresh archives today's ${state.completedCount} completed ${state.completedCount === 1 ? "match" : "matches"} ` +
        `and sets all ${state.players.length} ${state.players.length === 1 ? "player" : "players"} back to not checked in.`,
      canBack: state.setupStep > 0,
      isLast: state.setupStep === 3,
      close: closeSetup,
      next: setupNext,
      back: setupBack,
      finish: finishSetup,
      playersCount: state.players.length,
      courtsCount: state.courts.length,
      newPlayerName: state.newPlayerName,
      newPlayerLevel: state.newPlayerLevel,
      onNewPlayerNameChange,
      setNewPlayerLevel,
      onAddPlayer: () => addPlayer("expected"),
      onAddPlayers: (names: string[]) => addPlayers(names, "expected"),
      onAddCourt,
      onRemoveCourt,
      resultMode: state.setupResultMode,
      onSetResultMode: setSetupResultMode,
    },

    shareRankings: {
      open: state.shareRankingsOpen,
      top: shareRankingsTop,
      sessionName: state.sessionName,
      sessionSchedule: state.sessionSchedule,
      playersCount: state.players.length,
      matchesCompleted: state.completedCount,
      close: closeShareRankings,
      download: downloadRankingsImage,
      cardRef: shareCardRef,
    },

    toast: { message: state.toastMsg },

    review: {
      sessionName: state.sessionName,
      sessionSchedule: state.sessionSchedule,
      matchesCompleted: state.completedCount,
      playersCount: state.players.length,
      courtsCount: state.courts.length,
      resultMode: state.sessionResultMode,
      rankingsVM,
      onStartNew: onStartNewFromReview,
    },
  };
}

export type SessionStore = ReturnType<typeof useSessionStore>;
