import { describe, expect, it } from "vitest";
import type { Match, Player, SkillLevel } from "../types";
import { buildStandings, makeBlankPlayer, pickBalancedFoursome, recomputePlayerStats } from "./session";

/** Plays whole evenings with a hidden "true" skill per player and checks how
 * well the Rankings tab recovers it, through the app's own team split, stats
 * and standings. Deterministic (seeded), so a change that makes the order
 * luckier shows up as a failing number, not a flaky one.
 *
 * Two numbers per scenario, averaged over many nights:
 * - within-tier: of every two players in the same tier, how often the better
 *   one is ranked higher (50% = coin flip). Tiers are already known, so this
 *   is what the results themselves add.
 * - draw luck: rank correlation between the order and how easy each player's
 *   draws were (their pair's tiers against the other pair's). 0 = the order
 *   doesn't reward easy draws.
 *
 * Before the score (smoothed win rate → tougher matches → points share) these
 * read 69.9% / 0.234, 68.9% / 0.246 and 74.1% / 0.306; with it, 71.5% / 0.198,
 * 70.3% / 0.219 and 75.7% / 0.202. The floors and ceilings below sit just
 * past the new numbers, so the old rule fails every one of them. */

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
const BASE: Record<SkillLevel, number> = { A: 1, B: 0, C: -1, D: -2 };

/** One game to 21 (win by 2, capped at 30), rally by rally. */
function playGame(team1: number, team2: number, r: () => number): [number, number] {
  const p = 1 / (1 + Math.exp(-(team1 - team2) * 0.35));
  let a = 0;
  let b = 0;
  while (!((a >= 21 || b >= 21) && Math.abs(a - b) >= 2) && a < 30 && b < 30) {
    if (r() < p) a++;
    else b++;
  }
  return [a, b];
}

/** Spearman rank correlation between two orders of the same ids. */
function rho(a: string[], b: string[]): number {
  const pos = new Map(b.map((id, i) => [id, i]));
  const n = a.length;
  const d2 = a.reduce((s, id, i) => s + (i - pos.get(id)!) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}

/** With `tiers`, skill is drawn fresh for everyone and the "organizer" sorts
 * them into that many equal tiers from a view of it that is off by 0.4
 * standard deviations, so 3 and 4 tiers can be compared on the same skills. */
function night(n: number, courts: number, rounds: number, r: () => number, tiers?: 3 | 4): { withinTier: number; drawLuck: number; overall: number } {
  const skill = new Map<string, number>();
  let players: Player[] = Array.from({ length: n }, (_, i) => {
    const level: SkillLevel = i < n / 3 ? "A" : i < (2 * n) / 3 ? "B" : "C";
    const p = makeBlankPlayer("p" + i, "P" + String(i).padStart(2, "0"), level, "ready");
    skill.set(p.id, BASE[level] + gauss(r) * 0.5);
    return p;
  });
  if (tiers) {
    const seen = players.map((p) => {
      const s = gauss(r);
      skill.set(p.id, s);
      return { id: p.id, seen: s + gauss(r) * 0.4 };
    });
    const names: SkillLevel[] = ["A", "B", "C", "D"];
    const tierOf = new Map([...seen].sort((a, b) => b.seen - a.seen).map((x, i) => [x.id, names[Math.floor((i * tiers) / n)]]));
    players = players.map((p) => ({ ...p, level: tierOf.get(p.id)! }));
  }
  const games = new Map(players.map((p) => [p.id, 0]));
  const matches: Match[] = [];
  for (let round = 0; round < rounds; round++) {
    const pool = [...players].sort((x, y) => games.get(x.id)! - games.get(y.id)! || r() - 0.5).slice(0, courts * 4);
    pool.sort(() => r() - 0.5);
    for (let c = 0; c < courts; c++) {
      const four = pool.slice(c * 4, c * 4 + 4);
      const { team1, team2 } = pickBalancedFoursome(four);
      const strength = (t: Player[]) => skill.get(t[0].id)! + skill.get(t[1].id)!;
      const [s1, s2] = playGame(strength(team1), strength(team2), r);
      matches.push({
        id: `m${round}-${c}`,
        round,
        num: matches.length + 1,
        courtId: "c" + c,
        status: "completed",
        t1: [team1[0].id, team1[1].id],
        t2: [team2[0].id, team2[1].id],
        s1,
        s2,
        elapsedAtTick0: 0,
      });
      for (const p of four) games.set(p.id, games.get(p.id)! + 1);
    }
  }

  const stats = recomputePlayerStats(players, matches);
  const order = buildStandings(stats).rows.map((row) => row.player.id);
  const pos = new Map(order.map((id, i) => [id, i]));
  let right = 0;
  let pairs = 0;
  for (const a of players)
    for (const b of players)
      if (a.id < b.id && a.level === b.level) {
        pairs++;
        if (pos.get(a.id)! < pos.get(b.id)! === skill.get(a.id)! > skill.get(b.id)!) right++;
      }
  // oppEdge is the other pair's tiers minus their own, so the easiest draws have the lowest
  const byEasyDraws = [...stats].sort((a, b) => a.oppEdge - b.oppEdge || a.id.localeCompare(b.id)).map((p) => p.id);
  const bySkill = [...players].sort((a, b) => skill.get(b.id)! - skill.get(a.id)!).map((p) => p.id);
  return { withinTier: right / pairs, drawLuck: rho(order, byEasyDraws), overall: rho(order, bySkill) };
}

function average(n: number, courts: number, rounds: number, nights: number, tiers?: 3 | 4) {
  let withinTier = 0;
  let drawLuck = 0;
  let overall = 0;
  for (let t = 0; t < nights; t++) {
    const res = night(n, courts, rounds, rng(5000 + t), tiers);
    withinTier += res.withinTier;
    drawLuck += res.drawLuck;
    overall += res.overall;
  }
  return { withinTier: withinTier / nights, drawLuck: drawLuck / nights, overall: overall / nights };
}

describe("ranking quality on simulated nights", () => {
  const NIGHTS = 300;
  const cases: [string, number, number, number, number, number][] = [
    // label, players, courts, rounds, within-tier floor, draw-luck ceiling
    ["12 players, 6 games each", 12, 3, 6, 0.71, 0.21],
    ["16 players, 5 games each", 16, 4, 5, 0.7, 0.23],
    ["16 players, 10 games each", 16, 4, 10, 0.75, 0.22],
  ];
  for (const [label, n, courts, rounds, floor, ceiling] of cases) {
    it(`${label}: ranks same-tier players well and doesn't reward easy draws`, () => {
      const res = average(n, courts, rounds, NIGHTS);
      expect(res.withinTier).toBeGreaterThanOrEqual(floor);
      expect(res.drawLuck).toBeLessThanOrEqual(ceiling);
    });
  }
});

describe("ranking quality with a fourth tier", () => {
  // Same skills, tiers set in 3 or 4 groups. Draw luck (3 -> 4 tiers): 0.169 -> 0.084,
  // 0.142 -> 0.049, 0.090 -> 0.039. How closely the whole order follows true skill drops
  // (0.380 -> 0.290, 0.360 -> 0.296, 0.369 -> 0.287), and does so under the old win-rate
  // rule too (0.382 -> 0.313 ...): closer matches say less about who is strongest, so the
  // order leans more on who played above their tier. Asserted: draw luck falls, and the
  // order still follows skill.
  const cases: [string, number, number, number][] = [
    ["16 players, 5 games each", 16, 4, 5],
    ["8 players, 2 courts, 6 games each", 8, 2, 6],
    ["8 players, 1 court, ~6 games each", 8, 1, 12],
  ];
  for (const [label, n, courts, rounds] of cases) {
    it(`${label}: easy draws count for even less with 4 tiers`, () => {
      const three = average(n, courts, rounds, 300, 3);
      const four = average(n, courts, rounds, 300, 4);
      expect(four.drawLuck).toBeLessThan(three.drawLuck);
      expect(four.overall).toBeGreaterThan(0.25);
    });
  }
});
