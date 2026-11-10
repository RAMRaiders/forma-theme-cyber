// @vitest-environment jsdom
import { DEFAULT_FRONT, hue } from './cover.js';
import type { Game } from '@ramraiders/forma-sdk';
import type { CollectorOptions } from './collector.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LazyList } from '../logic/pager.js';
import { versionsText } from './collector.js';
import {
  CollectorView,
  type ScreenArea,
  boxHeight,
  paginate,
  versionText,
  gradeOf,
  hueOf,
  serial
} from './collector.js';
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

async function view(games: Game[], extra: Partial<CollectorOptions> = {}) {
  const v = new CollectorView({
    media,
    ...extra,
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
  return { v, list, text, src };
}

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.dataset.motion = 'on';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the Collector view', () => {
  it('puts the box in the case from its front, spine and back, its cartridge behind it', async () => {
    const { v, src, text } = await view([game(7, 'After Burner', BOXED)]);
    expect(src('.cbox .front img')).toBe('forma://media/7/thumbnail?w=640');
    expect(src('.cbox .spine img')).toBe('forma://media/7/boxside?w=160');
    expect(src('.cbox .back img')).toBe('forma://media/7/boxback?w=640');
    // The cartridge behind the box, until its turn.
    expect(src('.display .cart-stage img')).toBe('forma://media/7/cartridge?w=400');
    // Its screenshots on the footage bay's screen, the first showing.
    expect(v.root.querySelectorAll('.bay.footage .screen img')).toHaveLength(2);
    expect(v.root.querySelectorAll('.bay.footage .screen img.on')).toHaveLength(1);
    expect(text('.poses span')).toEqual(['Front', 'Spine', 'Back', 'Cartridge']);
    expect(text('.poses .on')).toEqual(['Front']);
  });

  it('has no cartridge turn for a game with no picture of one', async () => {
    const { text } = await view([game(3, 'Doom', { thumbnail: 'front' })]);
    expect(text('.poses span')).toEqual(['Front', 'Spine', 'Back']);
  });

  it('after the back, slides the box out and the cartridge in, then the other way', async () => {
    const { v } = await view([game(7, 'After Burner', BOXED)]);
    const box = v.root.querySelector<HTMLElement>('.cbox')!;
    const display = v.root.querySelector<HTMLElement>('.display')!;
    v.turn(1);
    v.turn(1);
    expect(box.dataset.pose).toBe('back');
    v.turn(1);
    expect(box.dataset.pose).toBe('cartridge');
    expect(display.classList.contains('cart-out')).toBe(true);
    // Not turned while it goes.
    expect(box.style.transform).toBe('rotateY(180deg)');
    v.turn(1);
    // The cartridge on out, the box back in already on its front.
    expect(display.classList.contains('cart-out')).toBe(false);
    expect(display.classList.contains('cart-leaving')).toBe(true);
    expect(box.dataset.pose).toBe('front');
    expect(box.style.transform).toBe('rotateY(360deg)');
    vi.advanceTimersByTime(2400);
    expect(display.classList.contains('cart-leaving')).toBe(false);
    // And the other way: out on its front, back in on its back (the same face as 180°).
    v.turn(-1);
    expect(display.classList.contains('cart-out')).toBe(true);
    v.turn(-1);
    expect(box.dataset.pose).toBe('back');
    expect(box.style.transform).toBe('rotateY(540deg)');
  });

  it('makes up the spine and back a game has no picture of', async () => {
    const { v, src, text } = await view([game(3, 'Doom', { thumbnail: 'front', wheel: 'logo' })]);
    expect(v.root.querySelector('.cbox .spine .made-spine')).not.toBeNull();
    expect(src('.cbox .spine .made-spine img')).toBe('forma://media/3/wheel?w=560');
    expect(text('.cbox .back .made-back p')[0]).toMatch(/^Strap into your F-14\./);
  });

  it('shows the age rating as PEGI among the marks; worked out from another board where needed', async () => {
    const rated = { ...game(8, 'Doom (Europe)'), ageRating: 'ESRB:M,PEGI:18' } as Game;
    const { v, text } = await view([rated]);
    expect(text('.dossier .marks .mark:last-child.pegi strong')).toEqual(['18PEGI']);
    const seal = v.root.querySelector('.dossier .pegi');
    expect(seal?.classList.contains('red')).toBe(true);
    expect(seal?.getAttribute('aria-label')).toBe('Age rating ESRB M, PEGI 18');
    const esrb = await view([{ ...game(9, 'After Burner'), ageRating: 'ESRB:E' }]);
    expect(esrb.text('.dossier .pegi strong')).toEqual(['3PEGI']);
    expect(esrb.v.root.querySelector('.dossier .pegi')?.getAttribute('title')).toBe(
      'PEGI 3, from ESRB E'
    );
    const unrated = await view([game(10, 'Kolibri')]);
    expect(unrated.v.root.querySelector('.dossier .pegi.none')).not.toBeNull();
  });

  it('labels the case with its grade, system and serial', async () => {
    const { v, text } = await view([game(7, 'After Burner', BOXED)]);
    expect(text('.slab-label .what strong')).toEqual(['After Burner']);
    expect(text('.slab-label .line')).toEqual(['1995 · Sega 32X']);
    expect(text('.slab-label .serial')).toEqual(['SEGA32X-000007']);
    expect(text('.slab-label .grade strong')).toEqual(['3.5/5']);
    expect(text('.slab-label .grade .word')).toEqual(['Excellent']);
    expect(v.root.querySelector('.slab-label .grade .stars')?.getAttribute('aria-label')).toBe(
      '3.5 of 5'
    );
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
    expect(box.style.transform).toBe('rotateY(90deg)');
  });

  it('shows the dossier: what is known, what it offers, what was played', async () => {
    const { v, text } = await view([
      { ...game(7, 'After Burner', BOXED), path: 'After Burner (USA, Japan) (En,Ja) (Rev 1).7z' }
    ]);
    expect(text('.dossier .part h3')).toEqual(['Release', 'This copy', 'Play record']);
    expect(text('.dossier .specs dt')).toEqual([
      'Released',
      'Developer',
      'Publisher',
      'Genre',
      'Region',
      'Languages',
      'Version',
      'Media',
      'Played',
      'Time'
    ]);
    const dd = text('.dossier .specs dd');
    expect(dd[0]).toMatch(/^13 Jan 1995 · \d+ years ago$/);
    expect(dd[1]).toBe('Rutubo Games');
    // From the ROM's name, before the gamelist's: flags alone, their names for screen readers.
    const flags = (n: number) =>
      [...v.root.querySelectorAll('.dossier .specs .flags')][n]!.querySelectorAll('.chip');
    expect([...flags(0)].map((c) => c.getAttribute('title'))).toEqual(['USA', 'Japan']);
    expect([...flags(1)].map((c) => c.getAttribute('title'))).toEqual(['English', 'Japanese']);
    expect(text('.dossier .specs .flags')).toEqual(['', '']);
    expect(dd[6]).toBe('Revision 1');
    // What it has, lit; what it lacks, faint.
    expect(text('.dossier .archive .on')).toEqual([
      'Box',
      'Back',
      'Spine',
      'Cart',
      'Shots',
      'Fan art'
    ]);
    expect(dd.slice(8)).toEqual(['2×', '10 min']);
    // What it offers: players and no manual, no achievements.
    expect(text('.dossier .mark.on')).toEqual(['1 player']);
    // The bays: the case, the footage (its screenshots until the video), the story.
    expect(text('.bay-tag')).toEqual(['Case', 'Footage', 'Story']);
    expect(text('.bay.story .text')).toEqual([
      'Strap into your F-14. Shoot everything. Land on the carrier.'
    ]);
  });

  it('shows this copy and the play record in turn', async () => {
    const { text } = await view([game(7, 'After Burner', BOXED)]);
    expect(text('.dossier .alternate .part.shown h3')).toEqual(['This copy']);
    vi.advanceTimersByTime(10_000);
    expect(text('.dossier .alternate .part.shown h3')).toEqual(['Play record']);
    vi.advanceTimersByTime(10_000);
    expect(text('.dossier .alternate .part.shown h3')).toEqual(['This copy']);
  });

  it("says the dump's version in words", () => {
    expect(versionText(null)).toBe('Original release');
    expect(versionText('Rev 1')).toBe('Revision 1');
    expect(versionText('Rev a')).toBe('Revision A');
    expect(versionText('v1.1')).toBe('Version 1.1');
    expect(versionText('Proto')).toBe('Prototype');
    expect(versionText('Beta 2')).toBe('Beta 2');
    expect(versionText('Unl')).toBe('Unlicensed');
    expect(versionText('Rev 1 · Unl')).toBe('Revision 1 · Unlicensed');
  });

  it('fades the new fan art in over the old, which goes once covered: never a dip to dark', async () => {
    const art = { ...BOXED, fanart: 'art' };
    const { v } = await view([game(1, 'After Burner', art), game(2, 'Doom', art)]);
    const imgs = () => [...v.root.querySelectorAll<HTMLImageElement>('.collector-backdrop img')];
    const settle = async () => {
      await Promise.resolve();
      await Promise.resolve();
    };
    imgs()[0]!.dispatchEvent(new Event('load'));
    await settle();
    expect(imgs()[0]!.classList.contains('waiting')).toBe(false);
    vi.advanceTimersByTime(2100);
    v.select(1);
    // Not until the selection pauses, ahead of the rest of the game.
    expect(imgs()).toHaveLength(1);
    vi.advanceTimersByTime(230);
    expect(v.root.classList.contains('arriving')).toBe(false);
    const [first, next] = imgs();
    expect(next?.classList.contains('waiting')).toBe(true);
    // The old one stays whole while the new one loads and fades in over it.
    expect(first?.classList.contains('leaving')).toBe(false);
    next!.dispatchEvent(new Event('load'));
    await settle();
    expect(next!.classList.contains('waiting')).toBe(false);
    expect(first!.classList.contains('leaving')).toBe(false);
    // Not on a clock alone: gone when the fade has really ended.
    vi.advanceTimersByTime(600);
    expect(imgs()).toEqual([first, next]);
    next!.dispatchEvent(new Event('transitionend'));
    expect(imgs()).toEqual([next]);
  });

  it('removes the old fan art in the end, even if the fade never reports', async () => {
    const art = { ...BOXED, fanart: 'art' };
    const { v } = await view([game(1, 'After Burner', art), game(2, 'Doom', art)]);
    const imgs = () => [...v.root.querySelectorAll<HTMLImageElement>('.collector-backdrop img')];
    const settle = async () => {
      await Promise.resolve();
      await Promise.resolve();
    };
    imgs()[0]!.dispatchEvent(new Event('load'));
    await settle();
    vi.advanceTimersByTime(2100);
    v.select(1);
    vi.advanceTimersByTime(230);
    const next = imgs()[1]!;
    next.dispatchEvent(new Event('load'));
    await settle();
    vi.advanceTimersByTime(900);
    expect(imgs()).toEqual([next]);
  });

  it('leaves the fan art alone when the game is shown again, and drops any passed by', async () => {
    const art = { ...BOXED, fanart: 'art' };
    const { v } = await view([
      game(1, 'After Burner', art),
      game(2, 'Doom', art),
      game(3, 'Quake', art)
    ]);
    const imgs = () => [...v.root.querySelectorAll<HTMLImageElement>('.collector-backdrop img')];
    expect(imgs()).toHaveLength(1);
    imgs()[0]!.dispatchEvent(new Event('load'));
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(2100);
    v.select(1);
    vi.advanceTimersByTime(230);
    expect(imgs()).toHaveLength(2);
    // Showing the same game once it has rested adds no second picture of it.
    vi.advanceTimersByTime(300);
    expect(imgs()).toHaveLength(2);
    // On to another before Doom's had loaded: Doom's is dropped.
    const doom = imgs()[1];
    v.select(2);
    vi.advanceTimersByTime(230);
    expect(imgs()).not.toContain(doom);
    expect(imgs()).toHaveLength(2);
  });

  it('runs at an even speed while the direction is held, and only then', async () => {
    const { v, text } = await view([
      game(1, 'After Burner', BOXED),
      game(2, 'Doom', BOXED),
      game(3, 'Quake', BOXED)
    ]);
    const held = () => v.root.querySelector('.track')!.classList.contains('held');
    vi.advanceTimersByTime(2100);
    v.select(1);
    expect(held()).toBe(false);
    expect(text('.slab-label .what strong')).toEqual(['Doom']);
    vi.advanceTimersByTime(80);
    v.select(2);
    expect(held()).toBe(true);
    // The label waits for the selection to rest.
    expect(text('.slab-label .what strong')).toEqual(['Doom']);
    vi.advanceTimersByTime(300);
    expect(text('.slab-label .what strong')).toEqual(['Quake']);
    v.select(1);
    expect(held()).toBe(false);
  });

  it('fades a new game in once the selection rests; the label alone follows each step', async () => {
    const { v, text } = await view([game(1, 'After Burner', BOXED), game(2, 'Doom', BOXED)]);
    vi.advanceTimersByTime(2100);
    expect(v.root.classList.contains('arriving')).toBe(false);
    v.select(1);
    expect(text('.slab-label .what strong')).toEqual(['Doom']);
    expect(v.root.classList.contains('arriving')).toBe(false);
    vi.advanceTimersByTime(310);
    expect(v.root.classList.contains('arriving')).toBe(true);
    vi.advanceTimersByTime(360);
    expect(v.root.classList.contains('arriving')).toBe(false);
  });

  it('stars a favourite in the label, and a reload of the same game moves nothing', async () => {
    const g = game(7, 'After Burner', BOXED);
    const { v } = await view([g]);
    const star = () => v.root.querySelector('.slab-label .fav')!;
    expect(star().classList.contains('on')).toBe(false);
    const box = v.root.querySelector('.cbox');
    // The shelf gone after the first show.
    vi.advanceTimersByTime(2100);
    expect(v.root.classList.contains('browsing')).toBe(false);
    // The list reloaded after the favourite was set: the same game, starred.
    const list = new LazyList<Game>(
      () => Promise.resolve({ items: [{ ...g, favorite: true }], total: 1 }),
      50
    );
    await list.start(0);
    v.show(list, 0);
    expect(star().classList.contains('on')).toBe(true);
    expect(v.root.classList.contains('browsing')).toBe(false);
    expect(v.root.querySelector('.cbox')).toBe(box);
  });

  it('draws the game again when a scrape changes it, without moving the shelf', async () => {
    const g = game(7, 'After Burner', BOXED);
    const { v } = await view([g]);
    vi.advanceTimersByTime(2100);
    const list = new LazyList<Game>(
      () => Promise.resolve({ items: [{ ...g, description: 'Freshly scraped.' }], total: 1 }),
      50
    );
    await list.start(0);
    v.show(list, 0);
    expect(v.root.textContent).toContain('Freshly scraped.');
    expect(v.root.classList.contains('browsing')).toBe(false);
  });

  it('cuts a story into pages that fit, between sentences', () => {
    const box = document.createElement('div');
    // 40 characters a page.
    Object.defineProperty(box, 'clientHeight', { value: 40 });
    Object.defineProperty(box, 'scrollHeight', { get: () => box.textContent?.length ?? 0 });
    const story = 'One short line. Another short line. A third sentence here. And a fourth.';
    expect(paginate(story, box)).toEqual([
      'One short line. Another short line.',
      'A third sentence here. And a fourth.'
    ]);
    // A sentence longer than a page, between words.
    expect(paginate('word '.repeat(12).trim(), box)).toEqual([
      'word word word word word word word word',
      'word word word word'
    ]);
  });

  it('with more games than it shows, puts the last ones before the first', async () => {
    const tall = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(320);
    const { v, text } = await view(
      Array.from({ length: 30 }, (_, i) => game(i + 1, `Game ${i + 1}`))
    );
    const top = (name: string) =>
      [...v.root.querySelectorAll<HTMLElement>('.spine-row')].find(
        (r) => r.querySelector('.title')?.textContent === name
      )?.style.top;
    expect(top('Game 30')).toBe('-3.2rem');
    expect(top('Game 2')).toBe('3.2rem');
    vi.advanceTimersByTime(500);
    v.select(29);
    expect(text('.spine-row.selected .title')).toEqual(['Game 30']);
    expect(top('Game 30')).toBe('-3.2rem'); // one step up, not all the way down the list
    tall.mockRestore();
  });

  it('keeps every game on the shelf, the selected one pulled out', async () => {
    const { v, text } = await view([
      game(1, 'After Burner', BOXED),
      game(2, 'Doom'),
      game(3, 'Kolibri')
    ]);
    expect(text('.spine-row .title')).toEqual(['After Burner', 'Doom', 'Kolibri']);
    // Its own spine picture where it has one; Doom and Kolibri have none.
    expect(v.root.querySelectorAll('.spine-row.pictured .spine-pic')).toHaveLength(1);
    vi.advanceTimersByTime(500);
    v.select(1);
    expect(text('.spine-row.selected .title')).toEqual(['Doom']);
    // The label at once, lit over the shelf; the rest of the showcase once the selection rests.
    expect(text('.slab-label .what strong')).toEqual(['Doom']);
    vi.advanceTimersByTime(200);
    expect(v.root.querySelector('.cbox .front img')?.getAttribute('src')).not.toBe(DEFAULT_FRONT);
    vi.advanceTimersByTime(200);
    // Nothing to make a cover from: the default box, and static where the footage would be.
    expect(v.root.querySelector('.cbox .front img')?.getAttribute('src')).toBe(DEFAULT_FRONT);
    expect(text('.no-signal span')).toEqual(['No signal']);
    expect(text('.dossier .mark')).toHaveLength(3);
  });
});

describe('the shelf and the video', () => {
  it('shows the shelf while moving, then the case; the video after a moment', async () => {
    const play = vi.fn((_game: Game, _area: ScreenArea) => Promise.resolve({ playing: true }));
    const stopVideo = vi.fn();
    const v = new CollectorView({ media, play, stopVideo });
    // jsdom lays nothing out: the footage screen stands in the middle of a 1000 × 500 screen.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 250,
      top: 100,
      width: 500,
      height: 300
    } as DOMRect);
    vi.stubGlobal('innerWidth', 1000);
    vi.stubGlobal('innerHeight', 500);
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
    vi.advanceTimersByTime(2100);
    expect(v.root.classList.contains('browsing')).toBe(false);
    vi.advanceTimersByTime(1500);
    expect(play).toHaveBeenCalledTimes(1);
    expect(play.mock.calls[0]?.[1]).toEqual({ left: 0.25, top: 0.2, width: 0.5, height: 0.6 });
    await Promise.resolve();
    await Promise.resolve();
    expect(v.root.classList.contains('video-on')).toBe(true);

    // Moving on: the video stops at once, the shelf comes back.
    v.select(1);
    expect(stopVideo).toHaveBeenCalled();
    expect(v.root.classList.contains('video-on')).toBe(false);
    expect(v.root.classList.contains('browsing')).toBe(true);
    v.leave();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});

describe('the box in its case', () => {
  it('stands as tall as the case allows, within bounds', () => {
    // A tall case, a narrow box: its height is what limits it.
    expect(boxHeight(40, 20, 0.72, 0.14)).toBeCloseTo(20 - 1.6);
    // A wide box (an N64's) in a narrow case: its width is.
    expect(boxHeight(30, 30, 1.4, 0.2)).toBeCloseTo(29 / 1.6);
    // Never taller than this, however big the case.
    expect(boxHeight(200, 200, 0.7, 0.1)).toBe(22);
    expect(boxHeight(5, 5, 1, 0.1)).toBe(12);
  });
});

describe('a spine’s colour', () => {
  it('is the hue of its box’s colour', () => {
    expect(hueOf('hsl(212 95% 70%)')).toBe(212);
    expect(hueOf('#fff')).toBeNull();
  });
});

describe('a preview video', () => {
  it('is stopped when it only starts after it stopped being wanted', async () => {
    const box = { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 };
    const rect = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockReturnValue(box as DOMRect);
    let started: (answer: { playing: boolean; sound: boolean }) => void = () => {};
    const play = vi.fn(
      () =>
        new Promise<{ playing: boolean; sound: boolean }>((resolve) => {
          started = resolve;
        })
    );
    const stopVideo = vi.fn();
    const g = game(7, 'After Burner', { ...BOXED, video: 'clip' });
    const { v } = await view([g], { play, stopVideo });
    vi.advanceTimersByTime(3000);
    expect(play).toHaveBeenCalledTimes(1);

    v.leave();
    expect(stopVideo).toHaveBeenCalledTimes(1);
    started({ playing: true, sound: true });
    await vi.waitFor(() => expect(stopVideo).toHaveBeenCalledTimes(2));
    rect.mockRestore();
  });
});

describe('coming back to the same game', () => {
  it('starts its animations and video again', async () => {
    const box = { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 };
    const rect = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockReturnValue(box as DOMRect);
    const play = vi.fn(() => Promise.resolve({ playing: false, sound: false }));
    const g = game(7, 'After Burner', { ...BOXED, video: 'clip' });
    const { v, list } = await view([g], { play });
    vi.advanceTimersByTime(3000);
    expect(play).toHaveBeenCalledTimes(1);

    v.leave();
    v.show(list, 0);
    vi.advanceTimersByTime(3000);
    expect(play).toHaveBeenCalledTimes(2);
    rect.mockRestore();
  });
});

describe('other versions of a game', () => {
  it('sums them up by place and kind', () => {
    const patched = (n: number) => ({
      path: `Game (USA) (T-En by Someone v${n}).md`,
      tags: ['USA', `T-En by Someone v${n}`]
    });
    expect(versionsText([])).toBe('');
    expect(versionsText([{ path: 'Game (Japan).md', tags: ['Japan'] }])).toBe('Japan');
    expect(versionsText([patched(1), patched(2)])).toBe('USA · English patch ×2');
  });

  it('stops at three kinds', () => {
    const others = ['Japan', 'USA', 'Europe', 'Brazil', 'Korea'].map((r) => ({
      path: `Game (${r}).md`,
      tags: [r]
    }));
    expect(versionsText(others)).toBe('Japan, USA, Europe +2');
  });
});

describe('collector words', () => {
  it('grades a rating', () => {
    expect(gradeOf(null)).toBeNull();
    expect(gradeOf(0.99)).toEqual({ score: '5.0', word: 'Gem mint' });
    expect(gradeOf(0.85)).toEqual({ score: '4.3', word: 'Near mint' });
    expect(gradeOf(0.3)).toEqual({ score: '1.5', word: 'Fair' });
  });

  it('gives each game the same serial and colour every time', () => {
    expect(serial(game(42, 'X'))).toBe('SEGA32X-000042');
    expect(hue('After Burner')).toBe(hue('After Burner'));
    expect(hue('After Burner')).not.toBe(hue('Doom'));
  });
});
