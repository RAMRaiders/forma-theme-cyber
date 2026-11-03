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
  it('gives each system its own colours, the same each time', () => {
    const snes = systemColours('snes', 'Nintendo', 'consoles');
    expect(systemColours('snes', 'Nintendo', 'consoles')).toEqual(snes);
    expect(systemColours('n64', 'Nintendo', 'consoles')[0]).not.toBe(snes[0]);
    expect(snes[1]).not.toBe(snes[0]);
    for (const c of [...snes, ...systemColours('wsc', 'Bandai', 'handhelds')]) {
      expect(c).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
    }
  });
});
