import { describe, expect, it } from 'vitest';

import { isDarkLogo } from './tone.js';

/** RGBA pixels: `n` of each colour given. */
function pixels(...runs: [number, [number, number, number, number]][]): Uint8ClampedArray {
  return new Uint8ClampedArray(
    runs.flatMap(([n, rgba]) => Array.from({ length: n }, () => rgba).flat())
  );
}

describe('a logo too dark for a dark page', () => {
  it('is one drawn in black or a deep colour', () => {
    expect(isDarkLogo(pixels([90, [0, 0, 0, 255]], [10, [0, 0, 0, 0]]))).toBe(true);
    // Navy, as After Burner's.
    expect(isDarkLogo(pixels([100, [20, 20, 110, 255]]))).toBe(true);
    // Mostly black with a touch of colour: its black would be lost, so dark.
    expect(isDarkLogo(pixels([75, [0, 0, 0, 255]], [25, [230, 40, 40, 255]]))).toBe(true);
  });

  it('is not one with a bright fill, black outline or not', () => {
    expect(isDarkLogo(pixels([50, [0, 0, 0, 255]], [50, [230, 40, 40, 255]]))).toBe(false);
    expect(isDarkLogo(pixels([100, [255, 255, 255, 255]]))).toBe(false);
  });

  it('counts only the solid pixels, not the see-through round it', () => {
    expect(isDarkLogo(pixels([900, [0, 0, 0, 0]], [100, [250, 220, 60, 255]]))).toBe(false);
    expect(isDarkLogo(pixels([100, [0, 0, 0, 0]]))).toBe(false);
  });
});
