import { describe, expect, it } from "vitest";
import type { Match, Player, SkillLevel } from "../types";
import { makeBlankPlayer } from "./session";
import { HARD_GAME_AFTER_CARRIES, carriesSinceHard, dCarriesSinceRelief, hardGamePick, isDFreeMatch, isHardMatch, isLower, isUpper } from "./hardGames";

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

describe("hard games with tier D", () => {
  const roster = [P("a1", "A"), P("a2", "A"), P("b1", "B"), P("b2", "B"), P("c1", "C"), P("d1", "D"), P("d2", "D")];

  it("lower tier is C or D; a player we no longer know is neither", () => {
    expect([isLower("C"), isLower("D"), isLower("A"), isLower("B"), isLower(undefined)]).toEqual([true, true, false, false, false]);
    expect(isUpper("D")).toBe(false);
  });

  it("carrying a D partner counts, the same as a C; a deleted partner doesn't", () => {
    const withD = M("m1", ["a1", "d1"], ["b1", "c1"]);
    const withC = M("m2", ["a1", "c1"], ["b1", "d2"]);
    const withGone = M("m3", ["a2", "gone"], ["b2", "d1"]);
    const carries = carriesSinceHard(roster, [withD, withC, withGone]);
    expect(carries.get("a1")).toBe(HARD_GAME_AFTER_CARRIES);
    expect(carries.get("b1")).toBe(2); // partnered c1, then d2
    expect(carries.get("a2")).toBe(0);
  });

  it("a D who must play blocks a hard game, as a C does", () => {
    const upper = roster.filter((p) => isUpper(p.level));
    const carries = new Map([["a1", 2]]);
    const args = { pool: upper, carries, enabled: true, hardActive: false };
    expect(hardGamePick({ ...args, mustPlay: [] })).not.toBeNull();
    expect(hardGamePick({ ...args, mustPlay: [P("d1", "D")] })).toBeNull();
  });
});

describe("relief games: a C who has carried a D", () => {
  const roster = [P("a1", "A"), P("b1", "B"), P("b2", "B"), P("c1", "C"), P("c2", "C"), P("c3", "C"), P("d1", "D"), P("d2", "D"), P("d3", "D")];
  const levelOf = (id: string) => roster.find((p) => p.id === id)?.level;

  it("a D-free match has four known players, none in D", () => {
    expect(isDFreeMatch(M("m", ["a1", "c1"], ["b1", "c2"]), levelOf)).toBe(true);
    expect(isDFreeMatch(M("m", ["a1", "d1"], ["b1", "c2"]), levelOf)).toBe(false);
    expect(isDFreeMatch(M("m", ["a1", "gone"], ["b1", "c2"]), levelOf)).toBe(false); // a deleted player is unknown
  });

  it("counts a C's carries of a D partner, and resets on any D-free match", () => {
    const withD1 = M("m1", ["c1", "d1"], ["c2", "d2"]);
    const withD2 = M("m2", ["c1", "d2"], ["c3", "d3"]);
    const carries = dCarriesSinceRelief(roster, [withD1, withD2]);
    expect(carries.get("c1")).toBe(HARD_GAME_AFTER_CARRIES);
    expect(carries.get("c2")).toBe(1);
    expect(carries.has("a1")).toBe(false); // only C players are tracked
    expect(carries.has("d1")).toBe(false);
    expect(dCarriesSinceRelief(roster, [withD1, withD2, M("r", ["c1", "a1"], ["b1", "b2"], "in_progress")]).get("c1")).toBe(0);
    expect(dCarriesSinceRelief(roster, [withD1, M("live", ["c1", "d3"], ["c2", "d2"], "in_progress")]).get("c1")).toBe(1); // not played yet
  });

  const args = { pool: roster, mustPlay: [] as Player[], carries: new Map<string, number>(), dCarries: new Map([["c1", 2], ["c2", 1]]), enabled: true, hardActive: false };

  it("a due C gets a D-free match: forced in, candidates in A–C only", () => {
    const pick = hardGamePick(args)!;
    expect(pick.kind).toBe("mid");
    expect(pick.forced.map((p) => p.id)).toEqual(["c1"]);
    expect(pick.candidates.every((p) => p.level !== "D")).toBe(true);
    expect(pick.due.map((p) => p.id)).toEqual(["c1"]);
  });

  it("an all-A/B hard game comes first when an upper player is due", () => {
    const upper = [P("a1", "A"), P("a2", "A"), P("b1", "B"), P("b2", "B"), P("c1", "C"), P("d1", "D")];
    const pick = hardGamePick({ ...args, pool: upper, carries: new Map([["a1", 2]]) })!;
    expect(pick.kind).toBe("upper");
  });

  it("never while a D must play, a hard game is on or planned, nobody is due, fewer than four are in A–C, or it is off", () => {
    expect(hardGamePick({ ...args, mustPlay: [P("d2", "D")] })).toBeNull();
    expect(hardGamePick({ ...args, hardActive: true })).toBeNull();
    expect(hardGamePick({ ...args, dCarries: new Map([["c1", 1]]) })).toBeNull();
    expect(hardGamePick({ ...args, pool: roster.filter((p) => p.level === "D" || ["c1", "b1", "b2"].includes(p.id)) })).toBeNull();
    expect(hardGamePick({ ...args, enabled: false })).toBeNull();
    expect(hardGamePick({ ...args, dCarries: undefined })).toBeNull();
  });

  it("a C who must play is forced in alongside the due one", () => {
    const pick = hardGamePick({ ...args, mustPlay: [P("c3", "C")] })!;
    expect(pick.forced.map((p) => p.id)).toEqual(["c3", "c1"]);
  });
});
