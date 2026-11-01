import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SessionStore } from "../hooks/useSessionStore";
import { renderText } from "../test/renderText";
import { copy } from "../lib/copy";
import { RemoteGate } from "./RemoteGate";

type RemoteProps = SessionStore["remote"];

function props(overrides: Partial<RemoteProps> = {}): RemoteProps {
  return {
    isRemoteMode: true,
    firebaseConfigured: true,
    authReady: true,
    role: null,
    roleStep: "choose",
    pinError: "",
    checking: false,
    connected: false,
    missing: false,
    sessionLabel: null,
    chooseRole() {},
    async submitPin() {},
    back() {},
    ...overrides,
  };
}

describe("RemoteGate join screen", () => {
  it("names the session and its time", () => {
    const text = renderText(<RemoteGate {...props({ sessionLabel: { name: "GoBadmin", schedule: "Wed 19:00–22:00" } })} />);
    expect(text).toContain("Join GoBadmin");
    expect(text).toContain("Wed 19:00–22:00");
  });
  it("falls back when the label is missing or the default name", () => {
    expect(renderText(<RemoteGate {...props({ sessionLabel: null })} />)).toContain("Join session");
    expect(renderText(<RemoteGate {...props({ sessionLabel: { name: "New session", schedule: "" } })} />)).toContain("Join session");
  });
  it("shows no schedule line when there is none", () => {
    const text = renderText(<RemoteGate {...props({ sessionLabel: { name: "GoBadmin", schedule: "" } })} />);
    expect(text).toContain("Join GoBadmin");
    expect(text).toContain("How are you joining?");
  });
});

describe("RemoteGate PIN step", () => {
  it("takes up to 6 digits and keeps its screen-reader label", () => {
    const html = renderToStaticMarkup(<RemoteGate {...props({ roleStep: "pin" })} />);
    expect(html).toContain('maxLength="6"');
    expect(html).toContain('placeholder="PIN"');
    expect(html).toContain('aria-label="Umpire PIN"');
  });
  it("shows the lock message it is given", () => {
    const text = renderText(<RemoteGate {...props({ roleStep: "pin", pinError: "Too many tries. Wait 10 minutes, then try again." })} />);
    expect(text).toContain("Too many tries. Wait 10 minutes, then try again.");
  });
  it("asks for the new PIN when the old one stopped working", () => {
    expect(copy.gate.pinChanged).toBe("The PIN changed. Enter the new one.");
    const text = renderText(<RemoteGate {...props({ roleStep: "pin", pinError: copy.gate.pinChanged })} />);
    expect(text).toContain("The PIN changed. Enter the new one.");
  });
});
