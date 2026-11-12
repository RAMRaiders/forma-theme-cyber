/**
 * A screenshot's black frame, cut off on Cyber's TVs.
 *
 * Scraped screenshots often carry the console's overscan border as black bars baked into the
 * picture (most Atari 5200 and 7800 shots, many PC Engine and Mega Drive ones): put on a TV's
 * tube, the game showed small inside it. Cyber finds the bars once per picture, on a small
 * canvas, and lays the picture out so the game itself fills the screen. A look, so the theme's
 * own: Forma serves the pictures as scraped.
 *
 * Careful with dark games: only rows and columns that are black right across count, and a side
 * whose black runs past MAX_SIDE is a dark picture (a night sky), left whole.
 */

/** The black bars round a picture, as fractions of its width (left, right) and height. */
export interface Trim {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Most of a side cut off: more black than this is the picture's own. */
const MAX_SIDE = 0.15;
/** Less than this is no bar (a soft edge, a stray dark row). */
const MIN_SIDE = 0.015;
/** A pixel this dark (its brightest channel, 0–255) is black. */
const DARK = 24;
/** A row or column this dark right across is a bar (a speck of noise allowed). */
const DARK_SHARE = 0.985;
/** Measured no wider than this: plenty for bars a few pixels thick, little work on a Pi. */
const SAMPLE_W = 320;
/** Pictures measured, kept: browsing back to a game measures nothing again. */
const KEPT = 400;

const measured = new Map<string, Trim | null>();

/** The same picture at another size has the same bars: its URL without the width asked for. */
function keyOf(src: string): string {
  return src.replace(/([?&])w=\d+&?/, '$1').replace(/[?&]$/, '');
}

/** `img`'s black bars, once it has loaded; `null` without any (or if it cannot be read). */
export function borderOf(img: HTMLImageElement): Trim | null {
  const src = img.currentSrc || img.src;
  if (!src || !img.naturalWidth || !img.naturalHeight) return null;
  const key = keyOf(src);
  const known = measured.get(key);
  if (known !== undefined) return known;
  let trim: Trim | null = null;
  try {
    trim = measure(img);
  } catch {
    // No canvas, or a picture it may not read: shown as it is.
  }
  if (measured.size >= KEPT) measured.delete(measured.keys().next().value!);
  measured.set(key, trim);
  return trim;
}

function measure(img: HTMLImageElement): Trim | null {
  const scale = Math.min(1, SAMPLE_W / img.naturalWidth);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const dark = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return Math.max(px[i]!, px[i + 1]!, px[i + 2]!) <= DARK;
  };
  const rowDark = (y: number, x0: number, x1: number) => {
    let n = 0;
    for (let x = x0; x < x1; x++) if (dark(x, y)) n++;
    return n >= DARK_SHARE * (x1 - x0);
  };
  const colDark = (x: number, y0: number, y1: number) => {
    let n = 0;
    for (let y = y0; y < y1; y++) if (dark(x, y)) n++;
    return n >= DARK_SHARE * (y1 - y0);
  };
  // A run of black from one side: its share of the picture, 0 if none or too much to be a bar.
  const side = (size: number, isDark: (i: number) => boolean) => {
    const most = Math.floor(size * MAX_SIDE);
    let n = 0;
    while (n < size && isDark(n)) {
      n++;
      if (n > most) return 0;
    }
    const share = n / size;
    return share < MIN_SIDE ? 0 : share;
  };
  const top = side(h, (i) => rowDark(i, 0, w));
  const bottom = side(h, (i) => rowDark(h - 1 - i, 0, w));
  // The columns over the rows left between the bars.
  const y0 = Math.round(top * h);
  const y1 = h - Math.round(bottom * h);
  if (y1 - y0 < 2) return null;
  const left = side(w, (i) => colDark(i, y0, y1));
  const right = side(w, (i) => colDark(w - 1 - i, y0, y1));
  if (!top && !bottom && !left && !right) return null;
  return { left, top, right, bottom };
}

/** The game's own shape, its bars cut off. */
export function trimmedAspect(img: HTMLImageElement, t: Trim): number {
  return ((1 - t.left - t.right) * img.naturalWidth) / ((1 - t.top - t.bottom) * img.naturalHeight);
}

/**
 * Where `img` goes in a screen of shape `screenAspect` (width over height) for the game, its
 * bars cut off, to cover the screen as `object-fit: cover` would: its box, in percent of the
 * screen's width (left, width) and height (top, height). Overflowing the screen, which clips it.
 */
export function trimmedBox(
  img: HTMLImageElement,
  t: Trim,
  screenAspect: number
): { left: number; top: number; width: number; height: number } {
  // In units of the screen's width: the picture `a` wide and 1 high before scaling.
  const a = img.naturalWidth / img.naturalHeight;
  const cw = (1 - t.left - t.right) * a;
  const ch = 1 - t.top - t.bottom;
  const s = Math.max(1 / cw, 1 / (screenAspect * ch));
  return {
    left: (0.5 - (t.left * a + cw / 2) * s) * 100,
    top: (0.5 - (t.top + ch / 2) * s * screenAspect) * 100,
    width: a * s * 100,
    height: s * screenAspect * 100
  };
}

/** `img` laid out in its screen (shape `screenAspect`) with its bars cut off (style.css). */
export function placeTrimmed(img: HTMLImageElement, t: Trim, screenAspect: number): void {
  const box = trimmedBox(img, t, screenAspect);
  const pc = (n: number) => `${n.toFixed(3)}%`;
  img.style.left = pc(box.left);
  img.style.top = pc(box.top);
  img.style.width = pc(box.width);
  img.style.height = pc(box.height);
  img.classList.add('trimmed');
}

/** The box `placeTrimmed` gave `img`, in fractions of its screen; `null` if it gave none. */
export function placedBox(
  img: HTMLImageElement
): { left: number; top: number; width: number; height: number } | null {
  if (!img.classList.contains('trimmed')) return null;
  const f = (v: string) => Number.parseFloat(v) / 100;
  const box = {
    left: f(img.style.left),
    top: f(img.style.top),
    width: f(img.style.width),
    height: f(img.style.height)
  };
  return Object.values(box).every(Number.isFinite) ? box : null;
}
