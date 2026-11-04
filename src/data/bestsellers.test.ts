import { describe, expect, it } from 'vitest';

import { bestsellers } from './bestsellers.js';

describe('best sellers', () => {
  it('are the top three, each with the picture of its cartridge in the theme', () => {
    expect(
      bestsellers('gb', ['Tetris', 'Pokémon Red|Pokémon Blue', 'Super Mario Land', 'Kirby'])
    ).toEqual([
      { name: 'Tetris', art: './systems/gb/bestsellers/1.webp' },
      { name: 'Pokémon Red', art: './systems/gb/bestsellers/2.webp' },
      { name: 'Super Mario Land', art: './systems/gb/bestsellers/3.webp' }
    ]);
  });

  it('are none for a system without a list', () => {
    expect(bestsellers('snes', undefined)).toEqual([]);
  });
});
