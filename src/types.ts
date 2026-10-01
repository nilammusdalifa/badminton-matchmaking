export type SkillLevel = "A" | "B" | "C";
export type PlayerStatus = "expected" | "ready" | "paused" | "left";
export type PauseReason = "rest" | "host" | "break" | "injury" | "other";
export type MatchStatus = "in_progress" | "completed";
export type Tab = "session" | "matches" | "rankings" | "manage";
/** How this session records a result: a real numeric score, just a
 * winning team, or nothing at all beyond "this match happened". Chosen once
 * at setup, stamped onto every match created under it. */
export type ResultMode = "score" | "winner" | "none";

export interface Player {
  id: string;
  name: string;
  level: SkillLevel;
  /** Every completed match they played, whether or not its result counts:
   * rotation (who is due next) works from this. */
  games: number;
  /** Games whose result counts (not "ended early"): what rankings use. */
  rankGames: number;
  wins: number;
  losses: number;
  diff: number;
  /** Points scored / conceded across completed matches (real scores only). */
  pointsFor: number;
  pointsAgainst: number;
  /** How many different partners they have had. */
  partnersCount: number;
  rating: number;
  trend: number;
  /** Last 5 completed (non-tie) match results, oldest first: 1 = win, -1 =
   * loss. Same derive-fresh-every-time treatment as `trend` — a short form
   * streak for display, not a value anything else reads. */
  recentForm: number[];
  status: PlayerStatus;
  skipped: number;
  consecutiveGames: number;
  skipNextRound: boolean;
  pauseReason: PauseReason | null;
  favPartner: string;
  favPartnerWin: number;
  favPartnerGames: number;
  toughOpp: string;
  toughOppLoss: number;
  toughOppGames: number;
  avgWait: number;
  maxConsecutive: number;
  /** A host sits out the first round (one match on every open court), then
   * joins the rotation normally. Saved with the player, so it carries over
   * to the next session. Missing means not a host. */
  isHost?: boolean;
  /** False for a player who plays but shouldn't compete for a place (a host,
   * a guest). Saved with the player. Missing means counted. */
  inRankings?: boolean;
  /** Set while they are on court: what to do the moment their match is saved
   * or cancelled. */
  afterMatch?: "rest" | "left";
}

/** A player's rotation-fairness fields, captured just before a match-start
 * touches them — see `Match.counterSnapshot`. */
export interface CounterSnapshot {
  skipped: number;
  consecutiveGames: number;
  skipNextRound: boolean;
  maxConsecutive: number;
}

export interface Match {
  id: string;
  round: number;
  num: number;
  courtId: string;
  status: MatchStatus;
  t1: [string, string];
  t2: [string, string];
  s1: number;
  s2: number;
  /** Seconds of elapsed time already on the clock at tick 0; combined with
   * the global `tick` counter to derive a live-updating match clock without
   * a per-match timer. */
  elapsedAtTick0: number;
  /** Stamped from the session's setting at the moment this match was
   * started — a mode change mid-session only affects matches created after
   * it, never rewrites history. Missing on matches persisted before this
   * field existed, which is exactly what "score" (the original, only,
   * behavior) means for them. */
  resultMode?: ResultMode;
  /** Stopped before it finished (injury, time up). The score so far is kept. */
  endedEarly?: boolean;
  /** False when the result is kept for the log but doesn't count towards
   * wins, losses, points or rankings. The match still counts as a game
   * played for rotation. Missing means counted. */
  counted?: boolean;
  /** Every player's skipped/consecutiveGames/skipNextRound/maxConsecutive
   * right before this match started touched them (the four joining players,
   * plus every other ready player whose skipped count bumped). Cancelling
   * this match while still in_progress restores these — otherwise a
   * mistakenly started match leaves permanent fairness drift behind even
   * after being cancelled. Not meaningful once a match completes for real,
   * so never applied to a completed match's deletion. */
  counterSnapshot?: Record<string, CounterSnapshot>;
}

export interface Court {
  id: string;
  name: string;
  /** Temporarily out of rotation (wet floor, net down, etc.) — keeps its
   * identity/history instead of being removed outright. Undefined and
   * `false` both mean "active"; optional so courts persisted before this
   * field existed still load correctly. */
  paused?: boolean;
  /** When this court's booking ends, as "HH:MM" (24-hour, what a time input
   * yields). Within 15 minutes of it the court stops being offered new
   * matches, and once its last match is over it pauses itself. Missing means
   * no closing time was set. */
  closesAt?: string;
  /** The `closesAt` value the organizer chose to run this court past, for
   * one more match (see `keepOpenBase`). Changing `closesAt` drops it. */
  keepOpenFor?: string;
  /** How many matches had been started on this court when it was kept open.
   * Keeping open allows exactly one more: once a match beyond this count has
   * started, the court closes normally when that match is over. */
  keepOpenBase?: number;
}

/** A match planned ahead and locked: it starts exactly as shown, on whichever
 * court frees first. Built by `planQueue`, kept until it starts (or until a
 * player in it is no longer available). */
export interface QueueItem {
  team1: [string, string];
  team2: [string, string];
  /** Shuffle bumps this to re-pick the match. */
  seed: number;
  reasons: string[];
  balanceNote: string | null;
}

export interface Suggestion {
  team1: [Player, Player];
  team2: [Player, Player];
  four: Player[];
  reasons: string[];
  /** Tier-split explanation, kept apart from `reasons` so the read-only
   * Player view (which hides tiers) can leave it out. Null when teams were
   * fixed by a partner request rather than balanced by tier. */
  balanceNote: string | null;
  /** Set when this came from the locked queue (position in it) rather than a fresh pick. */
  queueIndex?: number;
}

export interface SessionHistoryEntry {
  id: string;
  name: string;
  schedule: string;
  endedAt: string;
  completedCount: number;
  playersCount: number;
  courtsCount: number;
  topRankings: { rank: number; name: string; wins: number; losses: number }[];
}
