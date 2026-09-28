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
  games: number;
  wins: number;
  losses: number;
  diff: number;
  rating: number;
  trend: number;
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
}

export interface Suggestion {
  team1: [Player, Player];
  team2: [Player, Player];
  four: Player[];
  reasons: string[];
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
