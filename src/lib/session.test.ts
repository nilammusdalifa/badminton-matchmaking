import { describe, expect, it } from "vitest";
import type { Match, Player } from "../types";
import { applyLiveScore, canRemovePlayer, courtCloseKey, courtCloseReminders, isFirstRun, liveScoreFor, makeBlankPlayer, nameTaken, photoReminderMinutes, rankPlayers, recomputePlayerStats, syncFingerprint, withListDefaults } from "./session";

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

describe("court closing reminder", () => {
  const at = (h: number, m: number) => new Date(2026, 8, 30, h, m, 0, 0);
  const courtA = { id: "1", name: "Court A", closesAt: "22:00" };
  const courtB = { id: "2", name: "Court B", closesAt: "21:00" };
  const busyOnB: Match = { id: "m", round: 1, num: 1, courtId: "2", status: "in_progress", t1: ["a", "b"], t2: ["c", "d"], s1: 0, s2: 0, elapsedAtTick0: 0 };

  it("only flags the court that is about to close", () => {
    const r = courtCloseReminders([courtA, courtB], [], at(20, 55));
    expect(r.map((x) => x.courtId)).toEqual(["2"]);
    expect(r[0].minutesLeft).toBe(5);
  });

  it("stays quiet earlier than 10 minutes before closing", () => {
    expect(courtCloseReminders([courtA, courtB], [], at(20, 45))).toEqual([]);
  });

  it("keeps flagging after closing, for a while", () => {
    expect(courtCloseReminders([courtB], [], at(21, 20))[0].minutesLeft).toBeLessThanOrEqual(0);
    expect(courtCloseReminders([courtB], [], at(23, 30))).toEqual([]);
  });

  it("says when a match is still being played there", () => {
    expect(courtCloseReminders([courtB], [busyOnB], at(21, 0))[0].busy).toBe(true);
    expect(courtCloseReminders([courtB], [], at(21, 0))[0].busy).toBe(false);
  });

  it("skips paused courts, courts without a time, and dismissed reminders", () => {
    expect(courtCloseReminders([{ ...courtB, paused: true }], [], at(21, 0))).toEqual([]);
    expect(courtCloseReminders([{ id: "3", name: "Court C" }], [], at(21, 0))).toEqual([]);
    expect(courtCloseReminders([courtB], [], at(21, 0), [courtCloseKey(courtB)])).toEqual([]);
    // a changed closing time asks again
    expect(courtCloseReminders([{ ...courtB, closesAt: "21:05" }], [], at(21, 0), [courtCloseKey(courtB)])).toHaveLength(1);
  });

  it("works across midnight", () => {
    const late = { id: "4", name: "Court D", closesAt: "00:05" };
    expect(courtCloseReminders([late], [], at(23, 58))[0].minutesLeft).toBe(7);
    expect(courtCloseReminders([late], [], at(23, 40))).toEqual([]);
    expect(courtCloseReminders([late], [], at(0, 20))[0].minutesLeft).toBeLessThanOrEqual(0);
  });

  it("ignores a malformed time", () => {
    expect(courtCloseReminders([{ ...courtB, closesAt: "25:00" }], [], at(21, 0))).toEqual([]);
  });
});
