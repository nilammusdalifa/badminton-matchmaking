import { describe, expect, it } from "vitest";
import { copy } from "../../lib/copy";
import { renderText } from "../../test/renderText";
import { RankingsInfoSheet } from "./RankingsInfoSheet";

describe("RankingsInfoSheet", () => {
  it("starts with one sentence; the maths waits behind More", () => {
    const text = renderText(<RankingsInfoSheet resultMode="score" onClose={() => {}} />);
    expect(text).toContain(copy.rankings.sheet.summary);
    expect(text).toContain("More");
    expect(text).not.toContain(copy.rankings.sheet.fiftyBody);
  });

  it("is a named, modal dialog with a Got it button, for viewers too", () => {
    for (const hideTier of [false, true]) {
      const text = renderText(<RankingsInfoSheet resultMode="winner" hideTier={hideTier} onClose={() => {}} />);
      expect(text).toContain(copy.rankings.howItWorks);
      expect(text).toContain(copy.rankings.sheet.gotIt);
    }
  });
});
