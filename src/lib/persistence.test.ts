import { afterEach, describe, expect, it, vi } from "vitest";
import { clearUmpireSession, loadUmpireSession, saveUmpireSession } from "./persistence";

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    removeItem: (k: string) => void items.delete(k),
  };
}

describe("umpire session memory", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("remembers an umpire claim per session", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    expect(loadUmpireSession("s1")).toBe(false);
    saveUmpireSession("s1");
    expect(loadUmpireSession("s1")).toBe(true);
    expect(loadUmpireSession("s2")).toBe(false);
  });
  it("forgets an umpire claim for one session only", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    saveUmpireSession("s1");
    saveUmpireSession("s2");
    clearUmpireSession("s1");
    expect(loadUmpireSession("s1")).toBe(false);
    expect(loadUmpireSession("s2")).toBe(true);
  });
  it("never throws when storage does", () => {
    const boom = () => {
      throw new Error("storage unavailable");
    };
    vi.stubGlobal("localStorage", { getItem: boom, setItem: boom, removeItem: boom });
    expect(() => saveUmpireSession("s1")).not.toThrow();
    expect(() => clearUmpireSession("s1")).not.toThrow();
    expect(loadUmpireSession("s1")).toBe(false);
  });
  it("is false when there is no storage at all", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(loadUmpireSession("s1")).toBe(false);
    expect(() => saveUmpireSession("s1")).not.toThrow();
    expect(() => clearUmpireSession("s1")).not.toThrow();
  });
});
