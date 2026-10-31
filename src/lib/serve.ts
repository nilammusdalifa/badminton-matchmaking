/** Badminton doubles service order (BWF rules), for the scorekeeper's
 * "who serves" line. Only the court positions are tracked; the score decides
 * which side the serve comes from. */

export type Team = "t1" | "t2";

/** Who serves, and where everyone stands. `right[team]` is the index (in
 * `Match.t1` / `Match.t2`) of the player in that team's right service court. */
export interface ServeState {
  serving: Team;
  right: { t1: 0 | 1; t2: 0 | 1 };
}

const other = (team: Team): Team => (team === "t1" ? "t2" : "t1");
const flip = (i: 0 | 1): 0 | 1 => (i === 0 ? 1 : 0);

/** The umpire says who serves at `score` (0–0 at the start of a match, or
 * any score once the sheet is reopened): `server` stands on the side that
 * score serves from, right when their team's score is even, left when odd.
 * On the receiving team, index 0 stands right, a guess fixed with swapReceivers. */
export function startServe(team: Team, server: 0 | 1, score: { t1: number; t2: number } = { t1: 0, t2: 0 }): ServeState {
  const right = score[team] % 2 === 0 ? server : flip(server);
  return { serving: team, right: team === "t1" ? { t1: right, t2: 0 } : { t1: 0, t2: right } };
}

/** After a rally: when the serving team wins it, its two players swap
 * service courts. When the receivers win, they serve next and nobody moves. */
export function afterRally(s: ServeState, winner: Team): ServeState {
  if (winner !== s.serving) return { serving: winner, right: { ...s.right } };
  return { serving: s.serving, right: { ...s.right, [winner]: flip(s.right[winner]) } };
}

/** Who serves at this score: from the right on an even score of the serving
 * team, from the left on an odd one, by whoever stands on that side. */
export function serverOf(s: ServeState, score: { t1: number; t2: number }): { team: Team; player: 0 | 1; side: "right" | "left" } {
  const side = score[s.serving] % 2 === 0 ? "right" : "left";
  const player = side === "right" ? s.right[s.serving] : flip(s.right[s.serving]);
  return { team: s.serving, player, side };
}

/** Flips the receiving team's positions (a wrong guess of who receives first). */
export function swapReceivers(s: ServeState): ServeState {
  return flipTeam(s, other(s.serving));
}

function flipTeam(s: ServeState, team: Team): ServeState {
  return { serving: s.serving, right: { ...s.right, [team]: flip(s.right[team]) } };
}

/** Swap receivers applied to the scorekeeper's Undo history, so stepping
 * back past the correction doesn't bring the wrong guess back. The guess was
 * made when the server was picked, so every step since then (back to the
 * step marked `picked`, or to the first step that knows who serves) gets that
 * team flipped. That is exactly replaying from a corrected pick: no rule
 * depends on where a player stands, only on who won. Steps from before the
 * pick are left alone. */
export function swapReceiversInSteps<T extends { serve?: ServeState; picked?: boolean }>(steps: T[]): T[] {
  const latest = steps[steps.length - 1]?.serve;
  if (!latest) return steps;
  const team = other(latest.serving);
  let from = steps.length - 1;
  while (from > 0 && !steps[from].picked && steps[from - 1].serve) from--;
  return steps.map((step, i) => (i >= from && step.serve ? { ...step, serve: flipTeam(step.serve, team) } : step));
}
