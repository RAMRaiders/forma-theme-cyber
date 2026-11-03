import type { Category, CyberSystem } from '../data/catalog.js';
import { categoryArt } from './art.js';
import { circuitSvg } from './circuit.js';
import { el } from './dom.js';

export interface Tile {
  category: Category;
  systems: CyberSystem[];
}

/** A button under the categories: favourites, and what is coming later. */
export interface Shortcut {
  id: string;
  label: string;
  tagline: string;
  /** e.g. "12 games"; none for one that is not there yet. */
  count?: string;
  /** Not there yet: shown, and says so, but opens nothing. */
  soon?: boolean;
}

/** Logos along the bottom of a tile. */
const LOGOS = 4;

/**
 * Cyber's top level: one tile per category that has games, then a row of shortcuts under them.
 * One index runs through both: the shortcuts follow the categories.
 */
export class HomeView {
  readonly root = el('div', { class: 'home' });
  readonly #categories = el('div', { class: 'categories', role: 'listbox' });
  readonly #shortcuts = el('div', { class: 'shortcuts', role: 'listbox' });
  #tiles: HTMLElement[] = [];
  #selected = -1;
  /** Categories shown; the shortcuts' indexes start here. */
  categories = 0;
  shortcuts = 0;

  constructor() {
    this.root.append(this.#categories, this.#shortcuts);
  }

  show(tiles: Tile[], shortcuts: Shortcut[], selected: number): void {
    const cards = tiles.map(tile);
    const buttons = shortcuts.map(shortcut);
    this.#tiles = [...cards, ...buttons];
    this.categories = tiles.length;
    this.shortcuts = shortcuts.length;
    // Columns for two rows on a 16:9 screen (eight tiles: 4 + 4), so every tile gets a big
    // stage; a narrow screen overrides this in style.css and scrolls.
    const rows = Math.max(1, Math.round(Math.sqrt((tiles.length * 9) / 16)));
    this.root.style.setProperty('--cols', String(Math.max(1, Math.ceil(tiles.length / rows))));
    this.root.style.setProperty('--shortcuts', String(Math.max(1, shortcuts.length)));
    this.#categories.replaceChildren(...cards);
    this.#shortcuts.replaceChildren(...buttons);
    this.#selected = -1;
    this.select(selected);
  }

  /** The shortcut selected, if the selection is on one. */
  get shortcut(): string | null {
    return this.#tiles[this.#selected]?.dataset.shortcut ?? null;
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
    const template = getComputedStyle(this.#categories).gridTemplateColumns;
    return Math.max(1, template.split(' ').filter(Boolean).length);
  }
}

const image = (src: string, cls: string) => {
  const img = el('img', { class: cls, src, alt: '', loading: 'lazy', decoding: 'async' });
  img.addEventListener('error', () => img.remove());
  return img;
};

/**
 * A category as a little stage: Cyber's own picture of it, in neon on a halo of the
 * category's colour, the category's own circuit board as texture, and its systems' logos along
 * the bottom.
 */
function tile({ category, systems }: Tile): HTMLElement {
  const games = systems.reduce((n, s) => n + s.summary.gameCount, 0);
  const texture = el('div', { class: 'texture', 'aria-hidden': 'true' });
  texture.innerHTML = circuitSvg(`category:${category.id}`, [], 0);
  const art = el('div', { class: 'art' });
  art.innerHTML = categoryArt(category.id);
  const stage = el(
    'div',
    { class: 'stage', 'aria-hidden': 'true' },
    el('div', { class: 'halo' }),
    art
  );
  const logos = el(
    'div',
    { class: 'logos', 'aria-hidden': 'true' },
    ...systems
      .flatMap((s) => (s.logo ? [s.logo] : []))
      .slice(0, LOGOS)
      .map((logo) => image(logo, 'logo'))
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
          { class: 'tag' },
          `${systems.length} ${systems.length === 1 ? 'system' : 'systems'}`
        ),
        el('span', { class: 'tag' }, `${games.toLocaleString('en')} games`)
      ),
      logos
    )
  );
}

/** Each shortcut's picture: a line icon in Cyber's style. */
const ICONS: Record<string, string> = {
  favorites: '<path d="M12 3.2l2.6 5.5 6 .7-4.5 4.1 1.2 6L12 16.6 6.7 19.5l1.2-6L3.4 9.4l6-.7z"/>',
  magazines:
    '<path d="M5 3.5h10l4 4v13H5z"/><path d="M15 3.5v4h4"/><path d="M8 11h8M8 14h8M8 17h5"/>',
  collections:
    '<rect x="3.5" y="9" width="17" height="11.5" rx="1.5"/><path d="M5.5 6h13M7.5 3.5h9"/>',
  recommended:
    '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="M12 8.5l1.2 2.3 2.3 1.2-2.3 1.2L12 15.5l-1.2-2.3L8.5 12l2.3-1.2z"/>'
};

function shortcut(s: Shortcut): HTMLElement {
  const icon = el('div', { class: 'icon', 'aria-hidden': 'true' });
  icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${ICONS[s.id] ?? ''}</svg>`;
  const button = el(
    'div',
    {
      class: `shortcut shortcut-${s.id}${s.soon ? ' soon' : ''}`,
      role: 'option',
      'aria-selected': 'false'
    },
    icon,
    el(
      'div',
      { class: 'text' },
      el('h2', {}, s.label),
      s.soon ? el('span', { class: 'tag' }, 'Coming soon') : '',
      !s.soon && s.count ? el('span', { class: 'tag' }, s.count) : ''
    )
  );
  // What it is, for a screen reader: there is no room for it on screen.
  button.setAttribute('aria-label', `${s.label}: ${s.tagline}`);
  button.dataset.shortcut = s.id;
  return button;
}
