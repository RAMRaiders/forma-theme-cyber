import { describe, expect, it } from 'vitest';

import { systemColours } from './system.js';

const hueOf = (rgb: string) => {
  const [r, g, b] = rgb.split(' ').map((v) => Number(v) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round((h * 60 + 360) % 360);
};

describe('the colours a system lights its screen with', () => {
  it('are its logo’s own: both of them, in neon', () => {
    // PlayStation: red and yellow.
    const [main, accent] = systemColours(
      { hues: [345, 45], maker: 'Sony', category: 'consoles' },
      0
    );
    expect(Math.abs(hueOf(main) - 345)).toBeLessThan(4);
    expect(Math.abs(hueOf(accent) - 45)).toBeLessThan(4);
  });

  it('with its console’s own colour as the accent: a PAL Super Nintendo’s yellow button', () => {
    const [main, accent] = systemColours(
      { hues: [355], consoleHues: [53, 5], maker: 'Nintendo', category: 'consoles' },
      0
    );
    expect(hueOf(main)).toBeGreaterThan(350);
    expect(Math.abs(hueOf(accent) - 53)).toBeLessThan(4);
  });

  it('with its maker’s as the accent when the logo has one colour', () => {
    // Super Nintendo's red, Nintendo's red too: a step round instead.
    const snes = systemColours({ hues: [355], maker: 'Nintendo', category: 'consoles' }, 0);
    expect(hueOf(snes[1])).not.toBe(hueOf('255 59 78'));
    // FBNeo's orange, an arcade maker's pink.
    const other = systemColours({ hues: [30], maker: 'Sega', category: 'arcade' }, 0);
    expect(other[1]).toBe('47 140 255');
  });

  it('are its maker’s when the logo has no colour', () => {
    const [main] = systemColours({ hues: [], maker: 'Sega', category: 'consoles' }, 3);
    expect(main).toBe('47 140 255');
  });

  it('else differ clearly from their neighbours’, by place in the list', () => {
    const mains = [0, 1, 2, 3, 4].map(
      (i) => systemColours({ hues: [], maker: 'Watara', category: 'handhelds' }, i)[0]
    );
    expect(new Set(mains).size).toBe(5);
    for (const c of mains) expect(c).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
  });
});
