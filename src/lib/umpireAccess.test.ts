import { describe, expect, it } from "vitest";
import { nextDenialCount, shouldDropUmpire, UMPIRE_DROP_DENIALS } from "./umpireAccess";

describe("umpire push denials", () => {
  it("counts only consecutive permission denials", () => {
    expect(nextDenialCount(0, { ok: false, code: "PERMISSION_DENIED" })).toBe(1);
    expect(nextDenialCount(1, { ok: false, code: "PERMISSION_DENIED" })).toBe(2);
    expect(nextDenialCount(1, { ok: true })).toBe(0);
  });
  it("leaves the count alone for other failures (offline, network)", () => {
    expect(nextDenialCount(1, { ok: false, code: "UNKNOWN" })).toBe(1);
    expect(nextDenialCount(0, { ok: false, code: "NETWORK_ERROR" })).toBe(0);
  });
  it("drops the umpire after 2 denials in a row, never after 1", () => {
    expect(UMPIRE_DROP_DENIALS).toBe(2);
    expect(shouldDropUmpire(0)).toBe(false);
    expect(shouldDropUmpire(1)).toBe(false);
    expect(shouldDropUmpire(2)).toBe(true);
  });
});
