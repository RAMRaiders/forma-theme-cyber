import { el, reveal } from './dom.js';

export interface Card {
  key: string;
  label: string;
  count: number;
  image: string | null;
}

/** Groups and menu branches, as a grid of cards. */
export class GridView {
  readonly root = el('div', { class: 'grid', role: 'listbox' });
  #cards: HTMLElement[] = [];
  #selected = -1;

  show(cards: Card[], selected: number): void {
    this.#cards = cards.map((c) => card(c));
    this.root.replaceChildren(...this.#cards);
    this.#selected = -1;
    if (cards.length === 0) {
      this.root.append(el('p', { class: 'empty' }, 'Nothing here yet.'));
    }
    this.select(selected);
  }

  select(index: number): void {
    this.#cards[this.#selected]?.classList.remove('selected');
    this.#cards[this.#selected]?.setAttribute('aria-selected', 'false');
    const card = this.#cards[index];
    this.#selected = index;
    if (!card) return;
    card.classList.add('selected');
    card.setAttribute('aria-selected', 'true');
    reveal(card, this.root, true);
  }

  /** Columns as laid out right now, for up/down movement. */
  columns(): number {
    const template = getComputedStyle(this.root).gridTemplateColumns;
    return Math.max(1, template.split(' ').filter(Boolean).length);
  }
}

function card(c: Card): HTMLElement {
  const initial = () =>
    el('div', { class: 'initial', 'aria-hidden': 'true' }, c.label.slice(0, 1).toUpperCase());
  let art: HTMLElement = initial();
  if (c.image) {
    const img = el('img', { src: c.image, alt: '', loading: 'lazy', decoding: 'async' });
    // Missing or unreadable art falls back to the letter, not a broken-image icon.
    img.addEventListener('error', () => img.replaceWith(initial()));
    art = img;
  }
  return el(
    'div',
    { class: 'card', role: 'option', 'aria-selected': 'false' },
    el('div', { class: 'art' }, art),
    el('div', { class: 'label' }, c.label),
    el('div', { class: 'count' }, `${c.count} ${c.count === 1 ? 'game' : 'games'}`)
  );
}
