import type { PauseReason, ResultMode, SkillLevel } from "./types";

export interface WaitingEntry {
  id: string;
  name: string;
  level: SkillLevel;
  initials: string;
  skipped: number;
  games: number;
  hasStreak: boolean;
  consec: number;
  /** "Host · plays after round 1" while a host is still being held back. */
  note?: string;
  onSkip: () => void;
  onPause: () => void;
}

export interface NotInRotationEntry {
  id: string;
  name: string;
  tag: string;
  actionLabel: string;
  onAction: () => void;
}

export interface RecentResultEntry {
  t1Names: string;
  t2Names: string;
  score: string;
  winner: "t1" | "t2" | null;
  resultMode: ResultMode;
  /** Ended early: the score is shown, but it isn't anyone's win or loss. */
  notCounted: boolean;
}

export interface GamesPlayedRow {
  /** Games played, or "–" for players not checked in. */
  games: string;
  text: string;
  /** Where a single player is right now ("waiting", "left", …); null on a grouped line. */
  status: string | null;
  /** Two or more games behind the busiest player. */
  warn: boolean;
}

export interface GamesPlayedVM {
  rows: GamesPlayedRow[];
  average: number;
  /** Players 2+ games behind (not counting anyone who left). */
  behind: number;
}

export interface CourtViewModel {
  id: string;
  name: string;
  /** "HH:MM" this court closes, when one was set. */
  closesAt?: string;
  /** Set on an open court too close to its closing time to start a match:
   * no suggestion is offered, and `onKeepOpen` overrides that. */
  closingSoon?: { closesAt: string; onKeepOpen: () => void };
  /** Set on a paused court whose closing time has passed: resuming would only
   * pause it again, so the card offers Keep open (one more match) instead. */
  pastClosing?: { closesAt: string; onKeepOpen: () => void };
  /** Open past its closing window on the organizer's say-so, with one more match to start. */
  keptOpen?: boolean;
  state: "playing" | "scoreNeeded" | "available" | "paused";
  match?: {
    matchNumber: number;
    elapsed: string;
    t1p1: string;
    t1p2: string;
    t2p1: string;
    t2p2: string;
    s1: number;
    s2: number;
    resultMode: ResultMode;
    onEnterScore: () => void;
    onWinT1: () => void;
    onWinT2: () => void;
    onQuickFinish: () => void;
  };
  suggestion?: {
    team1Label: string;
    team2Label: string;
    reason: string;
    onStart: () => void;
    onRegenerate: () => void;
  } | null;
  /** Only meaningful when the court is available and `suggestion` is null —
   * how many eligible players are left for THIS court once earlier courts'
   * own suggestions have already claimed theirs, and how many more are
   * needed to reach four. Lets the empty state say "Need 1 more player"
   * instead of a generic "not enough players". */
  insufficientPlayers?: { eligibleCount: number; missing: number };
  /** Present whenever the court is available — lets the organizer assign
   * players by hand instead of accepting/shuffling the auto-suggestion,
   * and still works even when there aren't enough ready players for one. */
  onEdit?: () => void;
  /** Present whenever the court isn't mid-match — pauses it (available) or
   * resumes it (paused). Absent while playing/scoreNeeded, since there's
   * nowhere for that match to go. */
  onTogglePause?: () => void;
}

export interface RankingEntry {
  id: string;
  /** Position in the list; null for a player who hasn't played yet — they aren't ranked. */
  rank: number | null;
  /** 1–3 for a medal, when the player qualifies for one (see buildStandings). */
  medal: 1 | 2 | 3 | null;
  /** Which part of the list: ranked, "not enough games yet" or "not ranked". */
  section: "ranked" | "tooFew" | "notRanked";
  /** Counts in the rankings (false for a host or guest switched out). */
  inRankings: boolean;
  /** Set for the organizer only: switch this player in or out of the rankings. */
  onToggleCounted: (() => void) | null;
  name: string;
  level: SkillLevel;
  initials: string;
  /** Games whose result counts — what the record and the rank are built on. */
  played: number;
  /** The most games anyone ranked has played, for "Played 2 of 5". */
  mostGames: number;
  wins: number;
  losses: number;
  /** Smoothed win rate as a whole percentage — the number the order is decided on. */
  winPct: number;
  /** Smoothed share of points won, as a whole percentage; null when scores aren't recorded. */
  pointsPct: number | null;
  pointsFor: number;
  pointsAgainst: number;
  partnersCount: number;
  diffLabel: string;
  positiveDiff: boolean;
  trendLabel: string;
  trend: number;
  recentForm: number[];
  favPartner: string;
  favPartnerWin: number;
  favPartnerGames: number;
  toughOpp: string;
  toughOppLoss: number;
  toughOppGames: number;
  onSetLevel: (level: SkillLevel) => void;
}

export interface ManagePlayerEntry {
  id: string;
  name: string;
  level: SkillLevel;
  statusLabel: string;
  statusTone: "default" | "warning" | "accent";
  /** The state changes that fit where the player is right now. */
  actions: { label: string; onClick: () => void }[];
  isHost: boolean;
  inRankings: boolean;
  /** "3 games" — every game played, counted or not. */
  gamesLabel: string;
  /** Round 1 has started, so a host flag set now would change nothing this session. */
  hostLocked: boolean;
  /** False when the change was refused (blank or duplicate name), so the editor stays open. */
  onSave: (name: string, level: SkillLevel, isHost: boolean, inRankings: boolean) => boolean;
  /** Null while the player has games or matches on record. */
  onRemove: (() => void) | null;
}

export interface RequestedPairEntry {
  label: string;
  onRemove: () => void;
}

export interface ShareRankingEntry {
  rank: number;
  medal: 1 | 2 | 3 | null;
  name: string;
  initials: string;
  level: SkillLevel;
  wins: number;
  losses: number;
  winPct: number;
}

export interface EditablePlayerOption {
  id: string;
  name: string;
}

export interface ScorekeeperViewModel {
  open: boolean;
  courtLabel: string;
  t1p1: string;
  t1p2: string;
  t2p1: string;
  t2p2: string;
  t1: number;
  t2: number;
  isGameOver: boolean;
  isLikelyIncomplete: boolean;
  isEditingCompleted: boolean;
}

export interface MatchLogEntry {
  id: string;
  courtName: string;
  matchNumber: number;
  status: "in_progress" | "completed";
  t1Names: string;
  t2Names: string;
  score: string;
  winner: "t1" | "t2" | null;
  /** True only for a completed match with an equal score — distinguishes a
   * genuine tie from an in-progress match, which also has `winner: null`. */
  isTie: boolean;
  resultMode: ResultMode;
  /** Stopped early and not counted towards anyone's record. */
  notCounted: boolean;
  onEditScore: () => void;
  onDelete: () => void;
}

export interface UpNextEntry {
  team1Label: string;
  team2Label: string;
  reason: string;
  onRegenerate: () => void;
}

export interface SessionHealth {
  longestWaitName: string | null;
  longestWaitMatches: number;
  gameSpread: number;
  hasWarning: boolean;
}

export interface EditMatchViewModel {
  open: boolean;
  courtLabel: string;
  editablePlayers: EditablePlayerOption[];
  t1A: string;
  t1B: string;
  t2A: string;
  t2B: string;
  onAutoFill: () => void;
}

export interface SetupViewModel {
  open: boolean;
  step: 0 | 1 | 2 | 3;
  stepLabel: number;
  progressWidth: string;
  name: string;
  schedule: string;
  reviewName: string;
  reviewSchedule: string;
  canBack: boolean;
  isLast: boolean;
}

export interface ConfirmViewModel {
  open: boolean;
  title: string;
  body: string;
  actionLabel: string;
}

export type { PauseReason };
