import { describe, expect, it } from 'vitest';

import { systemRgb } from './system.js';

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
