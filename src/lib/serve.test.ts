import { describe, expect, it } from "vitest";
import { afterRally, serverOf, startServe, swapReceivers, swapReceiversInSteps, type ServeState, type Team } from "./serve";

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

  describe("picking the server mid-match (sheet reopened, reload, typed score)", () => {
    it("puts the picked player on the right at an even score, for either team", () => {
      expect(startServe("t1", 1, { t1: 4, t2: 3 })).toEqual({ serving: "t1", right: { t1: 1, t2: 0 } });
      expect(serverOf(startServe("t1", 1, { t1: 4, t2: 3 }), { t1: 4, t2: 3 })).toEqual({ team: "t1", player: 1, side: "right" });
      expect(startServe("t2", 1, { t1: 3, t2: 2 })).toEqual({ serving: "t2", right: { t1: 0, t2: 1 } });
      expect(serverOf(startServe("t2", 1, { t1: 3, t2: 2 }), { t1: 3, t2: 2 })).toEqual({ team: "t2", player: 1, side: "right" });
    });

    it("names the picked player, from the left, at an odd score, for either team", () => {
      for (const player of [0, 1] as const) {
        expect(serverOf(startServe("t1", player, { t1: 3, t2: 2 }), { t1: 3, t2: 2 })).toEqual({ team: "t1", player, side: "left" });
        expect(serverOf(startServe("t2", player, { t1: 2, t2: 5 }), { t1: 2, t2: 5 })).toEqual({ team: "t2", player, side: "left" });
      }
    });

    it("the receiving team is still guessed with index 0 on the right", () => {
      expect(startServe("t1", 0, { t1: 3, t2: 2 }).right.t2).toBe(0);
      expect(startServe("t2", 0, { t1: 3, t2: 1 }).right.t1).toBe(0);
    });
  });

  describe("Swap receivers on the Undo history", () => {
    it("flipping one team's court at the start flips it at every later rally, nothing else changes", () => {
      // Why a correction can be applied to every step since the pick: no rule
      // depends on where a player stands, only on who won.
      const flipT2 = (s: ServeState): ServeState => ({ ...s, right: { ...s.right, t2: s.right.t2 === 0 ? 1 : 0 } });
      let a = startServe("t1", 0);
      let b = flipT2(a);
      for (const w of winners) {
        a = afterRally(a, w);
        b = afterRally(b, w);
        expect(b).toEqual(flipT2(a));
      }
    });

    // Plays the store's history operations on a plain list of steps.
    type Step = { t1: number; t2: number; serve?: ServeState; picked?: boolean };
    const last = (h: Step[]) => h[h.length - 1];
    const pick = (h: Step[], team: Team, player: 0 | 1): Step[] => [...h.slice(0, -1), { ...last(h), serve: startServe(team, player, last(h)), picked: true }];
    const point = (h: Step[], w: Team): Step[] => {
      const { t1, t2, serve } = last(h);
      const score = { t1: t1 + (w === "t1" ? 1 : 0), t2: t2 + (w === "t2" ? 1 : 0) };
      return [...h, serve ? { ...score, serve: afterRally(serve, w) } : score];
    };
    const undo = (h: Step[]) => h.slice(0, -1);
    const server = (h: Step[]) => serverOf(last(h).serve!, last(h));

    it("keeps the correction when Undo goes back past it", () => {
      let h: Step[] = [{ t1: 0, t2: 0 }];
      h = pick(h, "t1", 0);
      h = point(h, "t1");
      h = swapReceiversInSteps(h);
      expect(h).toHaveLength(2); // still one step per point
      h = undo(h);
      expect(last(h).serve).toEqual({ serving: "t1", right: { t1: 0, t2: 1 } });
      h = point(h, "t2");
      // B0 was really on the right at 0–0, so at 0–1 B0 serves from the left.
      expect(server(h)).toEqual({ team: "t2", player: 0, side: "left" });
    });

    it("leaves steps from before the server was picked alone", () => {
      const earlier: Step = { t1: 2, t2: 1, serve: startServe("t2", 0, { t1: 2, t2: 1 }) };
      let h: Step[] = [earlier, { t1: 5, t2: 1 }]; // a typed score cleared the serve
      h = pick(h, "t1", 1);
      h = point(h, "t1");
      h = swapReceiversInSteps(h);
      expect(h[0]).toEqual(earlier);
      expect(h[1].serve!.right.t2).toBe(1);
      expect(h[2].serve!.right.t2).toBe(1);
    });

    it("does nothing while the server is unknown", () => {
      const h: Step[] = [{ t1: 3, t2: 2 }];
      expect(swapReceiversInSteps(h)).toEqual(h);
    });
  });
});
