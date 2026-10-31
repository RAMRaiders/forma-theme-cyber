import type { CyberSystem, InfoStore, SystemInfo } from '../data/catalog.js';
import { circuitSvg } from './circuit.js';
import { el } from './dom.js';

/** A curiosity stays this long before the next one. */
const FACT_MS = 10_000;

const SPECS: [keyof NonNullable<SystemInfo['specs']>, string][] = [
  ['released', 'Released'],
  ['cpu', 'CPU'],
  ['memory', 'Memory'],
  ['graphics', 'Graphics'],
  ['sound', 'Sound'],
  ['media', 'Media'],
  ['unitsSold', 'Sold']
];

/**
 * A category's systems: a list on one side, the selected system on the other (logo, console,
 * story, specs, curiosities), and its circuit board behind everything.
 */
export class SystemView {
  readonly root = el('div', { class: 'systems' });
  readonly #list = el('ul', { class: 'system-list', role: 'listbox' });
  readonly #panel = el('section', { class: 'system-panel', 'aria-live': 'polite' });
  #rows: HTMLElement[] = [];
  #systems: CyberSystem[] = [];
  #selected = -1;
  #info: SystemInfo | null = null;
  #fact = 0;
  #factTimer: ReturnType<typeof setInterval> | undefined;
  /** Which selection a pending info load belongs to: a quick scroll must not show a stale one. */
  #ticket = 0;

  constructor(
    private readonly infos: InfoStore,
    /** Shows a board behind the whole screen (the app's backdrop). */
    private readonly backdrop: (svg: string) => void
  ) {
    this.root.append(this.#list, this.#panel);
  }

  get selected(): CyberSystem | undefined {
    return this.#systems[this.#selected];
  }

  get count(): number {
    return this.#systems.length;
  }

  show(systems: CyberSystem[], selected: number): void {
    this.#systems = systems;
    this.#rows = systems.map(row);
    this.#list.replaceChildren(...this.#rows);
    this.#selected = -1;
    this.select(selected);
  }

  select(index: number): void {
    this.#rows[this.#selected]?.classList.remove('selected');
    this.#selected = index;
    const r = this.#rows[index];
    const system = this.#systems[index];
    if (!r || !system) return;
    r.classList.add('selected');
    r.scrollIntoView({ block: 'nearest' });
    const ticket = ++this.#ticket;
    this.#info = null;
    this.#render(system);
    void this.infos.get(system.summary.name).then((info) => {
      if (ticket !== this.#ticket) return;
      this.#info = info;
      this.#fact = 0;
      this.#render(system);
    });
  }

  /** The next curiosity, now (Y), instead of waiting. */
  nextFact(): void {
    const facts = this.#info?.curiosities ?? [];
    if (facts.length < 2) return;
    this.#fact = (this.#fact + 1) % facts.length;
    const system = this.selected;
    if (system) this.#render(system);
  }

  /** Stops the curiosity timer when the screen goes away. */
  hide(): void {
    clearInterval(this.#factTimer);
  }

  #render(system: CyberSystem): void {
    const s = system.summary;
    const info = this.#info;
    this.backdrop(circuitSvg(s.name, info?.chips ?? []));

    const logo = el('img', { class: 'logo', src: system.logo, alt: '' });
    const title = el('h2', { class: 'name' }, info?.name ?? s.fullname ?? s.name);
    // No logo file: the name stands alone.
    logo.addEventListener('error', () => logo.remove());
    const photo = el('img', { class: 'photo', src: system.photo, alt: '' });
    photo.addEventListener('error', () => photo.remove());

    const maker = info?.specs?.maker ?? s.manufacturer;
    const year = s.releaseYear ? String(s.releaseYear) : null;
    const byline = [maker, year].filter(Boolean).join(' · ');
    const facts = info?.curiosities ?? [];
    const fact = facts[this.#fact % Math.max(1, facts.length)];

    const specs = SPECS.flatMap(([key, label]) => {
      const value = info?.specs?.[key];
      return value ? [el('dt', {}, label), el('dd', {}, value)] : [];
    });

    const parts: (HTMLElement | null)[] = [
      el('div', { class: 'heading' }, logo, title),
      el(
        'p',
        { class: 'byline' },
        `${byline}${byline ? ' · ' : ''}${s.gameCount.toLocaleString('en')} games`
      ),
      el('div', { class: 'media' }, photo),
      info?.description ? el('p', { class: 'description' }, info.description) : null,
      specs.length ? el('dl', { class: 'specs' }, ...specs) : null,
      fact
        ? el(
            'aside',
            { class: 'fact' },
            el(
              'span',
              { class: 'label' },
              `Did you know? ${(this.#fact % facts.length) + 1}/${facts.length}`
            ),
            el('p', {}, fact)
          )
        : null
    ];
    this.#panel.replaceChildren(...parts.filter((p) => p !== null));

    clearInterval(this.#factTimer);
    if (facts.length > 1) this.#factTimer = setInterval(() => this.nextFact(), FACT_MS);
  }
}

function row(system: CyberSystem): HTMLElement {
  const s = system.summary;
  return el(
    'li',
    { role: 'option' },
    el('span', { class: 'name' }, s.fullname || s.name),
    el('span', { class: 'count' }, s.gameCount.toLocaleString('en'))
  );
}
