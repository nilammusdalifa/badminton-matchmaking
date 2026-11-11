import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionStore } from "../../hooks/useSessionStore";
import { renderText } from "../../test/renderText";
import { ShareRankingsModal } from "./ShareRankingsModal";

type Props = SessionStore["shareRankings"];

const ranked = (rank: number, name: string): Props["top"][number] => ({
  rank,
  medal: null,
  name,
  initials: name.slice(0, 2).toUpperCase(),
  level: "B",
  wins: 3,
  losses: 1,
  score: 60,
});

const unranked = (name: string, played = 2): Props["unranked"][number] => ({
  name,
  initials: name.slice(0, 2).toUpperCase(),
  played,
  wins: 1,
  losses: played - 1,
});

function props(overrides: Partial<Props> = {}): Props {
  return {
    open: true,
    top: [ranked(1, "Ana"), ranked(2, "Budi")],
    unranked: [],
    highlights: [],
    early: false,
    sessionName: "Friday Mabar",
    sessionSchedule: "",
    playersCount: 6,
    matchesCompleted: 8,
    close: vi.fn(),
    download: vi.fn(),
    cardRef: { current: null },
    photo: null,
    onPickPhoto: vi.fn(),
    onClearPhoto: vi.fn(),
    fallbackImageUrl: null,
    onOpenImage: vi.fn(),
    onCloseImage: vi.fn(),
    ...overrides,
  } as Props;
}

describe("ShareRankingsModal: players without a rank yet", () => {
  // the preview sizes itself from the window, which server rendering lacks
  beforeEach(() => {
    vi.stubGlobal("window", { innerWidth: 400, addEventListener() {}, removeEventListener() {} });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists them under the ranks, with matches played and record", () => {
    const text = renderText(<ShareRankingsModal {...props({ unranked: [unranked("Citra", 2), unranked("Dewi", 1)] })} />);
    expect(text).toContain("Not enough matches yet");
    expect(text).toContain("Citra");
    expect(text).toContain("2 matches · 1W–1L");
    expect(text).toContain("1 match · 1W–0L");
    // below the last rank
    expect(text.indexOf("Budi")).toBeLessThan(text.indexOf("Not enough matches yet"));
    expect(text.indexOf("Not enough matches yet")).toBeLessThan(text.indexOf("Citra"));
  });

  it("has no such section when everyone is ranked", () => {
    expect(renderText(<ShareRankingsModal {...props()} />)).not.toContain("Not enough matches yet");
  });

  it("names everyone up to four, and says how many more beyond that", () => {
    const four = renderText(<ShareRankingsModal {...props({ unranked: ["A1", "B2", "C3", "D4"].map((n) => unranked(n)) })} />);
    expect(four).toContain("D4");
    expect(four).not.toContain("more");

    const six = renderText(<ShareRankingsModal {...props({ unranked: ["A1", "B2", "C3", "D4", "E5", "F6"].map((n) => unranked(n)) })} />);
    expect(six).toContain("C3");
    expect(six).not.toContain("D4");
    expect(six).toContain("+3 more");
  });
});
