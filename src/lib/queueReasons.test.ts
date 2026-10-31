import { describe, expect, it } from "vitest";
import type { Match, Player, QueueItem } from "../types";
import { copy } from "./copy";
import { queueReasons } from "./queueReasons";
import { makeBlankPlayer, playerPriority } from "./session";

/** 6 ready players a..f, no matches, equal counters; `overrides` changes some of them. */
const six = (overrides: Record<string, Partial<Player>> = {}): Player[] =>
  ["a", "b", "c", "d", "e", "f"].map((id) => ({ ...makeBlankPlayer(id, id.toUpperCase(), "B", "ready"), ...overrides[id] }));
const ordered = playerPriority(six());
const item = (ids: string[], extra: Partial<QueueItem> = {}): QueueItem => ({
  team1: [ids[0], ids[1]],
  team2: [ids[2], ids[3]],
  seed: 0,
  reasons: ["x"],
  balanceNote: null,
  ...extra,
});
/** Reasons with one planned match. The queue is in priority order, as the app shows it. */
const reasonsFor = (ids: string[], overrides: Record<string, Partial<Player>> = {}, extra: Partial<QueueItem> = {}, matches: Match[] = []) =>
  queueReasons({ ordered: playerPriority(six(overrides)), plan: [item(ids, extra)], matches, requestedPairs: [], holdingHosts: false, singleCourt: true });
const done = (id: string, t1: [string, string], t2: [string, string]): Match => ({ id, round: 1, num: 1, courtId: "1", status: "completed", t1, t2, s1: 21, s2: 15, elapsedAtTick0: 0 });
/** `who` has shared two matches with each of `others` (opponents x and y are not here tonight). */
const metTwice = (who: string, others: string[]): Match[] =>
  others.flatMap((o) => [done(`${o}1`, [who, o], ["x", "y"]), done(`${o}2`, [who, o], ["x", "y"])]);

describe("queueReasons", () => {
  it("planned players", () => {
    const r = queueReasons({ ordered, plan: [item(["a", "b", "c", "d"]), item(["e", "f", "a", "b"])], matches: [], requestedPairs: [], holdingHosts: false, singleCourt: true });
    expect([r.get("a"), r.get("e")]).toEqual(["next", "after"]);
  });
  it("nobody below planned: no reason", () => expect(reasonsFor(["a", "b", "c", "d"]).get("e")).toBeNull());
  // skipped 1 keeps a first in line (priority 10 − 6) despite 2 in a row
  it("played two in a row", () => expect(reasonsFor(["b", "c", "d", "e"], { a: { consecutiveGames: 2, skipped: 1 } }).get("a")).toBe("streak"));
  it("host held back", () => {
    const r = queueReasons({ ordered: playerPriority(six({ a: { isHost: true } })), plan: [item(["b", "c", "d", "e"])], matches: [], requestedPairs: [], holdingHosts: true, singleCourt: true });
    expect(r.get("a")).toBe("host");
  });
  it("umpire edited or shuffled", () => {
    expect(reasonsFor(["b", "c", "d", "e"], {}, { seed: 2 }).get("a")).toBe("manual");
    expect(reasonsFor(["b", "c", "d", "e"], {}, { reasons: [copy.reason.setByUmpire] }).get("a")).toBe("manual");
  });
  it("umpire set it, even when it is a hard match", () =>
    expect(reasonsFor(["b", "c", "d", "e"], {}, { reasons: [copy.reason.setByUmpire], hard: true }).get("a")).toBe("manual"));
  it("hard match planned", () => expect(reasonsFor(["b", "c", "d", "e"], {}, { hard: true }).get("a")).toBe("relief"));
  it("D-free match planned", () => expect(reasonsFor(["b", "c", "d", "e"], {}, { noD: true }).get("a")).toBe("relief"));
  it("partner request", () => {
    const r = queueReasons({ ordered, plan: [item(["b", "c", "d", "e"])], matches: [], requestedPairs: [["c", "b"]], holdingHosts: false, singleCourt: true });
    expect(r.get("a")).toBe("request");
  });
  it("passed over for a later match: mixes in players coming off court", () => {
    const r = queueReasons({ ordered, plan: [item(["a", "b", "c", "d"]), item(["f", "a", "b", "c"])], matches: [], requestedPairs: [], holdingHosts: false, singleCourt: false });
    expect(r.get("e")).toBe("courtMix");
  });
  it("would repeat a group", () => {
    // a has already met b, c and d twice each; e has met nobody
    expect(reasonsFor(["b", "c", "d", "e"], {}, {}, metTwice("a", ["b", "c", "d"])).get("a")).toBe("mix");
  });
  // skipped 1 keeps a first in line despite 3 matches played (priority 10 − 1.5)
  it("has played more", () => expect(reasonsFor(["b", "c", "d", "e"], { a: { games: 3, skipped: 1 } }).get("a")).toBe("fair"));
  it("equal cost: balancing", () => expect(reasonsFor(["b", "c", "d", "e"]).get("a")).toBe("balance"));
  it("every passed-over row has a reason", () => {
    const r = reasonsFor(["c", "d", "e", "f"]);
    expect([r.get("a"), r.get("b")].every((x) => x !== null && x !== undefined)).toBe(true);
  });
});
