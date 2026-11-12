// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { borderOf, placeTrimmed, placedBox, trimmedAspect, trimmedBox } from './trim.js';

/** An image `w`×`h` that has loaded, at `src`. */
function loaded(src: string, w: number, h: number): HTMLImageElement {
  const img = document.createElement('img');
  img.src = src;
  Object.defineProperty(img, 'naturalWidth', { value: w });
  Object.defineProperty(img, 'naturalHeight', { value: h });
  return img;
}

/** Canvases that read back `pixel(x, y)` (true: black, false: lit), at the size drawn. */
function picture(pixel: (x: number, y: number, w: number, h: number) => boolean) {
  const draws = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement
  ) {
    const { width: w, height: h } = this;
    return {
      drawImage: draws,
      getImageData: () => {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const v = pixel(x, y, w, h) ? 8 : 200;
            data.set([v, v, v, 255], (y * w + x) * 4);
          }
        return { data };
      }
    } as unknown as CanvasRenderingContext2D;
  } as never);
  return draws;
}

afterEach(() => vi.restoreAllMocks());

describe('trim', () => {
  it('finds the black frame round a screenshot', () => {
    // An Atari 5200 shot: 320×240, the game 304×188 at (8, 28).
    picture((x, y) => x < 8 || x >= 312 || y < 28 || y >= 216);
    const t = borderOf(loaded('forma://localhost/media/1/image?w=400&v=1', 320, 240))!;
    expect(t.left).toBeCloseTo(8 / 320);
    expect(t.right).toBeCloseTo(8 / 320);
    expect(t.top).toBeCloseTo(28 / 240);
    expect(t.bottom).toBeCloseTo(24 / 240);
  });

  it('leaves a dark picture whole: black past a bar is its own', () => {
    // A night sky: the top 40 % black, and a thin bar at the bottom.
    picture((_x, y, _w, h) => y < h * 0.4 || y >= h - 6);
    const t = borderOf(loaded('forma://localhost/media/2/image', 320, 240))!;
    expect(t.top).toBe(0);
    expect(t.bottom).toBeCloseTo(6 / 240);
  });

  it('has nothing to cut on a picture without bars, nor on one it cannot read', () => {
    picture(() => false);
    expect(borderOf(loaded('forma://localhost/media/3/image', 320, 240))).toBeNull();
    vi.restoreAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('tainted');
    });
    expect(borderOf(loaded('forma://localhost/media/4/image', 320, 240))).toBeNull();
  });

  it('measures a picture once, whatever size it is asked at', () => {
    const draws = picture((x) => x < 10);
    borderOf(loaded('forma://localhost/media/5/image?w=400&v=2', 320, 240));
    borderOf(loaded('forma://localhost/media/5/image?w=640&v=2', 320, 240));
    expect(draws).toHaveBeenCalledTimes(1);
  });

  it('lays the game out over the whole screen, the bars outside it', () => {
    const img = loaded('x', 320, 240);
    // No bars, the screen its shape: the picture is the screen.
    const whole = trimmedBox(img, { left: 0, top: 0, right: 0, bottom: 0 }, 4 / 3);
    expect(whole.left).toBeCloseTo(0);
    expect(whole.top).toBeCloseTo(0);
    expect(whole.width).toBeCloseTo(100);
    expect(whole.height).toBeCloseTo(100);
    // Bars all round: the game's middle on the screen's, the game covering it.
    const t = { left: 0.05, top: 0.1, right: 0.05, bottom: 0.1 };
    const box = trimmedBox(img, t, 4 / 3);
    const game = {
      left: box.left + box.width * t.left,
      right: box.left + box.width * (1 - t.right),
      top: box.top + box.height * t.top,
      bottom: box.top + box.height * (1 - t.bottom)
    };
    expect((game.left + game.right) / 2).toBeCloseTo(50);
    expect((game.top + game.bottom) / 2).toBeCloseTo(50);
    expect(game.left).toBeLessThanOrEqual(1e-9);
    expect(game.top).toBeLessThanOrEqual(1e-9);
    expect(Math.min(-game.left, -game.top)).toBeCloseTo(0);
    expect(trimmedAspect(img, t)).toBeCloseTo((0.9 * 320) / (0.8 * 240));
  });

  it('gives back the box it placed, for the video to follow', () => {
    const img = loaded('x', 320, 240);
    expect(placedBox(img)).toBeNull();
    const t = { left: 0.05, top: 0.1, right: 0.05, bottom: 0.1 };
    placeTrimmed(img, t, 4 / 3);
    const box = trimmedBox(img, t, 4 / 3);
    const placed = placedBox(img)!;
    expect(placed.left * 100).toBeCloseTo(box.left, 2);
    expect(placed.height * 100).toBeCloseTo(box.height, 2);
  });
});
