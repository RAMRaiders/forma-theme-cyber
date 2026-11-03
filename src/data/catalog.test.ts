import type { SystemSummary } from '@ramraiders/forma-sdk';
import { describe, expect, it } from 'vitest';

import { InfoStore, group } from './catalog.js';

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
      'games',
      {
        snes: { logo: 'logo.webp', picture: 'photo.webp', kind: 'cutout' },
        nes: { logo: 'logo.webp', logoDark: true, picture: 'photo.webp', kind: 'framed' }
      }
    );
    expect(groups.map((g) => [g.category.id, g.systems.map((s) => s.summary.name)])).toEqual([
      ['consoles', ['snes', 'nes']],
      ['handhelds', ['gba']],
      ['arcade', ['neogeo']],
      ['ports', ['sonic3-air']],
      ['engines', ['openbor', 'easyrpg', 'pygame']]
    ]);
    // Each system's art, from art.json; a system it does not list has none.
    const [snes, nes] = groups[0]!.systems;
    expect(snes).toMatchObject({ photo: './systems/snes/photo.webp', photoKind: 'cutout' });
    expect(nes).toMatchObject({
      logo: './systems/nes/logo.webp',
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
