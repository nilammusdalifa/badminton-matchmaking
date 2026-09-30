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
}

export interface CourtViewModel {
  id: string;
  name: string;
  /** "HH:MM" this court closes, when one was set. */
  closesAt?: string;
  /** Set on an open court too close to its closing time to start a match:
   * no suggestion is offered, and `onKeepOpen` overrides that. */
  closingSoon?: { closesAt: string; onKeepOpen: () => void };
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
  /** null for a player who hasn't played yet — they aren't ranked. */
  rank: number | null;
  name: string;
  level: SkillLevel;
  initials: string;
  played: number;
  wins: number;
  losses: number;
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
  /** At most one: the state change that fits where the player is right now. */
  actions: { label: string; onClick: () => void }[];
  /** False when the change was refused (blank or duplicate name), so the editor stays open. */
  onSave: (name: string, level: SkillLevel) => boolean;
  /** Null while the player has games or matches on record. */
  onRemove: (() => void) | null;
}

export interface RequestedPairEntry {
  label: string;
  onRemove: () => void;
}

export interface ShareRankingEntry {
  rank: number;
  name: string;
  initials: string;
  level: SkillLevel;
  wins: number;
  losses: number;
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
