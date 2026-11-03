import { describe, expect, it } from 'vitest';

import { systemColours, systemRgb } from './system.js';

describe('the colour a system lights its screen with', () => {
  it('is its maker’s', () => {
    expect(systemRgb('Sega', 'consoles')).toBe('47 140 255');
    expect(systemRgb('Nintendo / St.GIGA', 'consoles')).toBe('255 59 78');
    expect(systemRgb('Sony Computer Entertainment', 'consoles')).toBe('125 107 255');
  });

  it('else its category’s, as on its home tile', () => {
    expect(systemRgb('Watara', 'handhelds')).toBe('61 255 160');
    expect(systemRgb(undefined, 'engines')).toBe('167 123 255');
  });
});

describe('systemColours', () => {
  it('gives neighbours in a list clearly different colours', () => {
    const hues = [0, 1, 2, 3, 4].map((i) => systemColours(i, 'consoles')[0]);
    expect(new Set(hues).size).toBe(5);
    expect(systemColours(2, 'consoles')).toEqual(systemColours(2, 'consoles'));
    for (const c of systemColours(7, 'arcade')) expect(c).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
  });
});
