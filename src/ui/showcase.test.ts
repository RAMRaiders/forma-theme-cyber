// @vitest-environment jsdom
import type { Game } from '@ramraiders/forma-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type Kind, Showcase, type ShowGame, ago, date, names } from './showcase.js';

const game = (
  over: Partial<ShowGame> = {},
  media: Partial<Record<Kind, string>> = {}
): ShowGame => ({
  id: 1,
  system: 'snes',
  path: 'Super Metroid (USA).sfc',
  name: 'Super Metroid',
  description: 'Samus returns.\n\nTo Zebes.',
  developer: 'Nintendo R&D1',
  publisher: 'Nintendo',
  genre: 'Action',
  players: '1',
  releaseDate: '1994-03-19',
  rating: 0.95,
  favorite: true,
  hidden: false,
  playCount: 3,
  lastPlayed: '2026-11-01T12:00:00Z',
  gameTime: 5400,
  raGameId: 7,
  region: 'us',
  lang: 'en,fr',
  media,
  ...over
});

const EVERYTHING: Partial<Record<Kind, string>> = {
  fanart: 'f',
  thumbnail: 't',
  boxback: 'b',
  cartridge: 'c',
  image: 'i',
  titleshot: 's',
  video: 'v',
  wheel: 'w',
  manual: 'm'
};

function showcase(achievements = vi.fn(() => Promise.resolve({ earned: 12, total: 40 }))) {
  const media = (g: Game, kind: Kind, width?: number) => {
    const has = (g.media as Partial<Record<string, string>>)[kind];
    return has ? `forma://media/${g.id}/${kind}${width ? `?w=${width}` : ''}` : null;
  };
  const s = new Showcase({ media, achievements });
  s.previews = false;
  document.body.replaceChildren(s.stage, s.root);
  const text = (sel: string) => [...s.root.querySelectorAll(sel)].map((n) => n.textContent ?? '');
  const srcs = (sel: string) =>
    [...document.querySelectorAll<HTMLImageElement>(sel)].map((n) => n.getAttribute('src'));
  return { s, text, srcs, achievements };
}

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.dataset.motion = 'on';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the game showcase', () => {
  it('shows a fully scraped game: logo, rating, box, cartridge, screens, facts, story', async () => {
    const { s, text, srcs } = showcase();
    s.show(game({}, EVERYTHING));

    expect(text('h2')).toEqual(['★ Super Metroid']);
    expect(srcs('.logo')).toEqual(['forma://media/1/wheel?w=640']);
    expect(text('.badge')).toEqual(['★ Favourite', '1994', 'Action', '1 player', 'Manual']);
    expect(text('.score')).toEqual(['9.5']);
    expect(text('.facts dt')).toEqual([
      'Released',
      'Developer',
      'Publisher',
      'Region',
      'Languages'
    ]);
    expect(text('.facts dd')).toContain('19 Mar 1994');
    expect(text('.facts dd')).toContain('USA');
    expect(text('.facts dd')).toContain('English, French');
    expect(text('.stat span')).toEqual(['Played', 'Time played', 'Last played']);
    expect(text('.story h3')).toEqual(['About']);
    expect(text('.story p')).toEqual(['Samus returns.', 'To Zebes.']);

    // At once: the box front and the first screenshot; the rest a moment later.
    expect(srcs('.case .front')).toEqual(['forma://media/1/thumbnail?w=480']);
    expect(srcs('.frame .still')).toEqual(['forma://media/1/image?w=960']);
    expect(srcs('.cartridge')).toEqual([]);
    await vi.advanceTimersByTimeAsync(500);
    expect(srcs('.case .back')).toEqual(['forma://media/1/boxback?w=480']);
    expect(srcs('.cartridge')).toEqual(['forma://media/1/cartridge?w=360']);
    expect(text('.thumb .label')).toEqual(['In game', 'Title', '▶ Video']);
    expect(text('.achievements span')).toEqual(['🏆 12 / 40 achievements']);

    // The box turns round, and back.
    const box = s.root.querySelector('.box3d')!;
    expect(box.classList.contains('flipped')).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(box.classList.contains('flipped')).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(box.classList.contains('flipped')).toBe(false);
  });

  it('puts the fan art behind the screen, and a soft screenshot when there is none', () => {
    const { s } = showcase();
    s.show(game({}, EVERYTHING));
    const first = s.stage.querySelector('.layer')!;
    expect(first.classList.contains('waiting')).toBe(true);
    first.querySelector('img')!.dispatchEvent(new Event('load'));
    expect(first.classList.contains('waiting')).toBe(false);
    expect(first.querySelector('img')?.getAttribute('src')).toBe('forma://media/1/fanart?w=1280');

    s.show(game({ id: 2 }, { image: 'i' }));
    const next = [...s.stage.querySelectorAll('.layer')].at(-1)!;
    next.querySelector('img')!.dispatchEvent(new Event('load'));
    expect(next.classList.contains('soft')).toBe(true);
    expect(next.querySelector('img')?.getAttribute('src')).toBe('forma://media/2/image?w=320');
    expect(first.classList.contains('leaving')).toBe(true);
  });

  it('leaves out what a game lacks', async () => {
    const { s, text, achievements } = showcase();
    s.show(
      game(
        {
          name: 'Pong',
          system: 'mame',
          favorite: false,
          rating: null,
          players: null,
          region: null,
          lang: undefined,
          playCount: 0,
          gameTime: 0,
          lastPlayed: null,
          raGameId: null,
          description: null,
          developer: null
        },
        { image: 'i' }
      )
    );
    await vi.advanceTimersByTimeAsync(2000);
    expect(s.root.classList.contains('no-box')).toBe(true);
    expect(s.root.querySelector('.collector, .logo, .rating, .achievements')).toBeNull();
    expect(text('h2')).toEqual(['Pong']);
    expect(text('.facts dt')).toEqual(['Released', 'Publisher']);
    expect(text('.stat span')).toEqual(['Never played']);
    expect(text('.story h3')).toEqual(['History']);
    expect(text('.story p')[0]).toMatch(/No description yet/);
    expect(text('.thumb .label')).toEqual(['In game']);
    expect(achievements).not.toHaveBeenCalled();
  });

  it('keeps still with animations off', async () => {
    document.documentElement.dataset.motion = 'off';
    const { s } = showcase();
    s.show(game({}, EVERYTHING));
    await vi.advanceTimersByTimeAsync(12_000);
    expect(s.root.querySelector('.box3d')!.classList.contains('flipped')).toBe(false);
  });

  it('asks for achievements once per game', async () => {
    const { s, achievements } = showcase();
    s.show(game({}, EVERYTHING));
    s.show(game({ favorite: false }, EVERYTHING));
    await vi.advanceTimersByTimeAsync(500);
    expect(achievements).toHaveBeenCalledTimes(1);
  });
});

describe('showcase text', () => {
  it('writes dates, regions, languages and how long ago', () => {
    expect(date('1994-03-19')).toBe('19 Mar 1994');
    expect(date('1994-01-01')).toBe('1994');
    expect(date('1994-06')).toBe('Jun 1994');
    expect(date('1994')).toBe('1994');
    expect(names('us,eu', { us: 'USA', eu: 'Europe' })).toBe('USA, Europe');
    expect(names('xx', {})).toBe('XX');
    const now = Date.parse('2026-11-05T12:00:00Z');
    expect(ago('2026-11-05T08:00:00Z', now)).toBe('Today');
    expect(ago('2026-11-04T08:00:00Z', now)).toBe('Yesterday');
    expect(ago('2026-10-26T12:00:00Z', now)).toBe('10 days ago');
    expect(ago('2026-05-05T12:00:00Z', now)).toBe('6 months ago');
    expect(ago('2023-11-05T12:00:00Z', now)).toBe('3 years ago');
  });
});
