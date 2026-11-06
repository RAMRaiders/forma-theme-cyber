import type { SystemSummary } from '@ramraiders/forma-sdk';
import { describe, expect, it } from 'vitest';

import { InfoStore, group, makerLogos } from './catalog.js';

const system = (name: string, hardware: string | null, gameCount: number): SystemSummary => ({
  name,
  fullname: name.toUpperCase(),
  manufacturer: null,
  releaseYear: null,
  hardware,
  gameCount
});

describe('catalog', () => {
  it("groups by Batocera's type, refined per system, with a system's info winning", () => {
    const groups = group(
      [
        system('snes', 'console', 2068),
        system('nes', 'console', 1277),
        system('neogeo', 'console', 169),
        system('gba', 'portable', 1561),
        system('sonic3-air', 'port', 3),
        system('openbor', 'port', 147),
        system('pygame', 'library', 2),
        system('easyrpg', 'port', 5),
        system('empty', 'console', 0),
        system('imageviewer', 'system', 1)
      ],
      new Map([['neogeo', { category: 'arcade' as const }]]),
      {
        snes: { logo: 'logo.webp', picture: 'photo.webp', kind: 'cutout' },
        nes: { logo: 'logo.webp', logoDark: true, picture: 'photo.webp', kind: 'framed' }
      }
    );
    expect(groups.map((g) => [g.category.id, g.systems.map((s) => s.summary.name)])).toEqual([
      ['consoles', ['snes', 'nes']],
      ['handhelds', ['gba']],
      ['arcade', ['neogeo']],
      // Ports and recompiled games are engines too, each its own system, in Forma's order.
      ['engines', ['sonic3-air', 'openbor', 'pygame', 'easyrpg']]
    ]);
    // Each system's art, from art.json; a system it does not list has none.
    const [snes, nes] = groups[0]!.systems;
    expect(snes).toMatchObject({ photo: './systems/snes/photo.webp', photoKind: 'cutout' });
    expect(nes).toMatchObject({
      logo: './systems/nes/logo.webp',
      logoSmall: './systems/nes/logo-small.webp',
      logoDark: true,
      photoKind: 'framed'
    });
    expect(groups[1]!.systems[0]).toMatchObject({ logo: null, photo: null });
  });

  it('fetches each info once, and a missing one is just null', async () => {
    const asked: string[] = [];
    const store = new InfoStore((url) => {
      asked.push(url);
      return url.includes('/nes/') ? Promise.resolve({ name: 'NES' }) : Promise.reject(new Error());
    });
    expect(await store.get('nes')).toEqual({ name: 'NES' });
    expect(await store.get('nes')).toEqual({ name: 'NES' });
    expect(await store.get('x68000')).toBeNull();
    expect([...(await store.all(['nes', 'x68000'])).keys()]).toEqual(['nes']);
    expect(asked).toEqual(['./systems/nes/info.json', './systems/x68000/info.json']);
  });
});

describe('makerLogos', () => {
  const makers = [
    { id: 'sega', match: '^sega', logo: 'sega.webp' },
    { id: 'nec', match: '^nec\\b', logo: 'nec.webp' },
    { id: 'sony', match: '^sony', logo: 'sony.webp' },
    { id: 'philips', match: '^philips', logo: 'philips.webp' },
    { id: 'mb', match: '^(mb|milton bradley)$', logo: 'mb.webp' },
    { id: 'bad', match: '(', logo: 'bad.webp' }
  ];
  it('finds the maker a name starts with, whatever its case', () => {
    expect(makerLogos('SEGA Enterprises', makers)).toEqual(['./makers/sega.webp']);
    expect(makerLogos('NEC Home Electronics', makers)).toEqual(['./makers/nec.webp']);
  });
  it('finds each maker a name lists, in its order', () => {
    expect(makerLogos('Several (Philips, Sony and others)', makers)).toEqual([
      './makers/philips.webp',
      './makers/sony.webp'
    ]);
    expect(makerLogos('General Consumer Electronics (later Milton Bradley)', makers)).toEqual([
      './makers/mb.webp'
    ]);
  });
  it("finds a game company's logo in its own folder, before the makers'", () => {
    const all = [
      { id: 'konami', match: '^konami', logo: 'konami.webp', dir: 'companies' },
      ...makers
    ];
    expect(makerLogos('Konami', all)).toEqual(['./companies/konami.webp']);
    expect(makerLogos('Sega of America', all)).toEqual(['./makers/sega.webp']);
  });
  it('is none for a maker without one, no maker, or a word that only starts the same', () => {
    expect(makerLogos('Necrosoft', makers)).toEqual([]);
    expect(makerLogos('Watara', makers)).toEqual([]);
    expect(makerLogos(null, makers)).toEqual([]);
  });
});
