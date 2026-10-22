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

  it("no component text is smaller than 14px", () => {
    const offenders: string[] = [];
    for (const { path, css } of files) {
      for (const m of css.matchAll(/font-size:\s*([\d.]+)px/g)) {
        if (parseFloat(m[1]) < 14) offenders.push(`${path} ${m[0]}`);
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

// WCAG AA (4.5:1) for the text colours, checked on the backgrounds they sit on.
describe("text contrast", () => {
  const read = (file: string) => readFileSync(join(__dirname, "styles", file), "utf8");
  const tokens = new Map<string, string>();
  for (const css of [read("organic.css"), read("theme.css")]) for (const m of css.matchAll(/(--[\w-]+):\s*([^;]+);/g)) tokens.set(m[1], m[2].trim());

  const resolve = (name: string): string => {
    const value = tokens.get(name) ?? "";
    const ref = value.match(/^var\((--[\w-]+)\)$/);
    return ref ? resolve(ref[1]) : value;
  };
  type Rgb = [number, number, number];
  const parse = (value: string): { rgb: Rgb; alpha: number } => {
    const hex = value.match(/^#([0-9a-f]{6})$/i);
    if (hex) return { rgb: [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as Rgb, alpha: 1 };
    const rgba = value.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/);
    if (!rgba) throw new Error(`can't read colour "${value}"`);
    return { rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])], alpha: rgba[4] === undefined ? 1 : Number(rgba[4]) };
  };
  const colour = (name: string) => parse(resolve(name));
  const over = (name: string, under: Rgb): Rgb => {
    const { rgb, alpha } = colour(name);
    return rgb.map((c, i) => c * alpha + under[i] * (1 - alpha)) as Rgb;
  };
  const luminance = ([r, g, b]: Rgb) => {
    const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a: Rgb, b: Rgb) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  const bg = colour("--sm-bg").rgb;
  const surface = colour("--sm-surface").rgb;
  const backgrounds: Record<string, Rgb> = {
    "page background": bg,
    "card surface": surface,
    "card fill": over("--sm-fill", surface),
    "teal chip": over("--sm-accent-soft", surface),
  };

  it.each(["--sm-text", "--sm-text-2", "--sm-text-3", "--sm-text-4", "--sm-accent", "--sm-accent-hover", "--sm-accent-2", "--sm-danger-text"])("%s is at least 4.5:1", (token) => {
    const text = colour(token).rgb;
    for (const [where, under] of Object.entries(backgrounds)) {
      if (token === "--sm-text-4" && where !== "page background" && where !== "card surface") continue; // placeholders only ever sit on the page background
      expect(ratio(text, under), `${token} on ${where}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("dark text on the accent fill is at least 4.5:1", () => {
    expect(ratio(colour("--sm-accent-on").rgb, colour("--sm-accent").rgb)).toBeGreaterThanOrEqual(4.5);
  });
});
