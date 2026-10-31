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

  it("the umpire's rows are closed buttons named after the player; Skip next and Rest stay hidden", () => {
    const markup = html(<SessionTab {...props()} />);
    expect(markup.match(/aria-expanded="false"/g)?.length).toBeGreaterThanOrEqual(8);
    expect(markup).toContain(`aria-label="${copy.session.rowActions("Ana")}"`);
    const text = renderText(<SessionTab {...props()} />);
    expect(text).not.toContain("Skip next");
    expect(text).not.toMatch(/\bRest\b/);
  });

  it("a watcher gets no row button and no Skip next or Rest", () => {
    const markup = html(<SessionTab {...props()} readOnly />);
    expect(markup).not.toContain(copy.session.rowActions("Ana"));
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
