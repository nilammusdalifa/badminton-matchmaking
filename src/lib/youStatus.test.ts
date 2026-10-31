import { describe, expect, it } from "vitest";
import { ordinal, youStatus } from "./youStatus";

const base = { waitingIds: ["a", "b", "c", "d", "e", "f"], plannedIds: [] as string[][], playingCourt: null, resting: false, ended: false };

describe("youStatus", () => {
  it("on court wins over everything", () => expect(youStatus("d", { ...base, playingCourt: "Court 1", resting: true })).toBe("You're playing on Court 1"));
  it("in Up next", () => expect(youStatus("d", { ...base, plannedIds: [["d", "e", "f", "a"]] })).toBe("You're in the next match"));
  it("in Then", () => expect(youStatus("d", { ...base, plannedIds: [["a", "b", "c", "e"], ["d", "f", "x", "y"]] })).toBe("You're in the match after"));
  it("passed over: someone below is planned", () =>
    expect(youStatus("d", { ...base, plannedIds: [["a", "b", "c", "f"]] })).toBe("You're 4th in line · not in the next match – picks also mix groups and even out teams"));
  it("passed over uses the reason when given", () =>
    expect(youStatus("d", { ...base, plannedIds: [["a", "b", "c", "f"]], reason: "Balancing teams" })).toBe("You're 4th in line · Balancing teams"));
  it("4th with nobody below planned", () => expect(youStatus("d", { ...base, plannedIds: [["a", "b", "c", "x"]] })).toBe("You're 4th in line"));
  it("first with no plan", () => expect(youStatus("a", base)).toBe("You're next in line"));
  it("resting", () => expect(youStatus("z", { ...base, resting: true })).toBe("You're resting"));
  it("left: not waiting, not resting", () => expect(youStatus("z", base)).toBeNull());
  it("ended", () => expect(youStatus("d", { ...base, ended: true })).toBeNull());
  it("ordinals", () => expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd"]));
});
