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
  /** The last `count` players check in at `at` instead of at the start. */
  late?: { count: number; at: string };
  /** The first `count` players are hosts. "flag" marks them isHost; "checkin"
   * checks them in only once every open court has started its first match. */
  hosts?: { count: number; mode: "flag" | "checkin" };
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
  /** Longest wait seen once only one court was left running. */
  waitOneCourt: number;
  hostGames: number;
  hostFirstStart: number;
  otherGames: number;
}

function playNight(scenario: Scenario, random: () => number, shuffleRoster: boolean): Night {
  const levels: SkillLevel[] = ["A", "B", "C"];
  const hostCount = scenario.hosts?.count ?? 0;
  const lateFrom = scenario.players - (scenario.late?.count ?? 0);
  let players: Player[] = Array.from({ length: scenario.players }, (_, i) => {
    const level = levels[Math.min(2, Math.floor((i * 3) / scenario.players))];
    const p = makeBlankPlayer("p" + i, "P" + String(i + 1).padStart(2, "0"), level, i >= lateFrom || (i < hostCount && scenario.hosts?.mode === "checkin") ? "expected" : "ready");
    if (i < hostCount && scenario.hosts?.mode === "flag") p.isHost = true;
    return p;
  });
  if (shuffleRoster) players = players.map((p) => ({ p, k: random() })).sort((a, b) => a.k - b.k).map((x) => x.p);

  let courts: Court[] = scenario.courts.map((c, i) => ({ id: String(i + 1), name: "Court " + (i + 1), closesAt: c.closes }));
  const opens = scenario.courts.map((c) => minutes(c.opens));
  let matches: Match[] = [];
  const endsAt = new Map<string, number>();
  let maxWait = 0;
  let waitOneCourt = 0;
  const hostIds = new Set(players.slice(0, 0).map((p) => p.id));
  for (const p of players) if (p.name <= "P" + String(hostCount).padStart(2, "0") && hostCount > 0) hostIds.add(p.id);
  let hostFirstStart = NaN;
  const arriveAt = scenario.late ? minutes(scenario.late.at) : Infinity;
  const start = Math.min(...opens);
  const latest = Math.max(...scenario.courts.map((c) => minutes(c.closes))) + 60;

  for (let t = start; t <= latest; t++) {
    const now = clock(t);
    // late arrivals check in
    if (t >= arriveAt) players = players.map((p) => (p.status === "expected" && p.name > "P" + String(lateFrom).padStart(2, "0") ? { ...p, status: "ready" as const } : p));
    // hosts checked in by hand once round 1 is under way
    if (scenario.hosts?.mode === "checkin" && matches.length >= scenario.courts.length) {
      players = players.map((p) => (hostIds.has(p.id) && p.status === "expected" ? { ...p, status: "ready" as const } : p));
    }
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
      const waiting = Math.max(...players.filter((p) => p.status === "ready").map((p) => p.skipped));
      maxWait = Math.max(maxWait, waiting);
      if (courts.filter((c) => !c.paused).length === 1) waitOneCourt = Math.max(waitOneCourt, waiting);
      if (Number.isNaN(hostFirstStart) && ids.some((id) => hostIds.has(id))) hostFirstStart = t - start;
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
  // players who checked in late can't catch up on games, so they're left out of the gap
  const games = finished.filter((p) => Number(p.id.slice(1)) < lateFrom).map((p) => p.games);
  return {
    matches: matches.length,
    distinctFoursomes: foursomes.size,
    avgDistinctPartners: finished.reduce((sum, p) => sum + (partners.get(p.id)?.size ?? 0), 0) / finished.length,
    gamesGap: Math.max(...games) - Math.min(...games),
    maxInARow: Math.max(...players.map((p) => p.maxConsecutive)),
    maxWait,
    waitOneCourt,
    hostGames: hostIds.size ? finished.filter((p) => hostIds.has(p.id)).reduce((sum, p) => sum + p.games, 0) / hostIds.size : 0,
    hostFirstStart: hostFirstStart,
    otherGames: finished.filter((p) => !hostIds.has(p.id)).reduce((sum, p) => sum + p.games, 0) / Math.max(1, finished.filter((p) => !hostIds.has(p.id)).length),
  };
}

export function summarize(scenario: Scenario, nights: number, shuffleRoster: boolean) {
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
    waitOneCourt: worst((n) => n.waitOneCourt),
    minRatio: Math.min(...results.map((n) => n.distinctFoursomes / n.matches)),
    hostGames: avg((n) => n.hostGames),
    otherGames: avg((n) => n.otherGames),
    hostFirstStart: avg((n) => (Number.isNaN(n.hostFirstStart) ? 999 : n.hostFirstStart)),
    latestHostStart: worst((n) => (Number.isNaN(n.hostFirstStart) ? 999 : n.hostFirstStart)),
  };
}

const NIGHTS = Number(process.env.SIM_NIGHTS ?? 60);
const both = (open: string, close: string) => ({ opens: open, closes: close });
const twoCourts = [both("19:00", "22:00"), both("19:00", "21:00")];
const threeCourts = [both("19:00", "22:00"), both("19:00", "22:00"), both("19:00", "22:00")];

const ceilQuarter = (n: number) => Math.ceil(n / 4);

describe("whole evenings, 2 courts (A until 22:00, B until 21:00)", () => {
  // Before the wait cap scaled with the pool, 16, 20 and 24 players fell into 4, 5
  // and 6 fixed groups all night; now nearly every match is a new foursome.
  for (const players of [12, 16, 18, 20, 24]) {
    for (const shuffled of [false, true]) {
      it(`${players} players${shuffled ? " (roster shuffled)" : ""}`, () => {
        const r = summarize({ players, courts: twoCourts }, NIGHTS, shuffled);
        expect(r.minRatio).toBeGreaterThanOrEqual(0.85);
        expect(r.gap).toBeLessThanOrEqual(2);
        expect(r.inARow).toBeLessThanOrEqual(2);
        // the price of mixing: a wait up to a quarter of the pool, plus one
        expect(r.wait).toBeLessThanOrEqual(ceilQuarter(players) + 1);
      });
    }
  }

  it("13 players", () => {
    const r = summarize({ players: 13, courts: twoCourts }, NIGHTS, false);
    expect(r.minRatio).toBeGreaterThanOrEqual(0.85);
    expect(r.gap).toBeLessThanOrEqual(2);
    expect(r.inARow).toBeLessThanOrEqual(2);
  });

  it("10 players, only two waiting while both courts run", () => {
    const r = summarize({ players: 10, courts: twoCourts }, NIGHTS, false);
    expect(r.gap).toBeLessThanOrEqual(3);
    expect(r.minFoursomes).toBeGreaterThanOrEqual(5);
    // someone playing three in a row is sometimes unavoidable here; it must stay rare and short
    expect(r.inARow).toBeLessThanOrEqual(3);
  });

  it("8 players all play throughout", () => {
    const r = summarize({ players: 8, courts: [both("19:00", "22:00"), both("19:00", "22:00")] }, NIGHTS, false);
    expect(r.gap).toBeLessThanOrEqual(2);
    expect(r.wait).toBeLessThanOrEqual(1);
  });

  it("16 players with 4 arriving at 20:00", () => {
    const r = summarize({ players: 16, courts: twoCourts, late: { count: 4, at: "20:00" } }, NIGHTS, false);
    expect(r.minRatio).toBeGreaterThanOrEqual(0.85);
    expect(r.gap).toBeLessThanOrEqual(2);
    expect(r.inARow).toBeLessThanOrEqual(2);
  });
});

describe("whole evenings, 3 courts (all until 22:00)", () => {
  for (const players of [16, 20, 24]) {
    it(`${players} players`, () => {
      const r = summarize({ players, courts: threeCourts }, NIGHTS, false);
      expect(r.minRatio).toBeGreaterThanOrEqual(0.85);
      // the last round of the night is only partly played, so a player can end a game or
      // two behind on three courts (the old fixed cap had the same worst case)
      expect(r.gap).toBeLessThanOrEqual(3);
      expect(r.inARow).toBeLessThanOrEqual(2);
      expect(r.wait).toBeLessThanOrEqual(ceilQuarter(players) + 1);
    });
  }
});

describe("hosts on a 16-player night", () => {
  // Nilam and Raden: out of round 1, then in the rotation like everyone else.
  for (const mode of ["flag", "checkin"] as const) {
    it(mode === "flag" ? "hosts marked as hosts" : "hosts checked in after round 1", () => {
      const r = summarize({ players: 16, courts: twoCourts, hosts: { count: 2, mode } }, NIGHTS, false);
      // first match ends ~14-23 minutes in, and that is when the hosts first play
      expect(r.hostFirstStart).toBeGreaterThanOrEqual(14);
      expect(r.latestHostStart).toBeLessThanOrEqual(25);
      expect(Math.abs(r.hostGames - r.otherGames)).toBeLessThanOrEqual(1);
      expect(r.minRatio).toBeGreaterThanOrEqual(0.85);
      expect(r.gap).toBeLessThanOrEqual(2);
    });
  }
});
