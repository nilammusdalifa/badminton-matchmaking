import { describe, expect, it } from "vitest";
import type { Court, Match, Player, SkillLevel } from "../types";
import { applyMatchStart, courtSuggestions, courtsDueToPause, makeBlankPlayer, recomputePlayerStats } from "./session";

/** Plays whole evenings through the app's own matchmaking functions — the
 * same ones the Session tab uses — with random game lengths, and measures how
 * fair and varied the rotation is. Deterministic (seeded), so a regression in
 * the rotation rules shows up as a failing number, not a flaky one. */

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Scenario {
  players: number;
  /** [opens, closes] as "HH:MM" per court; closes may be omitted. */
  courts: { opens: string; closes: string }[];
}

const clock = (min: number) => new Date(2026, 8, 30, Math.floor(min / 60), min % 60, 0, 0);
const minutes = (hhmm: string) => parseInt(hhmm.slice(0, 2), 10) * 60 + parseInt(hhmm.slice(3), 10);

interface Night {
  matches: number;
  distinctFoursomes: number;
  avgDistinctPartners: number;
  gamesGap: number;
  maxInARow: number;
  maxWait: number;
}

function playNight(scenario: Scenario, random: () => number, shuffleRoster: boolean): Night {
  const levels: SkillLevel[] = ["A", "B", "C"];
  let players: Player[] = Array.from({ length: scenario.players }, (_, i) => {
    const level = levels[Math.min(2, Math.floor((i * 3) / scenario.players))];
    return makeBlankPlayer("p" + i, "P" + String(i + 1).padStart(2, "0"), level, "ready");
  });
  if (shuffleRoster) players = players.map((p) => ({ p, k: random() })).sort((a, b) => a.k - b.k).map((x) => x.p);

  let courts: Court[] = scenario.courts.map((c, i) => ({ id: String(i + 1), name: "Court " + (i + 1), closesAt: c.closes }));
  const opens = scenario.courts.map((c) => minutes(c.opens));
  let matches: Match[] = [];
  const endsAt = new Map<string, number>();
  let maxWait = 0;
  const start = Math.min(...opens);
  const latest = Math.max(...scenario.courts.map((c) => minutes(c.closes))) + 60;

  for (let t = start; t <= latest; t++) {
    const now = clock(t);
    // finish matches whose time is up
    for (const m of matches) {
      if (m.status === "in_progress" && (endsAt.get(m.id) ?? 0) <= t) {
        matches = matches.map((x) => (x.id === m.id ? { ...x, status: "completed", s1: 21, s2: Math.floor(random() * 20) } : x));
      }
    }
    // courts that have reached closing time pause themselves
    const due = courtsDueToPause(courts, matches, now).map((c) => c.id);
    if (due.length) courts = courts.map((c) => (due.includes(c.id) ? { ...c, paused: true } : c));
    // start matches on free courts that are open
    const open = courts.filter((_, i) => opens[i] <= t);
    for (;;) {
      const live = recomputePlayerStats(players, matches);
      const suggestions = courtSuggestions(open, live, matches, [], {}, now);
      const courtId = Object.keys(suggestions).find((id) => suggestions[id]);
      if (!courtId) break;
      const sug = suggestions[courtId]!;
      const ids = sug.four.map((p) => p.id);
      players = applyMatchStart(players, matches, ids);
      const match: Match = {
        id: "m" + matches.length,
        round: 0,
        num: matches.length + 1,
        courtId,
        status: "in_progress",
        t1: [sug.team1[0].id, sug.team1[1].id],
        t2: [sug.team2[0].id, sug.team2[1].id],
        s1: 0,
        s2: 0,
        elapsedAtTick0: 0,
      };
      matches = [...matches, match];
      endsAt.set(match.id, t + 14 + Math.floor(random() * 10));
      maxWait = Math.max(maxWait, ...players.map((p) => p.skipped));
    }
  }

  const finished = recomputePlayerStats(players, matches);
  const partners = new Map<string, Set<string>>();
  const foursomes = new Set<string>();
  for (const m of matches) {
    foursomes.add([...m.t1, ...m.t2].sort().join("|"));
    for (const team of [m.t1, m.t2]) {
      for (const [x, y] of [[team[0], team[1]], [team[1], team[0]]]) {
        if (!partners.has(x)) partners.set(x, new Set());
        partners.get(x)!.add(y);
      }
    }
  }
  const games = finished.map((p) => p.games);
  return {
    matches: matches.length,
    distinctFoursomes: foursomes.size,
    avgDistinctPartners: finished.reduce((sum, p) => sum + (partners.get(p.id)?.size ?? 0), 0) / finished.length,
    gamesGap: Math.max(...games) - Math.min(...games),
    maxInARow: Math.max(...players.map((p) => p.maxConsecutive)),
    maxWait,
  };
}

function summarize(scenario: Scenario, nights: number, shuffleRoster: boolean) {
  const random = rng(12345);
  const results = Array.from({ length: nights }, () => playNight(scenario, random, shuffleRoster));
  const avg = (f: (n: Night) => number) => results.reduce((s, n) => s + f(n), 0) / results.length;
  const worst = (f: (n: Night) => number) => Math.max(...results.map(f));
  const best = (f: (n: Night) => number) => Math.min(...results.map(f));
  return {
    matches: avg((n) => n.matches),
    foursomes: avg((n) => n.distinctFoursomes),
    minFoursomes: best((n) => n.distinctFoursomes),
    partners: avg((n) => n.avgDistinctPartners),
    gap: worst((n) => n.gamesGap),
    avgGap: avg((n) => n.gamesGap),
    inARow: worst((n) => n.maxInARow),
    wait: worst((n) => n.maxWait),
  };
}

const NIGHTS = 100;
const both = (open: string, close: string) => ({ opens: open, closes: close });

describe("rotation over whole evenings", () => {
  // Court A 19:00-22:00, Court B 19:00-21:00: the case that motivated the rework.
  // Before it, the same three groups of four played each other all night
  // (3 distinct foursomes, 2 partners each).
  for (const shuffled of [false, true]) {
    it(`12 players on 2 courts closing at different times${shuffled ? " (roster shuffled)" : ""}`, () => {
      const r = summarize({ players: 12, courts: [both("19:00", "22:00"), both("19:00", "21:00")] }, NIGHTS, shuffled);
      expect(r.minFoursomes).toBeGreaterThanOrEqual(10);
      expect(r.partners).toBeGreaterThan(4);
      expect(r.gap).toBeLessThanOrEqual(2);
      expect(r.inARow).toBeLessThanOrEqual(2);
      expect(r.wait).toBeLessThanOrEqual(2);
    });
  }

  it("13 players on 2 courts", () => {
    const r = summarize({ players: 13, courts: [both("19:00", "22:00"), both("19:00", "22:00")] }, NIGHTS, false);
    expect(r.gap).toBeLessThanOrEqual(2);
    expect(r.inARow).toBeLessThanOrEqual(2);
    // five wait for four places, so someone always waits an extra start
    expect(r.wait).toBeLessThanOrEqual(3);
    expect(r.minFoursomes).toBeGreaterThanOrEqual(10);
  });

  it("16 players on 3 courts", () => {
    const r = summarize({ players: 16, courts: [both("19:00", "22:00"), both("19:00", "22:00"), both("19:00", "22:00")] }, NIGHTS, false);
    expect(r.gap).toBeLessThanOrEqual(3);
    expect(r.inARow).toBeLessThanOrEqual(2);
    // a waiting player is passed over by three starts per round on three courts
    expect(r.wait).toBeLessThanOrEqual(3);
    expect(r.minFoursomes).toBeGreaterThanOrEqual(10);
  });

  it("10 players on 2 courts, one closing early", () => {
    const r = summarize({ players: 10, courts: [both("19:00", "22:00"), both("19:00", "21:00")] }, NIGHTS, false);
    expect(r.gap).toBeLessThanOrEqual(3);
    expect(r.wait).toBeLessThanOrEqual(2);
    expect(r.minFoursomes).toBeGreaterThanOrEqual(5);
    // Only two people wait while both courts run, so someone playing three in a
    // row is sometimes unavoidable; it must stay rare and short.
    expect(r.inARow).toBeLessThanOrEqual(3);
  });

  it("8 players on 2 courts all play throughout", () => {
    const r = summarize({ players: 8, courts: [both("19:00", "22:00"), both("19:00", "22:00")] }, NIGHTS, false);
    expect(r.gap).toBeLessThanOrEqual(2);
    expect(r.wait).toBeLessThanOrEqual(1);
  });
});
