import { describe, expect, it } from "vitest";
import { loadRankingSort, saveRankingSort, sortRankings } from "./rankingSort";
import { buildGamesPlayed, isBehind, makeBlankPlayer, mostMatchesPlayed } from "./session";
import type { Player, PlayerStatus } from "../types";

const player = (name: string, games: number, status: PlayerStatus = "ready"): Player => ({ ...makeBlankPlayer(name.toLowerCase(), name, "B", status), games });

describe("sortRankings", () => {
  const rows = [
    { name: "Rank 1", matchesPlayed: 7 },
    { name: "Rank 2", matchesPlayed: 3 },
    { name: "Rank 3", matchesPlayed: 7 },
    { name: "Rank 4", matchesPlayed: 0 },
    { name: "Rank 5", matchesPlayed: 3 },
  ];
  it("keeps the order it was given for Rank", () => {
    expect(sortRankings(rows, "rank").map((r) => r.name)).toEqual(["Rank 1", "Rank 2", "Rank 3", "Rank 4", "Rank 5"]);
  });
  it("lists the fewest matches played first, keeping rank order among equals", () => {
    expect(sortRankings(rows, "matches").map((r) => [r.name, r.matchesPlayed])).toEqual([
      ["Rank 4", 0],
      ["Rank 2", 3],
      ["Rank 5", 3],
      ["Rank 1", 7],
      ["Rank 3", 7],
    ]);
  });
  it("doesn't reorder the list it was given", () => {
    sortRankings(rows, "matches");
    expect(rows[0].name).toBe("Rank 1");
  });
});

describe("remembering the sort", () => {
  const storage = (initial: string | null = null) => {
    let value = initial;
    return { getItem: () => value, setItem: (_k: string, v: string) => void (value = v) };
  };
  const blocked = {
    getItem: () => {
      throw new DOMException("blocked", "SecurityError");
    },
    setItem: () => {
      throw new DOMException("blocked", "QuotaExceededError");
    },
  };

  it("defaults to rank, and reads back what was saved", () => {
    const s = storage();
    expect(loadRankingSort(s)).toBe("rank");
    saveRankingSort("matches", s);
    expect(loadRankingSort(s)).toBe("matches");
    saveRankingSort("rank", s);
    expect(loadRankingSort(s)).toBe("rank");
  });
  it("ignores anything it doesn't recognise", () => {
    expect(loadRankingSort(storage("fewest"))).toBe("rank");
  });
  it("survives blocked storage on both read and write", () => {
    expect(loadRankingSort(blocked)).toBe("rank");
    expect(() => saveRankingSort("matches", blocked)).not.toThrow();
  });
  it("survives localStorage itself being unreachable", () => {
    // in the test environment there is no localStorage at all, which is the same as a blocked accessor
    expect(loadRankingSort()).toBe("rank");
    expect(() => saveRankingSort("matches")).not.toThrow();
  });
});

describe("behind", () => {
  it("is two or more matches below the busiest player", () => {
    const most = 5;
    expect(isBehind(player("A", 3), most)).toBe(true);
    expect(isBehind(player("B", 4), most)).toBe(false);
    expect(isBehind(player("C", 5), most)).toBe(false);
  });
  it("never flags someone who has left", () => {
    expect(isBehind(player("A", 0, "left"), 5)).toBe(false);
  });
  it("measures from players who have been here, not from anyone not yet checked in", () => {
    expect(mostMatchesPlayed([player("A", 4), player("B", 0, "expected")])).toBe(4);
    expect(mostMatchesPlayed([])).toBe(0);
  });
  it("agrees with the Session tab's warning for every player", () => {
    const players = [player("A", 1), player("B", 1), player("C", 3, "left"), player("D", 4), player("E", 5), player("F", 5), player("G", 2, "paused"), player("H", 0, "expected")];
    const most = mostMatchesPlayed(players);
    const warned = new Set(buildGamesPlayed(players, new Set()).rows.filter((r) => r.warn).flatMap((r) => r.text.split(" · ")));
    for (const p of players) {
      const here = p.status !== "expected" || p.games > 0;
      expect(here && isBehind(p, most), p.name).toBe(warned.has(p.name));
    }
  });
});
