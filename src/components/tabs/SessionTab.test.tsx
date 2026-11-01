import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderText } from "../../test/renderText";
import { copy } from "../../lib/copy";
import { SessionTab } from "./SessionTab";

const NAMES = ["Ana", "Budi", "Citra", "Dewi", "Eko", "Fajar", "Gita", "Hadi"];

function props(overrides: Record<string, unknown> = {}) {
  const waitingVM = NAMES.map((name, i) => ({
    id: String(i + 1),
    name,
    level: "B",
    initials: name.slice(0, 2).toUpperCase(),
    skipped: 1,
    games: 2,
    hasStreak: false,
    consec: 0,
    waitMin: null,
    queueTag: i < 4 ? (i < 2 ? copy.session.upNext : copy.session.then) : undefined,
    reason: i < 2 ? copy.session.why.next : i < 4 ? copy.session.why.after : i === 4 ? copy.session.why.fair : null,
    onSkip() {},
    onPause() {},
  }));
  return {
    playersCount: 8,
    courtsCount: 1,
    playingCount: 4,
    readyWaitingCount: 8,
    pausedCount: 0,
    expectedCount: 0,
    hasExpected: false,
    onCheckInAll() {},
    courtsVM: [],
    queueVM: [],
    plannedIds: [],
    waitingVM,
    waitingCount: waitingVM.length,
    hasNotInRotation: false,
    notInRotationVM: [],
    recentResultsVM: [],
    sessionHealth: { hasWarning: false },
    gamesPlayedVM: { average: 0, behind: 0, rows: [] },
    fewPlayersHint: null,
    scheduleOver: false,
    scheduleEndLabel: "",
    playerOptions: [],
    rankings: [],
    ...overrides,
  } as unknown as React.ComponentProps<typeof SessionTab>;
}

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("SessionTab queue rows", () => {
  it("renders every waiting player as one compact row", () => {
    expect(html(<SessionTab {...props()} />).match(/data-queue-row/g)).toHaveLength(8);
  });

  it("the umpire's rows are closed buttons named by their own text; Skip next and Rest stay hidden", () => {
    const markup = html(<SessionTab {...props()} />);
    expect(markup.match(/aria-expanded="false"/g)?.length).toBeGreaterThanOrEqual(8);
    // No aria-label: it would replace the row's text (position, stats, tag, reason) for screen readers.
    const rowButtons = markup.match(/<button[^>]*aria-expanded="false"[^>]*>[\s\S]*?<\/button>/g) ?? [];
    expect(rowButtons.length).toBeGreaterThanOrEqual(8);
    expect(rowButtons.every((b) => !/^<button[^>]*aria-label=/.test(b))).toBe(true);
    const ana = rowButtons.find((b) => b.includes("Ana"));
    expect(ana).toBeDefined();
    expect(ana).toContain("Played");
    expect(ana).toContain(`<span class="srOnly">${copy.session.rowActionsHint}</span>`);
    const text = renderText(<SessionTab {...props()} />);
    expect(text).not.toContain("Skip next");
    expect(text).not.toMatch(/\bRest\b/);
  });

  it("a watcher gets no row button and no Skip next or Rest", () => {
    const markup = html(<SessionTab {...props()} readOnly />);
    const buttons = markup.match(/<button[\s\S]*?<\/button>/g) ?? [];
    expect(buttons.some((b) => b.includes("Ana"))).toBe(false);
    expect(markup).not.toContain(`<span class="srOnly">${copy.session.rowActionsHint}</span>`);
    const text = renderText(<SessionTab {...props()} readOnly />);
    expect(text).not.toContain("Skip next");
    expect(text).not.toMatch(/\bRest\b/);
  });

  it("planned rows show the tag but not a redundant Plays next line", () => {
    const text = renderText(<SessionTab {...props()} readOnly />);
    expect(text).toContain("In next match");
    expect(text).toContain("In match after");
    expect(text).not.toContain(copy.session.why.next);
    expect(text).not.toContain(copy.session.why.after);
  });

  it("other reasons keep their line", () => {
    expect(renderText(<SessionTab {...props()} readOnly />)).toContain(copy.session.why.fair);
  });

  it("keeps position, stats, and hides tiers from watchers", () => {
    const umpire = renderText(<SessionTab {...props()} />);
    expect(umpire).toContain("#1");
    expect(umpire).toContain("Sat out 1 · Played 2");
    expect(umpire).toContain("Ana · Tier B");
    expect(renderText(<SessionTab {...props()} hideTier />)).not.toContain("Tier");
  });

  it("marks the viewer's own row", () => {
    const people = NAMES.map((name, i) => ({ id: String(i + 1), name }));
    const text = renderText(<SessionTab {...props({ playerOptions: people })} readOnly youId="3" onSetYou={() => {}} />);
    expect(text).toContain(copy.session.youTag);
  });

  it("a host held back shows the note once", () => {
    const base = props();
    const waitingVM = base.waitingVM.map((w, i) => (i === 5 ? { ...w, note: copy.session.hostLater, reason: copy.session.hostLater } : w));
    const text = renderText(<SessionTab {...props({ waitingVM })} readOnly />);
    expect(text.split(copy.session.hostLater)).toHaveLength(2);
    expect(renderText(<SessionTab {...props({ waitingVM: waitingVM.map((w, i) => (i === 5 ? { ...w, note: copy.session.hostLater, reason: copy.session.why.fair } : w)) })} readOnly />)).toContain(`${copy.session.hostLater} · ${copy.session.why.fair}`);
  });
});

describe("SessionTab queue row text", () => {
  const stripTags = (h: string) => h.replace(/<[^>]+>/g, "");
  /** Each row split into its two lines: line 1 = position, avatar, name, tier; line 2 = tag, reason, numbers. */
  const lines = (markup: string) =>
    markup
      .split('data-queue-row="true"')
      .slice(1)
      .map((row) => {
        const [first, second = ""] = row.split(/<span class="_queueLine2_\w+">/);
        return { line1: stripTags(first), line2: stripTags(second.split("</span></span>")[0]) };
      });
  const longNames = () => {
    const base = props();
    return props({ waitingVM: base.waitingVM.map((w, i) => (i === 0 ? { ...w, name: "Bartholomews" } : w)) });
  };

  it("puts name and tier on line 1 and Sat out / Played on line 2, for every row", () => {
    const rows = lines(html(<SessionTab {...longNames()} />));
    expect(rows).toHaveLength(8);
    for (const { line1, line2 } of rows) {
      expect(line1).toMatch(/ · Tier B/);
      expect(line1).not.toContain("Played");
      expect(line1).not.toContain("Sat out");
      expect(line2).toContain("Sat out 1 · Played 2");
    }
    expect(rows[0].line1).toContain("Bartholomews · Tier B");
  });

  it("keeps the tier outside the part of the name that may be cut short", () => {
    const markup = html(<SessionTab {...longNames()} />);
    expect(markup).toMatch(/<span class="_queueNameText_\w+">Bartholomews<\/span><span class="_waitingLevel_\w+"> · Tier B<\/span>/);
  });

  it("gives a row with no tag and no reason a line 2 of its own with the numbers", () => {
    const rows = lines(html(<SessionTab {...props()} />));
    // rows 6-8 have neither a tag nor a reason in the fixture
    expect(rows[7].line2).toBe("Sat out 1 · Played 2");
  });

  it("leaves the status chips and reasons as they were, ahead of the numbers", () => {
    const rows = lines(html(<SessionTab {...props()} />));
    expect(rows[0].line2).toBe("In next match" + "Sat out 1 · Played 2");
    expect(rows[2].line2).toBe("In match after" + "Sat out 1 · Played 2");
    expect(rows[4].line2).toBe(copy.session.why.fair + "Sat out 1 · Played 2");
  });

  it("a watcher sees the name without a tier, and still the numbers on line 2", () => {
    const rows = lines(html(<SessionTab {...longNames()} readOnly hideTier />));
    expect(rows[0].line1).toContain("Bartholomews");
    expect(rows[0].line1).not.toContain("Tier");
    expect(rows[0].line2).toContain("Sat out 1 · Played 2");
  });

  it("shows the in-a-row count with the other numbers on line 2", () => {
    const base = props();
    const waitingVM = base.waitingVM.map((w, i) => (i === 5 ? { ...w, hasStreak: true, consec: 3 } : w));
    const rows = lines(html(<SessionTab {...props({ waitingVM })} />));
    expect(rows[5].line2).toContain("Sat out 1 · Played 2 · 3 in a row");
    expect(rows[5].line1).not.toContain("in a row");
  });
});
