import { copy } from "./copy";

/** 1 -> "1st", 11 -> "11th", 22 -> "22nd". */
export const ordinal = (n: number): string => {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10 > 3 ? 0 : n % 10]}`;
};

export interface YouStatusInput {
  /** The queue order shown to everyone. */
  waitingIds: string[];
  /** The four ids of each plan item; 0 is "Up next". */
  plannedIds: string[][];
  /** The court they are playing on, or null. */
  playingCourt: string | null;
  resting: boolean;
  ended: boolean;
  /** Why the plan skipped them, when the plan says so. */
  reason?: string;
}

/** The one line a viewer sees about themselves, or null when there is nothing to say. */
export function youStatus(youId: string, input: YouStatusInput): string | null {
  const { waitingIds, plannedIds, playingCourt, resting, ended, reason } = input;
  if (playingCourt) return copy.session.youPlaying(playingCourt);
  if (ended) return null;
  if (plannedIds[0]?.includes(youId)) return copy.session.youInNext;
  if (plannedIds.some((item) => item.includes(youId))) return copy.session.youInMatchAfter;

  const index = waitingIds.indexOf(youId);
  if (index >= 0) {
    const planned = new Set(plannedIds.flat());
    const passedOver = waitingIds.slice(index + 1).some((id) => planned.has(id));
    if (passedOver) return copy.session.youPassed(ordinal(index + 1), reason ?? copy.session.passedGeneric);
    return index === 0 ? copy.session.youNext : copy.session.youPosition(ordinal(index + 1));
  }
  return resting ? copy.session.youResting : null;
}
