// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CyberSystem } from '../data/catalog.js';
import { HomeView, type Tile } from './home.js';

function tiles(n: number, logos: number): Tile[] {
  return Array.from({ length: n }, (_, t) => ({
    category: { id: `c${t}`, label: `Category ${t}`, tagline: '' },
    systems: Array.from({ length: logos }, (_, i) => ({
      summary: { name: `s${i}`, fullname: `S${i}`, gameCount: 1 },
      logoSmall: `./logo-${i}.webp`
    })) as unknown as CyberSystem[]
  })) as unknown as Tile[];
}

beforeEach(() => {
  // The logos loaded, as they are once the row is measured.
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
});

afterEach(() => vi.restoreAllMocks());

describe('the categories', () => {
  it('run a row of logos too long for its tile round, without a jump, only when selected', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      const parent = this.parentElement;
      return parent ? [...parent.children].indexOf(this) * 50 : 0;
    });
    const home = new HomeView();
    document.body.replaceChildren(home.root);
    home.show(tiles(2, 6), [], 0);
    await new Promise((done) => requestAnimationFrame(() => setTimeout(done, 0)));
    const track = home.root.querySelector<HTMLElement>('.tile .logos-track')!;
    // Its logos and a copy of them after, to run onto.
    expect(track.querySelectorAll('img')).toHaveLength(12);
    expect(track.classList.contains('loops')).toBe(true);
    expect(track.style.getPropertyValue('--loop')).toBe('-300px');
    expect(track.style.getPropertyValue('--loop-steps')).toBe('300');
    // Moving on changes classes only: the row is left where it is, not put back.
    const before = track.getAttribute('style');
    home.select(1);
    expect(track.getAttribute('style')).toBe(before);
    expect(track.closest('.tile')?.classList.contains('selected')).toBe(false);
    expect(home.root.querySelectorAll('.tile.selected')).toHaveLength(1);
  });

  it('leave a row that fits as it is', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(300);
    const home = new HomeView();
    document.body.replaceChildren(home.root);
    home.show(tiles(1, 3), [], 0);
    await new Promise((done) => requestAnimationFrame(() => setTimeout(done, 0)));
    const track = home.root.querySelector<HTMLElement>('.tile .logos-track')!;
    expect(track.querySelectorAll('img')).toHaveLength(3);
    expect(track.classList.contains('loops')).toBe(false);
  });
});
