import { describe, expect, it } from 'vitest';

import { flaggedRegions, languageFlag, regionFlag, romName } from './romname.js';

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
    // Not the official release, whatever else the name says.
    expect(romName('Shui Hu Zhuan (China) (Unl).zip').version).toBe('Unl');
    expect(romName('Game (World) (Rev 1) (Unl).md').version).toBe('Rev 1 · Unl');
    expect(romName('Game (Pirate).md').version).toBe('Pirate');
    expect(romName('Trouble Shooter (Japan) [T-En by M.I.J.E.T. v061029] [n].md').version).toBe(
      'Translation'
    );
    expect(romName('Sonic (U) [h1].md').version).toBe('Hack');
    expect(romName('Sonic (U) [p1].md').version).toBe('Pirate');
    expect(romName('Sonic (U) [!].md').version).toBeNull();
    expect(romName('Sonic (U) [f1].md').version).toBeNull();
    // A subtitle in brackets is not a region.
    expect(romName('Wario Land (Super Mario Land 3).gb').regions).toEqual([]);
  });

  it('shows a World copy as the three regions', () => {
    expect(flaggedRegions(['wor'])).toEqual(['jp', 'us', 'eu']);
    expect(flaggedRegions(['us'])).toEqual(['us']);
    expect(flaggedRegions(['us', 'wor'])).toEqual(['us', 'jp', 'eu']);
  });

  it('has a flag for a country, none for the world', () => {
    expect(regionFlag('us')).toBe('./flags/us.svg');
    expect(regionFlag('uk')).toBe('./flags/gb.svg');
    expect(regionFlag('wor')).toBeNull();
    expect(languageFlag('en')).toBe('./flags/gb.svg');
    expect(languageFlag('xx')).toBeNull();
  });
});
