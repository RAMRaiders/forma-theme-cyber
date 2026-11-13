/**
 * Whether a logo is too dark for Cyber's dark pages: drawn in black or deep colours, for a box or
 * a light background. Measured once on a small copy (cheap on a Pi), and kept.
 */

/** Of a logo's solid pixels, under this share bright: too dark to read on a dark page. */
const BRIGHT_SHARE = 0.35;
/** A pixel is bright when its strongest channel is above this (0–255): a vivid red counts. */
const BRIGHT = 140;
const SAMPLE_W = 48;
const SAMPLE_H = 24;
const KEPT = 300;

const known = new Map<string, boolean>();

/** Whether RGBA `data` is a dark logo: few of its solid pixels bright. */
export function isDarkLogo(data: Uint8ClampedArray | Uint8Array): boolean {
  let solid = 0;
  let bright = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3]! < 128) continue;
    solid++;
    if (Math.max(data[i]!, data[i + 1]!, data[i + 2]!) > BRIGHT) bright++;
  }
  return solid > 0 && bright / solid < BRIGHT_SHARE;
}

/** What is known of the logo at `src`: dark or not, or `undefined` before it is measured. */
export function knownDark(src: string): boolean | undefined {
  return known.get(src);
}

/** Measures a loaded logo (once per picture); `null` when it cannot be read yet. */
export function darkLogo(img: HTMLImageElement): boolean | null {
  const src = img.getAttribute('src') ?? '';
  const kept = known.get(src);
  if (kept !== undefined) return kept;
  if (!img.complete || !img.naturalWidth) return null;
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_W;
  canvas.height = SAMPLE_H;
  const ctx = canvas.getContext?.('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(img, 0, 0, SAMPLE_W, SAMPLE_H);
    const dark = isDarkLogo(ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data);
    if (known.size >= KEPT) known.delete(known.keys().next().value!);
    known.set(src, dark);
    return dark;
  } catch {
    // A picture the page may not read: left as it is.
    return null;
  }
}
