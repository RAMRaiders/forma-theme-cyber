import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';

import { CASED_SYSTEMS, caseHeight, caseShape, spineShape } from './cases.js';

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

describe('caseHeight', () => {
  it('stands a PAL Dreamcast box taller than a US or Japanese jewel case', () => {
    expect(caseHeight('dreamcast', ['eu'])).toBe(190);
    expect(caseHeight('dreamcast', ['uk', 'fr'])).toBe(190);
    expect(caseHeight('dreamcast', ['us'])).toBe(125);
    expect(caseHeight('dreamcast', ['jp'])).toBe(125);
    // A disc sold in Europe and elsewhere, or that names no region: the jewel case.
    expect(caseHeight('dreamcast', ['us', 'eu'])).toBe(125);
    expect(caseHeight('dreamcast', [])).toBe(125);
  });

  it('knows no height where the cases do not differ by region', () => {
    expect(caseHeight('megadrive', ['eu'])).toBeNull();
  });
});
