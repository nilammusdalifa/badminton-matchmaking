import { describe, expect, it } from "vitest";
import { formatAgo, formatDuration, localizeSchedule, zonedToEpoch } from "./locale";
import { buildStandings, lastActivityMs, makeBlankPlayer, matchStartedAt, rankMinGames, scheduleEnded, tieBreakReason } from "./session";
import type { Match, Player } from "../types";

const jkt = (iso: string) => Date.parse(iso + "+07:00");
const SCHEDULE = "Rabu, 19:00–22:00";

describe("scheduleEnded", () => {
  const anchor = jkt("2026-10-21T20:00:00"); // Wednesday evening: a match was played

  it("is not over during or just before the end", () => {
    expect(scheduleEnded(SCHEDULE, anchor, jkt("2026-10-21T21:59:00"))).toBe(false);
  });
  it("is over once the end passes, and a day later", () => {
    expect(scheduleEnded(SCHEDULE, anchor, jkt("2026-10-21T22:01:00"))).toBe(true);
    expect(scheduleEnded(SCHEDULE, anchor, jkt("2026-10-22T20:00:00"))).toBe(true);
  });
  it("doesn't mix up the next day's evening for this session's own", () => {
    // activity at 18:30 before a 19:00 start: the session is that evening's, not the one before
    expect(scheduleEnded(SCHEDULE, jkt("2026-10-21T18:30:00"), jkt("2026-10-21T20:00:00"))).toBe(false);
  });
  it("lets a match that ran a little over keep the session open until its own end", () => {
    expect(scheduleEnded(SCHEDULE, jkt("2026-10-21T22:20:00"), jkt("2026-10-21T22:30:00"))).toBe(true);
  });
  it("reads times in Jakarta whatever the device zone is", () => {
    // 21:30 Jakarta is 14:30 UTC, which is a different calendar evening in New York
    const nowMs = Date.parse("2026-10-21T14:30:00Z");
    expect(scheduleEnded(SCHEDULE, anchor, nowMs, "Asia/Jakarta")).toBe(false);
    expect(scheduleEnded(SCHEDULE, anchor, Date.parse("2026-10-21T15:01:00Z"), "Asia/Jakarta")).toBe(true);
  });
  it("handles a session that runs past midnight", () => {
    const late = "Jumat 22:00–00:30";
    const a = jkt("2026-10-23T23:00:00");
    expect(scheduleEnded(late, a, jkt("2026-10-24T00:10:00"))).toBe(false);
    expect(scheduleEnded(late, a, jkt("2026-10-24T00:31:00"))).toBe(true);
  });
  it("can't tell without a time range or an anchor", () => {
    expect(scheduleEnded("Wed 12 Nov", anchor, jkt("2026-11-30T00:00:00"))).toBe(false);
    expect(scheduleEnded(SCHEDULE, null, jkt("2026-11-30T00:00:00"))).toBe(false);
  });
});

describe("zonedToEpoch", () => {
  it("is exact in a zone with no daylight saving", () => {
    expect(zonedToEpoch({ year: 2026, month: 10, day: 21 }, 22 * 60, "Asia/Jakarta")).toBe(jkt("2026-10-21T22:00:00"));
  });
  it("settles on the right offset in a zone that changes", () => {
    expect(zonedToEpoch({ year: 2026, month: 7, day: 1 }, 12 * 60, "America/New_York")).toBe(Date.parse("2026-07-01T16:00:00Z"));
    expect(zonedToEpoch({ year: 2026, month: 1, day: 1 }, 12 * 60, "America/New_York")).toBe(Date.parse("2026-01-01T17:00:00Z"));
  });
});

describe("activity anchors", () => {
  const m = (id: string): Match => ({ id, round: 0, num: 1, courtId: "1", status: "completed", t1: ["a", "b"], t2: ["c", "d"], s1: 21, s2: 10, elapsedAtTick0: 0 });
  it("reads a match's start from its id", () => {
    expect(matchStartedAt(m("m1792587600000"))).toBe(1792587600000);
    expect(matchStartedAt(m("m3"))).toBeNull();
  });
  it("takes the latest of match starts and players coming free", () => {
    expect(lastActivityMs([m("m1792587600000")], [{ idleSince: 1792590000000 }, {}])).toBe(1792590000000);
    expect(lastActivityMs([], [{}])).toBeNull();
  });
});

describe("durations", () => {
  it("formats readably and drops absurd waits", () => {
    expect(formatDuration(0)).toBe("<1 min");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(80)).toBe("1h 20m");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(180)).toBe("3h");
    expect(formatDuration(181)).toBeNull();
    expect(formatDuration(729)).toBeNull();
    expect(formatDuration(null)).toBeNull();
  });
  it("says how long ago, or the clock time", () => {
    const now = jkt("2026-10-21T21:00:00");
    expect(formatAgo(now - 20 * 60000, now)).toBe("20 min ago");
    expect(formatAgo(now - 30000, now)).toBe("just now");
    expect(formatAgo(jkt("2026-10-21T20:35:00"), now, true)).toBe("20:35");
    expect(formatAgo(jkt("2026-10-21T20:35:00"), jkt("2026-10-22T20:35:00"))).toBe("20:35");
  });
});

describe("localizeSchedule", () => {
  it("shows Indonesian weekday names in the app's language, leaving the rest alone", () => {
    expect(localizeSchedule("Rabu, 19:00–22:00")).toBe("Wednesday, 19:00–22:00");
    expect(localizeSchedule("Minggu · 7pm-10pm")).toBe("Sunday · 7pm-10pm");
    expect(localizeSchedule("Friday 19:00")).toBe("Friday 19:00");
  });
});

describe("ranking explanations", () => {
  const player = (id: string, name: string, rankGames: number, wins: number, perf: number): Player => ({
    ...makeBlankPlayer(id, name, "B", "ready"),
    games: rankGames,
    rankGames,
    wins,
    losses: rankGames - wins,
    perf,
  });

  it("rankMinGames matches who buildStandings ranks", () => {
    for (const maxGames of [0, 1, 3, 4, 5, 6, 7, 9, 10]) {
      const players = [player("top", "Top", maxGames, 1, 0)];
      for (let g = 1; g <= maxGames; g++) players.push(player("p" + g, "P" + g, g, 1, 0));
      const ranked = new Set(buildStandings(players).rows.filter((r) => r.section === "ranked").map((r) => r.player.rankGames));
      for (let g = 1; g <= maxGames; g++) expect(ranked.has(g), `max ${maxGames}, games ${g}`).toBe(g >= rankMinGames(maxGames));
    }
  });

  it("names the tie-break between equal scores, in the order the ranking applies them", () => {
    const a = player("a", "Ana", 4, 3, 0.2);
    expect(tieBreakReason(a, player("b", "Bo", 4, 2, 0.2))).toBe("win rate");
    expect(tieBreakReason(player("c", "Cy", 5, 3, 0.25), player("d", "Di", 4, 3, 0.2))).toBeNull(); // different scores shown
    // 2–2 and 1–1 share a win rate of 50%, and perf 0 shows the same score of 50 for both
    expect(tieBreakReason(player("e", "Eli", 4, 2, 0), player("f", "Fay", 2, 1, 0))).toBe("games played");
    expect(tieBreakReason(player("g", "Gus", 4, 3, 0.2), player("h", "Hal", 4, 3, 0.2))).toBe("name");
  });
});

describe("avatarStyle", () => {
  it("gives a name the same colour every time, whatever its case or padding", async () => {
    const { avatarStyle } = await import("./playerColor");
    expect(avatarStyle("Maya")).toEqual(avatarStyle("  maya "));
  });
  it("tells apart names with the same initials", async () => {
    const { avatarStyle } = await import("./playerColor");
    const colours = new Set(["Maya", "Mo", "Mia", "Mira", "Marco"].map((n) => avatarStyle(n).background));
    expect(colours.size).toBeGreaterThanOrEqual(3);
  });
});
