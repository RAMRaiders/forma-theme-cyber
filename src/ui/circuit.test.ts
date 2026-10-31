import { describe, expect, it } from 'vitest';

import { circuitSvg } from './circuit.js';

describe('circuit', () => {
  it('draws the same board for the same system, and a different one for another', () => {
    const chips = [{ role: 'CPU', part: 'Ricoh 5A22' }];
    expect(circuitSvg('snes', chips)).toBe(circuitSvg('snes', chips));
    expect(circuitSvg('snes', chips)).not.toBe(circuitSvg('megadrive', chips));
  });

  it('labels the real chips, escaped, and draws a board without any', () => {
    const svg = circuitSvg('x', [{ role: 'CPU', part: 'A<B & C' }]);
    expect(svg).toContain('>A&lt;B &amp; C</text>');
    expect(svg).toContain('>CPU</text>');
    expect(circuitSvg('y')).toMatch(/^<svg class="circuit"[^]*class="chip"[^]*<\/svg>$/);
  });

  it('lights only the traces asked for', () => {
    expect(circuitSvg('z', [], 0)).not.toContain('class="pulse"');
    expect(circuitSvg('z', [], 4).match(/class="pulse"/g)).toHaveLength(4);
  });
});
