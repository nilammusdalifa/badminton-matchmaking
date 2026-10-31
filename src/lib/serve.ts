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

/** The first serve of a match: `server` stands right and serves; on the
 * receiving team, index 0 stands right (fix a wrong guess with swapReceivers). */
export function startServe(team: Team, server: 0 | 1): ServeState {
  return { serving: team, right: team === "t1" ? { t1: server, t2: 0 } : { t1: 0, t2: server } };
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
  const r = other(s.serving);
  return { serving: s.serving, right: { ...s.right, [r]: flip(s.right[r]) } };
}
