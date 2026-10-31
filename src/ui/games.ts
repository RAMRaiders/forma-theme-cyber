import type { Game } from '@ramraiders/forma-sdk';

import type { LazyList } from '../logic/pager.js';
import { el, remPx } from './dom.js';

/** Row height in rem; rows are positioned by index, so only visible ones exist. */
const ROW_REM = 2.6;
/** Rows rendered beyond the viewport, so fast scrolling does not show gaps. */
const OVERSCAN = 6;
/** Wait before the video preview starts, so scrolling past a game does not start it. */
const VIDEO_DELAY_MS = 900;
/**
 * While the selection moves faster than this (a held direction), the detail panel waits for
 * it to settle. Rebuilding the panel and loading its art on every step was measured at 20 fps
 * on a Raspberry Pi 5 holding down; a single press still updates it at once.
 */
const DETAIL_SETTLE_MS = 150;

/** A game list of any length, beside the selected game's details. */
export class GamesView {
  readonly root = el('div', { class: 'games' });
  readonly #list = el('div', { class: 'list', role: 'listbox' });
  readonly #spacer = el('div', { class: 'spacer' });
  readonly #detail = el('aside', { class: 'detail' });
  #rows = new Map<number, HTMLElement>();
  #source: LazyList<Game> | null = null;
  #selected = 0;
  #videoTimer: ReturnType<typeof setTimeout> | undefined;
  #detailTimer: ReturnType<typeof setTimeout> | undefined;
  #lastMove = 0;

  /** `imageUrl` picks the art for the detail panel, at the size the panel shows it. */
  /** Preview videos after a short pause on a game; Interface → Video previews. */
  previews = true;

  constructor(private readonly imageUrl: (game: Game) => string | null) {
    this.#list.append(this.#spacer);
    this.root.append(this.#list, this.#detail);
    this.#list.addEventListener('scroll', () => this.render(), { passive: true });
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
    if (this.#detail.dataset.pending === 'true' && this.selected) this.#showDetail();
  }

  /** Redraws the selected game after it changed, e.g. a favourite toggled. */
  refreshSelected(game: Game): void {
    this.#source?.set(this.#selected, game);
    this.render();
    this.#showDetail();
  }

  #showDetail(): void {
    clearTimeout(this.#videoTimer);
    const game = this.selected;
    this.#detail.dataset.pending = String(!game);
    if (!game) {
      this.#detail.replaceChildren();
      return;
    }
    const image = this.imageUrl(game);
    const art = el('div', { class: 'art' });
    if (image) {
      const img = el('img', { src: image, alt: '', decoding: 'async' });
      // Scraped paths go stale; an empty frame beats a broken-image icon.
      img.addEventListener('error', () => img.remove());
      art.append(img);
    }

    const facts = [
      game.releaseDate?.slice(0, 4),
      game.genre,
      game.players ? `${game.players} players` : null,
      game.developer
    ].filter((f): f is string => Boolean(f));
    const stats = [
      game.rating !== null ? stars(game.rating) : null,
      game.playCount > 0 ? `Played ${game.playCount}×` : 'Never played',
      game.gameTime > 0 ? playtime(game.gameTime) : null
    ].filter((s): s is string => Boolean(s));

    this.#detail.replaceChildren(
      art,
      el('h2', {}, game.favorite ? `★ ${game.name}` : game.name),
      el('p', { class: 'facts' }, facts.join(' · ')),
      el('p', { class: 'stats' }, stats.join(' · ')),
      el('p', { class: 'description' }, game.description ?? '')
    );

    const video = this.previews ? game.media.video : undefined;
    if (video) {
      this.#videoTimer = setTimeout(() => {
        const player = el('video', {
          src: video,
          muted: '',
          autoplay: '',
          loop: '',
          playsinline: ''
        });
        player.muted = true;
        // The screenshot stays until the video really plays: a box without a decoder for it
        // (a Pi 5 has no H.264 hardware) would otherwise show an empty frame.
        player.hidden = true;
        player.addEventListener('playing', () => {
          player.hidden = false;
          art.replaceChildren(player);
        });
        player.addEventListener('error', () => player.remove());
        art.append(player);
      }, VIDEO_DELAY_MS);
    }
  }
}

function stars(rating: number): string {
  const n = Math.round(rating * 5);
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function playtime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}
