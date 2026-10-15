import type { Match, Player, SkillLevel } from "../types";

/** An A/B player who has carried a lower-tier (C or D) partner this many
 * times since their last all-A/B ("hard") game is due a hard game. */
export const HARD_GAME_AFTER_CARRIES = 2;

/** Upper tier: A or B. */
export function isUpper(level: SkillLevel | undefined): boolean {
  return level === "A" || level === "B";
}

/** Lower tier: C or D. Explicit, so a player we no longer know about
 * (deleted, no level) is neither upper nor lower. */
export function isLower(level: SkillLevel | undefined): boolean {
  return level === "C" || level === "D";
}

/** A D-free match: all four known and none in tier D. A C who has carried a D
 * partner is given one as relief (see `dCarriesSinceRelief`). */
export function isDFreeMatch(
  m: Pick<Match, "t1" | "t2">,
  levelOf: (id: string) => SkillLevel | undefined,
): boolean {
  return [...m.t1, ...m.t2].every((id) => {
    const level = levelOf(id);
    return level === "A" || level === "B" || level === "C";
  });
}

/** A hard match has all four players in the upper tier. A player we no longer
 * know about (deleted) has no level, so the match isn't hard. */
export function isHardMatch(
  m: Pick<Match, "t1" | "t2">,
  levelOf: (id: string) => SkillLevel | undefined,
): boolean {
  return [...m.t1, ...m.t2].every((id) => isUpper(levelOf(id)));
}

/** Carries since each upper player's last hard game, by current tier. Walks
 * the matches in order: any hard match (even one still on court) resets its
 * four to 0; a completed non-hard match adds 1 for each upper player whose
 * partner is lower tier (C or D). */
export function carriesSinceHard(players: Player[], matches: Match[]): Map<string, number> {
  const level = new Map(players.map((p) => [p.id, p.level] as const));
  const levelOf = (id: string) => level.get(id);
  const carries = new Map<string, number>();
  for (const p of players) if (isUpper(p.level)) carries.set(p.id, 0);

  for (const m of matches) {
    if (isHardMatch(m, levelOf)) {
      for (const id of [...m.t1, ...m.t2]) carries.set(id, 0);
      continue;
    }
    if (m.status !== "completed") continue;
    for (const team of [m.t1, m.t2]) {
      const [x, y] = team;
      if (carries.has(x) && isLower(levelOf(y))) carries.set(x, carries.get(x)! + 1);
      if (carries.has(y) && isLower(levelOf(x))) carries.set(y, carries.get(y)! + 1);
    }
  }
  return carries;
}

/** Carries since each C player's last D-free match, by current tier. The same
 * walk as `carriesSinceHard`: any D-free match (even one still on court) resets
 * its C players to 0; a completed match adds 1 for each C whose partner is a D. */
export function dCarriesSinceRelief(players: Player[], matches: Match[]): Map<string, number> {
  const level = new Map(players.map((p) => [p.id, p.level] as const));
  const levelOf = (id: string) => level.get(id);
  const carries = new Map<string, number>();
  for (const p of players) if (p.level === "C") carries.set(p.id, 0);

  for (const m of matches) {
    if (isDFreeMatch(m, levelOf)) {
      for (const id of [...m.t1, ...m.t2]) if (carries.has(id)) carries.set(id, 0);
      continue;
    }
    if (m.status !== "completed") continue;
    for (const team of [m.t1, m.t2]) {
      const [x, y] = team;
      if (carries.has(x) && levelOf(y) === "D") carries.set(x, carries.get(x)! + 1);
      if (carries.has(y) && levelOf(x) === "D") carries.set(y, carries.get(y)! + 1);
    }
  }
  return carries;
}

/** Decides whether a hard game can be planned from this pool, and who it must
 * include. `pool` is priority-ordered with back-to-back-limited players
 * already removed. Null unless the feature is on and no hard game is already
 * on court or planned. Two kinds, the upper one first:
 * - "upper": all A/B, for an A/B player who has carried a C or D partner
 *   (`carries`). Not while a C or D must play; needs 4+ upper players.
 * - "mid": a match with no D, for a C who has carried a D partner
 *   (`dCarries`). Not while a D must play; needs 4+ players in A–C. */
export function hardGamePick(args: {
  pool: Player[];
  mustPlay: Player[];
  carries: Map<string, number>;
  /** Carries of C players (see `dCarriesSinceRelief`); without it there are no "mid" games. */
  dCarries?: Map<string, number>;
  enabled: boolean;
  hardActive: boolean;
}): { forced: Player[]; candidates: Player[]; due: Player[]; kind: "upper" | "mid" } | null {
  const { pool, mustPlay, carries, dCarries, enabled, hardActive } = args;
  if (!enabled || hardActive) return null;
  const upper = upperPick(pool, mustPlay, carries);
  if (upper) return { ...upper, kind: "upper" };
  const mid = dCarries ? midPick(pool, mustPlay, dCarries) : null;
  return mid ? { ...mid, kind: "mid" } : null;
}

/** A C who has carried a D partner HARD_GAME_AFTER_CARRIES times is due a D-free match. */
function midPick(pool: Player[], mustPlay: Player[], dCarries: Map<string, number>): { forced: Player[]; candidates: Player[]; due: Player[] } | null {
  if (mustPlay.some((p) => p.level === "D")) return null;
  const candidates = pool.filter((p) => p.level === "A" || p.level === "B" || p.level === "C");
  if (candidates.length < 4) return null;
  const carriesOf = (p: Player) => dCarries.get(p.id) ?? 0;
  const due = candidates.filter((p) => p.level === "C" && carriesOf(p) >= HARD_GAME_AFTER_CARRIES).sort((a, b) => carriesOf(b) - carriesOf(a));
  if (due.length === 0) return null;
  const forced: Player[] = [];
  for (const p of [...mustPlay, ...due]) {
    if (!forced.some((f) => f.id === p.id)) forced.push(p);
  }
  return { forced: forced.slice(0, 4), candidates, due };
}

function upperPick(pool: Player[], mustPlay: Player[], carries: Map<string, number>): { forced: Player[]; candidates: Player[]; due: Player[] } | null {
  if (mustPlay.some((p) => isLower(p.level))) return null;

  const candidates = pool.filter((p) => isUpper(p.level));
  if (candidates.length < 4) return null;

  const carriesOf = (p: Player) => carries.get(p.id) ?? 0;
  // Array.prototype.sort is stable, so ties keep pool order.
  const due = candidates
    .filter((p) => carriesOf(p) >= HARD_GAME_AFTER_CARRIES)
    .sort((a, b) => carriesOf(b) - carriesOf(a));
  if (due.length === 0) return null;

  const forced: Player[] = [];
  for (const p of [...mustPlay.filter((q) => isUpper(q.level)), ...due]) {
    if (!forced.some((f) => f.id === p.id)) forced.push(p);
  }
  return { forced: forced.slice(0, 4), candidates, due };
}
