import { describe, expect, it } from "vitest";
import { photoCrop, withPhoto } from "./photos";

describe("photoCrop", () => {
  it("fills the slot with no uncovered edge, for tall, wide and narrow pictures", () => {
    for (const [w, h] of [[900, 1200], [1600, 900], [300, 1500]] as const) {
      const { dw, dh, dx, dy } = photoCrop(w, h, 150, 340);
      expect(dw).toBeGreaterThanOrEqual(150 - 1e-6);
      expect(dh).toBeGreaterThanOrEqual(340 - 1e-6);
      expect(dx).toBeLessThanOrEqual(0);
      expect(dx + dw).toBeGreaterThanOrEqual(150 - 1e-6);
      expect(dy).toBe(0);
    }
  });

  it("puts the middle of a picture right of centre, clear of the title", () => {
    const { dw, dx } = photoCrop(900, 1200, 150, 340);
    const middle = dx + dw / 2;
    expect(middle).toBeGreaterThan(75);
    expect(middle).toBeCloseTo(150 * 0.72, 0);
  });
});

describe("withPhoto", () => {
  it("adds, replaces and removes one player's photo without touching the rest", () => {
    const a = withPhoto({}, "p1", "x");
    expect(a).toEqual({ p1: "x" });
    expect(withPhoto(a, "p2", "y")).toEqual({ p1: "x", p2: "y" });
    expect(withPhoto(a, "p1", "z")).toEqual({ p1: "z" });
    expect(withPhoto(a, "p1", null)).toEqual({});
  });

  it("keeps only the newest photos", () => {
    let photos: Record<string, string> = {};
    for (let i = 0; i < 30; i++) photos = withPhoto(photos, "p" + i, "u" + i);
    expect(Object.keys(photos)).toHaveLength(24);
    expect(photos.p29).toBe("u29");
    expect(photos.p0).toBeUndefined();
  });
});
