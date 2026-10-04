import { describe, expect, it } from "vitest";
import type { Match, Player, SkillLevel } from "../types";
import { makeBlankPlayer } from "./session";
import { HARD_GAME_AFTER_CARRIES, carriesSinceHard, hardGamePick, isHardMatch, isUpper } from "./hardGames";

const P = (id: string, level: SkillLevel, over: Partial<Player> = {}): Player => ({ ...makeBlankPlayer(id, id, level, "ready"), ...over });
const M = (id: string, t1: [string, string], t2: [string, string], status: Match["status"] = "completed"): Match => ({ id, round: 0, num: 1, courtId: "1", status, t1, t2, s1: 21, s2: 15, elapsedAtTick0: 0 });

describe("hard games: definitions", () => {
  const roster = [P("a1", "A"), P("b1", "B"), P("b2", "B"), P("b3", "B"), P("c1", "C"), P("c2", "C")];
  const levelOf = (id: string) => roster.find((p) => p.id === id)?.level;

  it("upper tier is A or B; a hard match has no C", () => {
    expect([isUpper("A"), isUpper("B"), isUpper("C"), isUpper(undefined)]).toEqual([true, true, false, false]);
    expect(isHardMatch(M("m", ["a1", "b1"], ["b2", "b3"]), levelOf)).toBe(true);
    expect(isHardMatch(M("m", ["a1", "c1"], ["b2", "b3"]), levelOf)).toBe(false);
  });

  it("counts carries for upper players only and resets on any hard match", () => {
    const carry1 = M("m1", ["a1", "c1"], ["b1", "c2"]);
    const carry2 = M("m2", ["a1", "c2"], ["b2", "b3"]);
    expect(carriesSinceHard(roster, [carry1]).get("a1")).toBe(1);
    expect(carriesSinceHard(roster, [carry1, carry2]).get("a1")).toBe(HARD_GAME_AFTER_CARRIES);
    expect(carriesSinceHard(roster, [carry1, carry2]).get("b2")).toBe(0); // partnered b3
    expect(carriesSinceHard(roster, [carry1, carry2]).has("c1")).toBe(false);
    expect(carriesSinceHard(roster, [carry1, carry2, M("h", ["a1", "b1"], ["b2", "b3"], "in_progress")]).get("a1")).toBe(0);
    expect(carriesSinceHard(roster, [carry1, M("live", ["a1", "c2"], ["b2", "b3"], "in_progress")]).get("a1")).toBe(1); // not played yet
  });

  it("a deleted player in the history doesn't crash and isn't upper tier", () => {
    expect(isHardMatch(M("m", ["a1", "gone"], ["b2", "b3"]), levelOf)).toBe(false);
    expect(carriesSinceHard(roster, [M("m", ["a1", "gone"], ["b2", "b3"])]).get("a1")).toBe(0);
  });

  it("uses the current tier: a C promoted to B no longer counts as carried", () => {
    const promoted = roster.map((p) => (p.id === "c1" ? { ...p, level: "B" as const } : p));
    expect(carriesSinceHard(promoted, [M("m1", ["a1", "c1"], ["b1", "c2"])]).get("a1")).toBe(0);
  });
});

describe("hard games: when one can be planned", () => {
  const pool = [P("a1", "A"), P("b1", "B"), P("c1", "C"), P("b2", "B"), P("b3", "B"), P("c2", "C")];
  const carries = new Map([["a1", 2], ["b1", 0], ["b2", 3], ["b3", 1]]);
  const base = { pool, mustPlay: [] as Player[], carries, enabled: true, hardActive: false };

  it("picks the due players first, most carries first", () => {
    const pick = hardGamePick(base)!;
    expect(pick.due.map((p) => p.id)).toEqual(["b2", "a1"]);
    expect(pick.forced.map((p) => p.id)).toEqual(["b2", "a1"]);
    expect(pick.candidates.map((p) => p.id)).toEqual(["a1", "b1", "b2", "b3"]);
  });

  it("must-play upper players come before due ones", () => {
    expect(hardGamePick({ ...base, mustPlay: [pool[4]] /* b3 */ })!.forced.map((p) => p.id)).toEqual(["b3", "b2", "a1"]);
  });

  it("never when off, when one is already on, when a C must play, without 4 upper, or nobody due", () => {
    expect(hardGamePick({ ...base, enabled: false })).toBeNull();
    expect(hardGamePick({ ...base, hardActive: true })).toBeNull();
    expect(hardGamePick({ ...base, mustPlay: [pool[2]] })).toBeNull();
    expect(hardGamePick({ ...base, pool: pool.filter((p) => p.id !== "b3") })).toBeNull();
    expect(hardGamePick({ ...base, carries: new Map([["a1", 1], ["b2", 1]]) })).toBeNull();
  });
});
