import { describe, expect, it } from "vitest";
import type { Match, Player } from "../types";
import { applyLiveScore, canRemovePlayer, isFirstRun, liveScoreFor, makeBlankPlayer, nameTaken, rankPlayers, recomputePlayerStats, syncFingerprint, withListDefaults } from "./session";

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

  it("recomputePlayerStats shows no tough opponent without a loss", () => {
    expect(stats.find((p) => p.name === "Ana")!.toughOpp).toBe("—");
    expect(stats.find((p) => p.name === "Cy")!.toughOpp).not.toBe("—");
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
