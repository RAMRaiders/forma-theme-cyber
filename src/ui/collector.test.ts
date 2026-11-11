// @vitest-environment jsdom
import { DEFAULT_FRONT, hue } from './cover.js';
import type { Game } from '@ramraiders/forma-sdk';
import type { CollectorOptions } from './collector.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LazyList } from '../logic/pager.js';
import {
  boxHeight,
  CollectorView,
  dumpText,
  gradeOf,
  hueOf,
  paginate,
  releaseOf,
  serial,
  shelfShape,
  tvEra,
  type ScreenArea,
  versionText
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

/** A game whose file names its languages: it has a "this copy". */

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
    expect(seal?.getAttribute('aria-label')).toBe('Age rating ESRB M · PEGI 18');
    // The badge says it: no row for it under Release.
    expect(text('.dossier .specs dt')).not.toContain('Age rating');
    const esrb = await view([{ ...game(9, 'After Burner'), ageRating: 'ESRB:E' }]);
    expect(esrb.text('.dossier .pegi strong')).toEqual(['3PEGI']);
    expect(esrb.v.root.querySelector('.dossier .pegi')?.getAttribute('aria-label')).toBe(
      'Age rating PEGI 3, from ESRB E'
    );
    const unrated = await view([game(10, 'Kolibri')]);
    expect(unrated.text('.dossier .mark.rating.off')).toEqual(['No rating']);
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

  it('rests behind the shelf while it shows, and turns again once it is gone', async () => {
    const { v } = await view([game(7, 'After Burner', BOXED), game(8, 'Space Harrier', BOXED)]);
    const box = v.root.querySelector<HTMLElement>('.cbox')!;
    vi.advanceTimersByTime(2500);
    // A step and back just before its first turn: the shelf is up over the same game.
    v.select(1);
    v.select(0);
    expect(v.root.classList.contains('browsing')).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(box.dataset.pose).toBe('front');
    // The shelf gone, the box turns again.
    vi.advanceTimersByTime(4500);
    expect(v.root.classList.contains('browsing')).toBe(false);
    expect(box.dataset.pose).toBe('spine');
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
    expect(text('.dossier .part h3')).toEqual(['Release', 'Play record']);
    expect(text('.dossier .specs dt')).toEqual([
      'Released',
      'Developer',
      'Publisher',
      'Genre',
      'Region',
      'Release',
      'Version',
      'Languages',
      'Played',
      'Time'
    ]);
    const dd = text('.dossier .specs dd');
    expect(dd[0]).toMatch(/^13 Jan 1995 · \d+ years ago$/);
    expect(dd[1]).toBe('Rutubo Games');
    // From the ROM's name, before the gamelist's: flags alone, their names for screen readers.
    const flags = (n: number) =>
      [...v.root.querySelectorAll('.dossier .specs .flags')][n]!.querySelectorAll('.chip');
    // Each flag with its name on screen.
    expect([...flags(0)].map((c) => c.textContent)).toEqual(['USA', 'Japan']);
    expect([...flags(1)].map((c) => c.textContent)).toEqual(['English', 'Japanese']);
    expect(v.root.querySelectorAll('.dossier .specs .flags .flag')).toHaveLength(4);
    expect(dd.slice(5, 7)).toEqual(['Original', 'Revision 1']);
    // Its pictures are not listed: they are on the screen.
    expect(v.root.querySelector('.dossier .archive')).toBeNull();
    expect(dd.slice(8)).toEqual(['2×', '10 min']);
    // What it offers: players; no manual, achievements nor rating: their tiles there, faded.
    expect(text('.dossier .mark.on')).toEqual(['1 player']);
    expect(text('.dossier .mark.off')).toEqual(['No manual', '– / –', 'No rating']);
    expect(v.root.querySelector('.dossier .achievements')).toBeNull();
    // The bays: the case, the footage (its screenshots until the video), the story.
    expect(text('.bay-tag')).toEqual(['Case', 'Footage', 'Story']);
    expect(text('.bay.story .text')).toEqual([
      'Strap into your F-14. Shoot everything. Land on the carrier.'
    ]);
  });

  it('puts the languages by the version and status, a translation’s language by it', async () => {
    const { v, text } = await view([
      { ...game(7, 'After Burner', BOXED), path: 'After Burner (Japan) (T-En by Someone).md' }
    ]);
    const dt = text('.dossier .specs dt');
    expect(dt.slice(dt.indexOf('Status'), dt.indexOf('Status') + 2)).toEqual([
      'Status',
      'Languages'
    ]);
    expect(v.root.querySelector('.dossier .specs .flags')).not.toBeNull();
    // A manual: a mark by the players, not a row.
    expect(text('.dossier .part h3')).toEqual(['Release', 'Play record']);
  });

  it('says whether the file is a catalogued dump, once Forma has checked it', async () => {
    const { v, text } = await view([
      {
        ...game(7, 'After Burner', BOXED),
        dump: {
          status: 'verified',
          catalogue: 'no-intro',
          name: 'After Burner (USA)',
          region: 'USA'
        }
      }
    ]);
    const dt = text('.dossier .specs dt');
    expect(text('.dossier .specs dd')[dt.indexOf('Dump')]).toBe('No-IntroVerified');
    expect(text('.dossier .dump .seal')).toEqual(['No-Intro']);
    expect(v.root.querySelector('.dossier .dump')?.getAttribute('aria-label')).toBe(
      'Verified by No-Intro'
    );
    expect(text('.dossier .dump .badge .verdict')).toEqual(['Verified']);
    expect(dumpText(null)).toBeNull();
    // A file more than one catalogue lists: a badge each, in a row.
    const both = dumpText([
      { status: 'verified', catalogue: 'no-intro', name: 'Sonic (World)', region: null },
      { status: 'crcOnly', catalogue: 'redump', name: 'Sonic (Japan)', region: null }
    ]);
    expect([...both!.querySelectorAll('.badge')].map((b) => b.textContent)).toEqual([
      'No-IntroVerified',
      'RedumpCRC32 match'
    ]);
    // Just the labels: not the catalogue's name for the dump.
    expect(both!.querySelector('.listed')).toBeNull();
    expect(
      dumpText({ status: 'notCatalogued', catalogue: null, name: null, region: null })?.textContent
    ).toBe('Not catalogued');
  });

  it('takes the release kind and its number apart', () => {
    expect(releaseOf(null)).toEqual({ kind: null, number: null, status: null });
    expect(releaseOf('Proto', 'Unl · Hack')).toEqual({
      kind: 'Prototype · Unlicensed',
      number: null,
      status: 'Hack'
    });
    expect(releaseOf('Proto 1')).toEqual({ kind: 'Prototype', number: '1', status: null });
    expect(releaseOf('Beta')).toEqual({ kind: 'Beta', number: null, status: null });
    expect(releaseOf('Demo · Rev 1')).toEqual({ kind: 'Demo', number: 'Revision 1', status: null });
    expect(releaseOf('v1.1')).toEqual({ kind: null, number: '1.1', status: null });
    expect(releaseOf('Kiosk')).toEqual({ kind: 'Kiosk demo', number: null, status: null });
    expect(releaseOf('Alt 2')).toEqual({ kind: null, number: 'Alternate 2', status: null });
  });

  it("says the dump's version in words", () => {
    expect(versionText(null)).toBe('Original release');
    expect(versionText('Rev 1')).toBe('Revision 1');
    expect(versionText('Rev a')).toBe('Revision A');
    expect(versionText('Proto 2')).toBe('Prototype 2');
    expect(versionText('Kiosk')).toBe('Kiosk demo');
    expect(versionText('v1.1')).toBe('Version 1.1');
    expect(versionText('Proto')).toBe('Prototype');
    expect(versionText('Beta 2')).toBe('Beta 2');
    expect(versionText('Unl')).toBe('Unlicensed');
    expect(versionText('Aftermarket · Unl')).toBe('Homebrew · Unlicensed');
    expect(versionText('Aftermarket · Homebrew')).toBe('Homebrew');
  });

  it('shows achievements with a drawn trophy, never an emoji the Pi has no font for', async () => {
    const { v } = await view([{ ...game(7, 'After Burner', BOXED), raGameId: 9 }], {
      achievements: () => Promise.resolve({ earned: 0, total: 30 } as never)
    });
    await vi.waitFor(() =>
      expect(v.root.querySelector('.dossier .mark.cheevos.on')).not.toBeNull()
    );
    // A tile of its own, before the age rating's: the count, no bar.
    const tile = v.root.querySelector('.dossier .mark.cheevos')!;
    expect(tile.querySelector('svg')).not.toBeNull();
    expect(tile.textContent).toBe('0 / 30');
    expect(tile.nextElementSibling?.matches('.pegi, .rating')).toBe(true);
    expect(v.root.querySelector('.dossier .bar')).toBeNull();
  });

  it('keeps what kind of copy it is apart from its version', async () => {
    const rows = async (path: string) => {
      const { text } = await view([{ ...game(7, 'Tanglewood', BOXED), path }]);
      const labels = text('.dossier .specs dt');
      const values = text('.dossier .specs dd');
      return Object.fromEntries(labels.map((label, i) => [label, values[i]]));
    };
    const both = await rows('Tanglewood (World) (v1.1) (Aftermarket) (Unl).md');
    // Homebrew and unlicensed are how it was released.
    expect(both['Release']).toBe('Homebrew · Unlicensed');
    expect(both['Version']).toBe('1.1');
    expect(both['Status']).toBeUndefined();
    const noVersion = await rows('Tanglewood (World) (Aftermarket) (Unl).md');
    expect(noVersion['Release']).toBe('Homebrew · Unlicensed');
    expect(noVersion['Version']).toBeUndefined();
    expect(noVersion['Status']).toBeUndefined();
    // A hack is no release of its own: its status says.
    const hack = await rows('Tanglewood (USA) [h1].md');
    expect([hack['Release'], hack['Status']]).toEqual([undefined, 'Hack']);
    const plain = await rows('Tanglewood (USA).md');
    expect(plain['Release']).toBe('Original');
    expect(plain['Version']).toBeUndefined();
    const proto = await rows('Tanglewood (USA) (Proto 2).md');
    expect([proto['Release'], proto['Version']]).toEqual(['Prototype', '2']);
    expect(plain['Status']).toBeUndefined();
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
    vi.advanceTimersByTime(750);
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

  it('shows the games run past every half second while the direction is held', async () => {
    const games = Array.from({ length: 12 }, (_, i) => game(i + 1, `Game ${i + 1}`, BOXED));
    const { v, text } = await view(games);
    vi.advanceTimersByTime(2100);
    v.select(1);
    for (let i = 2; i <= 8; i++) {
      vi.advanceTimersByTime(100);
      v.select(i);
    }
    // 700 ms held: the label has followed once on the way, not waited for the stop.
    expect(text('.slab-label .what strong')).not.toEqual(['Game 2']);
  });

  it('fades a new game in once the selection rests; the label alone follows each step', async () => {
    const { v, text } = await view([game(1, 'After Burner', BOXED), game(2, 'Doom', BOXED)]);
    vi.advanceTimersByTime(2100);
    expect(v.root.classList.contains('arriving')).toBe(false);
    v.select(1);
    expect(text('.slab-label .what strong')).toEqual(['Doom']);
    expect(v.root.classList.contains('arriving')).toBe(false);
    // Rested, and its pictures loaded: then it replaces the last.
    await vi.advanceTimersByTimeAsync(760);
    expect(v.root.classList.contains('arriving')).toBe(true);
    vi.advanceTimersByTime(360);
    expect(v.root.classList.contains('arriving')).toBe(false);
  });

  it("keeps the game shown until the next one's pictures have loaded, then replaces it", async () => {
    const { v } = await view([game(1, 'After Burner', BOXED), game(2, 'Doom', BOXED)]);
    vi.advanceTimersByTime(2100);
    const waiting: (() => void)[] = [];
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: () => new Promise<void>((done) => waiting.push(done))
    });
    try {
      v.select(1);
      await vi.advanceTimersByTimeAsync(800);
      // Doom's pictures still loading: After Burner's case still there, nothing emptied.
      expect(v.root.querySelector('.cbox .front img')?.getAttribute('src')).toContain('media/1/');
      waiting.forEach((done) => done());
      await vi.advanceTimersByTimeAsync(0);
      expect(v.root.querySelector('.cbox .front img')?.getAttribute('src')).toContain('media/2/');
    } finally {
      delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
    }
  });

  it("frames the selected game's picture left of the shelf while it shows", async () => {
    const { v } = await view([game(1, 'After Burner', BOXED), game(2, 'Doom', BOXED)]);
    vi.advanceTimersByTime(2100);
    v.select(1);
    const pic = v.root.querySelector('.nav-pic img');
    // Its picture (the box, where it has nothing else), coming in once decoded.
    expect(pic?.getAttribute('src')).toContain('media/2/');
    expect(v.root.classList.contains('browsing')).toBe(true);
    vi.advanceTimersByTime(1500);
    // The shelf gone, its picture goes with it (style.css: shown only while browsing).
    expect(v.root.classList.contains('browsing')).toBe(false);
  });

  it('keeps the dossier lit and following the selection while the shelf shows', async () => {
    const { v } = await view([game(1, 'After Burner', BOXED), game(2, 'Doom', BOXED)]);
    vi.advanceTimersByTime(2100);
    v.select(1);
    // Just after the shelf has faded in, well before the selection rests.
    vi.advanceTimersByTime(150);
    expect(v.root.querySelector('.dossier')?.textContent).toContain('Doom');
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

  it("draws an Atari's spines a little bigger, rows and all", async () => {
    const { v } = await view([
      { ...game(1, 'Asteroids'), system: 'atari7800' },
      { ...game(2, 'Xevious'), system: 'atari7800' }
    ]);
    const shelf = v.root.querySelector<HTMLElement>('.shelf')!;
    expect(shelf.style.getPropertyValue('--spine-h')).toBe('3.19rem');
    expect(shelf.style.getPropertyValue('--spine-len')).toBe('24.64rem');
    const rows = [...v.root.querySelectorAll<HTMLElement>('.spine-row')].map((r) => r.style.top);
    expect(rows).toContain('3.584rem');
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

  it('puts a game’s marquee on its spine where it has no spine picture', async () => {
    const { v } = await view([
      game(1, 'After Burner', BOXED),
      game(2, 'Doom', { marquee: 'banner' }),
      game(3, 'Kolibri')
    ]);
    const row = (name: string) =>
      [...v.root.querySelectorAll<HTMLElement>('.spine-row')].find(
        (r) => r.querySelector('.title')?.textContent === name
      )!;
    expect(row('After Burner').querySelector('.spine-mark')).toBeNull();
    expect(row('Doom').classList.contains('marked')).toBe(true);
    expect(row('Doom').querySelector('.spine-mark')?.getAttribute('src')).toContain('/2/marquee');
    expect(row('Kolibri').classList.contains('marked')).toBe(false);
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
    vi.advanceTimersByTime(600);
    expect(v.root.querySelector('.cbox .front img')?.getAttribute('src')).not.toBe(DEFAULT_FRONT);
    await vi.advanceTimersByTimeAsync(200);
    // Nothing to make a cover from: the default box, and static where the footage would be.
    expect(v.root.querySelector('.cbox .front img')?.getAttribute('src')).toBe(DEFAULT_FRONT);
    expect(text('.no-signal span')).toEqual(['No signal']);
    // All four tiles, whatever it has: what it lacks faded.
    expect(text('.dossier .mark')).toHaveLength(4);
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

describe('the shelf in the shape of its spines', () => {
  it('sizes a system’s shelf once, when its list opens, and never while it is browsed', async () => {
    // Every spine picture a PC Engine HuCard's shape: 18.4 times as tall as wide.
    const loaded: HTMLImageElement[] = [];
    const Real = globalThis.Image;
    globalThis.Image = class extends Real {
      constructor() {
        super();
        loaded.push(this);
        Object.defineProperty(this, 'naturalWidth', { value: 10 });
        Object.defineProperty(this, 'naturalHeight', { value: 184 });
        queueMicrotask(() => {
          this.onload?.(new Event('load'));
        });
      }
    };
    try {
      const games = Array.from({ length: 30 }, (_, i): Game => ({
        ...game(i + 1, `Game ${i + 1}`, i % 3 ? {} : { boxside: 's' }),
        system: 'pcengine'
      }));
      // A wide screen: room for long spines.
      const rect = vi
        .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
        .mockReturnValue({ left: 0, top: 0, width: 1600, height: 900 } as DOMRect);
      const { v } = await view(games);
      const shelf = v.root.querySelector<HTMLElement>('.shelf')!;
      expect(shelf.style.getPropertyValue('--spine-len')).toBe('22rem');
      for (let i = 0; i < 5; i++) await Promise.resolve();
      rect.mockRestore();
      expect(shelf.style.getPropertyValue('--spine-len')).toBe('49.29rem');
      const sized = shelf.style.getPropertyValue('--spine-len');
      expect(loaded.length).toBeLessThanOrEqual(8);
      // Browsing loads no more pictures to measure, and the length stays.
      for (let i = 1; i < 20; i++) v.select(i);
      await Promise.resolve();
      expect(shelf.style.getPropertyValue('--spine-len')).toBe(sized);
      expect(loaded.length).toBeLessThanOrEqual(8);
    } finally {
      globalThis.Image = Real;
    }
  });

  it('loads a long list’s pages ahead of the shelf', async () => {
    const asked: number[] = [];
    const games = Array.from({ length: 1000 }, (_, i) => game(i + 1, `Game ${i + 1}`));
    const v = new CollectorView({ media, system: () => null });
    document.body.replaceChildren(v.root);
    const list = new LazyList<Game>((offset, limit) => {
      asked.push(offset);
      return Promise.resolve({ items: games.slice(offset, offset + limit), total: games.length });
    }, 50);
    await list.start(0);
    v.show(list, 0);
    v.select(5);
    // More than the rows drawn ask for: the next page already on its way.
    expect(Math.max(...asked.filter((o) => o < 500))).toBeGreaterThanOrEqual(50);
  });

  it('keeps a Mega Drive spine as it was, makes a PC Engine one longer, as far as there is room', () => {
    expect(shelfShape(7.1, 100)).toBe(22);
    expect(shelfShape(18.4, 100)).toBe(49.29);
    expect(shelfShape(18.4, 40)).toBe(36);
    // Not measured yet, or a narrow screen: never shorter than the usual.
    expect(shelfShape(18.4, 0)).toBe(22);
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

describe('tvEra', () => {
  it("picks a console's TV from the year it came out, a plain frame for anything else", () => {
    expect(tvEra('consoles', 1977)).toBe('wood');
    expect(tvEra('consoles', 1986)).toBe('beige');
    expect(tvEra('consoles', 1994)).toBe('black');
    expect(tvEra('consoles', 2001)).toBe('flat');
    expect(tvEra('consoles', null)).toBe('plain');
    expect(tvEra('handhelds', 1989)).toBe('plain');
  });
});
