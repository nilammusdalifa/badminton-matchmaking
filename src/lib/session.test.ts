import { describe, expect, it } from "vitest";
import type { Match, Player } from "../types";
import { applyLiveScore, applyMatchStart, buildSuggestion, canRemovePlayer, courtCloseReminders, courtsDueToPause, courtSuggestions, fewPlayersHint, hostsHolding, initialsFor, isCourtClosingSoon, isCourtKeptOpen, isCourtPastClosing, keepCourtOpen, pairCounts, pickBalancedFoursome, pickFour, resetCourtsForNewSession, resumeCourt, scheduleEndTime, isFirstRun, liveScoreFor, makeBlankPlayer, nameTaken, photoReminderMinutes, rankPlayers, recomputePlayerStats, syncFingerprint, withListDefaults } from "./session";

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

  it("rankPlayers gives no rank to players without games", () => {
    const ranked = rankPlayers(stats);
    expect(ranked.map((r) => [r.player.name, r.rank])).toEqual([
      ["Ana", 1],
      ["Bo", 2],
      ["Cy", 3],
      ["Di", 4],
      ["Eka", null],
    ]);
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

  it("rankPlayers orders by wins first, then point difference", () => {
    const ppl = ["X", "P", "Q", "Y", "R", "S"].map(player);
    const s = recomputePlayerStats(ppl, [
      completed("m1", ["x", "p"], ["q", "r"], 21, 20), // X wins by 1
      completed("m2", ["x", "p"], ["q", "r"], 21, 20), // X wins by 1
      completed("m3", ["x", "q"], ["p", "r"], 11, 21), // X loses by 10 -> X: 2 wins, 1 loss, diff -8
      completed("m4", ["y", "s"], ["r", "q"], 21, 2), //  Y wins by 19 -> Y: 1 win, 0 losses, diff +19
    ]);
    const order = rankPlayers(s).map((r) => r.player.name);
    // the old hidden rating put Y (1172) above X (1096); wins come first now
    expect(order.indexOf("X")).toBeLessThan(order.indexOf("Y"));
    // equal wins: the bigger point difference ranks higher (P and Y both won once... P won 2)
    const eq = rankPlayers(s).filter((r) => r.player.wins === 1).map((r) => r.player.name);
    expect(eq).toEqual([...eq].sort((a, b) => s.find((p) => p.name === b)!.diff - s.find((p) => p.name === a)!.diff));
  });

  it("rankPlayers leaves everyone unranked when the session doesn't record results", () => {
    const ppl = ["Ana", "Bo"].map(player);
    const s = recomputePlayerStats(ppl, [completed("a", ["ana", "bo"], ["x", "y"], 0, 0)]);
    expect(rankPlayers(s, "none").map((r) => r.rank)).toEqual([null, null]);
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
