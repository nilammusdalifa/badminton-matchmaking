import { describe, expect, it } from "vitest";
import type { SessionStore } from "../../hooks/useSessionStore";
import { renderText } from "../../test/renderText";
import { ManageTab } from "./ManageTab";

function props(overrides: Partial<SessionStore["manage"]> = {}): SessionStore["manage"] {
  const player = (id: string, name: string) => ({
    id,
    name,
    level: "B",
    isHost: false,
    inRankings: true,
    hostLocked: false,
    statusTone: "ready",
    statusLabel: "Ready",
    gamesLabel: "0 games",
    actions: [],
    onSave: () => true,
  });
  return {
    playersCount: 2,
    courtsCount: 1,
    newPlayerName: "",
    newPlayerLevel: "B",
    onNewPlayerNameChange() {},
    setNewPlayerLevel() {},
    onAddPlayer() {},
    onAddPlayers() {},
    managePlayersVM: [player("1", "Ana"), player("2", "Budi")],
    players: [],
    requestA: "",
    requestB: "",
    onRequestAChange() {},
    onRequestBChange() {},
    onAddPartnerRequest() {},
    hasRequestedPairs: false,
    requestedPairsVM: [],
    onAddCourt() {},
    onRemoveCourt() {},
    planAhead: false,
    onTogglePlanAhead() {},
    hardGames: false,
    onToggleHardGames() {},
    courtHours: [],
    onSetCourtClosesAt() {},
    onOpenSetup() {},
    onEndSession() {},
    onResetSession() {},
    resultMode: "none",
    isOwner: true,
    shareEnabled: true,
    shareUrl: "https://example.test/s/1",
    sessionPin: "1234",
    onCopyShareLink() {},
    ...overrides,
  } as unknown as SessionStore["manage"];
}

describe("ManageTab", () => {
  it("puts the roster first, the danger zone last", () => {
    const text = renderText(<ManageTab {...props()} />);
    const at = (s: string) => text.indexOf(s);
    expect(at("Roster (2)")).toBeGreaterThan(-1);
    expect(at("Roster (2)")).toBeLessThan(at("Add a walk-in player"));
    expect(at("Add a walk-in player")).toBeLessThan(at("Partner requests"));
    expect(at("Partner requests")).toBeLessThan(at("Courts"));
    expect(at("Courts")).toBeLessThan(at("Live sharing"));
    expect(at("Live sharing")).toBeLessThan(at("End & see results"));
  });
});
