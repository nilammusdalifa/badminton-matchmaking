import { describe, expect, it } from "vitest";
import type { SessionStore } from "../../hooks/useSessionStore";
import { renderText } from "../../test/renderText";
import { ScorekeeperSheet } from "./ScorekeeperSheet";

function props(overrides: Partial<SessionStore["scorekeeper"]> = {}): SessionStore["scorekeeper"] {
  return {
    open: true,
    courtLabel: "Court 1",
    t1p1: "Ana",
    t1p2: "Budi",
    t2p1: "Citra",
    t2p2: "Dewi",
    t1: 3,
    t2: 2,
    isGameOver: false,
    isLikelyIncomplete: true,
    isTie: false,
    isEditingCompleted: false,
    resultMode: "score",
    serve: null,
    serverChoices: [],
    onSwapReceivers() {},
    addT1() {},
    addT2() {},
    setT1() {},
    setT2() {},
    focusSelect() {},
    undo() {},
    saveFinal() {},
    close() {},
    onCancelMatch() {},
    ...overrides,
  };
}

const choices = ["Ana", "Budi", "Citra", "Dewi"].map((label) => ({ label, onPick() {} }));

describe("ScorekeeperSheet", () => {
  it("says who serves and from which side", () => {
    const text = renderText(<ScorekeeperSheet {...props({ serve: { name: "Ana", side: "right" } })} />);
    expect(text).toContain("Ana serves from the right");
    expect(text).toContain("Swap receivers");
    expect(text).not.toContain("Who serves?");
  });

  it("asks who serves when the server is unknown (reopened sheet, typed score)", () => {
    const text = renderText(<ScorekeeperSheet {...props({ serve: null, serverChoices: choices })} />);
    expect(text).toContain("Who serves?");
    for (const name of ["Ana", "Budi", "Citra", "Dewi"]) expect(text).toContain(name);
    expect(text).not.toContain("serves from the");
  });

  it("shows no serve line outside score mode", () => {
    const text = renderText(<ScorekeeperSheet {...props({ resultMode: "winner", serve: { name: "Ana", side: "right" }, serverChoices: choices })} />);
    expect(text).not.toContain("serves from the");
    expect(text).not.toContain("Who serves?");
  });
});
