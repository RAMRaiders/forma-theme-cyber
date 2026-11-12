import type { Category, CyberSystem } from '../data/catalog.js';
import { categoryArt } from './art.js';
import { circuitSvg } from './circuit.js';
import { el, reveal } from './dom.js';
import { awake } from './rest.js';

export interface Tile {
  category: Category;
  systems: CyberSystem[];
  /** What its tags say, in place of its systems and games (the magazines tile). */
  counts?: string[];
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

/** The selected tile's logos, when more than fit, turn to the next few this often. */
/** How often the selected tile's logos glide on by one, and how long the glide takes. */
const LOGO_STEP_MS = 1800;
const LOGO_GLIDE_MS = 700;

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
  #pageTimer: ReturnType<typeof setInterval> | undefined;
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
    // Every row is split into pages now, not on its tile's first selection: the first moves
    // (at boot, while the Pi is busiest) then only change which row turns.
    requestAnimationFrame(() => {
      for (const card of cards) void paginate(card).then(() => this.#turnPages());
    });
  }

  /** The shortcut selected, if the selection is on one. */
  get shortcut(): string | null {
    return this.#tiles[this.#selected]?.dataset.shortcut ?? null;
  }

  select(index: number): void {
    const before = this.#tiles[this.#selected];
    if (before) glideTo(before, 0, false);
    before?.classList.remove('selected');
    this.#tiles[this.#selected]?.setAttribute('aria-selected', 'false');
    this.#selected = index;
    const t = this.#tiles[index];
    if (!t) return;
    t.classList.add('selected');
    t.setAttribute('aria-selected', 'true');
    if (t.parentElement === this.#categories) reveal(t, this.#categories);
    this.#turnPages();
  }

  /**
   * The selected tile's logos, when more than fit, glide along by one every couple of seconds,
   * round and round; still in between. (A row running without pause kept the Pi drawing every
   * frame, and moves stuttered behind it.)
   */
  #turnPages(): void {
    clearInterval(this.#pageTimer);
    const tile = this.#tiles[this.#selected];
    const count = tile ? (ROWS.get(tile)?.starts.length ?? 0) : 0;
    if (!tile || count < 2 || document.documentElement.dataset.motion === 'off') return;
    let step = 0;
    this.#pageTimer = setInterval(
      awake(() => {
        step += 1;
        glideTo(tile, step, true);
        if (step === count) step = 0;
      }),
      LOGO_STEP_MS
    );
  }

  /** Columns as laid out right now, for up/down movement. */
  columns(): number {
    const template = getComputedStyle(this.#categories).gridTemplateColumns;
    return Math.max(1, template.split(' ').filter(Boolean).length);
  }
}

/**
 * Each tile's row of logos, when longer than its room: where each logo starts, and the length
 * of the whole set (a copy follows it, so the row loops without a jump).
 */
const ROWS = new WeakMap<HTMLElement, { starts: number[]; loop: number }>();

/**
 * Measures a tile's row of logos once they are in (at start-up they may still be loading). When
 * they do not all fit, a copy of them follows, for the row to run round.
 */
async function paginate(tile: HTMLElement): Promise<void> {
  const row = tile.querySelector<HTMLElement>('.logos');
  const track = row?.querySelector<HTMLElement>('.logos-track');
  if (!row || !track || ROWS.has(tile)) return;
  await Promise.all(
    [...track.querySelectorAll('img')]
      .filter((img) => !img.complete)
      .map(
        (img) =>
          new Promise((done) => {
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
          })
      )
  );
  // Not laid out (the screen is hidden): done again when it shows.
  const room = row.clientWidth;
  if (!room || ROWS.has(tile)) return;
  const logos = [...track.querySelectorAll('img')];
  if (!logos.length || track.scrollWidth <= room) return;
  const base = logos[0]?.offsetLeft ?? 0;
  const starts = logos.map((img) => img.offsetLeft - base);
  for (const img of logos) track.append(img.cloneNode(true));
  const loop = (logos.length ? (track.children[logos.length] as HTMLElement).offsetLeft : 0) - base;
  ROWS.set(tile, { starts, loop });
}

/**
 * Moves a tile's row so logo `n` is first, gliding or at once. Past the last, it glides on to the
 * copy and then, still, jumps back to the start, which looks the same. Only a transform changes:
 * nothing is laid out again.
 */
function glideTo(tile: HTMLElement, n: number, glide: boolean): void {
  const row = ROWS.get(tile);
  const track = tile.querySelector<HTMLElement>('.logos-track');
  if (!row || !track) return;
  const x = n >= row.starts.length ? row.loop : (row.starts[n] ?? 0);
  track.style.transition = glide ? `transform ${LOGO_GLIDE_MS}ms ease-in-out` : 'none';
  track.style.transform = x ? `translateX(${-x}px)` : '';
  if (glide && n >= row.starts.length) {
    setTimeout(() => {
      track.style.transition = 'none';
      track.style.transform = '';
    }, LOGO_GLIDE_MS + 50);
  }
}

const image = (src: string, cls: string) => {
  // Not lazy: a logo coming into the row as it runs must already be there.
  const img = el('img', { class: cls, src, alt: '', decoding: 'async' });
  img.addEventListener('error', () => img.remove());
  return img;
};

/**
 * A category as a little stage: Cyber's own picture of it, in neon on a halo of the
 * category's colour, the category's own circuit board as texture, and its systems' logos along
 * the bottom.
 */
function tile({ category, systems, counts }: Tile): HTMLElement {
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
  // Every system's logo: the first few show, and the selected tile runs through them all.
  const logos = el(
    'div',
    { class: 'logos', 'aria-hidden': 'true' },
    el(
      'div',
      { class: 'logos-track' },
      ...systems
        .flatMap((s) => (s.logoSmall ? [s.logoSmall] : []))
        .map((logo) => image(logo, 'logo'))
    )
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
        ...(
          counts ?? [
            `${systems.length} ${systems.length === 1 ? 'system' : 'systems'}`,
            `${games.toLocaleString('en')} games`
          ]
        ).map((text) => el('span', { class: 'tag' }, text))
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
    '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="M12 8.5l1.2 2.3 2.3 1.2-2.3 1.2L12 15.5l-1.2-2.3L8.5 12l2.3-1.2z"/>',
  recent:
    '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/><path d="M3.5 12H2M4 7l-1.5-1"/>'
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
