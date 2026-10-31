import type { InputEvent } from '@ramraiders/forma-sdk';

import { el } from './dom.js';

export type Layout = 'text' | 'address';

export interface Ask {
  title: string;
  value?: string;
  /** Shown as dots until Y reveals it. */
  secret?: boolean;
  /** `address`: digits and dots, for IP addresses. */
  layout?: Layout;
}

type Special = 'shift' | 'symbols' | 'space' | 'delete' | 'done';
type Key = { char: string } | { special: Special; label: string };

const LETTERS = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm-_.'];
const SYMBOLS = ['1234567890', '!@#$%^&*()', `'"/\\:;?+=`, ',<>[]{}|~`'];
const DIGITS = ['123', '456', '789', '.0'];

/**
 * A keyboard for the gamepad: the d-pad moves, A types, B deletes (or cancels when empty), X
 * switches case, Y shows a password, Start finishes. A real keyboard types straight in, and
 * Enter finishes.
 */
export class Keyboard {
  readonly root = el('div', { class: 'overlay keyboard', hidden: '' });
  #ask: Ask = { title: '' };
  #value = '';
  #upper = false;
  #symbols = false;
  #reveal = false;
  #row = 0;
  #col = 0;
  #rows: Key[][] = [];
  #field = el('div', { class: 'field' });
  #grid = el('div', { class: 'keys' });
  #resolve: ((value: string | null) => void) | null = null;
  readonly #onKey = (e: KeyboardEvent) => this.#typed(e);

  get open(): boolean {
    return !this.root.hidden;
  }

  /** The text typed, or `null` when cancelled. */
  ask(ask: Ask): Promise<string | null> {
    this.#resolve?.(null);
    this.#ask = ask;
    this.#value = ask.value ?? '';
    this.#upper = false;
    this.#symbols = false;
    this.#reveal = !ask.secret;
    this.#row = ask.layout === 'address' ? 0 : 1;
    this.#col = 0;
    this.root.replaceChildren(
      el('div', { class: 'panel' }, el('h2', {}, ask.title), this.#field, this.#grid)
    );
    this.root.hidden = false;
    window.addEventListener('keydown', this.#onKey);
    this.#render();
    return new Promise((resolve) => (this.#resolve = resolve));
  }

  hints(): [string, string][] {
    return [
      ['A', 'Type'],
      ['B', this.#value ? 'Delete' : 'Cancel'],
      ...(this.#ask.layout === 'address' ? [] : [['X', 'Shift'] as [string, string]]),
      ...(this.#ask.secret ? [['Y', this.#reveal ? 'Hide' : 'Show'] as [string, string]] : []),
      ['Start', 'Done']
    ];
  }

  input(e: InputEvent): void {
    if (!e.pressed) return;
    switch (e.action) {
      case 'up':
      case 'down':
        return this.#moveRow(e.action === 'up' ? -1 : 1);
      case 'left':
      case 'right': {
        const width = this.#rows[this.#row]!.length;
        this.#col = (this.#col + (e.action === 'left' ? -1 : 1) + width) % width;
        return this.#render();
      }
      default:
    }
    if (e.repeat && e.action !== 'back') return;
    switch (e.action) {
      // Enter on a real keyboard finishes; A on a pad types the key under the cursor.
      case 'confirm':
        return e.gamepad === -1 ? this.#finish(this.#value) : this.#press();
      case 'back':
        return this.#value ? this.#edit(this.#value.slice(0, -1)) : this.#finish(null);
      case 'west':
        this.#upper = !this.#upper;
        return this.#render();
      case 'north':
        if (this.#ask.secret) this.#reveal = !this.#reveal;
        return this.#render();
      case 'start':
        return this.#finish(this.#value);
      default:
    }
  }

  #layout(): Key[][] {
    const chars = (rows: string[]) =>
      rows.map((r) => [...r].map((c) => ({ char: this.#upper ? c.toUpperCase() : c })));
    if (this.#ask.layout === 'address') {
      return [
        ...chars(DIGITS),
        [
          { special: 'delete', label: '⌫' },
          { special: 'done', label: 'Done' }
        ]
      ];
    }
    return [
      ...chars(this.#symbols ? SYMBOLS : LETTERS),
      [
        { special: 'shift', label: this.#upper ? 'abc' : 'ABC' },
        { special: 'symbols', label: this.#symbols ? 'abc' : '#+=' },
        { special: 'space', label: 'Space' },
        { special: 'delete', label: '⌫' },
        { special: 'done', label: 'Done' }
      ]
    ];
  }

  #moveRow(step: number): void {
    const from = this.#rows[this.#row]!.length;
    this.#row = (this.#row + step + this.#rows.length) % this.#rows.length;
    // Keep roughly the same place across rows of different widths.
    const to = this.#rows[this.#row]!.length;
    this.#col = Math.min(to - 1, Math.round((this.#col / Math.max(1, from - 1)) * (to - 1)));
    this.#render();
  }

  #press(): void {
    const key = this.#rows[this.#row]?.[this.#col];
    if (!key) return;
    if ('char' in key) return this.#edit(this.#value + key.char);
    switch (key.special) {
      case 'shift':
        this.#upper = !this.#upper;
        return this.#render();
      case 'symbols':
        this.#symbols = !this.#symbols;
        return this.#render();
      case 'space':
        return this.#edit(`${this.#value} `);
      case 'delete':
        return this.#edit(this.#value.slice(0, -1));
      case 'done':
        return this.#finish(this.#value);
    }
  }

  /** Printable keys from a real keyboard; the SDK already turns arrows, Enter and Backspace
   * into actions. */
  #typed(e: KeyboardEvent): void {
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    this.#edit(this.#value + e.key);
  }

  #edit(value: string): void {
    this.#value = value;
    this.#render();
  }

  #finish(value: string | null): void {
    window.removeEventListener('keydown', this.#onKey);
    this.root.hidden = true;
    const resolve = this.#resolve;
    this.#resolve = null;
    resolve?.(value);
  }

  #render(): void {
    this.#rows = this.#layout();
    this.#row = Math.min(this.#row, this.#rows.length - 1);
    this.#col = Math.min(this.#col, this.#rows[this.#row]!.length - 1);
    const shown = this.#reveal ? this.#value : '•'.repeat([...this.#value].length);
    this.#field.replaceChildren(el('span', {}, shown), el('span', { class: 'caret' }));
    this.#grid.replaceChildren(
      ...this.#rows.map((row, r) =>
        el(
          'div',
          { class: 'row' },
          ...row.map((key, c) =>
            el(
              'span',
              {
                class: [
                  'key',
                  'special' in key ? `wide ${key.special}` : '',
                  r === this.#row && c === this.#col ? 'selected' : ''
                ]
                  .filter(Boolean)
                  .join(' ')
              },
              'char' in key ? key.char : key.label
            )
          )
        )
      )
    );
  }
}
