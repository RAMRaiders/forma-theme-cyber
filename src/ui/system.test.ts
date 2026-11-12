// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import {
  lifeEvents,
  logoHeight,
  makerHeight,
  readingMs,
  soldShort,
  SystemView,
  systemColours
} from './system.js';
import type { CyberSystem, InfoStore } from '../data/catalog.js';

const hueOf = (rgb: string) => {
  const [r, g, b] = rgb.split(' ').map((v) => Number(v) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round((h * 60 + 360) % 360);
};

describe('the strip of logos', () => {
  const systems = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      summary: { name: `s${i}`, fullname: `System ${i}`, gameCount: 1 },
      category: 'consoles',
      logo: null,
      logoSmall: null,
      logoDark: false,
      photo: null,
      photoKind: 'cutout',
      hues: [],
      magazines: [],
      peripherals: []
    })) as unknown as CyberSystem[];
  const strip = (n: number) => {
    const infos = {
      makers: () => Promise.resolve({}),
      peek: () => null,
      get: () => Promise.resolve(null)
    } as unknown as InfoStore;
    const view = new SystemView(infos, () => {});
    document.body.replaceChildren(view.root);
    view.show(systems(n), 0);
    const place = (name: string) =>
      [...view.root.querySelectorAll<HTMLElement>('.system-list li')]
        .find((li) => li.querySelector('.name')?.textContent === name)
        ?.style.getPropertyValue('--place');
    return { view, place };
  };

  it('with more systems than it shows, puts the last ones before the first', () => {
    const tall = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(320);
    const { view, place } = strip(12);
    expect(place('System 11')).toBe('-1');
    expect(place('System 1')).toBe('1');
    view.select(11);
    expect(view.root.querySelector('li.selected .name')?.textContent).toBe('System 11');
    expect(place('System 11')).toBe('-1'); // one step up, not all the way down the list
    view.hide();
    tall.mockRestore();
  });

  it('lights the selection frame in the next system’s colour on the step itself', () => {
    const { view } = strip(3);
    const rail = view.root.querySelector<HTMLElement>('.system-rail')!;
    const before = rail.style.getPropertyValue('--sys');
    view.select(1);
    const after = rail.style.getPropertyValue('--sys');
    // Set at once, before the page is drawn; and a different colour from the first system's.
    expect(after).toMatch(/^rgb\(/);
    expect(after).not.toBe(before);
    view.select(2);
    expect(rail.style.getPropertyValue('--sys')).not.toBe(after);
    view.hide();
  });

  it('with few systems stays a plain list, each once', () => {
    const tall = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(320);
    const { view, place } = strip(3);
    expect(view.root.querySelectorAll('.system-list li')).toHaveLength(3);
    expect(place('System 2')).toBe('2');
    tall.mockRestore();
  });
});

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

  describe('makerHeight', () => {
    it('gives a square emblem the area of a wordmark', () => {
      expect(makerHeight(3)).toBeCloseTo(1.9, 1);
      expect(makerHeight(0.91)).toBeGreaterThan(3.4);
      expect(makerHeight(0.5)).toBe(3.6);
      expect(makerHeight(8)).toBe(1.7);
    });
  });
});

describe('a system’s life', () => {
  it('is its launch, its releases abroad, and its end', () => {
    expect(lifeEvents('1987 JP · 1989 NA', '1987–1994 (7 years)')).toEqual([
      { year: 1987, what: 'Launch', regions: ['JP'] },
      { year: 1989, what: 'North America', regions: ['NA'] },
      { year: 1994, what: 'Last made', regions: [] }
    ]);
  });

  it('has one moment a year, its regions together', () => {
    expect(lifeEvents('1994 JP · 1995 NA · 1995 EU', '1994–2006 (12 years)')).toEqual([
      { year: 1994, what: 'Launch', regions: ['JP'] },
      { year: 1995, what: 'Abroad', regions: ['NA', 'EU'] },
      { year: 2006, what: 'Last made', regions: [] }
    ]);
  });

  it('is nothing when nothing is known', () => {
    expect(lifeEvents(null, null)).toEqual([]);
  });
});

describe('units sold', () => {
  it('keeps the number and its word only', () => {
    expect(soldShort('~61.9 million')).toBe('61.9 million');
    expect(soldShort('About 118.69 million (Game Boy and Game Boy Color combined)')).toBe(
      '118.69 million'
    );
  });
});
