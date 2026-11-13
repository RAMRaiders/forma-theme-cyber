import { describe, expect, it } from 'vitest';

import { releaseOf } from '../ui/collector.js';
import { flaggedRegions, gameTags, languageFlag, patchBy, regionFlag, romName } from './romname.js';

describe('a ROM’s file name', () => {
  it('gives No-Intro’s regions, languages and revision', () => {
    expect(romName('Super Metroid (Japan, USA) (En,Ja).sfc')).toEqual({
      regions: ['jp', 'us'],
      languages: ['en', 'ja'],
      version: null,
      status: null
    });
    expect(romName('sub/Chrono Trigger (USA) (Rev 1).zip').version).toBe('Rev 1');
    expect(romName('Game (Europe) (En,Fr,De) (Beta 2).md')).toEqual({
      regions: ['eu'],
      languages: ['en', 'fr', 'de'],
      version: 'Beta 2',
      status: null
    });
  });

  it('gives GoodTools’ letters', () => {
    expect(romName('Sonic (JUE) [!].bin').regions).toEqual(['jp', 'us', 'eu']);
    expect(romName('Mario (U) (V1.1).nes')).toEqual({
      regions: ['us'],
      languages: [],
      version: 'V1.1',
      status: null
    });
  });

  it('gives the language a fan translation is into', () => {
    const into = (name: string) => {
      const { languages, status } = romName(name);
      return { languages, status };
    };
    const english = { languages: ['en'], status: 'Translation' };
    expect(into('Dyna Brothers (Japan) [T-En by Tybis v0.1] [i].zip')).toEqual(english);
    expect(into('Monster World IV (Japan) (Translated En).zip')).toEqual(english);
    expect(into('Game (Japan) (Translated Fr).zip').languages).toEqual(['fr']);
    expect(into('Game (J) [T+Eng1.0_Someone].md')).toEqual(english);
    expect(into('Game (J) [T+Por].md').languages).toEqual(['pt']);
    expect(into('Game (J) [T-Bra].md').languages).toEqual(['pt-br']);
    // Both ways of naming it, and languages the cartridge already had.
    expect(into('Game (Japan) (Translated En) [T-En by Someone].zip')).toEqual(english);
    expect(into('Taruruto (Japan) (En,Fr,Ja) [T-En by Someone].zip').languages).toEqual([
      'en',
      'fr',
      'ja'
    ]);
    // A translation into something not known is still one.
    expect(into('Game (J) [T-Xyz].md')).toEqual({ languages: [], status: 'Translation' });
  });

  it('gives languages with a country, and Brazilian Portuguese apart', () => {
    expect(romName('Cave Story (World) (Pt-BR) (Aftermarket) (Unl).zip').languages).toEqual([
      'pt-br'
    ]);
    expect(romName('Cave Story (World) (Pt-PT).zip').languages).toEqual(['pt']);
    expect(romName('Asteborg (World) (En,Fr,Pt-BR).zip').languages).toEqual(['en', 'fr', 'pt-br']);
    expect(romName('Game (En-US).zip').languages).toEqual(['en']);
    expect(romName('Game (Re-release).zip').languages).toEqual([]);
    expect(languageFlag('pt-br')).toBe('./flags/br.svg');
  });

  it('gives nothing from a bare name', () => {
    expect(romName('Doom.wad')).toEqual({
      regions: [],
      languages: [],
      version: null,
      status: null
    });
    // Not the official release, whatever else the name says.
    expect(romName('Shui Hu Zhuan (China) (Unl).zip').status).toBe('Unl');
    expect(romName('Shui Hu Zhuan (China) (Unl).zip').version).toBeNull();
    expect(romName('Game (World) (v1.1) (Aftermarket) (Unl).md')).toMatchObject({
      version: 'v1.1',
      status: 'Aftermarket · Unl'
    });
    expect(romName('Game (Pirate).md').status).toBe('Pirate');
    expect(romName('Trouble Shooter (Japan) [T-En by M.I.J.E.T. v061029] [n].md').status).toBe(
      'Translation'
    );
    expect(romName('Sonic (U) [h1].md').status).toBe('Hack');
    expect(romName('Sonic (U) [h1].md').languages).toEqual([]);
    expect(romName('Sonic (U) [p1].md').status).toBe('Pirate');
    expect(romName('Sonic (U) [!].md').status).toBeNull();
    expect(romName('Sonic (U) [f1].md').status).toBeNull();
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

describe('gameTags', () => {
  const dump = (name: string, status = 'verified') => ({ status, name });

  it('takes the catalogue’s name first, whatever the file is called', () => {
    const tags = gameTags({
      path: 'sonic.md',
      dump: dump('Sonic the Hedgehog (USA) (Proto 2)')
    });
    expect(tags).toEqual({
      regions: ['us'],
      languages: [],
      version: 'Proto 2',
      status: null,
      fromCatalogue: true
    });
  });

  it('fills from the file what the catalogue leaves out; its version is the catalogue’s alone', () => {
    const tags = gameTags({
      path: 'Mario (Europe) (En,Fr,De) (Rev 1) [h].nes',
      dump: dump('Super Mario Bros. (Europe)')
    });
    expect(tags.regions).toEqual(['eu']);
    expect(tags.languages).toEqual(['en', 'fr', 'de']);
    // Matched: the original release, whatever the file said.
    expect(tags.version).toBeNull();
    expect(tags.status).toBeNull();
  });

  it('keeps how it was released from the file: No-Intro leaves `(Unl)` out of some names', () => {
    const tags = gameTags({
      path: 'Alex Kidd in Miracle World 2 (World) (Unl) [h].7z',
      dump: dump('Alex Kidd in Miracle World 2 (World)')
    });
    // Unlicensed, from the file; a hack it is not, the file being the catalogue's.
    expect(tags.status).toBe('Unl');
    expect(releaseOf(tags.version, tags.status).kind).toBe('Unlicensed');
    // Said by both: once.
    expect(gameTags({ path: 'A (Korea) (Unl).7z', dump: dump('A (Korea) (Unl)') }).status).toBe(
      'Unl'
    );
  });

  it('reads the file alone when not catalogued or not checked', () => {
    const path = 'Cave Story (World) (Aftermarket) (Unl).zip';
    expect(gameTags({ path, dump: dump('ignored (Japan)', 'notCatalogued') })).toEqual({
      ...romName(path),
      fromCatalogue: false
    });
    expect(gameTags({ path, dump: null }).fromCatalogue).toBe(false);
  });

  it('knows a kiosk, a promo, a debug build and an alpha', () => {
    for (const tag of ['Kiosk', 'Promo', 'Debug', 'Alpha 1', 'Demo 2']) {
      expect(romName(`Game (USA) (${tag}).bin`).version).toBe(tag);
    }
  });
});

describe('patchBy', () => {
  it('credits who made a fan translation, as its name does', () => {
    expect(patchBy('Bare Knuckle III (Japan) [T-En by Twilight Translations v1.0].zip')).toBe(
      'Twilight Translations v1.0'
    );
    expect(patchBy('A (Japan) [T-En by Ann & Bo v0.99] [n].zip')).toBe('Ann & Bo v0.99');
    expect(patchBy('Bare Knuckle III (Japan) (Translated En).zip')).toBeNull();
    expect(patchBy('Sonic (USA) (by Sega).zip')).toBeNull();
  });
});
