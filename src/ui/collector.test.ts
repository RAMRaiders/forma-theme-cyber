// @vitest-environment jsdom
import type { Game } from '@ramraiders/forma-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LazyList } from '../logic/pager.js';
import { CollectorView, boxHeight, gradeOf, hue, hueOf, serial } from './collector.js';
import type { Kind } from './stage.js';

const game = (id: number, name: string, media: Partial<Record<Kind, string>> = {}): Game =>
  ({
    id,
    system: 'sega32x',
    path: `${name}.7z`,
    name,
    description: 'Strap into your F-14. Shoot everything. Land on the carrier.',
    developer: 'Rutubo Games',
    publisher: 'Sega of America',
    genre: 'Shooter',
    players: '1',
    releaseDate: '1995-01-13',
    rating: 0.7,
    favorite: false,
    hidden: false,
    playCount: 2,
    lastPlayed: null,
    gameTime: 600,
    raGameId: null,
    media
  }) as unknown as Game;

const BOXED: Partial<Record<Kind, string>> = {
  thumbnail: 'front',
  boxback: 'back',
  boxside: 'spine',
  cartridge: 'cart',
  wheel: 'logo',
  fanart: 'art',
  titleshot: 'title',
  image: 'shot'
};

const media = (g: Game, kind: Kind, width?: number) =>
  (g.media as Partial<Record<string, string>>)[kind]
    ? `forma://media/${g.id}/${kind}${width ? `?w=${width}` : ''}`
    : null;

async function view(games: Game[]) {
  const v = new CollectorView({
    media,
    system: () => ({ name: 'Sega 32X', logo: './systems/sega32x/logo-small.webp', dark: false })
  });
  document.body.replaceChildren(v.root);
  const list = new LazyList<Game>(
    (offset, limit) =>
      Promise.resolve({ items: games.slice(offset, offset + limit), total: games.length }),
    50
  );
  await list.start(0);
  v.show(list, 0);
  const text = (sel: string) =>
    [...v.root.querySelectorAll(sel)].map((n) => n.textContent?.trim() ?? '');
  const src = (sel: string) => v.root.querySelector<HTMLImageElement>(sel)?.getAttribute('src');
  return { v, text, src };
}

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.dataset.motion = 'on';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the Collector view', () => {
  it('puts the box in the case from its front, spine and back, the cartridge beside it', async () => {
    const { src, text } = await view([game(7, 'After Burner', BOXED)]);
    expect(src('.cbox .front img')).toBe('forma://media/7/thumbnail?w=640');
    expect(src('.cbox .spine img')).toBe('forma://media/7/boxside?w=160');
    expect(src('.cbox .back img')).toBe('forma://media/7/boxback?w=640');
    expect(src('.display .cart')).toBe('forma://media/7/cartridge?w=400');
    expect(text('.prints .print')).toHaveLength(2);
    expect(text('.poses span')).toEqual(['Front', 'Spine', 'Back']);
  });

  it('makes up the spine and back a game has no picture of', async () => {
    const { v, src, text } = await view([game(3, 'Doom', { thumbnail: 'front', wheel: 'logo' })]);
    expect(v.root.querySelector('.cbox .spine .made-spine')).not.toBeNull();
    expect(src('.cbox .spine .made-spine img')).toBe('forma://media/3/wheel?w=560');
    expect(text('.cbox .back .made-back p')[0]).toMatch(/^Strap into your F-14\./);
  });

  it('labels the case with its grade, system and serial', async () => {
    const { text } = await view([game(7, 'After Burner', BOXED)]);
    expect(text('.slab-label .what strong')).toEqual(['After Burner']);
    expect(text('.slab-label .line')).toEqual(['1995 · Sega 32X']);
    expect(text('.slab-label .serial')).toEqual(['SEGA32X-000007']);
    expect(text('.slab-label .grade strong')).toEqual(['7.0']);
    expect(text('.slab-label .grade span')).toEqual(['Excellent']);
  });

  it('turns the box by itself, and the way the player turns it', async () => {
    const { v } = await view([game(7, 'After Burner', BOXED)]);
    const box = v.root.querySelector<HTMLElement>('.cbox')!;
    expect(box.dataset.pose).toBe('front');
    vi.advanceTimersByTime(3300);
    expect(box.dataset.pose).toBe('spine');
    v.turn(1);
    expect(box.dataset.pose).toBe('back');
    // Turned by hand, it no longer turns by itself.
    vi.advanceTimersByTime(20_000);
    expect(box.dataset.pose).toBe('back');
    v.turn(-1);
    expect(box.dataset.pose).toBe('spine');
    expect(box.style.transform).toBe('rotateX(-8deg) rotateY(66deg)');
  });

  it('shows the dossier: what is known, what it offers, what was played', async () => {
    const { text } = await view([
      { ...game(7, 'After Burner', BOXED), path: 'After Burner (USA, Japan) (En,Ja) (Rev 1).7z' }
    ]);
    expect(text('.dossier .specs dt')).toEqual([
      'Released',
      'Developer',
      'Publisher',
      'Genre',
      'Region',
      'Languages',
      'Version',
      'Rating'
    ]);
    expect(text('.dossier .specs dd').slice(0, 2)).toEqual(['13 Jan 1995', 'Rutubo Games']);
    // From the ROM's name, before the gamelist's.
    expect(text('.dossier .specs .flags')).toEqual(['USAJapan', 'EnglishJapanese']);
    expect(text('.dossier .specs dd')[6]).toBe('Rev 1');
    // What it offers: players and no manual, no achievements; netplay not known here.
    expect(text('.dossier .mark.on')).toEqual(['1 player']);
    expect(text('.dossier .record p')[0]).toMatch(/^2×/);
  });

  it('keeps every game on the shelf, the selected one pulled out', async () => {
    const { v, text } = await view([
      game(1, 'After Burner', BOXED),
      game(2, 'Doom'),
      game(3, 'Kolibri')
    ]);
    expect(text('.spine-row .title')).toEqual(['After Burner', 'Doom', 'Kolibri']);
    vi.advanceTimersByTime(500);
    v.select(1);
    expect(text('.spine-row.selected .title')).toEqual(['Doom']);
    vi.advanceTimersByTime(200);
    expect(text('.slab-label .what strong')).toEqual(['Doom']);
    // No box picture: a cover made from what it has.
    expect(v.root.querySelector('.cbox .front .made-cover')).not.toBeNull();
    expect(text('.dossier .mark')).toHaveLength(4);
  });
});

describe('the shelf and the video', () => {
  it('shows the shelf while moving, then the case; the video after a moment', async () => {
    const play = vi.fn(() => Promise.resolve({ playing: true }));
    const stopVideo = vi.fn();
    const v = new CollectorView({ media, play, stopVideo });
    document.body.replaceChildren(v.root);
    const games = [game(1, 'A', { ...BOXED, video: 'v' }), game(2, 'B', { ...BOXED, video: 'v' })];
    const list = new LazyList<Game>(
      (offset, limit) =>
        Promise.resolve({ items: games.slice(offset, offset + limit), total: games.length }),
      50
    );
    await list.start(0);
    v.show(list, 0);
    expect(v.root.classList.contains('browsing')).toBe(true);
    vi.advanceTimersByTime(1200);
    expect(v.root.classList.contains('browsing')).toBe(false);
    vi.advanceTimersByTime(1500);
    expect(play).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(v.root.classList.contains('video-on')).toBe(true);
    // Moving on: the video stops at once, the shelf comes back.
    v.select(1);
    expect(stopVideo).toHaveBeenCalled();
    expect(v.root.classList.contains('video-on')).toBe(false);
    expect(v.root.classList.contains('browsing')).toBe(true);
    v.leave();
  });
});

describe('the box in its case', () => {
  it('stands as tall as the case allows, within bounds', () => {
    // A tall case, a narrow box: its height is what limits it.
    expect(boxHeight(40, 24, 0.72, 0.14)).toBeCloseTo(24 - 4.6);
    // A wide box (an N64's) in a narrow case: its width is.
    expect(boxHeight(30, 30, 1.4, 0.2)).toBeCloseTo(29 / 1.6);
    expect(boxHeight(200, 200, 0.7, 0.1)).toBe(26);
    expect(boxHeight(5, 5, 1, 0.1)).toBe(12);
  });
});

describe('a spine’s colour', () => {
  it('is the hue of its box’s colour', () => {
    expect(hueOf('hsl(212 95% 70%)')).toBe(212);
    expect(hueOf('#fff')).toBeNull();
  });
});

describe('collector words', () => {
  it('grades a rating', () => {
    expect(gradeOf(null)).toBeNull();
    expect(gradeOf(0.99)).toEqual({ score: '9.9', word: 'Gem mint' });
    expect(gradeOf(0.85)).toEqual({ score: '8.5', word: 'Near mint' });
    expect(gradeOf(0.3)).toEqual({ score: '3.0', word: 'Fair' });
  });

  it('gives each game the same serial and colour every time', () => {
    expect(serial(game(42, 'X'))).toBe('SEGA32X-000042');
    expect(hue('After Burner')).toBe(hue('After Burner'));
    expect(hue('After Burner')).not.toBe(hue('Doom'));
  });
});
