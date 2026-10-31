import type { Category, CyberSystem } from '../data/catalog.js';
import { el } from './dom.js';

export interface Tile {
  category: Category;
  systems: CyberSystem[];
}

/** Cyber's top level: one tile per category that has games. */
export class HomeView {
  readonly root = el('div', { class: 'home', role: 'listbox' });
  #tiles: HTMLElement[] = [];
  #selected = -1;

  show(tiles: Tile[], selected: number): void {
    this.#tiles = tiles.map(tile);
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
    t.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /** Columns as laid out right now, for up/down movement. */
  columns(): number {
    const template = getComputedStyle(this.root).gridTemplateColumns;
    return Math.max(1, template.split(' ').filter(Boolean).length);
  }
}

function tile({ category, systems }: Tile): HTMLElement {
  const games = systems.reduce((n, s) => n + s.summary.gameCount, 0);
  // The three biggest libraries stand for the category.
  const photos = systems.slice(0, 3).map((s) => {
    const img = el('img', { src: s.photo, alt: '', loading: 'lazy', decoding: 'async' });
    img.addEventListener('error', () => img.remove());
    return img;
  });
  return el(
    'div',
    { class: `tile tile-${category.id}`, role: 'option', 'aria-selected': 'false' },
    el('div', { class: 'photos', 'aria-hidden': 'true' }, ...photos),
    el(
      'div',
      { class: 'text' },
      el('h2', {}, category.label),
      el('p', { class: 'tagline' }, category.tagline),
      el(
        'p',
        { class: 'count' },
        `${systems.length} ${systems.length === 1 ? 'system' : 'systems'} · ${games.toLocaleString('en')} games`
      )
    )
  );
}
