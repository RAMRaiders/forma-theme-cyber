import { el } from './dom.js';

export interface MenuItem {
  id: string;
  label: string;
  description?: string;
}

/** A simple list overlay driven by up/down/confirm/back: the system menu. */
export class Menu {
  readonly root = el('div', { class: 'overlay switcher', hidden: '' });
  #items: MenuItem[] = [];
  #rows: HTMLElement[] = [];
  selected = 0;

  get open(): boolean {
    return !this.root.hidden;
  }

  get item(): MenuItem | undefined {
    return this.#items[this.selected];
  }

  get count(): number {
    return this.#items.length;
  }

  show(title: string, items: MenuItem[]): void {
    this.#items = items;
    this.#rows = items.map((i) =>
      el(
        'li',
        { role: 'option' },
        el('span', { class: 'name' }, i.label),
        el('span', { class: 'description' }, i.description ?? '')
      )
    );
    this.root.replaceChildren(
      el(
        'div',
        { class: 'panel' },
        el('h2', {}, title),
        el('ul', { role: 'listbox' }, ...this.#rows)
      )
    );
    this.root.hidden = false;
    this.select(0);
  }

  select(index: number): void {
    this.#rows[this.selected]?.classList.remove('selected');
    this.selected = index;
    this.#rows[index]?.classList.add('selected');
    // The menu is taller than a small screen: the selection scrolls into view.
    this.#rows[index]?.scrollIntoView({ block: 'nearest' });
  }

  close(): void {
    this.root.hidden = true;
  }
}
