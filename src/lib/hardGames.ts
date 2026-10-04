import type { Match, Player, SkillLevel } from "../types";

/** An A/B player who has carried a C partner this many times since their
 * last all-A/B ("hard") game is due a hard game. */
export const HARD_GAME_AFTER_CARRIES = 2;

/** Upper tier: A or B. */
export function isUpper(level: SkillLevel | undefined): boolean {
  return level === "A" || level === "B";
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
 * partner is a C. */
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
      if (carries.has(x) && levelOf(y) === "C") carries.set(x, carries.get(x)! + 1);
      if (carries.has(y) && levelOf(x) === "C") carries.set(y, carries.get(y)! + 1);
    }
  }
  return carries;
}

/** Decides whether a hard game can be planned from this pool, and who it must
 * include. `pool` is priority-ordered with back-to-back-limited players
 * already removed. Null unless the feature is on, no hard game is already on
 * court, no C is a must-play, the pool has 4+ upper players and at least one
 * is due. */
export function hardGamePick(args: {
  pool: Player[];
  mustPlay: Player[];
  carries: Map<string, number>;
  enabled: boolean;
  hardActive: boolean;
}): { forced: Player[]; candidates: Player[]; due: Player[] } | null {
  const { pool, mustPlay, carries, enabled, hardActive } = args;
  if (!enabled || hardActive) return null;
  if (mustPlay.some((p) => p.level === "C")) return null;

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
