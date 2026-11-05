import type { Game } from '@ramraiders/forma-sdk';

import type { LazyList } from '../logic/pager.js';
import { el, remPx } from './dom.js';
import { STAGE_PICTURES, Stage, type StageOptions } from './stage.js';

/** Row height in rem; rows are positioned by index, so only visible ones exist. */
const ROW_REM = 2.6;
/** Rows rendered beyond the viewport, so fast scrolling does not show gaps. */
const OVERSCAN = 6;
/**
 * While the selection moves faster than this (a held direction), the stage waits for it to
 * settle. Rebuilding it and loading its art on every step was measured at 20 fps on a
 * Raspberry Pi 5 holding down; a single press still updates it at once.
 */
const DETAIL_SETTLE_MS = 150;
/** After this long resting on a game, the list fades away and leaves the game the screen. */
const RAIL_REST_MS = 2400;
/**
 * After this long on a game, the pictures of the games around it are made ahead (by Forma, in
 * the background, after what the screen waits for), this many either side: the next moves show
 * at once.
 */
const PREPARE_AFTER_MS = 400;
const PREPARE_AROUND = 3;

/**
 * A game list of any length as a thin rail at the screen's edge, over the selected game's
 * stage. The rail fades away while the player rests on a game and is back on any move.
 */
export class GamesView {
  readonly root = el('div', { class: 'games' });
  readonly #list = el('div', { class: 'list', role: 'listbox' });
  readonly #spacer = el('div', { class: 'spacer' });
  readonly #stage: Stage;
  #restTimer: ReturnType<typeof setTimeout> | undefined;
  #rows = new Map<number, HTMLElement>();
  #source: LazyList<Game> | null = null;
  #selected = 0;
  #detailTimer: ReturnType<typeof setTimeout> | undefined;
  #prepareTimer: ReturnType<typeof setTimeout> | undefined;
  readonly #options: StageOptions;
  #lastMove = 0;
  #pending = false;

  constructor(options: StageOptions) {
    this.#options = options;
    this.#stage = new Stage(options);
    this.#list.append(this.#spacer);
    this.root.append(this.#stage.backdrop, this.#stage.root, this.#list);
    this.#list.addEventListener('scroll', () => this.render(), { passive: true });
  }

  /** Preview videos after a short pause on a game; Interface → Video previews. */
  get previews(): boolean {
    return this.#stage.previews;
  }

  set previews(on: boolean) {
    this.#stage.previews = on;
  }

  show(source: LazyList<Game>, selected: number): void {
    this.#source = source;
    this.#rows.forEach((row) => row.remove());
    this.#rows.clear();
    this.#spacer.style.height = `${source.total * ROW_REM}rem`;
    this.#selected = -1;
    this.select(selected);
  }

  get selected(): Game | undefined {
    return this.#source?.get(this.#selected);
  }

  /** Rows that fit in the viewport: the distance a page jump moves. */
  pageSize(): number {
    return Math.max(1, Math.floor(this.#list.clientHeight / (ROW_REM * remPx())));
  }

  select(index: number): void {
    const changed = index !== this.#selected;
    this.#selected = index;
    const row = ROW_REM * remPx();
    // The selection kept in the middle of the rail, its neighbours fading out around it.
    this.#list.scrollTop = Math.max(0, index * row - (this.#list.clientHeight - row) / 2);
    this.render();
    this.#wake();
    if (changed) this.#scheduleDetail();
  }

  /** The rail back, and away again after a rest. */
  #wake(): void {
    this.root.classList.remove('resting');
    clearTimeout(this.#restTimer);
    this.#restTimer = setTimeout(() => this.root.classList.add('resting'), RAIL_REST_MS);
  }

  #scheduleDetail(): void {
    const now = performance.now();
    const fast = now - this.#lastMove < DETAIL_SETTLE_MS;
    this.#lastMove = now;
    clearTimeout(this.#detailTimer);
    if (fast) {
      this.#detailTimer = setTimeout(() => this.#showDetail(), DETAIL_SETTLE_MS);
    } else {
      this.#showDetail();
    }
  }

  /** Draws the visible rows, from whatever is loaded; called again as pages arrive. */
  render(): void {
    const source = this.#source;
    if (!source) return;
    const row = ROW_REM * remPx();
    const first = Math.max(0, Math.floor(this.#list.scrollTop / row) - OVERSCAN);
    const last = Math.min(
      source.total - 1,
      Math.ceil((this.#list.scrollTop + this.#list.clientHeight) / row) + OVERSCAN
    );
    for (const [i, node] of this.#rows) {
      if (i < first || i > last) {
        node.remove();
        this.#rows.delete(i);
      }
    }
    for (let i = first; i <= last; i++) {
      const game = source.get(i);
      let node = this.#rows.get(i);
      if (!node) {
        node = el('div', { class: 'row', role: 'option' });
        node.style.top = `${i * ROW_REM}rem`;
        this.#list.append(node);
        this.#rows.set(i, node);
      }
      const label = game ? `${game.favorite ? '★ ' : ''}${game.name}` : '…';
      if (node.textContent !== label) node.textContent = label;
      node.classList.toggle('selected', i === this.#selected);
      node.setAttribute('aria-selected', String(i === this.#selected));
    }
    if (this.#pending && this.selected) this.#showDetail();
  }

  /** Redraws the selected game after it changed, e.g. a favourite toggled. */
  refreshSelected(game: Game): void {
    this.#source?.set(this.#selected, game);
    this.render();
    this.#showDetail();
  }

  #showDetail(): void {
    const game = this.selected;
    this.#pending = !game;
    if (game) this.#stage.show(game);
    else this.#stage.clear();
    clearTimeout(this.#prepareTimer);
    if (game) this.#prepareTimer = setTimeout(() => this.#prepareAround(), PREPARE_AFTER_MS);
  }

  /** The pictures of the games either side of the selection, nearest first, made ahead. */
  #prepareAround(): void {
    const prepare = this.#options.prepare;
    const source = this.#source;
    if (!prepare || !source) return;
    const items: { gameId: number; kind: (typeof STAGE_PICTURES)[number][0]; width: number }[] = [];
    for (let d = 1; d <= PREPARE_AROUND; d++) {
      for (const i of [this.#selected + d, this.#selected - d]) {
        const game = i >= 0 && i < source.total ? source.get(i) : undefined;
        if (!game) continue;
        const has = game.media as Partial<Record<string, string>>;
        for (const [kind, width] of STAGE_PICTURES) {
          if (has[kind]) items.push({ gameId: game.id, kind, width });
        }
      }
    }
    if (items.length) prepare(items);
  }

  /** The list leaves the screen (another view, or a game starts): its video stops. */
  leave(): void {
    clearTimeout(this.#detailTimer);
    clearTimeout(this.#prepareTimer);
    this.#stage.clear();
  }

  /** Back on the list after a game: the selected game's stage again. */
  resume(): void {
    if (this.#source) this.#showDetail();
  }

  /** Video sound was turned on or off in Forma's menu. */
  soundChanged(): void {
    this.#stage.soundChanged();
  }
}
