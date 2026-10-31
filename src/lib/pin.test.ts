import { afterEach, describe, expect, it, vi } from "vitest";
import { generateSessionPin, isLocked, isPinLength, needsPinUpgrade, nextAttempt } from "./pin";

describe("umpire PIN", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("makes 6-digit PINs without Math.random", () => {
    const spy = vi.spyOn(Math, "random");
    const pins = Array.from({ length: 200 }, generateSessionPin);
    expect(pins.every((p) => /^\d{6}$/.test(p))).toBe(true);
    expect(new Set(pins).size).toBeGreaterThan(150);
    expect(spy).not.toHaveBeenCalled();
  });
  it("accepts 4 (sessions from before) or 6 digits", () => {
    expect(["1234", "123456", "12345", "", "1234567"].map(isPinLength)).toEqual([true, true, false, false, false]);
  });
  it("counts tries in a 10-minute window", () => {
    const t = 10_000_000;
    expect(nextAttempt(null, t)).toBe(1);
    expect(nextAttempt({ count: 3, at: t - 1000 }, t)).toBe(4);
    expect(nextAttempt({ count: 5, at: t - 599_999 }, t)).toBe(6);
    expect(nextAttempt({ count: 5, at: t - 600_000 }, t)).toBe(1);
  });
  it("is locked only after 5 tries inside the 10-minute window", () => {
    const t = 10_000_000;
    expect(isLocked(null, t)).toBe(false);
    expect(isLocked({ count: 4, at: t - 1000 }, t)).toBe(false);
    expect(isLocked({ count: 5, at: t - 1000 }, t)).toBe(true);
    expect(isLocked({ count: 5, at: t - 599_999 }, t)).toBe(true);
    expect(isLocked({ count: 5, at: t - 600_000 }, t)).toBe(false);
  });
  it("upgrades any PIN that isn't 6 digits", () => {
    expect(["1234", "123456", "", "12345a"].map(needsPinUpgrade)).toEqual([true, false, true, true]);
  });
});
