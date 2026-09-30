import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MATCHES_INIT, PAUSE_LABELS, PLAYERS_INIT } from "../data/seed";
import { auth, ensureAnonymousAuth, firebaseConfigured } from "../lib/firebase";
import { claimUmpireAccess, type FirebasePayload, generateSessionPin, pushSessionOwnership, pushSessionToFirebase, subscribeToRemoteSession } from "../lib/firebaseSync";
import { load, loadIdentity, save, saveIdentity, type PersistedState } from "../lib/persistence";
import {
  applyLiveScore,
  applyMatchStart,
  buildCounterSnapshot,
  canRemovePlayer,
  buildSessionSummary,
  buildSuggestion,
  courtSuggestions,
  courtsDueToPause,
  fewPlayersHint,
  hostsHolding,
  formatElapsed,
  initialsFor,
  isCourtClosingSoon,
  isCourtKeptOpen,
  isCourtPastClosing,
  isFirstRun,
  keepCourtOpen,
  isOverTarget,
  isPlaying as isPlayingFn,
  liveScoreFor,
  makeBlankPlayer,
  nameTaken,
  photoReminderMinutes,
  scheduleEndTime,
  courtCloseReminders,
  parseClockTime,
  playerPriority,
  buildStandings,
  pointsShare,
  winRate,
  readyPool as readyPoolFn,
  recomputePlayerStats,
  resetCourtsForNewSession,
  resetPlayersForNewSession,
  resumeCourt,
  reverseCounterSnapshot,
  syncFingerprint,
  teamNames,
  withListDefaults,
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
  // What this device last pushed (or adopted from Firebase), minus live match
  // points — see syncFingerprint. Live-point-only changes are saved locally
  // but not pushed.
  const lastPushedKeyRef = useRef<string | null>(null);
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
    setState((s) => {
      const next = { ...s, ...withListDefaults(payload) };
      // A scorekeeper sheet left open on a match another device just changed
      // must show the merged points — otherwise its next +1 or Undo would
      // write the old ones back over them.
      const live = liveScoreFor(next.matches, s.scorekeeperMatchId);
      if (live && (live.s1 !== s.scorekeeperT1 || live.s2 !== s.scorekeeperT2)) {
        return { ...next, scorekeeperT1: live.s1, scorekeeperT2: live.s2, scorekeeperHistory: [{ t1: live.s1, t2: live.s2 }] };
      }
      return next;
    });
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
      else if (result === "unavailable") setRemotePinError("Live sync isn't available. Try again shortly.");
      else setRemotePinError("Wrong PIN. Ask the organizer.");
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
    setState((s) => (isFirstRun(s.players.length, s.courts.length) ? { ...s, setupOpen: true, setupStep: 0 } : s));
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
      lastPushedKeyRef.current = syncFingerprint(persisted);
      if (!isRemoteMode) save(persisted);
      return;
    }
    // Only live points on an in-progress match changed: keep them on this
    // device (and in its local save) but don't push or bump the revision —
    // see syncFingerprint.
    const key = syncFingerprint(persisted);
    if (key === lastPushedKeyRef.current) {
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
      if (remoteRole === "umpire" && viewSessionId && hasHydratedRef.current) {
        lastPushedKeyRef.current = key;
        pushSessionToFirebase(viewSessionId, persisted, rev);
      }
      return;
    }
    save(persisted);
    if (!firebaseConfigured || hasHydratedRef.current) {
      lastPushedKeyRef.current = key;
      pushSessionToFirebase(state.sessionId, persisted, rev);
    }
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

  // "Take a group photo" nudge for the last 30 minutes of the schedule. It's
  // derived from the clock each second (no stored state to fall out of sync)
  // and shown as a banner until dismissed — a passing toast is easy to miss
  // with a racket in hand. Only for devices that run the session.
  const photoMinutesLeft = photoReminderMinutes(state.sessionSchedule, new Date());
  const dismissPhotoReminder = useCallback(() => setState((s) => ({ ...s, photoReminderShown: true })), []);

  // Closing-time handling only runs on devices that run the session.
  const runsSession = !isRemoteMode || remoteRole === "umpire";
  // Only the organizer's own device may change the setup: roster tiers, courts,
  // and starting or ending sessions. An umpire runs the night, nothing more.
  const isOwner = !isRemoteMode;

  // Reminder banner for courts whose closing time is near or past. Derived
  // from the clock each second like the photo reminder.
  const courtReminders = useMemo(
    () => (state.sessionEnded || !runsSession ? [] : courtCloseReminders(state.courts, state.matches, new Date())),
    // state.tick re-evaluates the clock every second
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.courts, state.matches, state.sessionEnded, runsSession, state.tick],
  );

  // At closing time a court with nothing being played on it pauses itself, so
  // the players flow to the courts still open. A court still mid-match waits
  // for that match to finish. Pausing (not toggling) is idempotent, so an
  // organizer's and an umpire's device can both do it without fighting.
  useEffect(() => {
    if (state.sessionEnded || !runsSession) return;
    const due = courtsDueToPause(state.courts, state.matches, new Date());
    if (due.length === 0) return;
    const ids = due.map((c) => c.id);
    setState((s) => ({ ...s, courts: s.courts.map((c) => (ids.includes(c.id) ? { ...c, paused: true } : c)) }));
    showToast(due.map((c) => c.name).join(" and ") + (due.length === 1 ? " closed and is paused" : " closed and are paused"));
  }, [state.tick, state.courts, state.matches, state.sessionEnded, runsSession, showToast]);

  // One suggestion per open court, computed once per render so the court card,
  // Start Match, the manual-assign modal and auto-fill always agree on who
  // plays where.
  const suggestions = useMemo(
    () => courtSuggestions(state.courts, livePlayers, state.matches, state.requestedPairs, state.suggestSeed, new Date()),
    // state.tick moves the closing-soon cut-off along with the clock
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.courts, livePlayers, state.matches, state.requestedPairs, state.suggestSeed, state.tick],
  );

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
      return {
        ...s,
        scorekeeperT1: t1,
        scorekeeperT2: t2,
        scorekeeperHistory: [...s.scorekeeperHistory, { t1, t2 }],
        matches: applyLiveScore(s.matches, s.scorekeeperMatchId ?? "", t1, t2),
      };
    });
  }, []);
  const skSetT1 = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.max(0, Math.min(99, parseInt(e.target.value, 10) || 0));
    setState((s) => ({
      ...s,
      scorekeeperT1: v,
      scorekeeperHistory: [...s.scorekeeperHistory, { t1: v, t2: s.scorekeeperT2 }],
      matches: applyLiveScore(s.matches, s.scorekeeperMatchId ?? "", v, s.scorekeeperT2),
    }));
  }, []);
  const skSetT2 = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.max(0, Math.min(99, parseInt(e.target.value, 10) || 0));
    setState((s) => ({
      ...s,
      scorekeeperT2: v,
      scorekeeperHistory: [...s.scorekeeperHistory, { t1: s.scorekeeperT1, t2: v }],
      matches: applyLiveScore(s.matches, s.scorekeeperMatchId ?? "", s.scorekeeperT1, v),
    }));
  }, []);
  const skUndo = useCallback(() => {
    setState((s) => {
      if (s.scorekeeperHistory.length <= 1) return s;
      const h = s.scorekeeperHistory.slice(0, -1);
      const last = h[h.length - 1];
      return {
        ...s,
        scorekeeperHistory: h,
        scorekeeperT1: last.t1,
        scorekeeperT2: last.t2,
        matches: applyLiveScore(s.matches, s.scorekeeperMatchId ?? "", last.t1, last.t2),
      };
    });
  }, []);
  const skSaveFinal = useCallback(() => {
    const matchId = state.scorekeeperMatchId;
    if (!matchId) return;
    // A tie can never be a genuine badminton result — guarded here too, not
    // just in the sheet's button, since this is what actually writes the
    // match. If it can't be finished, Cancel Match is the honest action.
    if (state.scorekeeperT1 === state.scorekeeperT2) {
      showToast("Scores can't tie");
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
        const players = applyMatchStart(s.players, s.matches, four);
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
      // The very four the court card shows — not a fresh calculation that
      // ignores what earlier courts have already claimed.
      const sug = suggestions[courtId];
      if (!sug) return;
      startMatchWithPlayers(courtId, [sug.team1[0].id, sug.team1[1].id], [sug.team2[0].id, sug.team2[1].id]);
    },
    [suggestions, startMatchWithPlayers],
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
      const sug = suggestions[courtId];
      setState((s) => ({
        ...s,
        editCourtId: courtId,
        editT1A: sug ? sug.team1[0].id : "",
        editT1B: sug ? sug.team1[1].id : "",
        editT2A: sug ? sug.team2[0].id : "",
        editT2B: sug ? sug.team2[1].id : "",
      }));
    },
    [suggestions],
  );
  // Refills all 4 pickers with a fresh balanced suggestion — the same logic
  // behind "Shuffle", but reachable from inside the manual-assign modal so
  // organizers who opened it empty (or changed their mind) don't have to
  // pick all 4 players by hand. Bumps the seed so repeated clicks cycle
  // through different combinations rather than repeating the same one.
  const autoFillEdit = useCallback(() => {
    const courtId = state.editCourtId;
    if (!courtId) return;
    const sug = suggestions[courtId];
    if (!sug) {
      showToast("Not enough waiting players to auto-fill");
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
  }, [state.editCourtId, suggestions, showToast]);
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
      showToast((p ? p.name : "Player") + " is resting");
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
      showToast("Sits out the next match");
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
      if (nameTaken(state.players, name)) {
        showToast(`${name} is already on the roster. Add a last initial.`);
        return;
      }
      const player = makeBlankPlayer("p" + Date.now(), name, state.newPlayerLevel, status);
      setState((s) => ({ ...s, players: [...s.players, player], newPlayerName: "" }));
      showToast(name + (status === "expected" ? " added — check them in when they arrive" : " added to the roster"));
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
      showToast(skipped > 0 ? `${toAdd.length} added, ${skipped} already on roster` : `${toAdd.length} ${toAdd.length === 1 ? "player" : "players"} added`);
    },
    [state.players, showToast],
  );

  const setPlayerTier = useCallback(
    (id: string, level: SkillLevel) => {
      if (!isOwner) return;
      setState((s) => ({ ...s, players: s.players.map((p) => (p.id === id ? { ...p, level } : p)) }));
      showToast("Tier updated");
    },
    [isOwner, showToast],
  );

  const updatePlayer = useCallback(
    (id: string, name: string, level: SkillLevel, isHost: boolean): boolean => {
      if (!isOwner) return false;
      const trimmed = name.trim();
      if (!trimmed) return false;
      if (nameTaken(state.players, trimmed, id)) {
        showToast(`${trimmed} is already on the roster. Add a last initial.`);
        return false;
      }
      setState((s) => ({
        ...s,
        players: s.players.map((p) => {
          if (p.id !== id) return p;
          const next: Player = { ...p, name: trimmed, level };
          // an absent key, not `false` or `undefined`, for a player who isn't a host
          if (isHost) next.isHost = true;
          else delete next.isHost;
          return next;
        }),
      }));
      showToast("Player updated");
      return true;
    },
    [isOwner, state.players, showToast],
  );
  const removePlayer = useCallback(
    (id: string) => {
      const p = livePlayers.find((x) => x.id === id);
      if (!isOwner || !p || !canRemovePlayer(p, state.matches)) return;
      setState((s) => ({
        ...s,
        players: s.players.filter((x) => x.id !== id),
        requestedPairs: s.requestedPairs.filter(([a, b]) => a !== id && b !== id),
        requestA: s.requestA === id ? "" : s.requestA,
        requestB: s.requestB === id ? "" : s.requestB,
      }));
      showToast(`${p.name} removed`);
    },
    [isOwner, livePlayers, state.matches, showToast],
  );

  // ---- sharing ------------------------------------------------------
  const onShareRankings = useCallback(() => setState((s) => ({ ...s, shareRankingsOpen: true })), []);

  // A read-only "Player" link anyone can open to watch this session live —
  // whoever opens it later can also claim "Umpire" (full scoring) access by
  // entering `state.sessionPin`. Requires Firebase to actually be configured
  // (see firebaseConfigured); this device's own session id/pin still exist
  // without it, they just wouldn't resolve to anything live.
  const shareUrl = `${window.location.origin}${window.location.pathname}?view=${viewSessionId ?? state.sessionId}`;
  const copyShareLink = useCallback(() => {
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => showToast("Live link copied"))
      .catch(() => showToast("Couldn't copy. Select the link below."));
  }, [shareUrl, showToast]);
  const closeShareRankings = useCallback(() => setState((s) => ({ ...s, shareRankingsOpen: false })), []);
  const downloadRankingsImage = useCallback(async () => {
    const node = shareCardRef.current;
    const html2canvas = (await import("html2canvas")).default;
    if (!node || !html2canvas) {
      showToast("Image export isn't supported in this browser");
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
      showToast("Couldn't create the image — try again");
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
    if (!isOwner) return;
    setState((s) => {
      if (s.courts.length >= MAX_COURTS) return s;
      const n = s.courts.length + 1;
      // A new court closes when the session's schedule ends, unless told otherwise.
      const closesAt = scheduleEndTime((s.setupOpen ? s.setupSchedule.trim() : "") || s.sessionSchedule);
      return { ...s, courts: [...s.courts, closesAt ? { id: String(n), name: "Court " + n, closesAt } : { id: String(n), name: "Court " + n }] };
    });
    showToast("Court added");
  }, [isOwner, showToast]);
  const onRemoveCourt = useCallback(() => {
    if (!isOwner || state.courts.length <= 1) return;
    const last = state.courts[state.courts.length - 1];
    const busy = state.matches.some((m) => m.status === "in_progress" && m.courtId === last.id);
    if (busy) {
      showToast("Finish the match on " + last.name + " first");
      return;
    }
    setState((s) => ({ ...s, courts: s.courts.slice(0, -1) }));
    showToast(last.name + " removed");
  }, [isOwner, state.courts, state.matches, showToast]);

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
      } else if (isCourtPastClosing(court, new Date())) {
        // Resuming a court past its closing time would only pause it again on
        // the next tick; running it later takes an explicit Keep open.
        showToast(court.name + " closed at " + court.closesAt + ". Use Keep open for one more match.");
        return;
      }
      setState((s) => ({
        ...s,
        courts: s.courts.map((c) => (c.id !== courtId ? c : c.paused ? resumeCourt(c) : { ...c, paused: true })),
      }));
      showToast(court.paused ? court.name + " resumed" : court.name + " paused");
    },
    [state.courts, state.matches, showToast],
  );

  // A court's closing time: within 15 minutes of it the court stops being
  // offered new matches, and once its last match is over it pauses itself.
  // Empty (or malformed) input clears it; any change drops an earlier "keep
  // open" choice, which was about the old time.
  const setCourtClosesAt = useCallback((courtId: string, value: string) => {
    if (!isOwner) return;
    const closesAt = parseClockTime(value) === null ? undefined : value;
    setState((s) => ({
      ...s,
      courts: s.courts.map((c) => {
        if (c.id !== courtId) return c;
        const next = { ...c, closesAt };
        delete next.keepOpenFor;
        delete next.keepOpenBase;
        // an absent key, not `undefined` — Firebase rejects undefined values
        if (!closesAt) delete next.closesAt;
        return next;
      }),
    }));
  }, [isOwner]);

  // Keep open: one more match may start on this court; when it is over the
  // court closes as scheduled. Pressing it again while that match runs allows another.
  const keepOpenPastClosing = useCallback((courtId: string) => {
    setState((s) => ({ ...s, courts: s.courts.map((c) => (c.id === courtId ? keepCourtOpen(c, s.matches) : c)) }));
  }, []);

  // ---- session lifecycle ------------------------------------------------
  const openEndConfirm = useCallback(() => {
    if (isOwner) setState((s) => ({ ...s, confirmAction: "end" }));
  }, [isOwner]);
  const openResetConfirm = useCallback(() => {
    if (isOwner) setState((s) => ({ ...s, confirmAction: "reset" }));
  }, [isOwner]);
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
    if (!isOwner) return;
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
  }, [isOwner]);
  const closeSetup = useCallback(() => setState((s) => ({ ...s, setupOpen: false })), []);
  const setupNext = useCallback(
    () =>
      setState((s) => {
        const step = Math.min(3, s.setupStep + 1) as AppState["setupStep"];
        if (step !== 2) return { ...s, setupStep: step };
        // Arriving at Courts: any court without a closing time gets the schedule's end time.
        const closesAt = scheduleEndTime(s.setupSchedule.trim() || s.sessionSchedule);
        return { ...s, setupStep: step, courts: closesAt ? s.courts.map((c) => (c.closesAt ? c : { ...c, closesAt })) : s.courts };
      }),
    [],
  );
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
        // a court paused (by hand or at closing time) or kept open past its
        // closing time last session starts this one as normal
        courts: resetCourtsForNewSession(s.courts),
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

  const standings = useMemo(() => buildStandings(livePlayers, state.sessionResultMode), [livePlayers, state.sessionResultMode]);

  const rankingsVM = useMemo<RankingEntry[]>(() => {
    return standings.rows.map(({ player: p, rank, medal, fewGames }) => ({
      id: p.id,
      rank,
      medal,
      fewGames,
      name: p.name,
      level: p.level,
      initials: initialsFor(p.name),
      played: p.games,
      mostGames: standings.maxGames,
      wins: p.wins,
      losses: p.losses,
      winPct: Math.round(winRate(p) * 100),
      pointsPct: state.sessionResultMode === "score" ? Math.round(pointsShare(p) * 100) : null,
      pointsFor: p.pointsFor,
      pointsAgainst: p.pointsAgainst,
      partnersCount: p.partnersCount,
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
      onSetLevel: (level) => setPlayerTier(p.id, level),
    }));
  }, [standings, state.sessionResultMode, setPlayerTier]);

  // The tier-balance note names tiers, which the read-only Player view hides
  // everywhere else — so it's dropped from the reason line there.
  const hideTiers = isRemoteMode && remoteRole === "player";
  const suggestionReason = useCallback(
    (sug: Suggestion) => [...sug.reasons, ...(sug.balanceNote && !hideTiers ? [sug.balanceNote] : [])].join(" · "),
    [hideTiers],
  );

  const courtsVM = useMemo<CourtViewModel[]>(() => {
    const claimed: string[] = [];
    const now = new Date();
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
          closesAt: court.closesAt,
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
          closesAt: court.closesAt,
          state: "paused",
          suggestion: null,
          // Past closing time a plain resume would just pause again; the way
          // back is Keep open, for one more match.
          pastClosing: isCourtPastClosing(court, now) ? { closesAt: court.closesAt ?? "", onKeepOpen: () => keepOpenPastClosing(court.id) } : undefined,
          onTogglePause: () => togglePauseCourt(court.id),
        };
      }
      if (isCourtClosingSoon(court, state.matches, now)) {
        // Too close to closing for a new match to finish; it claims nobody, so
        // the other courts get those players. Starting anyway is the organizer's call.
        return {
          id: court.id,
          name: court.name,
          closesAt: court.closesAt,
          state: "available",
          suggestion: null,
          closingSoon: { closesAt: court.closesAt ?? "", onKeepOpen: () => keepOpenPastClosing(court.id) },
          onTogglePause: () => togglePauseCourt(court.id),
        };
      }
      const suggestion = suggestions[court.id] ?? null;
      if (suggestion) claimed.push(...suggestion.four.map((p) => p.id));
      // Same pool buildSuggestion itself computes (ready, unskipped, not
      // already playing, minus whoever earlier courts already claimed) —
      // recomputed here only to report the exact shortfall when it comes
      // back empty, never to second-guess whether a suggestion exists.
      const eligibleCount = suggestion ? 0 : readyPoolFn(livePlayers, state.matches).filter((p) => !claimed.includes(p.id)).length;
      return {
        id: court.id,
        name: court.name,
        closesAt: court.closesAt,
        state: "available",
        keptOpen: isCourtKeptOpen(court, state.matches, now),
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
    suggestions,
    state.tick,
    keepOpenPastClosing,
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
    const now = new Date();
    const anyCourtFree = state.courts.some((c) => !c.paused && !isCourtClosingSoon(c, state.matches, now) && !state.matches.some((m) => m.status === "in_progress" && m.courtId === c.id));
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
    // state.tick moves the closing-soon cut-off along with the clock
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.courts, state.matches, livePlayers, state.suggestSeed, state.requestedPairs, state.tick, rerollSuggestion, suggestionReason]);

  // Hosts wait out the first round: until every open court has started a match.
  const holdingHosts = hostsHolding(state.courts, state.matches);

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
          statusLabel = p.pauseReason === "rest" || !p.pauseReason ? "Resting" : "Resting · " + (PAUSE_LABELS[p.pauseReason] || "Rest");
          actions = [{ label: "Back to Waiting", onClick: () => resumePlayer(p.id) }];
        } else if (p.skipNextRound) {
          statusLabel = "Sitting out next";
          statusTone = "warning";
          actions = [{ label: "Cancel Sit Out", onClick: () => cancelSkip(p.id) }];
        } else {
          statusLabel = p.isHost && holdingHosts ? "Host · plays after round 1" : "Waited " + p.skipped + (p.skipped === 1 ? " match" : " matches");
          statusTone = "warning";
          actions = [{ label: "Leave", onClick: () => leavePlayer(p.id) }];
        }
        const live = livePlayers.find((x) => x.id === p.id) ?? p;
        return {
          id: p.id,
          name: p.name,
          level: p.level,
          statusLabel,
          statusTone,
          actions,
          isHost: Boolean(p.isHost),
          hostLocked: !holdingHosts,
          onSave: (name: string, level: SkillLevel, isHost: boolean) => updatePlayer(p.id, name, level, isHost),
          onRemove: canRemovePlayer(live, state.matches) ? () => removePlayer(p.id) : null,
        };
      });
  }, [state.players, state.matches, livePlayers, holdingHosts, isPlaying, rejoinPlayer, checkIn, resumePlayer, leavePlayer, cancelSkip, updatePlayer, removePlayer]);

  const readyPlayers = useMemo(() => readyPool(), [readyPool]);
  const orderedReady = useMemo(() => playerPriority(readyPlayers), [readyPlayers]);

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
        note: p.isHost && holdingHosts ? "Host · plays after round 1" : undefined,
        onSkip: () => skipNext(p.id),
        onPause: () => pausePlayer(p.id, "rest"),
      })),
    [orderedReady, holdingHosts, skipNext, pausePlayer],
  );

  const notInRotationVM = useMemo<NotInRotationEntry[]>(() => {
    const notInRotation = state.players.filter((p) => p.status === "paused" || (p.skipNextRound && p.status === "ready" && !isPlaying(p.id)));
    return notInRotation.map((p) =>
      p.status === "paused"
        ? {
            id: p.id,
            name: p.name,
            tag: p.pauseReason === "rest" || !p.pauseReason ? "Resting" : "Resting · " + (PAUSE_LABELS[p.pauseReason] || "Rest"),
            actionLabel: "Back to Waiting",
            onAction: () => resumePlayer(p.id),
          }
        : { id: p.id, name: p.name, tag: "Sitting out next match", actionLabel: "Cancel", onAction: () => cancelSkip(p.id) },
    );
  }, [state.players, isPlaying, resumePlayer, cancelSkip]);

  const recentResultsVM = useMemo<RecentResultEntry[]>(() => {
    const completed = state.matches.filter((m) => m.status === "completed").slice(-3).reverse();
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
  // Too few players for the courts open: advice, not a rule.
  const playersHint = fewPlayersHint(
    state.players.filter((p) => p.status === "ready").length,
    state.courts.filter((c) => !c.paused && !isCourtClosingSoon(c, state.matches, new Date())).length,
  );
  const activeMatchesCount = useMemo(() => state.matches.filter((m) => m.status === "in_progress").length, [state.matches]);
  const pendingDeleteMatch = state.pendingDeleteMatchId ? state.matches.find((m) => m.id === state.pendingDeleteMatchId) : null;
  const pendingDeleteCourtName = pendingDeleteMatch ? state.courts.find((c) => c.id === pendingDeleteMatch.courtId)?.name || "the court" : "";

  const shareRankingsTop = useMemo<ShareRankingEntry[]>(
    () =>
      rankingsVM
        .filter((r): r is typeof r & { rank: number } => r.rank !== null)
        .slice(0, 5)
        .map((r) => ({
          rank: r.rank,
          medal: r.medal,
          name: r.name,
          initials: r.initials,
          level: r.level,
          wins: r.wins,
          losses: r.losses,
          winPct: r.winPct,
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
      needsSetup: isFirstRun(state.players.length, state.courts.length),
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
      courtsVM,
      upNext,
      waitingVM,
      waitingCount: waitingVM.length,
      hasNotInRotation: notInRotationVM.length > 0,
      notInRotationVM,
      recentResultsVM,
      sessionHealth,
      fewPlayersHint: playersHint,
    },

    matches: {
      courtsCount: state.courts.length,
      matchLogVM,
    },

    rankings: { rankingsVM, resultMode: state.sessionResultMode, early: standings.early, onShareRankings },

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
      courtHours: state.courts.map((c) => ({ id: c.id, name: c.name, closesAt: c.closesAt ?? "" })),
      onSetCourtClosesAt: setCourtClosesAt,
      onOpenSetup: openSetup,
      onEndSession: openEndConfirm,
      onResetSession: openResetConfirm,
      resultMode: state.sessionResultMode,
      isOwner,
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
            ? `Ending now cancels ${activeMatchesCount > 1 ? "them" : "it"} with no score. Finish ${activeMatchesCount > 1 ? "them" : "it"} first, or end anyway.`
            : "Closes the session and shows final standings."
          : state.confirmAction === "reset"
            ? "Erases all matches and stats. Players stay, set to not checked in. Can't be undone."
            : pendingDeleteMatch?.status === "in_progress"
              ? `Frees ${pendingDeleteCourtName}. The score so far isn't saved.`
              : "Removes this result for good.",
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
      rosterNames: state.players.map((p) => ({ name: p.name, level: p.level })),
      reviewHasHistory: state.completedCount > 0 || state.players.some((p) => p.status !== "expected"),
      reviewConsequence:
        `Starts fresh: ${state.completedCount} ${state.completedCount === 1 ? "match" : "matches"} archived, all players set to not checked in.`,
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
      courtHours: state.courts.map((c) => ({ id: c.id, name: c.name, closesAt: c.closesAt ?? "" })),
      onSetCourtClosesAt: setCourtClosesAt,
      resultMode: state.setupResultMode,
      onSetResultMode: setSetupResultMode,
    },

    shareRankings: {
      open: state.shareRankingsOpen,
      top: shareRankingsTop,
      early: standings.early,
      sessionName: state.sessionName,
      sessionSchedule: state.sessionSchedule,
      playersCount: state.players.length,
      matchesCompleted: state.completedCount,
      close: closeShareRankings,
      download: downloadRankingsImage,
      cardRef: shareCardRef,
    },

    toast: { message: state.toastMsg },

    // Null unless this device runs the session, courts exist, it hasn't been
    // dismissed and the last 30 minutes of the schedule have started.
    photoReminder:
      photoMinutesLeft !== null && !state.photoReminderShown && !state.sessionEnded && state.courts.length > 0 && (!isRemoteMode || remoteRole === "umpire")
        ? { minutesLeft: photoMinutesLeft, onDismiss: dismissPhotoReminder }
        : null,

    courtCloseReminders: courtReminders.map((r) => ({
      courtId: r.courtId,
      message:
        r.minutesLeft > 0
          ? `${r.name} closes at ${r.closesAt} (${r.minutesLeft} min). It pauses once idle.`
          : `${r.name} closed at ${r.closesAt}. It pauses after this match.`,
      // Can't pause under a running match; it pauses by itself when that ends.
      onPause: r.busy ? null : () => togglePauseCourt(r.courtId),
      onKeepOpen: () => keepOpenPastClosing(r.courtId),
    })),

    review: {
      sessionName: state.sessionName,
      sessionSchedule: state.sessionSchedule,
      matchesCompleted: state.completedCount,
      playersCount: state.players.length,
      courtsCount: state.courts.length,
      resultMode: state.sessionResultMode,
      rankingsVM,
      onShareRankings,
      onStartNew: onStartNewFromReview,
    },
  };
}

export type SessionStore = ReturnType<typeof useSessionStore>;
