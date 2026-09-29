import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Global Constraints from docs/superpowers/plans/2026-09-30-mobile-ux-fixes.md,
// checked against the CSS source so they can't quietly regress.
const componentsDir = join(__dirname, "components");

function cssModules(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return cssModules(path);
    return entry.name.endsWith(".module.css") ? [path] : [];
  });
}

// The share card is rendered to an image and sized for that capture, not for reading on the phone screen.
const files = cssModules(componentsDir)
  .filter((path) => !path.includes("ShareRankingsModal"))
  .map((path) => ({ path: path.replace(componentsDir, "components"), css: readFileSync(path, "utf8") }));

describe("phone readability and spacing", () => {
  it("has CSS modules to check", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("no component text is smaller than 12px", () => {
    const offenders: string[] = [];
    for (const { path, css } of files) {
      for (const m of css.matchAll(/font-size:\s*([\d.]+)px/g)) {
        if (parseFloat(m[1]) < 12) offenders.push(`${path} ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("row action pills have at least 8px between them", () => {
    const offenders: string[] = [];
    for (const { path, css } of files) {
      for (const m of css.matchAll(/\.(rosterActions|waitingActions)\s*\{[^}]*?gap:\s*(\d+)px/g)) {
        if (parseInt(m[2], 10) < 8) offenders.push(`${path} .${m[1]} gap ${m[2]}px`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
