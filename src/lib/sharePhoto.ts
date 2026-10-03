import { SHARE_PHOTO_H, SHARE_PHOTO_W } from "./shareCard";

/** Drawn at twice the size it shows at, so the exported picture stays sharp. */
const RES = 2;

// The card's design shows the winner in black and white with a navy-to-orange
// wash. html2canvas can't draw CSS filters or blend modes, so the look is baked
// into the pixels here, once, when the photo is picked.
const CONTRAST = 1.25;
const BRIGHTNESS = 1.05;
const WASH_OPACITY = 0.35;
const WASH_FROM: [number, number, number] = [0x10, 0x26, 0x3b];
const WASH_TO: [number, number, number] = [0xff, 0x4a, 0x1a];

const lum = (r: number, g: number, b: number) => 0.3 * r + 0.59 * g + 0.11 * b;

/** CSS `mix-blend-mode: color`: the wash's hue and saturation, the photo's brightness. */
function setLum(r: number, g: number, b: number, l: number): [number, number, number] {
  const d = l - lum(r, g, b);
  let R = r + d;
  let G = g + d;
  let B = b + d;
  const L = lum(R, G, B);
  const n = Math.min(R, G, B);
  const x = Math.max(R, G, B);
  if (n < 0) {
    R = L + ((R - L) * L) / (L - n);
    G = L + ((G - L) * L) / (L - n);
    B = L + ((B - L) * L) / (L - n);
  }
  if (x > 255) {
    R = L + ((R - L) * (255 - L)) / (x - L);
    G = L + ((G - L) * (255 - L)) / (x - L);
    B = L + ((B - L) * (255 - L)) / (x - L);
  }
  return [R, G, B];
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Not an image"));
    };
    img.src = url;
  });
}

/** Crops the picked photo to the card's photo box (face-high, slightly zoomed in)
 * and gives it the card's look. Returns a JPEG data URL. */
export async function prepareSharePhoto(file: File): Promise<string> {
  const img = await loadImage(file);
  const w = SHARE_PHOTO_W * RES;
  const h = SHARE_PHOTO_H * RES;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas");

  // object-fit: cover, anchored near the top where a face usually is, then
  // zoomed in a little about a point just above the middle
  const cover = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * cover;
  const dh = img.naturalHeight * cover;
  const dx = (w - dw) / 2;
  const dy = (h - dh) * 0.2;
  const zoom = 1.2;
  const ox = w * 0.5;
  const oy = h * 0.22;
  ctx.fillStyle = "#0b1420";
  ctx.fillRect(0, 0, w, h);
  ctx.translate(ox, oy);
  ctx.scale(zoom, zoom);
  ctx.translate(-ox, -oy);
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let g = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      g = ((g / 255 - 0.5) * CONTRAST + 0.5) * 255 * BRIGHTNESS;
      g = Math.max(0, Math.min(255, g));
      // 135deg wash from the top left to the bottom right
      const t = Math.max(0, Math.min(1, (x - w / 2 + (y - h / 2)) / (w + h) + 0.5));
      const [wr, wg, wb] = setLum(
        WASH_FROM[0] + (WASH_TO[0] - WASH_FROM[0]) * t,
        WASH_FROM[1] + (WASH_TO[1] - WASH_FROM[1]) * t,
        WASH_FROM[2] + (WASH_TO[2] - WASH_FROM[2]) * t,
        g,
      );
      px[i] = g + (wr - g) * WASH_OPACITY;
      px[i + 1] = g + (wg - g) * WASH_OPACITY;
      px[i + 2] = g + (wb - g) * WASH_OPACITY;
      px[i + 3] = 255;
    }
  }
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.88);
}
