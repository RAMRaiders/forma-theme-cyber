import type { Category, CyberSystem } from '../data/catalog.js';
import { circuitSvg } from './circuit.js';
import { el } from './dom.js';

export interface Tile {
  category: Category;
  systems: CyberSystem[];
}

/** Logos along the bottom of a tile. */
const LOGOS = 4;

/** Cyber's top level: one tile per category that has games. */
export class HomeView {
  readonly root = el('div', { class: 'home', role: 'listbox' });
  #tiles: HTMLElement[] = [];
  #selected = -1;

  show(tiles: Tile[], selected: number): void {
    this.#tiles = tiles.map(tile);
    // Columns for two rows on a 16:9 screen (seven categories: 4 + 3), so every tile gets a big
    // stage; a narrow screen overrides this in style.css and scrolls.
    const rows = Math.max(1, Math.round(Math.sqrt((tiles.length * 9) / 16)));
    this.root.style.setProperty('--cols', String(Math.max(1, Math.ceil(tiles.length / rows))));
    this.root.replaceChildren(...this.#tiles);
    this.#selected = -1;
    this.select(selected);
  }

  select(index: number): void {
    this.#tiles[this.#selected]?.classList.remove('selected');
    this.#tiles[this.#selected]?.setAttribute('aria-selected', 'false');
    this.#selected = index;
    const t = this.#tiles[index];
    if (!t) return;
    t.classList.add('selected');
    t.setAttribute('aria-selected', 'true');
    t.scrollIntoView({ block: 'nearest' });
  }

  /** Columns as laid out right now, for up/down movement. */
  columns(): number {
    const template = getComputedStyle(this.root).gridTemplateColumns;
    return Math.max(1, template.split(' ').filter(Boolean).length);
  }
}

const image = (src: string, cls: string) => {
  const img = el('img', { class: cls, src, alt: '', loading: 'lazy', decoding: 'async' });
  img.addEventListener('error', () => img.remove());
  return img;
};

/**
 * A category as a little stage: its biggest system large in the middle on a halo of the
 * category's colour, the next two set back on either side, a reflection under each, the
 * category's own circuit board as texture, and its systems' logos along the bottom.
 */
function tile({ category, systems }: Tile): HTMLElement {
  const games = systems.reduce((n, s) => n + s.summary.gameCount, 0);
  const [hero, left, right] = systems;
  const texture = el('div', { class: 'texture', 'aria-hidden': 'true' });
  texture.innerHTML = circuitSvg(`category:${category.id}`, [], 0);
  const stage = el(
    'div',
    { class: 'stage', 'aria-hidden': 'true' },
    el('div', { class: 'halo' }),
    left ? image(left.photo, 'side left') : '',
    right ? image(right.photo, 'side right') : '',
    hero ? image(hero.photo, 'hero') : ''
  );
  const logos = el(
    'div',
    { class: 'logos', 'aria-hidden': 'true' },
    ...systems.slice(0, LOGOS).map((s) => image(s.logo, 'logo'))
  );
  return el(
    'div',
    { class: `tile tile-${category.id}`, role: 'option', 'aria-selected': 'false' },
    texture,
    stage,
    el(
      'div',
      { class: 'text' },
      el('h2', {}, category.label),
      el('p', { class: 'tagline' }, category.tagline),
      el(
        'p',
        { class: 'counts' },
        el(
          'span',
          { class: 'chip' },
          `${systems.length} ${systems.length === 1 ? 'system' : 'systems'}`
        ),
        el('span', { class: 'chip' }, `${games.toLocaleString('en')} games`)
      ),
      logos
    )
  );
}
