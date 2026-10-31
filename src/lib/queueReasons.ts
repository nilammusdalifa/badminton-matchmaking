import type { Match, Player, QueueItem } from "../types";
import { copy } from "./copy";
import { groupCost, MAX_CONSECUTIVE, pairCounts, playerPriority, SINGLE_COURT_WAIT_WEIGHT } from "./session";

/** Why a waiting player is where they are in the plan (texts in `copy.session.why`). */
export type QueueReason = "next" | "after" | "streak" | "host" | "request" | "relief" | "manual" | "mix" | "fair" | "balance" | "courtMix";

const idsOf = (item: Pick<QueueItem, "team1" | "team2">): string[] => [...item.team1, ...item.team2];

/** A reason for every waiting player, by id. Rules, in order, for X at index i of `ordered`:
 *  1. In `plan[0]` → `next`; in a later item → `after`.
 *  2. Nobody after X is planned → null (a plain wait).
 *  3. Played `MAX_CONSECUTIVE` in a row → `streak`.
 *  4. A host while hosts are held back → `host`.
 *  5. k = the first plan item holding someone after X. Shuffled (seed) or set
 *     by the umpire → `manual`; a hard or D-free match → `relief`; a requested
 *     pair is a team in it → `request`; k ≥ 1 → `courtMix`.
 *  6. k = 0: X swapped in for the last of `plan[0]` by priority, costed as
 *     `pickFour` does (`groupCost`). Costs more: `mix` when the extra
 *     familiarity weighs at least as much as the extra spread, else `fair`.
 *     Costs the same or less: `balance`.
 * Rules 3–6 always give a reason, so a passed-over player always has one.
 * Deterministic: the same inputs always give the same reasons. */
export function queueReasons(args: {
  ordered: Player[];
  plan: QueueItem[];
  matches: Match[];
  requestedPairs: [string, string][];
  holdingHosts: boolean;
  singleCourt: boolean;
}): Map<string, QueueReason | null> {
  const { ordered, plan, matches, requestedPairs, holdingHosts, singleCourt } = args;
  const planned = plan.map(idsOf);
  const meet = pairCounts(matches).meet;
  const out = new Map<string, QueueReason | null>();

  const reasonFor = (x: Player, i: number): QueueReason | null => {
    const at = planned.findIndex((ids) => ids.includes(x.id));
    if (at === 0) return "next";
    if (at > 0) return "after";
    const below = new Set(ordered.slice(i + 1).map((p) => p.id));
    const k = planned.findIndex((ids) => ids.some((id) => below.has(id)));
    if (k === -1) return null;
    if (x.consecutiveGames >= MAX_CONSECUTIVE) return "streak";
    if (x.isHost && holdingHosts) return "host";

    const item = plan[k];
    if (item.seed !== 0 || item.reasons.includes(copy.reason.setByUmpire)) return "manual";
    if (item.hard || item.noD) return "relief";
    const isTeam = (team: [string, string], [a, b]: [string, string]) => team.includes(a) && team.includes(b);
    if (requestedPairs.some((pair) => isTeam(item.team1, pair) || isTeam(item.team2, pair))) return "request";
    if (k >= 1) return "courtMix";

    const byId = new Map(ordered.map((p) => [p.id, p]));
    const four = planned[0].flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    // every planned player is waiting, so this holds; a plain answer if it ever doesn't
    if (four.length < 4) return "balance";
    const last = playerPriority(four)[3];
    const swapped = four.map((p) => (p.id === last.id ? x : p));
    const minGames = Math.min(...[...ordered, ...four].map((p) => p.games));
    const waitWeight = singleCourt ? SINGLE_COURT_WAIT_WEIGHT : 1;
    const f = groupCost(four, meet, minGames, waitWeight);
    const g = groupCost(swapped, meet, minGames, waitWeight);
    if (g.cost <= f.cost) return "balance";
    return 8 * (g.familiarity - f.familiarity) >= 6 * (g.spread - f.spread) ? "mix" : "fair";
  };

  ordered.forEach((p, i) => out.set(p.id, reasonFor(p, i)));
  return out;
}
