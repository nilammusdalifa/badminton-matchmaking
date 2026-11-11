/** The exported rankings picture is drawn at this size (pixels). The card is
 * laid out at exactly this size and only scaled down, by a transform, for the
 * preview on screen; the exporter removes that transform (see
 * renderRankingsImage) so the PNG comes out at full size on any phone. */
export const SHARE_CARD_W = 1179;
export const SHARE_CARD_H = 1440;

/** The 1st-place photo sits in this box at the card's top right. */
export const SHARE_PHOTO_W = 500;
export const SHARE_PHOTO_H = 820;

/** The card is at least SHARE_CARD_H tall and grows when more players need room. */
const LIST_TOP = 479; // where the first row starts, below the header
const FOOTER = 225; // room under the last row for the panel's end, the chip and the call to action
const COMPACT_ROW = 62;
const ROOMY_ROW = 78;
const UNRANKED_ROW = 38;
const UNRANKED_GAP = 6;
const UNRANKED_HEAD = 22 + 26; // space above the section, and its title

export interface ShareCardLayout {
  /** Height of the picture, in pixels. */
  height: number;
  /** Space between the ranked rows. */
  rowGap: number;
  /** Tighter ranked rows, used once there is a lot to fit. */
  compact: boolean;
}

/** Everyone is on the card: the ranked players, then (smaller) the players who
 * have no rank yet. Up to 8 ranked players on their own fit the base size;
 * past that, or with a second section, the rows tighten and the card grows. */
export function shareCardLayout(rankedCount: number, unrankedCount: number): ShareCardLayout {
  const compact = unrankedCount > 0 || rankedCount > 8;
  const rowGap = compact ? 8 : rankedCount >= 7 ? 16 : rankedCount >= 6 ? 24 : rankedCount >= 4 ? 32 : 40;
  const rowH = compact ? COMPACT_ROW : ROOMY_ROW;
  const rankedH = rankedCount > 0 ? rankedCount * rowH + (rankedCount - 1) * rowGap : 0;
  const unrankedH = unrankedCount > 0 ? UNRANKED_HEAD + unrankedCount * (UNRANKED_ROW + UNRANKED_GAP) : 0;
  return { height: Math.max(SHARE_CARD_H, LIST_TOP + rankedH + unrankedH + FOOTER), rowGap, compact };
}
