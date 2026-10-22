import { describe, expect, it } from "vitest";
import { copy, matchCount, range } from "./copy";

/** Every string the app can show, with the functions called on sample data. */
function allStrings(node: unknown, path = "copy"): { path: string; text: string }[] {
  if (typeof node === "string") return [{ path, text: node }];
  if (typeof node === "function") {
    const out: { path: string; text: string }[] = [];
    for (const args of [[2, 3, 4], ["alex", 2, 3], [["alex"]], [["W", "L"]], [1, 1, 1], ["alex", "sam", "kim"], [true, 2, 3]]) {
      try {
        const text = (node as (...a: unknown[]) => unknown)(...args);
        if (typeof text === "string") out.push({ path, text });
      } catch {
        // wrong shape of sample for this function; another one fits
      }
    }
    return out;
  }
  if (node && typeof node === "object") return Object.entries(node).flatMap(([k, v]) => allStrings(v, `${path}.${k}`));
  return [];
}

const strings = allStrings(copy);
const offenders = (test: (text: string) => boolean) => strings.filter((s) => test(s.text)).map((s) => `${s.path}: ${s.text}`);

describe("copy: house style", () => {
  it("has strings to check", () => {
    expect(strings.length).toBeGreaterThan(300);
  });
  it('says "match", never "game"', () => {
    expect(offenders((t) => /\bgames?\b/i.test(t))).toEqual([]);
  });
  it('says "umpire", never "organizer"', () => {
    expect(offenders((t) => /organi[sz]er/i.test(t))).toEqual([]);
  });
  it("has no Indonesian weekday names", () => {
    expect(offenders((t) => /\b(senin|selasa|rabu|kamis|jumat|sabtu|minggu)\b/i.test(t))).toEqual([]);
  });
  it("uses en dashes, not hyphens or em dashes, for ranges and breaks", () => {
    expect(offenders((t) => /—/.test(t) || /\d\s?-\s?\d/.test(t) || / - /.test(t))).toEqual([]);
  });
  it("keeps short labels in sentence case", () => {
    // Words that are names of things on screen, not shouting: after the first word they may start with a capital.
    const names = new Set(["A", "B", "C", "D", "PIN", "Court", "Team", "Manage", "Session", "Keep", "Tier", "Hard", "Then", "Up", "Avg", "I"]);
    const bad = offenders((t) => {
      const words = t.replace(/^\+\s*/, "").split(/\s+/);
      if (words.length < 2 || words.length > 4 || /[.!?:,]/.test(t)) return false;
      return words.slice(1).some((w) => /^[A-Z][a-z]+$/.test(w) && !names.has(w));
    });
    expect(bad).toEqual([]);
  });
  it("counts and ranges read right", () => {
    expect(matchCount(1)).toBe("1 match");
    expect(matchCount(5)).toBe("5 matches");
    expect(range(2, 7)).toBe("2–7");
    expect(range(3, 3)).toBe("3");
  });
  it("shows the strings the brief asks for", () => {
    expect(copy.gate.joinTitle).toBe("Join session");
    expect(copy.gate.joinBody).toBe("How are you joining?");
    expect(copy.gate.watchSub).toBe("Courts, queue & rankings");
    expect(copy.gate.umpireSub).toBe("Enter scores · PIN needed");
    expect(copy.banner.viewOnly).toBe("View only · Only the umpire can edit");
    expect(copy.court.pausedViewer).toBe("Paused – waiting for the umpire");
    expect(copy.session.longestWait("Milzam", 2)).toBe("Longest wait: Milzam · 2 matches");
    expect(copy.session.matchesPlayedLink(2, 7)).toBe("Matches played: 2–7 ›");
    expect(copy.session.queueMeta(2, 5, 0)).toBe("Sat out 2 · Played 5");
    expect(copy.session.queueMeta(2, 5, 2)).toBe("Sat out 2 · Played 5 · 2 in a row");
    expect(copy.session.queueTitle(8)).toBe("Queue (8)");
    expect(copy.session.avg(5.3, 3)).toBe("Avg 5.3 · 3 behind");
    expect(copy.matches.heading(12, "Court 1")).toBe("Match 12 · Court 1");
    expect(copy.confirm.deleteTitle(12)).toBe("Delete match 12?");
    expect(copy.rankings.rule.score).toBe("Ranked by wins, points & opponent strength");
    expect(copy.rankings.summary(5, 2, 71)).toBe("5–2 · 71% wins");
    expect(copy.rankings.strength).toEqual({ stronger: "Stronger than average", weaker: "Weaker than average", average: "Average" });
    expect(copy.rankings.guestNote).toBe("Guest – not ranked. Doesn't affect anyone else's rankings.");
    expect(copy.rankings.needsMatches(2)).toBe("Needs 2 more matches to rank");
    expect(copy.rankings.needsMatches(1)).toBe("Needs 1 more match to rank");
    expect(copy.rankings.share).toBe("Share rankings");
    expect(copy.header.line(["Go Badmin", "Wed 19:00–22:00", copy.header.matches(12, null)])).toBe("Go Badmin · Wed 19:00–22:00 · 12 matches");
  });
});
