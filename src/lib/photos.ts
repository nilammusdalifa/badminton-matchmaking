// Champion photos for the share card. A photo belongs to a player and is kept on
// this device only (it is never part of the shared session): the card shows
// whoever is first, so each player's photo is picked once and reused.

const KEY = "smashmatch.photos.v1";
/** Oldest photos are dropped past this many, to stay well inside the storage quota. */
const MAX_PHOTOS = 24;

/** The photo slot on the card, in the card's own CSS pixels. */
export const PHOTO_W = 150;
export const PHOTO_H = 340;
/** Stored at this multiple of the slot: sharp enough for the 4x picture, small enough to keep. */
const STORE_SCALE = 2.4;
/** Where across the slot the middle of the photo is put (0.5 = centred): to the right,
 * so the person clears the title and the rows on the left. */
const FOCUS_X = 0.72;

export function loadPhotos(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function savePhotos(photos: Record<string, string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(photos));
  } catch {
    // Storage full or unavailable: the photo still shows for this visit, it just won't be remembered.
  }
}

/** Adds or replaces one player's photo, dropping the oldest ones beyond the cap. */
export function withPhoto(photos: Record<string, string>, id: string, url: string | null): Record<string, string> {
  const next = { ...photos };
  delete next[id];
  if (url) next[id] = url;
  const ids = Object.keys(next);
  for (let i = 0; i < ids.length - MAX_PHOTOS; i++) delete next[ids[i]];
  return next;
}

/** Where to draw a photo so it covers the slot: scaled to fill it, top-aligned (heads are near
 * the top), and slid so the middle of the picture sits at `focusX` across the slot, never
 * leaving an edge uncovered. */
export function photoCrop(srcW: number, srcH: number, slotW: number, slotH: number, focusX = FOCUS_X) {
  const scale = Math.max(slotW / srcW, slotH / srcH);
  const dw = srcW * scale;
  const dh = srcH * scale;
  const dx = Math.min(0, Math.max(slotW - dw, slotW * focusX - dw / 2));
  return { dw, dh, dx, dy: 0 };
}

async function loadImage(source: Blob | string): Promise<{ img: CanvasImageSource; width: number; height: number }> {
  if (source instanceof Blob && typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(source, { imageOrientation: "from-image" });
      return { img: bmp, width: bmp.width, height: bmp.height };
    } catch {
      // fall through to an <img>
    }
  }
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    if (typeof source !== "string") URL.revokeObjectURL(url);
  }
}

/** A chosen picture, made ready to keep: cropped to the slot, black and white with a touch of
 * contrast and a little darker, so a bright background doesn't swamp the white title and the rows
 * (done by hand, as canvas filters aren't everywhere), as a small JPEG. */
export async function preparePhoto(file: Blob): Promise<string> {
  const { img, width, height } = await loadImage(file);
  const W = Math.round(PHOTO_W * STORE_SCALE);
  const H = Math.round(PHOTO_H * STORE_SCALE);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no canvas");
  ctx.fillStyle = "#0c2340";
  ctx.fillRect(0, 0, W, H);
  const { dw, dh, dx, dy } = photoCrop(width, height, W, H);
  ctx.drawImage(img, dx, dy, dw, dh);
  const data = ctx.getImageData(0, 0, W, H);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const v = Math.max(0, Math.min(255, ((g - 128) * 1.12 + 128) * 0.78));
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** The kept photo with its left and bottom edges faded to transparent, so it melts into the
 * card's background instead of ending in a hard edge. The fade is in the picture itself because
 * the exporter can't draw CSS masks. */
export async function fadePhoto(url: string): Promise<string> {
  const { img, width, height } = await loadImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  const left = ctx.createLinearGradient(0, 0, width, 0);
  left.addColorStop(0, "rgba(0,0,0,0)");
  left.addColorStop(0.4, "rgba(0,0,0,1)");
  left.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = left;
  ctx.fillRect(0, 0, width, height);
  const bottom = ctx.createLinearGradient(0, 0, 0, height);
  bottom.addColorStop(0, "rgba(0,0,0,1)");
  bottom.addColorStop(0.6, "rgba(0,0,0,1)");
  bottom.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bottom;
  ctx.fillRect(0, 0, width, height);
  return canvas.toDataURL("image/png");
}
