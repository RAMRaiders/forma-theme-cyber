// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import {
  gear,
  logoHeight,
  press,
  readingMs,
  releaseDates,
  systemColours,
  turnCover
} from './system.js';

const hueOf = (rgb: string) => {
  const [r, g, b] = rgb.split(' ').map((v) => Number(v) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round((h * 60 + 360) % 360);
};

describe('how long words stay on screen', () => {
  const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ');

  it('grows with how much there is to read', () => {
    expect(readingMs(words(13))).toBe(8850);
    expect(readingMs(words(27))).toBe(15_150);
    expect(readingMs(words(64))).toBe(31_800);
  });

  it('is never too short to take in', () => {
    expect(readingMs(words(4))).toBe(6000);
    expect(readingMs('')).toBe(6000);
  });

  it('counts words however they are spaced', () => {
    expect(readingMs(`  ${words(20)}  `)).toBe(readingMs(words(20).replaceAll(' ', '\n  ')));
  });
});

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

describe('more of a system’s colours', () => {
  it('takes up to four, all its logo’s: 3DO’s red, yellow and blue', () => {
    const colours = systemColours({ hues: [5, 55, 245], maker: null, category: 'consoles' }, 0);
    expect(colours).toHaveLength(3);
    colours.forEach((c, i) => expect(Math.abs(hueOf(c) - [5, 55, 245][i]!)).toBeLessThan(6));
  });

  it('never two alike', () => {
    const colours = systemColours(
      { hues: [355, 10], consoleHues: [53, 50, 209], maker: null, category: 'consoles' },
      0
    );
    expect(colours).toHaveLength(3);
  });
});

describe('a logo in the column', () => {
  it('stands lower the wider it is, within 1rem and 2rem', () => {
    expect(logoHeight(1)).toBe(3);
    expect(logoHeight(3.5)).toBeCloseTo(3, 0);
    expect(logoHeight(6)).toBeLessThan(logoHeight(3));
    expect(logoHeight(40)).toBe(1.5);
  });
});

describe('the press and the gear', () => {
  const mag = (n: number) => ({ src: `./systems/x/mag-${n}.webp`, title: `Issue ${n}` });

  /** The covers' titles, front one first. */
  const order = (stand: HTMLElement) =>
    [...stand.querySelectorAll<HTMLElement>('.cover')]
      .sort((a, b) => Number(a.dataset.pos) - Number(b.dataset.pos))
      .map((c) => c.querySelector('img')?.getAttribute('alt'));

  it('stacks five magazines at most, the first in front, with no words', () => {
    const stand = press({ magazines: [mag(1), mag(2), mag(3), mag(4), mag(5), mag(6)] })!;
    expect(order(stand)).toEqual(['Issue 1', 'Issue 2', 'Issue 3', 'Issue 4', 'Issue 5']);
    expect(stand.textContent).toBe('');
  });

  it('turns the front cover away and puts it at the back', () => {
    vi.useFakeTimers();
    try {
      const stand = press({ magazines: [mag(1), mag(2), mag(3)] })!;
      turnCover(stand);
      expect(stand.querySelector('.cover.turning img')?.getAttribute('alt')).toBe('Issue 1');
      vi.runAllTimers();
      expect(stand.querySelector('.cover.turning')).toBeNull();
      expect(order(stand)).toEqual(['Issue 2', 'Issue 3', 'Issue 1']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('names up to four peripherals', () => {
    const p = (n: number) => ({ src: `./systems/x/gear-${n}.webp`, name: `Pad ${n}` });
    const box = gear({ peripherals: [p(1), p(2), p(3), p(4), p(5)] })!;
    expect([...box.querySelectorAll('figcaption')].map((c) => c.textContent)).toEqual([
      'Pad 1',
      'Pad 2',
      'Pad 3',
      'Pad 4'
    ]);
  });

  it('is nothing for a system with none', () => {
    expect(press({ magazines: [] })).toBeNull();
    expect(gear({ peripherals: [] })).toBeNull();
  });
});

describe('release dates', () => {
  it('shows each region as its flag and keeps the rest of the words', () => {
    const parts = releaseDates('1985 JP (Mark III) · 1986 NA · 1987 EU');
    const flags = parts.filter((p): p is HTMLImageElement => typeof p !== 'string');
    expect(flags.map((f) => f.getAttribute('src'))).toEqual([
      './flags/jp.svg',
      './flags/us.svg',
      './flags/eu.svg'
    ]);
    expect(parts.filter((p) => typeof p === 'string')).toEqual([
      '1985 ',
      ' (Mark III) · 1986 ',
      ' · 1987 ',
      ''
    ]);
  });

  it('leaves a date with no region as it is', () => {
    expect(releaseDates('1982')).toEqual(['1982']);
  });
});
