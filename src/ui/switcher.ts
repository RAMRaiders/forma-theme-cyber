import type { ViewInfo } from '@ramraiders/forma-sdk';

import { el } from './dom.js';

/** The overlay for choosing a view, and which one Forma opens with. */
export class Switcher {
  readonly root = el('div', { class: 'overlay switcher', hidden: '' });
  #items: HTMLElement[] = [];
  #views: ViewInfo[] = [];
  selected = 0;

  get open(): boolean {
    return !this.root.hidden;
  }

  get view(): ViewInfo | undefined {
    return this.#views[this.selected];
  }

  show(views: ViewInfo[], current: string, home: string | null): void {
    this.#views = views;
    this.selected = Math.max(
      0,
      views.findIndex((v) => v.id === current)
    );
    this.#items = views.map((v) =>
      el(
        'li',
        { role: 'option' },
        el('span', { class: 'name' }, v.name),
        v.id === home ? el('span', { class: 'badge' }, 'Home') : null,
        v.id === current ? el('span', { class: 'badge current' }, 'Showing') : null,
        el('span', { class: 'description' }, v.description ?? '')
      )
    );
    this.root.replaceChildren(
      el(
        'div',
        { class: 'panel' },
        el('h2', {}, 'Views'),
        el('ul', { role: 'listbox' }, ...this.#items)
      )
    );
    this.root.hidden = false;
    this.select(this.selected);
  }

  select(index: number): void {
    this.#items[this.selected]?.classList.remove('selected');
    this.selected = index;
    this.#items[index]?.classList.add('selected');
    this.#items[index]?.scrollIntoView({ block: 'nearest' });
  }

  get count(): number {
    return this.#views.length;
  }

  close(): void {
    this.root.hidden = true;
  }
}
