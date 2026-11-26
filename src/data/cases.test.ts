import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';

import {
  CASED_SYSTEMS,
  caseScale,
  caseShape,
  spineBoost,
  regionalCases,
  regionalSpine,
  spineShape,
  stubbiestSpine
} from './cases.js';

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

describe('regionalSpine', () => {
  it('knows a US or Japanese Dreamcast spine is slimmer than a PAL one', () => {
    expect(regionalSpine('dreamcast', ['eu'])).toBe(7.8);
    expect(regionalSpine('dreamcast', ['uk', 'fr'])).toBe(7.8);
    expect(regionalSpine('dreamcast', ['us'])).toBe(17.4);
    expect(regionalSpine('dreamcast', ['jp'])).toBe(17.4);
    // Sold in Europe and elsewhere, or no region named: the jewel case.
    expect(regionalSpine('dreamcast', ['us', 'eu'])).toBe(17.4);
    expect(regionalSpine('dreamcast', [])).toBe(17.4);
    expect(stubbiestSpine('dreamcast')).toBe(7.8);
  });

  it('leaves alone systems whose cases do not differ by region', () => {
    expect(regionalSpine('megadrive', ['us'])).toBeNull();
    expect(stubbiestSpine('megadrive')).toBeNull();
    expect(regionalCases('megadrive')).toBe(false);
    expect(regionalCases('dreamcast')).toBe(true);
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

describe('spineBoost', () => {
  it("draws a PlayStation's shelf rows a little bigger, others as their case makes them", () => {
    expect(spineBoost('psx')).toBe(1.15);
    expect(spineBoost('megadrive')).toBe(1);
  });
});
