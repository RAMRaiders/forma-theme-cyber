import type { InputEvent } from '@ramraiders/forma-sdk';
import { FormaError } from '@ramraiders/forma-sdk';

import { moveList } from '../logic/nav.js';
import { el } from './dom.js';
import { type Ask, Keyboard } from './keyboard.js';

export interface Row {
  label: string;
  detail?: string;
  /** A, or nothing for a row that only shows something. */
  run?: () => unknown;
  /** Left/right, for switches and choices. */
  adjust?: (step: -1 | 1) => unknown;
  /** Y: a second action on the row (e.g. remove). */
  alt?: { label: string; run: () => unknown };
  /** Starts a group of rows, with this heading. */
  heading?: string;
}

/**
 * A settings page over the screen: a title, a note, rows. A runs a row, left/right adjusts it,
 * B goes back. Rows come from `build`, called again after every change, so they always show
 * what Forma says now; the selection stays where it was.
 */
export class Page {
  readonly keyboard = new Keyboard();
  readonly root = el('div', { class: 'overlay switcher page', hidden: '' });
  #title = '';
  #build: () => Row[] | Promise<Row[]> = () => [];
  #rows: Row[] = [];
  #selected = 0;
  #busy: string | null = null;
  #note: string | null = null;

  constructor(
    private readonly notify: (message: string) => void,
    /** After every change on screen, so the button hints can follow. */
    private readonly changed: () => void
  ) {}

  get open(): boolean {
    return !this.root.hidden;
  }

  async show(title: string, build: () => Row[] | Promise<Row[]>, note?: string): Promise<void> {
    this.#title = title;
    this.#build = build;
    this.#note = note ?? null;
    this.#selected = 0;
    this.#rows = [];
    this.root.hidden = false;
    await this.refresh();
  }

  close(): void {
    this.root.hidden = true;
    this.changed();
  }

  /** Builds the rows again from what Forma says now. */
  async refresh(): Promise<void> {
    // The selection follows its row: playing something adds rows above it, and A again must not
    // land on whatever moved into its place (Stop, say).
    const was = this.#rows[this.#selected]?.label;
    try {
      this.#rows = await this.#build();
      const same = this.#rows.findIndex((r) => r.label === was);
      if (same >= 0) this.#selected = same;
    } catch (error) {
      this.#rows = [];
      this.#note = FormaError.from(error).message;
    }
    this.#render();
  }

  /** Runs a change with the page showing `label`, then reads everything again. */
  async run(label: string, work: () => Promise<string | void>): Promise<void> {
    this.#busy = label;
    this.#render();
    try {
      const done = await work();
      if (done) this.notify(done);
    } catch (error) {
      this.notify(FormaError.from(error).message);
    } finally {
      this.#busy = null;
      await this.refresh();
    }
  }

  /** The on-screen keyboard; the page redraws after it, typed or cancelled. */
  async ask(ask: Ask): Promise<string | null> {
    const typed = await this.keyboard.ask(ask);
    this.#render();
    return typed;
  }

  hints(): [string, string][] {
    if (this.keyboard.open) return this.keyboard.hints();
    if (this.#busy) return [];
    const row = this.#rows[this.#selected];
    return [
      ...(row?.run ? [['A', 'Choose'] as [string, string]] : []),
      ...(row?.adjust ? [['◀ ▶', 'Change'] as [string, string]] : []),
      ...(row?.alt ? [['Y', row.alt.label] as [string, string]] : []),
      ['B', 'Back']
    ];
  }

  input(e: InputEvent): void {
    if (this.keyboard.open) return this.keyboard.input(e);
    if (!e.pressed || this.#busy) return;
    if (e.action === 'up' || e.action === 'down') {
      this.#selected = moveList(this.#selected, this.#rows.length, e.action, 6, e.repeat);
      return this.#render();
    }
    const row = this.#rows[this.#selected];
    if ((e.action === 'left' || e.action === 'right') && row?.adjust) {
      void row.adjust(e.action === 'left' ? -1 : 1);
      return;
    }
    if (e.repeat) return;
    if (e.action === 'confirm') void row?.run?.();
    else if (e.action === 'north') void row?.alt?.run();
    else if (e.action === 'back') this.close();
  }

  #render(): void {
    this.#selected = Math.min(this.#selected, Math.max(0, this.#rows.length - 1));
    const note = this.#busy ?? this.#note;
    const items: HTMLElement[] = [];
    this.#rows.forEach((row, i) => {
      if (row.heading)
        items.push(el('li', { class: 'heading', role: 'presentation' }, row.heading));
      items.push(
        el(
          'li',
          {
            role: 'option',
            class: [i === this.#selected ? 'selected' : '', row.run || row.adjust ? '' : 'info']
              .filter(Boolean)
              .join(' ')
          },
          el('span', { class: 'name' }, row.label),
          row.adjust ? el('span', { class: 'adjust', 'aria-hidden': 'true' }, '◀ ▶') : '',
          el('span', { class: 'description' }, row.detail ?? '')
        )
      );
    });
    this.root.replaceChildren(
      el(
        'div',
        { class: 'panel' },
        el('h2', {}, this.#title),
        note ? el('p', { class: 'note' }, note) : null,
        el('ul', { role: 'listbox' }, ...(this.#busy ? [] : items))
      ),
      this.keyboard.root
    );
    this.root.querySelector('li.selected')?.scrollIntoView({ block: 'nearest' });
    this.changed();
  }
}

/** A Batocera switch shown and flipped: `'1'` is on. */
export const onOff = (value: string | null): string => (value === '1' ? 'On' : 'Off');
