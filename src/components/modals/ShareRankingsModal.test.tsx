import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionStore } from "../../hooks/useSessionStore";
import { renderText } from "../../test/renderText";
import { SHARE_CARD_H, shareCardLayout } from "../../lib/shareCard";
import { ShareRankingsModal } from "./ShareRankingsModal";

type Props = SessionStore["shareRankings"];

const entry = (rank: number, name: string, played = 4): Props["top"][number] => ({
  rank,
  medal: null,
  name,
  initials: name.slice(0, 2).toUpperCase(),
  level: "B",
  wins: Math.min(played, 3),
  losses: Math.max(0, played - 3),
  score: 60,
  played,
});

function props(overrides: Partial<Props> = {}): Props {
  return {
    open: true,
    top: [entry(1, "Ana"), entry(2, "Budi")],
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

describe("ShareRankingsModal: everyone in one list", () => {
  // the preview sizes itself from the window, which server rendering lacks
  beforeEach(() => {
    vi.stubGlobal("window", { innerWidth: 400, addEventListener() {}, removeEventListener() {} });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists a player without a rank in the same list, after the last rank", () => {
    const text = renderText(<ShareRankingsModal {...props({ top: [entry(1, "Ana"), entry(2, "Budi"), entry(3, "Mario", 2)] })} />);
    expect(text).toContain("Mario");
    expect(text).toContain("2W–0L");
    expect(text.indexOf("Budi")).toBeLessThan(text.indexOf("Mario"));
    expect(text).not.toContain("Not enough matches yet");
  });

  it("shows a player with no matches as having none yet", () => {
    const text = renderText(<ShareRankingsModal {...props({ top: [entry(1, "Ana"), entry(2, "Zed", 0)] })} />);
    expect(text).toContain("No matches yet");
  });

  it("lists every player, however many", () => {
    const top = Array.from({ length: 12 }, (_, i) => entry(i + 1, `Rank${String.fromCharCode(65 + i)}`));
    const text = renderText(<ShareRankingsModal {...props({ top })} />);
    expect(text).toContain("RankL");
    expect(text).not.toContain("TOP");
  });
});

describe("shareCardLayout", () => {
  it("keeps the base size for up to eight players and grows beyond that", () => {
    expect(shareCardLayout(8).height).toBe(SHARE_CARD_H);
    expect(shareCardLayout(3).height).toBe(SHARE_CARD_H);
    expect(shareCardLayout(12).height).toBeGreaterThan(SHARE_CARD_H);
    expect(shareCardLayout(20).height).toBeGreaterThan(shareCardLayout(12).height);
  });
});
