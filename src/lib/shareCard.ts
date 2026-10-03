/** The exported rankings picture is drawn at this size (pixels). The card is
 * laid out at exactly this size and only scaled down, by a transform, for the
 * preview on screen; the exporter removes that transform (see
 * renderRankingsImage) so the PNG comes out at full size on any phone. */
export const SHARE_CARD_W = 1179;
export const SHARE_CARD_H = 1440;

/** The 1st-place photo sits in this box at the card's top right. */
export const SHARE_PHOTO_W = 500;
export const SHARE_PHOTO_H = 820;

/** How many players the card lists at most. */
export const SHARE_TOP_COUNT = 8;
