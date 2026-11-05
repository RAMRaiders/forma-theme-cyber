import type { Game } from '@ramraiders/forma-sdk';

import type { LazyList } from '../logic/pager.js';
import { el, remPx } from './dom.js';
import { Showcase, type ShowcaseOptions } from './showcase.js';

/** Row height in rem; rows are positioned by index, so only visible ones exist. */
const ROW_REM = 2.6;
/** Rows rendered beyond the viewport, so fast scrolling does not show gaps. */
const OVERSCAN = 6;
/**
 * While the selection moves faster than this (a held direction), the showcase waits for it to
 * settle. Rebuilding it and loading its art on every step was measured at 20 fps on a
 * Raspberry Pi 5 holding down; a single press still updates it at once.
 */
const DETAIL_SETTLE_MS = 150;

/** A game list of any length, beside the selected game's showcase, over its fan art. */
export class GamesView {
  readonly root = el('div', { class: 'games' });
  readonly #list = el('div', { class: 'list', role: 'listbox' });
  readonly #spacer = el('div', { class: 'spacer' });
  readonly #showcase: Showcase;
  #rows = new Map<number, HTMLElement>();
  #source: LazyList<Game> | null = null;
  #selected = 0;
  #detailTimer: ReturnType<typeof setTimeout> | undefined;
  #lastMove = 0;
  #pending = false;

  constructor(options: ShowcaseOptions) {
    this.#showcase = new Showcase(options);
    this.#list.append(this.#spacer);
    this.root.append(this.#showcase.stage, this.#list, this.#showcase.root);
    this.#list.addEventListener('scroll', () => this.render(), { passive: true });
  }

  /** Preview videos after a short pause on a game; Interface → Video previews. */
  get previews(): boolean {
    return this.#showcase.previews;
  }

  set previews(on: boolean) {
    this.#showcase.previews = on;
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
    const top = index * row;
    if (top < this.#list.scrollTop) this.#list.scrollTop = top;
    else if (top + row > this.#list.scrollTop + this.#list.clientHeight) {
      this.#list.scrollTop = top + row - this.#list.clientHeight;
    }
    this.render();
    if (changed) this.#scheduleDetail();
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
    if (game) this.#showcase.show(game);
    else this.#showcase.clear();
  }
}
