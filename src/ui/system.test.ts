// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { shelf, systemColours } from './system.js';

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

describe('the shelf', () => {
  const mag = (n: number) => ({ src: `./systems/x/mag-${n}.webp`, title: `Issue ${n}` });
  const none = { manual: null, magazines: [], peripherals: [] };

  it('fans the magazines, the first in the middle, the manual before them, the peripherals named', () => {
    const box = shelf({
      manual: { src: './systems/x/manual.webp', title: 'Control Deck' },
      magazines: [mag(1), mag(2), mag(3), mag(4)],
      peripherals: [{ src: './systems/x/gear-1.webp', name: 'Light gun' }]
    })!;
    const covers = [...box.querySelectorAll('.stand .cover img')].map((i) => i.getAttribute('alt'));
    expect(covers).toEqual(['Issue 2', 'Issue 1', 'Issue 3']);
    expect(box.querySelector('.cover.lead img')?.getAttribute('alt')).toBe('Issue 1');
    expect(box.querySelector('.manual img')?.getAttribute('alt')).toBe(
      "Owner's manual: Control Deck"
    );
    expect(box.querySelector('.gear figcaption')?.textContent).toBe('Light gun');
  });

  it('leaves out what a system has none of, and is nothing for one with none', () => {
    const box = shelf({ ...none, magazines: [mag(1)] })!;
    expect(box.querySelector('.gear')).toBeNull();
    expect(box.querySelectorAll('.cover')).toHaveLength(1);
    expect(shelf(none)).toBeNull();
  });
});
