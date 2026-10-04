import { describe, expect, it } from "vitest";
import type { Match, Player } from "../types";
import { buildHighlights, shortName, dropStarted, planQueue, lockedCount, lockableWaiting, resetPlayersForNewSession, applyAfterMatch, playerPriority, markReady, applyLiveScore, buildGamesPlayed, hostSwitchLocked, buildStandings, pointsShare, winRate, applyMatchStart, buildSuggestion, canRemovePlayer, courtCloseReminders, courtsDueToPause, courtSuggestions, fewPlayersHint, hostsHolding, initialsFor, isCourtClosingSoon, isCourtKeptOpen, isCourtPastClosing, keepCourtOpen, pairCounts, pickBalancedFoursome, pickFour, resetCourtsForNewSession, resumeCourt, scheduleEndTime, isFirstRun, liveScoreFor, makeBlankPlayer, nameTaken, photoReminderMinutes, rankPlayers, recomputePlayerStats, syncFingerprint, withListDefaults } from "./session";

const player = (name: string): Player => makeBlankPlayer(name.toLowerCase(), name, "B", "ready");

const completed = (id: string, t1: [string, string], t2: [string, string], s1: number, s2: number): Match => ({
  id,
  round: 1,
  num: 1,
  courtId: "1",
  status: "completed",
  t1,
  t2,
  s1,
  s2,
  elapsedAtTick0: 0,
});

describe("rankings", () => {
  // Ana + Bo beat Cy + Di 21-15; Eka has not played.
  const players = ["Ana", "Bo", "Cy", "Di", "Eka"].map(player);
  const stats = recomputePlayerStats(players, [completed("m1", ["ana", "bo"], ["cy", "di"], 21, 15)]);

  it("rankPlayers gives no rank until players have 3 games, and none to players without games", () => {
    // one game each is 'not enough games yet': listed, but nobody is ranked
    const ranked = rankPlayers(stats);
    expect(ranked.map((r) => [r.player.name, r.rank])).toEqual([
      ["Ana", null],
      ["Bo", null],
      ["Cy", null],
      ["Di", null],
      ["Eka", null],
    ]);
    // the winners still sort ahead of the losers within the list
    expect(ranked.map((r) => r.player.name).slice(0, 2)).toEqual(["Ana", "Bo"]);
  });

  it("partner and opponent stats need at least two games and a win/loss", () => {
    // one game together / faced is noise, not a "favourite partner" or "tough opponent"
    expect(stats.find((p) => p.name === "Ana")!.favPartner).toBe("—");
    expect(stats.find((p) => p.name === "Cy")!.toughOpp).toBe("—");
    // Ana + Bo beat Cy + Di again, and Ana + Cy lose to Bo + Di
    const twice = recomputePlayerStats(players, [
      completed("m1", ["ana", "bo"], ["cy", "di"], 21, 15),
      completed("m2", ["ana", "bo"], ["cy", "di"], 21, 10),
      completed("m3", ["ana", "cy"], ["bo", "di"], 15, 21),
    ]);
    expect(twice.find((p) => p.name === "Ana")!.favPartner).toBe("Bo");
    expect(twice.find((p) => p.name === "Cy")!.toughOpp).not.toBe("—");
    expect(twice.find((p) => p.name === "Eka")!.favPartner).toBe("—");
  });

  it("rankPlayers leaves everyone unranked when the session doesn't record results", () => {
    const ppl = ["Ana", "Bo"].map(player);
    const s = recomputePlayerStats(ppl, [completed("a", ["ana", "bo"], ["x", "y"], 0, 0)]);
    expect(rankPlayers(s, "none").map((r) => r.rank)).toEqual([null, null]);
  });

  it("tracks points for and against, and how many different partners", () => {
    const ppl = ["Ana", "Bo", "Cy", "Di"].map(player);
    const s = recomputePlayerStats(ppl, [
      completed("m1", ["ana", "bo"], ["cy", "di"], 21, 15),
      completed("m2", ["ana", "cy"], ["bo", "di"], 18, 21),
    ]);
    const ana = s.find((p) => p.name === "Ana")!;
    expect([ana.pointsFor, ana.pointsAgainst, ana.partnersCount]).toEqual([39, 36, 2]);
  });
});

describe("opponent strength", () => {
  const tiered = (name: string, level: Player["level"]): Player => ({ ...player(name), level });
  const roster = [tiered("Ana", "A"), tiered("Bo", "A"), tiered("Cy", "B"), tiered("Di", "C")];

  it("is the other team's tier points minus their own, per counted game", () => {
    // A+A (6) vs B+C (3): the A pair played an easier match (-3), the others a harder one (+3)
    const s = recomputePlayerStats(roster, [completed("m1", ["ana", "bo"], ["cy", "di"], 21, 10)]);
    const edge = (n: string) => s.find((p) => p.name === n)!.oppEdge;
    expect([edge("Ana"), edge("Bo"), edge("Cy"), edge("Di")]).toEqual([-3, -3, 3, 3]);
  });

  it("averages over games, and uneven teams show up per game", () => {
    const s = recomputePlayerStats(roster, [
      completed("m1", ["ana", "bo"], ["cy", "di"], 21, 10),
      completed("m2", ["ana", "di"], ["bo", "cy"], 21, 19), // A+C (4) vs A+B (5)
    ]);
    expect(s.find((p) => p.name === "Ana")!.oppEdge).toBeCloseTo((-3 + 1) / 2);
    expect(s.find((p) => p.name === "Di")!.oppEdge).toBeCloseTo((3 + 1) / 2);
  });

  it("ignores a match that ended early and a player with no games", () => {
    const early = { ...completed("m1", ["ana", "bo"], ["cy", "di"], 5, 3), counted: false };
    expect(recomputePlayerStats(roster, [early]).every((p) => p.oppEdge === 0)).toBe(true);
  });
});

describe("standings", () => {
  // a player with a given record and points, in the rotation unless said otherwise
  const stat = (name: string, wins: number, losses: number, pf = 0, pa = 0, status: Player["status"] = "ready", extra: Partial<Player> = {}): Player => ({
    ...makeBlankPlayer(name.toLowerCase(), name, "B", status),
    games: wins + losses,
    rankGames: wins + losses,
    wins,
    losses,
    pointsFor: pf,
    pointsAgainst: pa,
    ...extra,
  });
  const names = (rows: ReturnType<typeof rankPlayers>) => rows.map((r) => r.player.name);
  const section = (rows: ReturnType<typeof rankPlayers>, name: string) => rows.find((r) => r.player.name === name)!;

  it("smooths the win rate: everyone starts at 1 win, 1 loss", () => {
    expect(winRate({ wins: 1, rankGames: 1 })).toBeCloseTo(2 / 3);
    expect(winRate({ wins: 4, rankGames: 5 })).toBeCloseTo(5 / 7);
    expect(pointsShare({ pointsFor: 0, pointsAgainst: 0 })).toBe(0.5);
  });

  describe("who gets a rank", () => {
    it("1 game of 6 is 'not enough games yet': listed with a record, no rank number", () => {
      const rows = rankPlayers([stat("Nilam", 1, 0, 21, 10), stat("Novi", 4, 2, 120, 100), stat("Imat", 5, 0, 105, 60), stat("Yuni", 3, 1, 80, 60)]);
      expect(names(rows)).toEqual(["Imat", "Yuni", "Novi", "Nilam"]);
      expect(section(rows, "Nilam")).toMatchObject({ rank: null, medal: null, section: "tooFew" });
      expect(rows.filter((r) => r.section === "ranked").map((r) => r.rank)).toEqual([1, 2, 3]);
    });

    it("needs at least half as many games as the player with the most", () => {
      // 3 games qualifies against 6 (half) but not against 7
      expect(section(rankPlayers([stat("Busy", 4, 2), stat("Three", 3, 0)]), "Three").section).toBe("ranked");
      expect(section(rankPlayers([stat("Busy", 5, 2), stat("Three", 3, 0)]), "Three").section).toBe("tooFew");
    });

    it("needs at least 3 games even when everyone has few", () => {
      expect(rankPlayers([stat("A", 2, 0), stat("B", 1, 1)]).every((r) => r.section === "tooFew")).toBe(true);
    });

    it("lists players who haven't played at the end of that section", () => {
      const rows = rankPlayers([stat("Late", 0, 0), stat("A", 3, 0), stat("Short", 1, 0)]);
      expect(rows.map((r) => [r.player.name, r.section])).toEqual([["A", "ranked"], ["Short", "tooFew"], ["Late", "tooFew"]]);
    });

    it("the old order is gone: 1W-0L is below 4W-1L, 2W-0L above 2W-1L (once they all qualify)", () => {
      expect(names(rankPlayers([stat("One", 1, 0, 0, 0, "ready"), stat("Four", 4, 1)]))).toEqual(["Four", "One"]);
      expect(names(rankPlayers([stat("Two1", 3, 1), stat("Two0", 3, 0)]))).toEqual(["Two0", "Two1"]);
    });

    it("equal records: the bigger share of points won ranks higher", () => {
      const rows = rankPlayers([stat("Close", 2, 1, 60, 58), stat("Big", 2, 1, 63, 40)]);
      expect(names(rows)).toEqual(["Big", "Close"]);
    });

    it("equal records: the player who faced tougher teams ranks higher, ahead of points", () => {
      const rows = rankPlayers([
        stat("Easy", 2, 1, 80, 40, "ready", { oppEdge: -1 }),
        stat("Hard", 2, 1, 60, 58, "ready", { oppEdge: 1 }),
        stat("Even", 2, 1, 70, 50, "ready", { oppEdge: 0 }),
      ]);
      expect(names(rows)).toEqual(["Hard", "Even", "Easy"]);
    });

    it("tougher matches never beat a better win rate", () => {
      expect(names(rankPlayers([stat("Won", 3, 0, 63, 30, "ready", { oppEdge: -2 }), stat("Lost", 2, 1, 60, 58, "ready", { oppEdge: 2 })]))).toEqual(["Won", "Lost"]);
    });

    it("an equal win rate is a tie, not a lead: falls to games, then name", () => {
      expect(names(rankPlayers([stat("Zed", 2, 2, 80, 80), stat("Amy", 2, 2, 80, 80)]))).toEqual(["Amy", "Zed"]);
    });

    it("winner-only sessions ignore points", () => {
      const a = stat("A", 2, 2, 1, 2);
      const b = stat("B", 2, 2, 500, 0);
      expect(names(rankPlayers([b, a], "winner"))).toEqual(["A", "B"]); // same record: games tie, then name
      expect(names(rankPlayers([b, a], "score"))).toEqual(["B", "A"]);
    });

    it("a session without results has no ranking at all", () => {
      const rows = rankPlayers([stat("A", 2, 0), stat("B", 0, 1)], "none");
      expect(rows.map((r) => [r.rank, r.medal])).toEqual([[null, null], [null, null]]);
      expect(buildStandings([stat("A", 0, 0)], "none").early).toBe(false);
    });
  });

  describe("count in rankings", () => {
    const base = () => [stat("A", 4, 1, 100, 80), stat("B", 3, 2, 95, 90), stat("C", 3, 2, 90, 92), stat("D", 2, 3, 85, 95)];

    it("an excluded player goes under 'Not ranked', with their record, no rank or medal", () => {
      const rows = rankPlayers([...base(), stat("Raden", 5, 0, 105, 60, "ready", { inRankings: false })]);
      const raden = section(rows, "Raden");
      expect([raden.section, raden.rank, raden.medal]).toEqual(["notRanked", null, null]);
      expect(rows[rows.length - 1].player.name).toBe("Raden");
    });

    it("does not change anyone else's rank", () => {
      const without = rankPlayers(base()).filter((r) => r.section === "ranked").map((r) => [r.player.name, r.rank]);
      const withHost = rankPlayers([...base(), stat("Host", 0, 6, 10, 126, "ready", { inRankings: false })])
        .filter((r) => r.section === "ranked")
        .map((r) => [r.player.name, r.rank]);
      expect(withHost).toEqual(without);
    });

    it("is not counted in the most-games bar", () => {
      // the host played 12 games; without exclusion nobody with 5 would qualify (half of 12 is 6)
      const rows = rankPlayers([...base(), stat("Host", 7, 5, 200, 190, "ready", { inRankings: false })]);
      expect(section(rows, "A").section).toBe("ranked");
      expect(buildStandings([...base(), stat("Host", 7, 5, 200, 190, "ready", { inRankings: false })]).maxGames).toBe(5);
    });

    it("is not counted in the early check", () => {
      const players = [...base(), stat("Host", 0, 1, 0, 0, "ready", { inRankings: false })];
      expect(buildStandings(players).early).toBe(false);
    });
  });

  describe("early standings", () => {
    const night = (...extra: Player[]) => [stat("A", 5, 1, 120, 90), stat("B", 4, 2, 110, 100), stat("C", 3, 3, 100, 100), stat("D", 3, 3, 98, 101), ...extra];

    it("is not early at match 18 when only two players have 1 game each", () => {
      // 16 players in the rotation, 14 of them past 2 games
      const many = Array.from({ length: 12 }, (_, i) => stat("P" + i, 3, 2, 100, 95));
      const s = buildStandings([...night(), ...many, stat("Nilam", 1, 0, 21, 10), stat("Raden", 0, 1, 10, 21)]);
      expect(s.early).toBe(false);
      expect(s.rows.filter((r) => r.medal).map((r) => r.medal)).toEqual([1, 2, 3]);
    });

    it("is early while the leader has fewer than 3 games", () => {
      const s = buildStandings([stat("A", 2, 0), stat("B", 1, 1), stat("C", 1, 1), stat("D", 0, 2)]);
      expect(s.early).toBe(true);
      expect(s.rows.every((r) => r.medal === null)).toBe(true);
    });

    it("is early while fewer than 75% of the players in the rotation have played 2", () => {
      const s = buildStandings(night(stat("E", 1, 0), stat("F", 1, 0), stat("G", 0, 1)));
      expect(s.early).toBe(true); // 4 of 7 = 57%
      expect(s.rows.every((r) => r.medal === null)).toBe(true);
    });

    it("is not held up by someone who left or hasn't arrived", () => {
      const s = buildStandings(night(stat("Gone", 1, 0, 0, 0, "left"), stat("Later", 0, 0, 0, 0, "expected")));
      expect(s.early).toBe(false);
    });

    it("is not early before anything has been played", () => {
      expect(buildStandings([stat("A", 0, 0), stat("B", 0, 0)]).early).toBe(false);
    });

    it("gives medals to the first three ranked players only", () => {
      const s = buildStandings(night(stat("Nilam", 1, 0, 21, 5)));
      expect(s.rows.map((r) => r.medal)).toEqual([1, 2, 3, null, null]);
      expect(section(s.rows, "Nilam").section).toBe("tooFew");
    });
  });
});

describe("a match that ended early", () => {
  const ppl = ["Ana", "Bo", "Cy", "Di"].map(player);
  const early: Match = { ...completed("e", ["ana", "bo"], ["cy", "di"], 9, 6), endedEarly: true, counted: false };

  it("counts as a game played but changes no record, points or partners", () => {
    const s = recomputePlayerStats(ppl, [early]);
    for (const p of s) {
      expect([p.games, p.rankGames, p.wins, p.losses, p.diff, p.pointsFor, p.pointsAgainst, p.partnersCount]).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
    }
  });

  it("leaves the other matches' stats alone", () => {
    const s = recomputePlayerStats(ppl, [completed("m1", ["ana", "bo"], ["cy", "di"], 21, 15), early]);
    const ana = s.find((p) => p.name === "Ana")!;
    expect([ana.games, ana.rankGames, ana.wins, ana.pointsFor]).toEqual([2, 1, 1, 21]);
  });

  it("does not put anyone first in the rankings", () => {
    const s = recomputePlayerStats(ppl, [early]);
    expect(rankPlayers(s).every((r) => r.rank === null)).toBe(true);
  });

  it("counts again once the result is counted (Fix Score → Count as final)", () => {
    const fixed: Match = { ...early };
    delete fixed.counted;
    delete fixed.endedEarly;
    const s = recomputePlayerStats(ppl, [{ ...fixed, s1: 21, s2: 6 }]);
    expect(s.find((p) => p.name === "Ana")!.wins).toBe(1);
  });
});

describe("rest or leave after the match", () => {
  const onCourt = { t1: ["a", "b"] as [string, string], t2: ["c", "d"] as [string, string] };
  const roster = () => ["a", "b", "c", "d", "e"].map((id) => makeBlankPlayer(id, id.toUpperCase(), "B", "ready"));

  it("applies the choice to the players in that match, then clears it", () => {
    const players = roster().map((p) => (p.id === "a" ? { ...p, afterMatch: "rest" as const } : p.id === "c" ? { ...p, afterMatch: "left" as const } : p.id === "e" ? { ...p, afterMatch: "rest" as const } : p));
    const out = applyAfterMatch(players, onCourt, 0);
    const get = (id: string) => out.find((p) => p.id === id)!;
    expect([get("a").status, get("a").pauseReason, get("a").afterMatch]).toEqual(["paused", "rest", undefined]);
    expect([get("c").status, get("c").afterMatch]).toEqual(["left", undefined]);
    // e wasn't in this match: its choice waits for its own match
    expect([get("e").status, get("e").afterMatch]).toEqual(["ready", "rest"]);
    expect(get("b").status).toBe("ready");
  });

  it("a new session forgets any choice that was never applied", () => {
    const [p] = resetPlayersForNewSession([{ ...makeBlankPlayer("a", "A", "B", "ready"), afterMatch: "rest" }]);
    expect(p.afterMatch).toBeUndefined();
  });
});

describe("games played list", () => {
  const withGames = (name: string, games: number, status: Player["status"] = "ready"): Player => ({ ...makeBlankPlayer(name.toLowerCase(), name, "B", status), games });

  it("lists everyone fewest first, with a warning for anyone 2+ behind", () => {
    const vm = buildGamesPlayed(
      [withGames("Nilam", 1), withGames("Raden", 1), withGames("Achmad", 3, "left"), withGames("Akbar", 4), withGames("Mariana", 4), withGames("Yuni", 4, "left"), withGames("Dadang", 5), withGames("Imat", 5), withGames("Fery", 0, "expected")],
      new Set(),
    );
    expect(vm.rows.map((r) => [r.games, r.text, r.status, r.warn])).toEqual([
      ["1", "Nilam", "waiting", true],
      ["1", "Raden", "waiting", true],
      ["3", "Achmad", "left", false],
      ["4", "Akbar · Mariana · Yuni (left)", null, false],
      ["5", "Dadang · Imat", null, false],
      ["–", "Fery", "not checked in", false],
    ]);
    expect(vm.behind).toBe(2);
    // not checked in is left out of the average
    expect(vm.average).toBe(Math.round(((1 + 1 + 3 + 4 + 4 + 4 + 5 + 5) / 8) * 10) / 10);
  });

  it("says who is on court", () => {
    const vm = buildGamesPlayed([withGames("A", 2), withGames("B", 5)], new Set(["a"]));
    expect(vm.rows[0]).toMatchObject({ text: "A", status: "on court", warn: true });
  });
});

describe("host switch lock", () => {
  const courts = [{ id: "1", name: "A" }, { id: "2", name: "B" }];
  const m = (n: number): Match[] => Array.from({ length: n }, (_, i) => ({ ...completed("m" + i, ["a", "b"], ["c", "d"], 21, 5), num: i + 1 }));

  it("is open until a match has started on every court", () => {
    expect(hostSwitchLocked(courts, m(0))).toBe(false);
    expect(hostSwitchLocked(courts, m(1))).toBe(false);
    expect(hostSwitchLocked(courts, m(2))).toBe(true);
  });

  it("stays open with every court paused and nothing started", () => {
    // pausing a court doesn't make round 1 'started'
    expect(hostSwitchLocked(courts.map((c) => ({ ...c, paused: true })), m(0))).toBe(false);
  });
});

describe("live scoring", () => {
  const live: Match = { ...completed("live", ["ana", "bo"], ["cy", "di"], 0, 0), status: "in_progress" };
  const done = completed("done", ["ana", "bo"], ["cy", "di"], 21, 15);

  it("applyLiveScore writes points to an in-progress match", () => {
    expect(applyLiveScore([live], live.id, 3, 1).find((m) => m.id === live.id)).toMatchObject({ s1: 3, s2: 1, status: "in_progress" });
  });

  it("applyLiveScore leaves completed matches untouched", () => {
    expect(applyLiveScore([done], done.id, 30, 0)[0]).toMatchObject({ s1: 21, s2: 15, status: "completed" });
  });
});

describe("roster editing", () => {
  const players = ["Andi", "Budi", "Eka"].map(player);
  const [andi, , eka] = players;

  it("nameTaken matches case-insensitively and trims", () => {
    expect(nameTaken(players, " andi ")).toBe(true);
    expect(nameTaken(players, "Andi", andi.id)).toBe(false);
    expect(nameTaken(players, "Andi S")).toBe(false);
  });

  it("canRemovePlayer refuses players with any match", () => {
    const live: Match = { ...completed("live", ["andi", "budi"], ["x", "y"], 0, 0), status: "in_progress" };
    expect(canRemovePlayer(eka, [live])).toBe(true);
    expect(canRemovePlayer(andi, [live])).toBe(false);
    expect(canRemovePlayer({ ...eka, games: 1 }, [])).toBe(false);
  });
});

describe("first run", () => {
  it("isFirstRun is true only with no players and no courts", () => {
    expect(isFirstRun(0, 0)).toBe(true);
    expect(isFirstRun(10, 0)).toBe(false);
    expect(isFirstRun(0, 2)).toBe(false);
  });
});

describe("remote sync helpers", () => {
  const live: Match = { ...completed("live", ["a", "b"], ["c", "d"], 0, 0), status: "in_progress" };
  const done = completed("done", ["a", "b"], ["c", "d"], 21, 15);
  const doc = (matches: Match[], extra: object = {}) => ({ matches, sessionName: "Rabu", completedCount: 1, ...extra });

  it("syncFingerprint ignores live points on an in-progress match", () => {
    expect(syncFingerprint(doc([{ ...live, s1: 5, s2: 3 }, done]))).toBe(syncFingerprint(doc([live, done])));
  });

  it("syncFingerprint changes when anything other than live points changes", () => {
    const base = syncFingerprint(doc([live, done]));
    expect(syncFingerprint(doc([{ ...live, status: "completed" }, done]))).not.toBe(base);
    expect(syncFingerprint(doc([live, { ...done, s1: 20 }]))).not.toBe(base);
    expect(syncFingerprint(doc([live, done], { sessionName: "Kamis" }))).not.toBe(base);
  });

  it("liveScoreFor returns the score of an in-progress match only", () => {
    expect(liveScoreFor([{ ...live, s1: 7, s2: 4 }], "live")).toEqual({ s1: 7, s2: 4 });
    expect(liveScoreFor([done], "done")).toBeNull();
    expect(liveScoreFor([live], "missing")).toBeNull();
    expect(liveScoreFor([live], null)).toBeNull();
  });

  it("withListDefaults restores lists Firebase dropped because they were empty", () => {
    const merged = withListDefaults({ sessionName: "Rabu" } as { sessionName: string; requestedPairs?: [string, string][]; matches?: Match[] });
    expect(merged.requestedPairs).toEqual([]);
    expect(merged.matches).toEqual([]);
    expect(merged.sessionName).toBe("Rabu");
    const kept = withListDefaults({ matches: [done] });
    expect(kept.matches).toEqual([done]);
  });
});

describe("group photo reminder", () => {
  // local time on an arbitrary day
  const at = (h: number, m: number, dayOffset = 0) => new Date(2026, 8, 30 + dayOffset, h, m, 0, 0);

  it("counts down the last 30 minutes of a schedule", () => {
    expect(photoReminderMinutes("Rabu · 19:00–22:00", at(21, 30))).toBe(30);
    expect(photoReminderMinutes("Rabu · 19:00–22:00", at(21, 40))).toBe(20);
    expect(photoReminderMinutes("Rabu · 19:00–22:00", at(21, 59))).toBe(1);
  });

  it("stays quiet before the last 30 minutes and after the end", () => {
    expect(photoReminderMinutes("Rabu · 19:00–22:00", at(21, 20))).toBeNull();
    expect(photoReminderMinutes("Rabu · 19:00–22:00", at(22, 1))).toBeNull();
  });

  it("handles a session that ends after midnight", () => {
    expect(photoReminderMinutes("22:00–00:30", at(0, 5, 1))).toBe(25); // just after midnight
    expect(photoReminderMinutes("22:00–00:30", at(23, 50))).toBeNull(); // 40 minutes left
  });

  it("reads 12-hour times", () => {
    expect(photoReminderMinutes("7:00 PM – 10:00 PM", at(21, 40))).toBe(20);
    expect(photoReminderMinutes("7pm-10pm", at(21, 40))).toBe(20);
  });

  it("does nothing without a start and end time", () => {
    expect(photoReminderMinutes("", at(21, 40))).toBeNull();
    expect(photoReminderMinutes("Rabu malam", at(21, 40))).toBeNull();
    expect(photoReminderMinutes("Wed 12 Nov · 22:00", at(21, 40))).toBeNull();
    expect(photoReminderMinutes("25:00–26:00", at(21, 40))).toBeNull();
  });
});

describe("court closing", () => {
  const at = (h: number, m: number) => new Date(2026, 8, 30, h, m, 0, 0);
  const courtA = { id: "1", name: "Court A", closesAt: "22:00" };
  const courtB = { id: "2", name: "Court B", closesAt: "21:00" };
  const onB = (status: Match["status"], num = 1): Match => ({ id: "m" + num, round: 0, num, courtId: "2", status, t1: ["a", "b"], t2: ["c", "d"], s1: 0, s2: 0, elapsedAtTick0: 0 });
  const busyOnB = onB("in_progress");
  const none: Match[] = [];

  describe("reminder", () => {
    it("only flags the court that is about to close", () => {
      const r = courtCloseReminders([courtA, courtB], none, at(20, 55));
      expect(r.map((x) => x.courtId)).toEqual(["2"]);
      expect(r[0].minutesLeft).toBe(5);
    });

    it("stays quiet earlier than 10 minutes before closing", () => {
      expect(courtCloseReminders([courtA, courtB], none, at(20, 45))).toEqual([]);
    });

    it("keeps flagging after closing, for a while", () => {
      expect(courtCloseReminders([courtB], none, at(21, 20))[0].minutesLeft).toBeLessThanOrEqual(0);
      expect(courtCloseReminders([courtB], none, at(23, 30))).toEqual([]);
    });

    it("says when a match is still being played there", () => {
      expect(courtCloseReminders([courtB], [busyOnB], at(21, 0))[0].busy).toBe(true);
      expect(courtCloseReminders([courtB], none, at(21, 0))[0].busy).toBe(false);
    });

    it("skips paused courts and courts without a time", () => {
      expect(courtCloseReminders([{ ...courtB, paused: true }], none, at(21, 0))).toEqual([]);
      expect(courtCloseReminders([{ id: "3", name: "Court C" }], none, at(21, 0))).toEqual([]);
    });

    it("works across midnight", () => {
      const late = { id: "4", name: "Court D", closesAt: "00:05" };
      expect(courtCloseReminders([late], none, at(23, 58))[0].minutesLeft).toBe(7);
      expect(courtCloseReminders([late], none, at(23, 40))).toEqual([]);
      expect(courtCloseReminders([late], none, at(0, 20))[0].minutesLeft).toBeLessThanOrEqual(0);
    });

    it("ignores a malformed time", () => {
      expect(courtCloseReminders([{ ...courtB, closesAt: "25:00" }], none, at(21, 0))).toEqual([]);
    });
  });

  describe("closing soon", () => {
    it("starts 15 minutes before closing", () => {
      expect(isCourtClosingSoon(courtB, none, at(20, 44))).toBe(false);
      expect(isCourtClosingSoon(courtB, none, at(20, 45))).toBe(true);
      expect(isCourtClosingSoon(courtA, none, at(20, 45))).toBe(false);
    });

    it("does not apply to a paused court or one without a time", () => {
      expect(isCourtClosingSoon({ ...courtB, paused: true }, none, at(20, 50))).toBe(false);
      expect(isCourtClosingSoon({ id: "3", name: "C" }, none, at(20, 50))).toBe(false);
    });

    it("withholds suggestions from a closing court and lets the others use its players", () => {
      const players = Array.from({ length: 8 }, (_, i) => makeBlankPlayer("p" + i, "P" + i, "B", "ready"));
      const s = courtSuggestions([courtA, courtB], players, [], [], {}, at(20, 50));
      expect(Object.keys(s)).toEqual(["1"]);
      expect(s["1"]?.four).toHaveLength(4);
    });
  });

  describe("keep open", () => {
    it("allows exactly one more match, then the court closes", () => {
      const kept = keepCourtOpen(courtB, none);
      expect(isCourtClosingSoon(kept, none, at(20, 50))).toBe(false);
      expect(isCourtKeptOpen(kept, none, at(20, 50))).toBe(true);
      // the extra match starts: the court is busy, and once it is over it is no longer kept open
      expect(isCourtKeptOpen(kept, [onB("in_progress")], at(21, 10))).toBe(false);
      expect(courtsDueToPause([kept], [onB("in_progress")], at(21, 10))).toEqual([]);
      expect(courtsDueToPause([kept], [onB("completed")], at(21, 10)).map((c) => c.id)).toEqual(["2"]);
    });

    it("counts matches already played on the court, not just the extra one", () => {
      const played = [onB("completed", 1), onB("completed", 2)];
      const kept = keepCourtOpen(courtB, played);
      expect(courtsDueToPause([kept], played, at(21, 5))).toEqual([]);
      expect(courtsDueToPause([kept], [...played, onB("completed", 3)], at(21, 30)).map((c) => c.id)).toEqual(["2"]);
    });

    it("can be extended again while the extra match runs", () => {
      const running = [onB("completed", 1), onB("in_progress", 2)];
      const kept = keepCourtOpen(keepCourtOpen(courtB, [onB("completed", 1)]), running);
      expect(courtsDueToPause([kept], [onB("completed", 1), onB("completed", 2)], at(21, 30))).toEqual([]);
    });

    it("also works on a paused court past closing, and reopens it", () => {
      const kept = keepCourtOpen({ ...courtB, paused: true }, [onB("completed")]);
      expect(kept.paused).toBeUndefined();
      expect(courtsDueToPause([kept], [onB("completed")], at(21, 30))).toEqual([]);
    });

    it("hides the closing reminder while it applies, and shows it again after", () => {
      const kept = keepCourtOpen(courtB, none);
      expect(courtCloseReminders([kept], none, at(20, 55))).toEqual([]);
      expect(courtCloseReminders([kept], [onB("in_progress")], at(21, 5))).toHaveLength(1);
    });

    it("is about that closing time only", () => {
      const kept = keepCourtOpen(courtB, none);
      expect(isCourtClosingSoon({ ...kept, closesAt: "21:30" }, none, at(21, 20))).toBe(true);
    });

    it("does nothing for a court without a closing time", () => {
      const c = { id: "3", name: "C" };
      expect(keepCourtOpen(c, none)).toEqual(c);
    });
  });

  describe("auto-pause", () => {
    it("pauses an idle court once its closing time is reached", () => {
      expect(courtsDueToPause([courtA, courtB], none, at(20, 59))).toEqual([]);
      expect(courtsDueToPause([courtA, courtB], none, at(21, 0)).map((c) => c.id)).toEqual(["2"]);
    });

    it("waits for the match on a court to finish", () => {
      expect(courtsDueToPause([courtB], [busyOnB], at(21, 10))).toEqual([]);
      expect(courtsDueToPause([courtB], [{ ...busyOnB, status: "completed" }], at(21, 10)).map((c) => c.id)).toEqual(["2"]);
    });

    it("leaves paused and time-less courts alone", () => {
      expect(courtsDueToPause([{ ...courtB, paused: true }, { id: "3", name: "C" }], none, at(21, 5))).toEqual([]);
    });

    it("resuming only unpauses: it does not keep the court open", () => {
      const resumed = resumeCourt({ ...courtB, paused: true });
      expect(resumed.paused).toBeUndefined();
      expect(resumed.keepOpenFor).toBeUndefined();
      // near closing it shows "closing soon" like any other court…
      expect(isCourtClosingSoon(resumed, none, at(20, 50))).toBe(true);
      expect(courtCloseReminders([resumed], none, at(20, 52))).toHaveLength(1);
      // …and past closing it would pause again, which is what Keep open is for
      expect(courtsDueToPause([resumed], none, at(21, 10))).toHaveLength(1);
      expect(isCourtPastClosing(resumed, at(21, 10))).toBe(true);
      expect(isCourtPastClosing(resumed, at(20, 50))).toBe(false);
    });

    it("a new session reopens courts and forgets overrides but keeps closing times", () => {
      const [c] = resetCourtsForNewSession([{ ...keepCourtOpen(courtB, [onB("completed")]), paused: true }]);
      expect(c).toEqual({ id: "2", name: "Court B", closesAt: "21:00" });
    });
  });
});

describe("schedule end time", () => {
  it("reads the end of a schedule", () => {
    expect(scheduleEndTime("Rabu · 19:00–22:00")).toBe("22:00");
    expect(scheduleEndTime("7pm-9:30pm")).toBe("21:30");
    expect(scheduleEndTime("22:00–00:30")).toBe("00:30");
  });
  it("is null without a start and an end", () => {
    expect(scheduleEndTime("")).toBeNull();
    expect(scheduleEndTime("Rabu malam")).toBeNull();
    expect(scheduleEndTime("Wed 12 Nov · 22:00")).toBeNull();
  });
});

describe("few players hint", () => {
  it("suggests fewer courts below 4 per court plus 2", () => {
    expect(fewPlayersHint(9, 2)).toBe("Only 9 players ready. Consider 1 court for now.");
    expect(fewPlayersHint(13, 3)).toBe("Only 13 players ready. Consider 2 courts for now.");
  });
  it("stays quiet with enough players, one court, or hardly anyone yet", () => {
    expect(fewPlayersHint(10, 2)).toBeNull();
    expect(fewPlayersHint(5, 1)).toBeNull();
    expect(fewPlayersHint(3, 2)).toBeNull();
    expect(fewPlayersHint(0, 2)).toBeNull();
  });
});

describe("who plays where", () => {
  const roster = (n: number) => Array.from({ length: n }, (_, i) => makeBlankPlayer("p" + i, "P" + String(i + 1).padStart(2, "0"), i < n / 3 ? "A" : i < (2 * n) / 3 ? "B" : "C", "ready"));
  const courts = [{ id: "1", name: "Court 1" }, { id: "2", name: "Court 2" }];
  const now = new Date(2026, 8, 30, 19, 0);

  it("gives each court a different four", () => {
    const s = courtSuggestions(courts, roster(12), [], [], {}, now);
    const ids = [...s["1"]!.four, ...s["2"]!.four].map((p) => p.id);
    expect(new Set(ids).size).toBe(8);
  });

  it("court 2's suggestion is what a fresh court-2-only calculation would not give", () => {
    // starting court 2 first must start court 2's four, not court 1's
    const s = courtSuggestions(courts, roster(12), [], [], {}, now);
    const alone = buildSuggestion(roster(12), [], [], [], 0)!;
    expect(s["2"]!.four.map((p) => p.id)).not.toEqual(alone.four.map((p) => p.id));
    expect(s["1"]!.four.map((p) => p.id)).toEqual(alone.four.map((p) => p.id));
  });

  it("does not send the same four straight back out", () => {
    let players = roster(12);
    const first = courtSuggestions(courts, players, [], [], {}, now);
    const m = (id: string, courtId: string, sug: NonNullable<(typeof first)[string]>, status: Match["status"]): Match => ({
      id, round: 0, num: 1, courtId, status, t1: [sug.team1[0].id, sug.team1[1].id], t2: [sug.team2[0].id, sug.team2[1].id], s1: status === "completed" ? 21 : 0, s2: status === "completed" ? 10 : 0, elapsedAtTick0: 0,
    });
    const matches: Match[] = [m("a", "1", first["1"]!, "completed"), m("b", "2", first["2"]!, "in_progress")];
    for (const match of matches) players = applyMatchStart(players, [], [...match.t1, ...match.t2]);
    const next = buildSuggestion(players, matches, [], [], 0)!;
    const firstFour = first["1"]!.four.map((p) => p.id).sort().join();
    expect(next.four.map((p) => p.id).sort().join()).not.toBe(firstFour);
  });

  it("counts partners and meetings over the whole session", () => {
    const matches: Match[] = [
      { id: "1", round: 0, num: 1, courtId: "1", status: "completed", t1: ["a", "b"], t2: ["c", "d"], s1: 21, s2: 1, elapsedAtTick0: 0 },
      { id: "2", round: 0, num: 2, courtId: "1", status: "in_progress", t1: ["a", "b"], t2: ["e", "f"], s1: 0, s2: 0, elapsedAtTick0: 0 },
    ];
    const { meet, partner } = pairCounts(matches);
    expect(partner.get("a|b")).toBe(2);
    expect(meet.get("a|b")).toBe(2);
    expect(meet.get("a|c")).toBe(1);
    expect(meet.get("c|e")).toBeUndefined();
  });

  it("splits teams away from repeat partners, but never A+A against C+C to do it", () => {
    const four = [makeBlankPlayer("a1", "A1", "A", "ready"), makeBlankPlayer("a2", "A2", "A", "ready"), makeBlankPlayer("c1", "C1", "C", "ready"), makeBlankPlayer("c2", "C2", "C", "ready")];
    // A1 & C2 and A2 & C1 have partnered before; the only fresh split is AA vs CC
    const repeats = new Map([["a1|c2", 3], ["a2|c1", 3], ["a1|c1", 3], ["a2|c2", 3]]);
    const { team1, team2 } = pickBalancedFoursome(four, repeats);
    expect(team1.map((p) => p.level).sort().join()).toBe("A,C");
    expect(team2.map((p) => p.level).sort().join()).toBe("A,C");
  });

  it("prefers a fresh split when the tiers allow it", () => {
    const four = [makeBlankPlayer("a1", "A1", "A", "ready"), makeBlankPlayer("a2", "A2", "A", "ready"), makeBlankPlayer("b1", "B1", "B", "ready"), makeBlankPlayer("b2", "B2", "B", "ready")];
    // A1+B2 / A2+B1 (the default split) has been played before; A1+B1 / A2+B2 is just as balanced
    const { team1, team2 } = pickBalancedFoursome(four, new Map([["a1|b2", 2], ["a2|b1", 2]]));
    const pairs = [team1, team2].map((t) => t.map((p) => p.id).sort().join("|"));
    expect(pairs.sort()).toEqual(["a1|b1", "a2|b2"]);
  });

  it("names the real reason for a pick, not just how teams were split", () => {
    const s = buildSuggestion(roster(12), [], [], [], 0)!;
    expect(s.reasons[0]).toMatch(/first in line|has waited/);
    expect(s.balanceNote).toMatch(/^Teams balanced by tier \(/);
  });
});

describe("rotation rules", () => {
  const roster = (n: number) => Array.from({ length: n }, (_, i) => makeBlankPlayer("p" + i, "P" + String(i + 1).padStart(2, "0"), "B", "ready"));
  const done = (id: string, ids: string[]): Match => ({ id, round: 0, num: 1, courtId: "1", status: "completed", t1: [ids[0], ids[1]], t2: [ids[2], ids[3]], s1: 21, s2: 10, elapsedAtTick0: 0 });
  const twoCourts = [{ id: "1", name: "Court 1" }, { id: "2", name: "Court 2" }];
  const at7 = new Date(2026, 8, 30, 19, 0);

  it("does not force the whole waiting group back on when everyone has waited a while", () => {
    // 16 ready, all waited 2 matches: a fixed cap of 2 would make all 16 must-plays and
    // take the first four in roster order, whoever they last played with
    const players = roster(16).map((p) => ({ ...p, skipped: 2 }));
    const meet = new Map<string, number>();
    for (const [a, b] of [["p0", "p1"], ["p0", "p2"], ["p0", "p3"], ["p1", "p2"], ["p1", "p3"], ["p2", "p3"]]) meet.set([a, b].sort().join("|"), 5);
    const four = pickFour(players, meet)!.map((p) => p.id);
    expect(four.filter((id) => ["p0", "p1", "p2", "p3"].includes(id)).length).toBeLessThanOrEqual(1);
  });

  it("still makes someone who has waited a quarter of the pool play", () => {
    const players = roster(8).map((p, i) => ({ ...p, skipped: i === 7 ? 2 : 0 }));
    expect(pickFour(players, new Map())!.map((p) => p.id)).toContain("p7");
  });

  it("holds hosts out of the first round while enough others can play", () => {
    const players = roster(10).map((p, i) => (i < 2 ? { ...p, isHost: true } : p));
    const s = courtSuggestions(twoCourts, players, [], [], {}, at7);
    const played = [...s["1"]!.four, ...s["2"]!.four].map((p) => p.id);
    expect(played).toHaveLength(8);
    expect(played).not.toContain("p0");
    expect(played).not.toContain("p1");
  });

  it("lets hosts in once every open court has started a match", () => {
    const players = roster(12).map((p, i) => (i < 2 ? { ...p, isHost: true } : p));
    const started: Match[] = [done("a", ["p2", "p3", "p4", "p5"]), done("b", ["p6", "p7", "p8", "p9"])].map((m) => ({ ...m, status: "in_progress" as const }));
    // everyone else is on court; only the hosts and two others are left
    expect(hostsHolding(twoCourts, started)).toBe(false);
    const s = buildSuggestion(players, started, [], [], 0, { holdHosts: hostsHolding(twoCourts, started) })!;
    expect(s.four.map((p) => p.id).sort()).toEqual(["p0", "p1", "p10", "p11"]);
  });

  it("never leaves a court empty for a host: with too few others, hosts play", () => {
    const players = roster(6).map((p, i) => (i < 3 ? { ...p, isHost: true } : p));
    expect(buildSuggestion(players, [], [], [], 0, { holdHosts: true })).not.toBeNull();
  });

  it("holds hosts only until each open court has a match", () => {
    expect(hostsHolding(twoCourts, [])).toBe(true);
    expect(hostsHolding(twoCourts, [done("a", ["p0", "p1", "p2", "p3"])])).toBe(true);
    expect(hostsHolding(twoCourts, [done("a", ["p0", "p1", "p2", "p3"]), done("b", ["p4", "p5", "p6", "p7"])])).toBe(false);
    // a paused court doesn't need a match of its own
    expect(hostsHolding([twoCourts[0], { ...twoCourts[1], paused: true }], [done("a", ["p0", "p1", "p2", "p3"])])).toBe(false);
  });

  it("says 'New group' only once everyone ready has played", () => {
    const groups = [["p0", "p1", "p2", "p3"], ["p4", "p5", "p6", "p7"], ["p8", "p9", "p10", "p11"], ["p12", "p13", "p14", "p15"]];
    // one player from each earlier group has waited the longest, so they come up together
    const players = roster(16).map((p) => (["p0", "p4", "p8", "p12"].includes(p.id) ? { ...p, skipped: 3 } : p));
    const all = buildSuggestion(players, groups.map((g, i) => done("m" + i, g)), [], [], 0)!;
    expect(all.four.map((p) => p.id).sort()).toEqual(["p0", "p12", "p4", "p8"].sort());
    expect(all.reasons).toContain("New group");
    const someNeverPlayed = buildSuggestion(players, groups.slice(0, 3).map((g, i) => done("m" + i, g)), [], [], 0)!;
    expect(someNeverPlayed.reasons).not.toContain("New group");
  });
});

describe("matches planned ahead (Up next, Then)", () => {
  const now = new Date(2026, 8, 30, 19, 30);
  const courts = [{ id: "1", name: "Court 1" }, { id: "2", name: "Court 2" }];
  const roster = (n: number) => Array.from({ length: n }, (_, i) => makeBlankPlayer("p" + i, "P" + String(i + 1).padStart(2, "0"), "B", "ready"));
  const live = (id: string, ids: string[], courtId: string): Match => ({ id, round: 0, num: 1, courtId, status: "in_progress", t1: [ids[0], ids[1]], t2: [ids[2], ids[3]], s1: 0, s2: 0, elapsedAtTick0: 0 });
  // 16 players, both courts busy (Court 1 started first), 8 waiting
  const busy = () => {
    const matches = [live("a", ["p0", "p1", "p2", "p3"], "1"), live("b", ["p4", "p5", "p6", "p7"], "2")];
    return { matches, players: applyMatchStart(applyMatchStart(roster(16), [], ["p0", "p1", "p2", "p3"]), [matches[0]], ["p4", "p5", "p6", "p7"]) };
  };
  const plan = (over: Partial<Parameters<typeof planQueue>[0]> = {}) => {
    const { matches, players } = busy();
    return planQueue({ players, matches, courts, requestedPairs: [], existing: [], now, enabled: true, ...over });
  };
  const ids = (q: { team1: string[]; team2: string[] }) => [...q.team1, ...q.team2];

  it("plans one match per open court", () => {
    expect(plan()).toHaveLength(2);
    const three = [...courts, { id: "3", name: "Court 3" }];
    const matches = [live("a", ["p0", "p1", "p2", "p3"], "1"), live("b", ["p4", "p5", "p6", "p7"], "2"), live("c", ["p8", "p9", "p10", "p11"], "3")];
    let players = applyMatchStart(roster(24), [], ["p0", "p1", "p2", "p3"]);
    players = applyMatchStart(players, [matches[0]], ["p4", "p5", "p6", "p7"]);
    players = applyMatchStart(players, matches.slice(0, 2), ["p8", "p9", "p10", "p11"]);
    expect(planQueue({ players, matches, courts: three, requestedPairs: [], existing: [], now, enabled: true })).toHaveLength(3);
    expect(plan({ courts: [courts[0], { ...courts[1], paused: true }] })).toHaveLength(1);
    expect(plan({ courts: [courts[0], { ...courts[1], closesAt: "19:40" }] })).toHaveLength(1); // now = 19:30
  });

  it("15 players on 2 busy courts: Up next from the 7 waiting, Then may use the longest court", () => {
    const matches = [live("a", ["p0", "p1", "p2", "p3"], "1"), live("b", ["p4", "p5", "p6", "p7"], "2")];
    const players = applyMatchStart(applyMatchStart(roster(15), [], ["p0", "p1", "p2", "p3"]), [matches[0]], ["p4", "p5", "p6", "p7"]);
    const q = planQueue({ players, matches, courts, requestedPairs: [], existing: [], now, enabled: true });
    expect(q).toHaveLength(2);
    expect(ids(q[0]).every((id) => Number(id.slice(1)) >= 8)).toBe(true);
    expect(ids(q[1]).some((id) => ["p4", "p5", "p6", "p7"].includes(id))).toBe(false);
    expect(ids(q[1]).filter((id) => ids(q[0]).includes(id))).toEqual([]);
  });

  it("plans 'Up next' and 'Then' for 16 players on 2 busy courts, with four different players each", () => {
    const q = plan();
    expect(q).toHaveLength(2);
    for (const item of q) expect(new Set(ids(item)).size).toBe(4);
    // Up next comes from the waiting players only
    expect(ids(q[0]).every((id) => !["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7"].includes(id))).toBe(true);
    // Then shares nobody with Up next, and never uses the court that is still playing
    expect(ids(q[1]).filter((id) => ids(q[0]).includes(id))).toEqual([]);
    expect(ids(q[1]).some((id) => ["p4", "p5", "p6", "p7"].includes(id))).toBe(false);
  });

  it("'Then' can use the four on the court that has been playing longest", () => {
    // p12-p15 have played together three times and aren't overdue; with nobody else free,
    // putting them together again is the dull pick, so 'Then' mixes in the four about to finish
    const together = (n: number): Match => ({ ...live("old" + n, ["p12", "p13", "p14", "p15"], "1"), status: "completed", s1: 21, s2: 10 });
    const { matches, players } = busy();
    const tuned = players.map((p) => (["p12", "p13", "p14", "p15"].includes(p.id) ? { ...p, skipped: 0, games: 3 } : ["p8", "p9", "p10", "p11"].includes(p.id) ? { ...p, skipped: 1, games: 3 } : { ...p, games: 3 }));
    const q = planQueue({ players: tuned, matches: [together(1), together(2), together(3), ...matches], courts, requestedPairs: [], existing: [], now, enabled: true });
    expect(q).toHaveLength(2);
    expect(ids(q[1]).some((id) => ["p0", "p1", "p2", "p3"].includes(id))).toBe(true);
    // but never the court that started later
    expect(ids(q[1]).some((id) => ["p4", "p5", "p6", "p7"].includes(id))).toBe(false);
  });

  it("locks: a planned match stays as shown when other things change", () => {
    const q = plan();
    const { matches, players } = busy();
    // a late arrival checks in
    const more = [...players, makeBlankPlayer("late", "Late", "B", "ready")];
    expect(planQueue({ players: more, matches, courts, requestedPairs: [], existing: q, now, enabled: true })).toEqual(q);
  });

  it("re-picks a match when one of its players rests, and the match after it", () => {
    const q = plan();
    const { matches, players } = busy();
    const resting = players.map((p) => (p.id === q[0].team1[0] ? { ...p, status: "paused" as const } : p));
    const next = planQueue({ players: resting, matches, courts, requestedPairs: [], existing: q, now, enabled: true });
    expect(ids(next[0])).not.toContain(q[0].team1[0]);
    expect(ids(next[1])).not.toContain(q[0].team1[0]);
    expect(ids(next[1]).filter((id) => ids(next[0]).includes(id))).toEqual([]);
  });

  it("a Then that no longer fits is re-picked on its own, Up next stays", () => {
    const q = plan();
    const { matches, players } = busy();
    const resting = players.map((p) => (p.id === q[1].team2[1] ? { ...p, status: "paused" as const } : p));
    const next = planQueue({ players: resting, matches, courts, requestedPairs: [], existing: q, now, enabled: true });
    expect(next[0]).toEqual(q[0]);
    expect(ids(next[1])).not.toContain(q[1].team2[1]);
  });

  it("Shuffle re-picks one position and keeps the ones before it", () => {
    const q = plan();
    const { matches, players } = busy();
    const shuffled = planQueue({ players, matches, courts, requestedPairs: [], existing: q.slice(0, 1), now, enabled: true, seedAt: { index: 1, seed: 1 } });
    expect(shuffled[0]).toEqual(q[0]);
    expect(shuffled[1].seed).toBe(1);
  });

  it("12 players on 2 courts now plans both; switched off plans nothing", () => {
    const matches = [live("a", ["p0", "p1", "p2", "p3"], "1"), live("b", ["p4", "p5", "p6", "p7"], "2")];
    const players = applyMatchStart(applyMatchStart(roster(12), [], ["p0", "p1", "p2", "p3"]), [matches[0]], ["p4", "p5", "p6", "p7"]);
    expect(planQueue({ players, matches, courts, requestedPairs: [], existing: [], now, enabled: true })).toHaveLength(2);
    expect(plan({ enabled: false })).toEqual([]);
  });

  it("preview seeds re-pick only their own position", () => {
    const q = plan();
    const reseeded = plan({ existing: q.slice(0, 1), seeds: { 1: 3 } });
    expect(reseeded[0]).toEqual(q[0]);
    expect(reseeded[1].seed).toBe(3);
  });

  it("locks the whole plan only when 8+ wait; below that, or with Plan ahead off, nothing", () => {
    expect([lockedCount(2, true, 8), lockedCount(2, true, 7), lockedCount(3, true, 12), lockedCount(2, false, 20)]).toEqual([2, 0, 3, 0]);
  });

  it("lockableWaiting: ready pool minus four per idle open court, +1 when something is locked", () => {
    const { matches, players } = busy(); // 16 players, both courts busy, 8 waiting
    expect(lockableWaiting(players, matches, courts, now, false)).toBe(8);
    expect(lockableWaiting(players, matches, courts, now, true)).toBe(9);
    // Court 2 frees: its four are back in the pool (12), but the idle court takes four of them
    expect(lockableWaiting(players, [matches[0]], courts, now, false)).toBe(8);
    // a paused or closing-soon court is not open, so it takes nobody
    expect(lockableWaiting(players, [matches[0]], [courts[0], { ...courts[1], paused: true }], now, false)).toBe(12);
    expect(lockableWaiting(players, [matches[0]], [courts[0], { ...courts[1], closesAt: "19:40" }], now, false)).toBe(12); // now = 19:30
    // never negative
    expect(lockableWaiting(players, [], courts, now, false)).toBe(8);
    expect(lockableWaiting(players.slice(0, 5), [], courts, now, false)).toBe(0);
  });

  it("with one court open, plans one ahead at most", () => {
    const matches = [live("a", ["p0", "p1", "p2", "p3"], "1")];
    const players = applyMatchStart(roster(16), [], ["p0", "p1", "p2", "p3"]);
    const q = planQueue({ players, matches, courts: [courts[0], { ...courts[1], paused: true }], requestedPairs: [], existing: [], now, enabled: true });
    expect(q).toHaveLength(1);
  });

  it("free courts start the locked matches in order, and the rest are picked fresh", () => {
    const q = plan();
    const { players } = busy();
    const freeCourts = courts;
    const out = courtSuggestions(freeCourts, players.map((p) => ({ ...p })), [], [], {}, now, q);
    expect(out["1"]?.queueIndex).toBe(0);
    expect(out["2"]?.queueIndex).toBe(1);
    expect(out["1"]?.four.map((p) => p.id).sort()).toEqual(ids(q[0]).sort());
  });

  it("a locked match whose players aren't all free is skipped for a fresh pick", () => {
    const q = plan();
    const { players } = busy();
    const out = courtSuggestions([courts[0]], players.map((p) => (p.id === q[0].team1[0] ? { ...p, status: "paused" as const } : p)), [], [], {}, now, q);
    expect(out["1"]?.queueIndex).toBeUndefined();
    expect(out["1"]?.four.some((p) => p.id === q[0].team1[0])).toBe(false);
  });

  it("starting a match takes it out of the queue", () => {
    const q = plan();
    expect(dropStarted(q, ids(q[0]).reverse())).toEqual([q[1]]);
    expect(dropStarted(q, ["x", "y", "z", "w"])).toEqual(q);
  });

  it("the must-play cap also counts players about to join the pool", () => {
    // 8 in the pool, four of them waited 2: with a cap of 2 they are forced together again
    const pool = roster(8).map((p, i) => (i < 4 ? { ...p, skipped: 2 } : p));
    expect(pickFour(pool, new Map())!.map((p) => p.id).sort()).toEqual(["p0", "p1", "p2", "p3"]);
    const meet = new Map<string, number>();
    for (const [a, b] of [["p0", "p1"], ["p0", "p2"], ["p0", "p3"], ["p1", "p2"], ["p1", "p3"], ["p2", "p3"]]) meet.set([a, b].sort().join("|"), 3);
    expect(pickFour(pool, meet, 0, false, 4)!.map((p) => p.id).filter((id) => ["p0", "p1", "p2", "p3"].includes(id)).length).toBeLessThan(4);
  });
});

describe("share card extras", () => {
  const pl = (name: string, over: Partial<Player> = {}): Player => ({ ...makeBlankPlayer(name.toLowerCase(), name, "B", "ready"), games: 4, rankGames: 4, wins: 2, losses: 2, ...over });

  describe("highlights", () => {
    it("🔥 needs a winning streak of 3 or more", () => {
      expect(buildHighlights([pl("Achmad", { recentForm: [-1, 1, 1, 1, 1], wins: 4 })])[0]).toMatchObject({ icon: "🔥", text: "Achmad · 4 wins in a row" });
      expect(buildHighlights([pl("Novi", { recentForm: [1, 1, -1, 1, 1] })]).some((h) => h.icon === "🔥")).toBe(false);
    });

    it("🔥 picks the longest streak, and ignores players with fewer than 3 games", () => {
      const out = buildHighlights([pl("A", { recentForm: [1, 1, 1] }), pl("B", { recentForm: [1, 1, 1, 1] }), pl("C", { rankGames: 2, recentForm: [1, 1, 1, 1, 1] })]);
      expect(out.find((h) => h.icon === "🔥")!.text).toMatch(/^B ·/);
    });

    it("🤝 needs a partnership that won at least 75% of 2+ games", () => {
      const good = pl("Novi", { favPartner: "Raden", favPartnerWin: 100, favPartnerGames: 3 });
      expect(buildHighlights([good]).find((h) => h.icon === "🤝")!.text).toBe("Novi & Raden · won 3 of 3");
      expect(buildHighlights([pl("Novi", { favPartner: "Raden", favPartnerWin: 50, favPartnerGames: 4 })]).some((h) => h.icon === "🤝")).toBe(false);
      expect(buildHighlights([pl("Novi", { favPartner: "Raden", favPartnerWin: 100, favPartnerGames: 1 })]).some((h) => h.icon === "🤝")).toBe(false);
    });

    it("🤝 names the pair alphabetically, by first name, so either player gives the same line", () => {
      const a = buildHighlights([pl("Raden", { favPartner: "Novi", favPartnerWin: 100, favPartnerGames: 2 })]);
      const b = buildHighlights([pl("Novi", { favPartner: "Raden", favPartnerWin: 100, favPartnerGames: 2 })]);
      expect(a[0].text).toBe(b[0].text);
      expect(buildHighlights([pl("Muhammad Alfarizi", { favPartner: "Siti Nurhaliza", favPartnerWin: 100, favPartnerGames: 2 })])[0].text).toBe("Muhammad & Siti · won 2 of 2");
    });

    it("💪 goes to the one player with the most games, and only from 4 games", () => {
      expect(buildHighlights([pl("A", { games: 6 }), pl("B", { games: 5 })]).find((h) => h.icon === "💪")!.text).toBe("A · 6 games");
      expect(buildHighlights([pl("A", { games: 6 }), pl("B", { games: 6 })]).some((h) => h.icon === "💪")).toBe(false);
      expect(buildHighlights([pl("A", { games: 3 }), pl("B", { games: 2 })]).some((h) => h.icon === "💪")).toBe(false);
    });

    it("leaves out players who aren't in the rankings, and sessions without results", () => {
      expect(buildHighlights([pl("Host", { games: 9, inRankings: false, recentForm: [1, 1, 1, 1, 1] })])).toEqual([]);
      expect(buildHighlights([pl("A", { games: 9, recentForm: [1, 1, 1, 1, 1] })], "none")).toEqual([]);
    });

    it("each line is short enough for the card", () => {
      const out = buildHighlights([
        pl("Muhammad Alfarizi Pratama Wijaya", { games: 9, recentForm: [1, 1, 1, 1, 1], favPartner: "Siti Nurhaliza Putri", favPartnerWin: 100, favPartnerGames: 3 }),
      ]);
      expect(out.length).toBe(3);
      for (const h of out) expect(h.text.length).toBeLessThanOrEqual(30);
    });
  });

  describe("short names", () => {
    it("leaves a name that fits alone", () => {
      expect(shortName("Achmad", 12)).toBe("Achmad");
    });
    it("shortens a long full name to first name + last initial", () => {
      expect(shortName("Siti Nurhaliza Putri", 12)).toBe("Siti P.");
      expect(shortName("Muhammad Alfarizi Pratama", 13)).toBe("Muhammad P.");
    });
    it("cuts what still doesn't fit, with an ellipsis", () => {
      expect(shortName("Bartholomeus", 8)).toBe("Barthol…");
      expect(shortName("Bartholomeus Kristianto", 8).length).toBeLessThanOrEqual(8);
    });
  });
});

describe("avatar initials", () => {
  it("tells P01 and P02 apart", () => {
    expect(initialsFor("P01")).toBe("P1");
    expect(initialsFor("P02")).toBe("P2");
    expect(initialsFor("P12")).toBe("P12");
  });
  it("uses both first letters of a two-word name", () => {
    expect(initialsFor("Budi Santoso")).toBe("BS");
  });
  it("keeps the first two letters of a plain name", () => {
    expect(initialsFor("Andi")).toBe("AN");
    expect(initialsFor("")).toBe("?");
  });
});

describe("arrival order", () => {
  const at = (id: string, idleSince?: number, over: Partial<Player> = {}): Player => ({ ...makeBlankPlayer(id, id, "B", "ready"), ...(idleSince === undefined ? {} : { idleSince }), ...over });

  it("equal priority goes to whoever became free first; unknown times last", () => {
    const order = playerPriority([at("c", 300), at("x"), at("a", 100), at("b", 200)]).map((p) => p.id);
    expect(order).toEqual(["a", "b", "c", "x"]);
  });

  it("the same check-in time (Check In All) keeps roster order", () => {
    expect(playerPriority([at("p2", 50), at("p1", 50), at("p3", 50)]).map((p) => p.id)).toEqual(["p2", "p1", "p3"]);
  });

  it("waiting count still beats arrival time", () => {
    expect(playerPriority([at("early", 1), at("late", 999, { skipped: 1 })])[0].id).toBe("late");
  });

  it("round 1 suggests the first four to check in", () => {
    const players = ["h", "g", "f", "e", "d", "c", "b", "a"].map((id, i) => at(id, 1000 - i * 10)); // a checked in first
    const sug = buildSuggestion(players, [], [], [], 0)!;
    expect(sug.four.map((p) => p.id).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("a saved or cancelled match stamps its four as free now", () => {
    const players = ["a", "b", "c", "d", "e"].map((id) => at(id, 5));
    const out = applyAfterMatch(players, { t1: ["a", "b"], t2: ["c", "d"] }, 777);
    expect(out.map((p) => p.idleSince)).toEqual([777, 777, 777, 777, 5]);
  });

  it("markReady stamps the time; a new session clears it", () => {
    const p = markReady(makeBlankPlayer("a", "A", "B", "expected"), 42);
    expect([p.status, p.idleSince]).toEqual(["ready", 42]);
    expect(resetPlayersForNewSession([p])[0].idleSince).toBeUndefined();
  });
});
