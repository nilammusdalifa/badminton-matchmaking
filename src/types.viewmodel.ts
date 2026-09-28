import type { PauseReason, ResultMode, SkillLevel } from "./types";

export interface TopPriorityEntry {
  name: string;
  initials: string;
  level: SkillLevel;
  reason: string;
}

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
  rank: number;
  name: string;
  level: SkillLevel;
  initials: string;
  played: number;
  wins: number;
  losses: number;
  rating: number;
  diffLabel: string;
  positiveDiff: boolean;
  trendLabel: string;
  trend: number;
  favPartner: string;
  favPartnerWin: number;
  favPartnerGames: number;
  toughOpp: string;
  toughOppLoss: number;
  toughOppGames: number;
  avgWait: number;
  maxConsecutive: number;
  onSetLevel: (level: SkillLevel) => void;
}

export interface ManagePlayerEntry {
  id: string;
  name: string;
  level: SkillLevel;
  statusLabel: string;
  statusTone: "default" | "warning" | "accent";
  actions: { label: string; onClick: () => void }[];
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
  winRate: number;
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
