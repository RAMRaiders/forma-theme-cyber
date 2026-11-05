// @vitest-environment jsdom
import type { Game } from '@ramraiders/forma-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACT_THREE_MS,
  ACT_TWO_MS,
  type Kind,
  Stage,
  type ShowGame,
  ago,
  captions,
  date,
  names,
  vivid
} from './stage.js';

const game = (
  over: Partial<ShowGame> = {},
  media: Partial<Record<Kind, string>> = {}
): ShowGame => ({
  id: 1,
  system: 'snes',
  path: 'Super Metroid (USA).sfc',
  name: 'Super Metroid',
  description: 'Samus returns to Zebes. The Metroid is stolen! She must get it back.',
  developer: 'Nintendo R&D1',
  publisher: 'Nintendo',
  genre: 'Action',
  players: '1',
  releaseDate: '1994-03-19',
  rating: 0.95,
  favorite: true,
  hidden: false,
  playCount: 3,
  lastPlayed: null,
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
  wheel: 'w',
  manual: 'm'
};

function stage(achievements = vi.fn(() => Promise.resolve({ earned: 12, total: 40 }))) {
  const media = (g: Game, kind: Kind, width?: number) => {
    const has = (g.media as Partial<Record<string, string>>)[kind];
    return has ? `forma://media/${g.id}/${kind}${width ? `?w=${width}` : ''}` : null;
  };
  const accent = vi.fn(() => Promise.resolve('hsl(200 90% 62%)'));
  const s = new Stage({ media, achievements, accent });
  s.previews = false;
  document.body.replaceChildren(s.backdrop, s.root);
  const text = (sel: string) => [...s.root.querySelectorAll(sel)].map((n) => n.textContent ?? '');
  const srcs = (sel: string) =>
    [...document.querySelectorAll<HTMLImageElement>(sel)].map((n) => n.getAttribute('src'));
  return { s, text, srcs, achievements, accent };
}

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.dataset.motion = 'on';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the game stage', () => {
  it('plays a fully scraped game out in three acts', async () => {
    const { s, text, srcs } = stage();
    s.show(game({}, EVERYTHING));

    // Act 1: the title over the fan art.
    expect(s.act).toBe(1);
    expect(srcs('.logo')).toEqual(['forma://media/1/wheel?w=720']);
    expect(text('h2')).toEqual(['Super Metroid']);
    expect(text('.score')).toEqual(['9.5']);
    // A favourite's mark comes first.
    expect(text('.tag')).toEqual(['★ Favourite', '1994', 'Action', '1 player']);
    expect(srcs('.stage-backdrop .fanart img')).toEqual(['forma://media/1/fanart?w=1280']);

    // Act 2: the collection and the facts.
    await vi.advanceTimersByTimeAsync(ACT_TWO_MS);
    expect(s.act).toBe(2);
    expect(srcs('.case .front')).toEqual(['forma://media/1/thumbnail?w=520']);
    expect(srcs('.case .back')).toEqual(['forma://media/1/boxback?w=520']);
    expect(srcs('.cartridge')).toEqual(['forma://media/1/cartridge?w=360']);
    expect(srcs('.shot img')).toEqual([
      'forma://media/1/image?w=480',
      'forma://media/1/titleshot?w=480'
    ]);
    expect(text('.facts dt')).toEqual([
      'Released',
      'Developer',
      'Publisher',
      'Region',
      'Languages',
      'Played',
      'Manual'
    ]);
    expect(text('.facts dd')).toContain('English, French');
    expect(text('.facts dd')).toContain('3× · 1 h 30 min');
    expect(text('.achievements span')).toEqual(['🏆 12 of 40 achievements']);

    // The box turns round once it is in.
    const box = s.root.querySelector('.box3d')!;
    await vi.advanceTimersByTimeAsync(1800);
    expect(box.classList.contains('flipped')).toBe(true);

    // Act 3: the screenshots behind, the story as captions.
    await vi.advanceTimersByTimeAsync(ACT_THREE_MS);
    expect(s.act).toBe(3);
    expect(srcs('.stage-backdrop .still img')).toContain('forma://media/1/image?w=960');
    expect(text('.captions .label')).toEqual(['Story']);
    expect(text('.captions .line')[0]).toBe(
      'Samus returns to Zebes. The Metroid is stolen! She must get it back.'
    );
  });

  it('has Forma play the video under a see-through page, and stop it', async () => {
    const media = (g: Game, kind: Kind) =>
      (g.media as Partial<Record<string, string>>)[kind] ? `forma://media/${g.id}/${kind}` : null;
    const play = vi.fn(() => Promise.resolve({ playing: true }));
    const stopVideo = vi.fn();
    const s = new Stage({ media, play, stopVideo });
    document.body.replaceChildren(s.backdrop, s.root);

    s.show(game({}, { video: 'v', fanart: 'f' }));
    // Not while act 2 moves in.
    await vi.advanceTimersByTimeAsync(ACT_TWO_MS);
    expect(play).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(ACT_THREE_MS - ACT_TWO_MS - 1);
    expect(play).not.toHaveBeenCalled();
    expect(s.act).toBe(2);
    // Act 3 comes with the video, once it shows.
    await vi.advanceTimersByTimeAsync(2);
    expect(play).toHaveBeenCalledTimes(1);
    expect(s.act).toBe(3);
    expect(s.backdrop.classList.contains('through')).toBe(true);
    expect(document.documentElement.classList.contains('video-through')).toBe(true);
    expect(document.querySelector('.still')).toBeNull();

    s.clear();
    expect(stopVideo).toHaveBeenCalledTimes(1);
    expect(document.documentElement.classList.contains('video-through')).toBe(false);
  });

  it('shows the screenshots when Forma cannot play the video', async () => {
    const media = (g: Game, kind: Kind) =>
      (g.media as Partial<Record<string, string>>)[kind] ? `forma://media/${g.id}/${kind}` : null;
    const s = new Stage({ media, play: () => Promise.resolve({ playing: false }) });
    document.body.replaceChildren(s.backdrop, s.root);
    s.show(game({}, { video: 'v', image: 'i' }));
    await vi.advanceTimersByTimeAsync(ACT_TWO_MS + ACT_THREE_MS);
    expect(s.act).toBe(3);
    expect(document.querySelector('.stage-backdrop .still')).not.toBeNull();
    expect(s.backdrop.classList.contains('through')).toBe(false);
  });

  it('takes its colour from the game', async () => {
    const { s, accent } = stage();
    s.show(game({}, EVERYTHING));
    await vi.advanceTimersByTimeAsync(0);
    expect(accent).toHaveBeenCalledWith('forma://media/1/thumbnail?w=64');
    expect(s.root.style.getPropertyValue('--game')).toBe('hsl(200 90% 62%)');
    expect(s.backdrop.style.getPropertyValue('--game')).toBe('hsl(200 90% 62%)');
  });

  it('starts again from act 1 on another game, but not on a favourite toggled', async () => {
    const { s, text } = stage();
    s.show(game({}, EVERYTHING));
    await vi.advanceTimersByTimeAsync(ACT_TWO_MS);
    s.show(game({ favorite: false }, EVERYTHING));
    expect(s.act).toBe(2);
    expect(text('h2')).toEqual(['Super Metroid']);
    s.show(game({ id: 2 }, EVERYTHING));
    expect(s.act).toBe(1);
  });

  it('leaves out what a game lacks', async () => {
    const { s, text, achievements } = stage();
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
          raGameId: null,
          description: 'An arcade classic.',
          developer: null
        },
        { image: 'i' }
      )
    );
    await vi.advanceTimersByTimeAsync(ACT_THREE_MS);
    expect(s.root.querySelector('.logo, .score, .case, .cartridge, .achievements')).toBeNull();
    expect(srcs()).toEqual(['forma://media/1/image?w=480']);
    expect(text('.facts dt')).toEqual(['Released', 'Publisher', 'Played']);
    expect(text('.facts dd')).toContain('Never yet');
    expect(text('.captions .label')).toEqual(['History']);
    expect(achievements).not.toHaveBeenCalled();

    s.show(game({ id: 3, description: null }, {}));
    expect(s.root.classList.contains('no-box')).toBe(true);
    expect(s.root.querySelector<HTMLElement>('.captions')!.hidden).toBe(true);

    function srcs() {
      return [...s.root.querySelectorAll('.shot img')].map((n) => n.getAttribute('src'));
    }
  });

  it('stays on act 2, still, with animations off', async () => {
    document.documentElement.dataset.motion = 'off';
    const { s } = stage();
    s.show(game({}, EVERYTHING));
    expect(s.act).toBe(2);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(s.act).toBe(2);
    expect(s.root.querySelector('.box3d')!.classList.contains('flipped')).toBe(false);
  });

  it('asks for achievements and colour once per game', async () => {
    const { s, achievements, accent } = stage();
    s.show(game({}, EVERYTHING));
    s.clear();
    s.show(game({}, EVERYTHING));
    await vi.advanceTimersByTimeAsync(ACT_TWO_MS);
    expect(achievements).toHaveBeenCalledTimes(1);
    expect(accent).toHaveBeenCalledTimes(1);
  });
});

describe('stage text', () => {
  it('writes captions, dates, regions, languages and how long ago', () => {
    expect(captions('One. Two!  Three?')).toEqual(['One. Two! Three?']);
    const long = 'A'.repeat(120);
    expect(captions(`${long}. ${long}.`)).toEqual([`${long}.`, `${long}.`]);
    expect(captions('')).toEqual([]);
    expect(date('1994-03-19')).toBe('19 Mar 1994');
    expect(date('1994-01-01')).toBe('1994');
    expect(date('1994-06')).toBe('Jun 1994');
    expect(names('us,eu', { us: 'USA', eu: 'Europe' })).toBe('USA, Europe');
    expect(names('xx', {})).toBe('XX');
    const now = Date.parse('2026-11-05T12:00:00Z');
    expect(ago('2026-11-05T08:00:00Z', now)).toBe('Today');
    expect(ago('2026-11-04T08:00:00Z', now)).toBe('Yesterday');
    expect(ago('2026-10-26T12:00:00Z', now)).toBe('10 days ago');
    expect(ago('2026-05-05T12:00:00Z', now)).toBe('6 months ago');
    expect(ago('2023-11-05T12:00:00Z', now)).toBe('3 years ago');
  });

  it('finds the colour of a picture from its vivid pixels', () => {
    const red = [230, 30, 40, 255];
    const grey = [120, 120, 120, 255];
    const pixels = [...red, ...red, ...grey, ...grey];
    for (let n = 0; n < 40; n++) pixels.push(...red);
    expect(vivid(pixels)).toMatch(/^hsl\((35[0-9]|[0-9]) 95% 70%\)$/);
    expect(vivid([...grey, ...grey])).toBeNull();
  });
});
