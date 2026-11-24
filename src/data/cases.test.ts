import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';

import { CASED_SYSTEMS, caseScale, caseShape, spineShape, spineSize } from './cases.js';

describe('cases', () => {
  it('gives every Batocera system a case of its own', () => {
    const ids = readFileSync('scripts/batocera-systems.tsv', 'utf8')
      .trim()
      .split('\n')
      .slice(1)
      .map((line) => line.split('\t')[0]!);
    expect(ids.length).toBeGreaterThan(200);
    expect(ids.filter((id) => !CASED_SYSTEMS.has(id))).toEqual([]);
  });

  it('shapes boxes as they were sold', () => {
    expect(caseShape('megadrive')).toMatchObject({ ratio: 0.72, lying: false });
    expect(caseShape('snes').lying).toBe(true);
    expect(caseShape('psx').ratio).toBeGreaterThan(1);
    expect(caseShape('psp').ratio).toBeLessThan(0.6);
    // One Batocera adds later: a keep case.
    expect(caseShape('newthing')).toEqual(caseShape('wii'));
  });

  it('shapes spines from their case', () => {
    expect(spineShape(caseShape('megadrive'))).toBeCloseTo(1 / 0.13);
    // Along the top of a wide box: as long as the box is wide.
    expect(spineShape(caseShape('snes'))).toBeCloseTo(1.39 / 0.27);
    expect(spineShape(caseShape('gamecube'))).toBeGreaterThan(spineShape(caseShape('nes')));
  });
});

describe('spineSize', () => {
  it('draws a US or Japanese Dreamcast spine longer than a PAL one', () => {
    expect(spineSize('dreamcast', ['eu'])).toBe(1);
    expect(spineSize('dreamcast', ['uk', 'fr'])).toBe(1);
    expect(spineSize('dreamcast', ['us'])).toBe(1.3);
    expect(spineSize('dreamcast', ['jp'])).toBe(1.3);
    // Sold in Europe and elsewhere, or no region named: the jewel case.
    expect(spineSize('dreamcast', ['us', 'eu'])).toBe(1.3);
    expect(spineSize('dreamcast', [])).toBe(1.3);
  });

  it('leaves alone systems whose spines do not differ by region', () => {
    expect(spineSize('megadrive', ['us'])).toBe(1);
  });
});

describe('caseScale', () => {
  it('draws a US or Japanese Dreamcast case two thirds as big as a PAL one', () => {
    expect(caseScale('dreamcast', ['eu'])).toBe(1);
    expect(caseScale('dreamcast', ['us'])).toBeCloseTo(125 / 190, 3);
    expect(caseScale('dreamcast', ['jp'])).toBeCloseTo(125 / 190, 3);
    expect(caseScale('saturn', ['us'])).toBe(1);
  });
});
