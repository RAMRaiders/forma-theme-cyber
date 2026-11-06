import { describe, expect, it } from 'vitest';

import { languageFlag, regionFlag, romName } from './romname.js';

describe('a ROM’s file name', () => {
  it('gives No-Intro’s regions, languages and revision', () => {
    expect(romName('Super Metroid (Japan, USA) (En,Ja).sfc')).toEqual({
      regions: ['jp', 'us'],
      languages: ['en', 'ja'],
      version: null
    });
    expect(romName('sub/Chrono Trigger (USA) (Rev 1).zip').version).toBe('Rev 1');
    expect(romName('Game (Europe) (En,Fr,De) (Beta 2).md')).toEqual({
      regions: ['eu'],
      languages: ['en', 'fr', 'de'],
      version: 'Beta 2'
    });
  });

  it('gives GoodTools’ letters', () => {
    expect(romName('Sonic (JUE) [!].bin').regions).toEqual(['jp', 'us', 'eu']);
    expect(romName('Mario (U) (V1.1).nes')).toEqual({
      regions: ['us'],
      languages: [],
      version: 'V1.1'
    });
  });

  it('gives nothing from a bare name', () => {
    expect(romName('Doom.wad')).toEqual({ regions: [], languages: [], version: null });
    // A subtitle in brackets is not a region.
    expect(romName('Wario Land (Super Mario Land 3).gb').regions).toEqual([]);
  });

  it('has a flag for a country, none for the world', () => {
    expect(regionFlag('us')).toBe('./flags/us.svg');
    expect(regionFlag('uk')).toBe('./flags/gb.svg');
    expect(regionFlag('wor')).toBeNull();
    expect(languageFlag('en')).toBe('./flags/gb.svg');
    expect(languageFlag('xx')).toBeNull();
  });
});
