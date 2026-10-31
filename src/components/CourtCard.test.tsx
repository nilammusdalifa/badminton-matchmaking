import { describe, expect, it } from "vitest";
import type { CourtViewModel } from "../types.viewmodel";
import { renderText } from "../test/renderText";
import { CourtCard } from "./CourtCard";

function court(overrides: { locked?: boolean } = {}): CourtViewModel {
  return {
    id: "1",
    name: "Court 1",
    state: "available",
    suggestion: {
      team1Label: "Ana & Budi",
      team2Label: "Citra & Dewi",
      reason: "Teams balanced by tier (A+C vs B+B)",
      locked: overrides.locked ?? true,
      onStart() {},
      onRegenerate() {},
    },
    onTogglePause() {},
    onEdit() {},
  } as CourtViewModel;
}

describe("CourtCard on an open court", () => {
  it("watcher sees who plays next on an open court, without buttons or tiers", () => {
    const text = renderText(<CourtCard court={court()} readOnly />);
    expect(text).toContain("Up next");
    expect(text).toContain("Ana & Budi vs Citra & Dewi");
    expect(text).not.toContain("Start match");
    expect(text).not.toContain("Tier");
    expect(text).not.toContain("may change");
  });
  it("an unlocked plan says it may change", () => {
    expect(renderText(<CourtCard court={court({ locked: false })} readOnly />)).toContain("Up next · may change");
  });
  it("the umpire's card is unchanged", () => {
    expect(renderText(<CourtCard court={court()} />)).toContain("Start match");
  });
});
