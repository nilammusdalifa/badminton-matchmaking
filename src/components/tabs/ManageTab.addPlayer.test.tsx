// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import type { SessionStore } from "../../hooks/useSessionStore";
import { copy } from "../../lib/copy";
import { ManageTab } from "./ManageTab";

function manageProps(overrides: Partial<SessionStore["manage"]> = {}): SessionStore["manage"] {
  const roster = Array.from({ length: 20 }, (_, i) => ({
    id: String(i + 1),
    name: `Player ${i + 1}`,
    level: "B",
    isHost: false,
    inRankings: true,
    hostLocked: false,
    statusTone: "default",
    statusLabel: "In queue",
    gamesLabel: "0 games",
    actions: [],
    onSave: () => true,
  }));
  return {
    playersCount: roster.length,
    courtsCount: 1,
    newPlayerName: "",
    newPlayerLevel: "B",
    onNewPlayerNameChange() {},
    setNewPlayerLevel() {},
    onAddPlayer() {},
    onAddPlayers() {},
    managePlayersVM: roster,
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
    shareEnabled: false,
    shareUrl: "",
    sessionPin: "123456",
    onCopyShareLink() {},
    ...overrides,
  } as unknown as SessionStore["manage"];
}

/** ManageTab with the controlled name field wired up the way the store does it. */
function Harness({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <ManageTab
      {...manageProps({
        newPlayerName: name,
        onNewPlayerNameChange: (e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value),
        onAddPlayer: () => {
          onAdd(name);
          setName("");
        },
      })}
    />
  );
}

afterEach(cleanup);

describe("ManageTab + Add player", () => {
  it("shows the button in the Roster header, ahead of every roster row, with the form closed", () => {
    render(<ManageTab {...manageProps()} />);
    const button = screen.getByRole("button", { name: copy.manage.addPlayerOpen });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    const header = screen.getByText(copy.manage.roster(20)).parentElement as HTMLElement;
    expect(header.contains(button)).toBe(true);
    // the form that is open by default is the lower walk-in panel only
    expect(screen.getAllByRole("textbox", { name: copy.manage.playerName })).toHaveLength(1);
  });

  it("opens the add form right under the header with one tap, and focuses the name field", () => {
    render(<ManageTab {...manageProps()} />);
    fireEvent.click(screen.getByRole("button", { name: copy.manage.addPlayerOpen }));
    const form = document.getElementById("roster-add") as HTMLElement;
    expect(form).not.toBeNull();
    const nameField = within(form).getByRole("textbox", { name: copy.manage.playerName });
    expect(document.activeElement).toBe(nameField);
    // it sits above the first roster row, so no scrolling past 20 players
    const firstRow = document.querySelector('[class*="rosterRow"]') as HTMLElement;
    expect(firstRow.textContent).toContain("Player 1 ");
    expect(form.compareDocumentPosition(firstRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps Paste a list instead reachable from the opened form, and focuses its box", () => {
    render(<ManageTab {...manageProps()} />);
    fireEvent.click(screen.getByRole("button", { name: copy.manage.addPlayerOpen }));
    const form = document.getElementById("roster-add") as HTMLElement;
    fireEvent.click(within(form).getByRole("button", { name: copy.manage.pasteList }));
    const box = within(form).getByRole("textbox", { name: copy.manage.playerNames });
    expect(document.activeElement).toBe(box);
    expect(within(form).getByRole("button", { name: copy.manage.addOneByOne })).toBeTruthy();
  });

  it("adds a walk-in from the opened form and is ready for the next name", () => {
    const added: string[] = [];
    render(<Harness onAdd={(n) => added.push(n)} />);
    fireEvent.click(screen.getByRole("button", { name: copy.manage.addPlayerOpen }));
    const form = document.getElementById("roster-add") as HTMLElement;
    const nameField = within(form).getByRole("textbox", { name: copy.manage.playerName }) as HTMLInputElement;
    fireEvent.change(nameField, { target: { value: "Walk In" } });
    fireEvent.click(within(form).getByRole("button", { name: copy.manage.addPlayer }));
    expect(added).toEqual(["Walk In"]);
    expect(nameField.value).toBe("");
    expect(document.activeElement).toBe(nameField);
  });

  it("closes again with Done, and leaves the lower walk-in panel alone", () => {
    render(<ManageTab {...manageProps()} />);
    fireEvent.click(screen.getByRole("button", { name: copy.manage.addPlayerOpen }));
    fireEvent.click(screen.getByRole("button", { name: copy.manage.addPlayerDone }));
    expect(document.getElementById("roster-add")).toBeNull();
    expect(screen.getByRole("button", { name: copy.manage.addPlayerOpen }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText(copy.manage.walkIn)).toBeTruthy();
  });

  it("does not steal focus when the form is not opened from the header", () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    render(<ManageTab {...manageProps()} />);
    expect(focus).not.toHaveBeenCalled();
    focus.mockRestore();
  });
});
