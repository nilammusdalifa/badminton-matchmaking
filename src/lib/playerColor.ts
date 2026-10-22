import type { CSSProperties } from "react";

/** Dark enough for the light initials on top (all above 5:1) and far enough
 * apart in hue that "MA", "MO" and "MI" don't read as the same person. */
const AVATAR_COLORS = ["#17594f", "#4a52a8", "#7d3f80", "#9a4a2e", "#5f6b2f", "#a03a4a", "#2f6a8f", "#8a5a12"];

/** A player's avatar colour, the same on every screen and every night: it
 * comes from the name alone (FNV-1a), not from list position or id. */
export function avatarStyle(name: string): CSSProperties {
  let hash = 0x811c9dc5;
  for (const ch of name.trim().toLowerCase()) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // FNV-1a's low bits barely move for short names, so mix before taking a remainder.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  hash ^= hash >>> 16;
  return { background: AVATAR_COLORS[hash % AVATAR_COLORS.length], color: "#f9f4ed", borderColor: "rgba(249, 244, 237, 0.35)" };
}
