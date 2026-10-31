import { describe, expect, it } from "vitest";
import { afterRally, serverOf, startServe, swapReceivers, type Team } from "./serve";

describe("serve", () => {
  // BWF doubles, worked through by hand; team 1 = A0, A1, team 2 = B0, B1;
  // A0 serves first from the right, B0 receives.
  const winners: Team[] = ["t1", "t1", "t2", "t2", "t1", "t2", "t1", "t1", "t1", "t2", "t2", "t2", "t1", "t2", "t1", "t1", "t2", "t1", "t1", "t2"];
  const expected = [
    ["A0", "left", "1-0"], ["A0", "right", "2-0"], ["B1", "left", "2-1"], ["B1", "right", "2-2"], ["A1", "left", "3-2"],
    ["B0", "left", "3-3"], ["A0", "right", "4-3"], ["A0", "left", "5-3"], ["A0", "right", "6-3"], ["B1", "right", "6-4"],
    ["B1", "left", "6-5"], ["B1", "right", "6-6"], ["A1", "left", "7-6"], ["B0", "left", "7-7"], ["A0", "right", "8-7"],
    ["A0", "left", "9-7"], ["B1", "right", "9-8"], ["A1", "right", "10-8"], ["A1", "left", "11-8"], ["B0", "left", "11-9"],
  ];

  it("follows badminton doubles service over 20 rallies", () => {
    let s = startServe("t1", 0);
    const score = { t1: 0, t2: 0 };
    expect(serverOf(s, score)).toEqual({ team: "t1", player: 0, side: "right" });
    winners.forEach((w, i) => {
      s = afterRally(s, w);
      score[w]++;
      const { team, player, side } = serverOf(s, score);
      expect([`${team === "t1" ? "A" : "B"}${player}`, side, `${score.t1}-${score.t2}`]).toEqual(expected[i]);
    });
  });

  it("swapReceivers only moves the team not serving", () => {
    expect(swapReceivers(startServe("t1", 1))).toEqual({ serving: "t1", right: { t1: 1, t2: 1 } });
  });
});
