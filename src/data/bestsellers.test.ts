import type { Game } from '@ramraiders/forma-sdk';
import { describe, expect, it, vi } from 'vitest';

import { BestsellerStore, findBestsellers, normalise } from './bestsellers.js';

const game = (id: number, system: string, name: string, art = true): Game =>
  ({
    id,
    system,
    name,
    hidden: false,
    media: art ? { thumbnail: `t${id}` } : {}
  }) as unknown as Game;

const library = [
  game(1, 'gb', 'Pokémon : Red Version'),
  game(2, 'gb', 'Tetris'),
  game(3, 'gb', 'Tetris Attack'),
  game(4, 'nes', 'Tetris'),
  game(5, 'gb', 'Super Mario Land', false),
  game(6, 'gb', 'Pokémon : Blue Version')
];

const lookup = {
  search: vi.fn((query: string) =>
    Promise.resolve(library.filter((g) => normalise(g.name).startsWith(query.split(' ')[0]!)))
  ),
  mediaUrl: (id: number, kind: string, width?: number) => `forma://media/${id}/${kind}?w=${width}`
};

describe('best sellers', () => {
  it('compares titles without accents, punctuation, region tags or "Version"', () => {
    expect(normalise('Pokémon : Red Version (USA, Europe)')).toBe('pokemon red');
    expect(normalise('Mario Kart: Double Dash!!')).toBe('mario kart double dash');
    expect(normalise('The Legend of Zelda [!]')).toBe('legend of zelda');
  });

  it('finds the ones the user has on this system, with art, best first, the first title that matches', async () => {
    const found = await findBestsellers(lookup, 'gb', [
      'Tetris',
      'Pokémon Red|Pokémon Blue',
      'Super Mario Land',
      'Kirby'
    ]);
    expect(found).toEqual([
      { name: 'Tetris', art: 'forma://media/2/thumbnail?w=200' },
      { name: 'Pokémon : Red Version', art: 'forma://media/1/thumbnail?w=200' }
    ]);
  });

  it('looks a system up once', async () => {
    lookup.search.mockClear();
    const store = new BestsellerStore(lookup);
    expect(store.peek('nes')).toBeUndefined();
    await store.get('nes', ['Tetris']);
    await store.get('nes', ['Tetris']);
    expect(lookup.search).toHaveBeenCalledOnce();
    expect(store.peek('nes')).toEqual([{ name: 'Tetris', art: 'forma://media/4/thumbnail?w=200' }]);
    expect(await store.get('snes', undefined)).toEqual([]);
  });
});
