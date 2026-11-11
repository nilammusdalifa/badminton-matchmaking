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

export interface ShareCardLayout {
  /** Height of the picture, in pixels. */
  height: number;
  /** Space between the rows. */
  rowGap: number;
  /** Tighter rows, used once there are more than eight. */
  compact: boolean;
}

/** Everyone is on the card, in one list. Up to 8 players fit the base size;
 * past that the rows tighten and the card grows. */
export function shareCardLayout(rowCount: number): ShareCardLayout {
  const compact = rowCount > 8;
  const rowGap = compact ? 8 : rowCount >= 7 ? 16 : rowCount >= 6 ? 24 : rowCount >= 4 ? 32 : 40;
  const rowH = compact ? COMPACT_ROW : ROOMY_ROW;
  const listH = rowCount > 0 ? rowCount * rowH + (rowCount - 1) * rowGap : 0;
  return { height: Math.max(SHARE_CARD_H, LIST_TOP + listH + FOOTER), rowGap, compact };
}
