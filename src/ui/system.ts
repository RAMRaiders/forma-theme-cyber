import type { CategoryId, CyberSystem, InfoStore, SystemInfo } from '../data/catalog.js';
import { categoryArt } from './art.js';
import { circuitSvg } from './circuit.js';
import { el } from './dom.js';

/** A curiosity stays this long before the next one. */
const FACT_MS = 10_000;
/** The board follows the selection once it rests: holding a direction does not redraw it. */
const BOARD_MS = 150;

type Spec = keyof NonNullable<SystemInfo['specs']>;

/** The callouts round the console, as on a schematic: three each side. */
const LEFT: [Spec, string][] = [
  ['cpu', 'CPU'],
  ['memory', 'Memory'],
  ['graphics', 'Graphics']
];
const RIGHT: [Spec, string][] = [
  ['sound', 'Sound'],
  ['media', 'Media'],
  ['unitsSold', 'Sold']
];

/** Each category's own colour, as on its home tile. */
const CATEGORY_RGB: Record<CategoryId, string> = {
  consoles: '34 228 255',
  handhelds: '61 255 160',
  computers: '255 181 71',
  arcade: '255 46 136',
  virtual: '182 255 61',
  educational: '255 227 71',
  ports: '255 122 61',
  engines: '167 123 255'
};

/** A maker's colour, in neon: the screen takes it on when one of theirs is selected. */
const MAKER_RGB: [RegExp, string][] = [
  [/^sega/i, '47 140 255'],
  [/^nintendo/i, '255 59 78'],
  [/^sony/i, '125 107 255'],
  [/^microsoft/i, '61 255 110'],
  [/^atari/i, '255 122 46'],
  [/^nec/i, '255 159 46'],
  [/^snk/i, '255 201 61'],
  [/^bandai/i, '255 90 180'],
  [/^commodore/i, '77 195 255'],
  [/^amstrad/i, '255 77 77'],
  [/^sinclair/i, '255 210 61'],
  [/^(the )?3do|^panasonic/i, '255 176 61'],
  [/^philips|^magnavox/i, '61 155 255'],
  [/^coleco|^mattel/i, '90 180 255'],
  [/^(bally|sammy|epoch|casio)/i, '255 105 200']
];

/** The colour the screen takes for a system: its maker's, else its category's. */
export function systemRgb(maker: string | undefined | null, category: CategoryId): string {
  const known = maker ? MAKER_RGB.find(([re]) => re.test(maker.trim())) : undefined;
  return known?.[1] ?? CATEGORY_RGB[category];
}

/**
 * A category's systems: a rail of logos on the left, kept centred on the selection, and the
 * selected system on a stage: its console, lit and reflected on a neon floor, its specs as
 * callouts round it, its year writ large behind, its story above and its curiosities on a strip
 * below. The whole screen takes the maker's colour. The system's circuit board stays behind.
 */
export class SystemView {
  readonly root = el('div', { class: 'systems' });
  readonly #rail = el('div', { class: 'system-rail' });
  readonly #list = el('ul', { class: 'system-list', role: 'listbox' });
  readonly #panel = el('section', { class: 'system-panel', 'aria-live': 'polite' });
  #rows: HTMLElement[] = [];
  #systems: CyberSystem[] = [];
  #selected = -1;
  #info: SystemInfo | null = null;
  #fact = 0;
  #factTimer: ReturnType<typeof setInterval> | undefined;
  #boardTimer: ReturnType<typeof setTimeout> | undefined;
  /** Curiosities move on by themselves; Interface → Rotate curiosities. */
  rotateFacts = true;
  /** Which selection a pending info load belongs to: a quick scroll must not show a stale one. */
  #ticket = 0;

  constructor(
    private readonly infos: InfoStore,
    /** Shows a board behind the whole screen (the app's backdrop). */
    private readonly backdrop: (svg: string) => void
  ) {
    this.#rail.append(this.#list);
    this.root.append(this.#rail, this.#panel);
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
    this.select(selected, true);
  }

  /** `now`: draw the board at once (entering the screen), not after the selection rests. */
  select(index: number, now = false): void {
    this.#rows[this.#selected]?.classList.remove('selected');
    this.#selected = index;
    const r = this.#rows[index];
    const system = this.#systems[index];
    if (!r || !system) return;
    r.classList.add('selected');
    this.#centre(r);
    const ticket = ++this.#ticket;
    const show = (info: SystemInfo | null) => {
      this.#info = info;
      this.#fact = 0;
      this.#render(system);
      this.#drawBoard(system, now ? 0 : BOARD_MS);
    };
    // Loaded with the catalogue, so normally at hand: drawn once, never first without its info.
    const known = this.infos.peek(system.summary.name);
    if (known !== undefined) return show(known);
    void this.infos.get(system.summary.name).then((info) => {
      if (ticket === this.#ticket) show(info);
    });
  }

  /** The next curiosity, now (Y), instead of waiting. */
  nextFact(): void {
    const facts = this.#info?.curiosities ?? [];
    if (facts.length < 2) return;
    this.#fact = (this.#fact + 1) % facts.length;
    this.#renderFact();
  }

  /** Stops the curiosity timer when the screen goes away. */
  hide(): void {
    clearInterval(this.#factTimer);
    clearTimeout(this.#boardTimer);
  }

  /** The rail slides so the selected logo sits in its middle (a transform: cheap on a Pi). */
  #centre(row: HTMLElement): void {
    const rail = this.#rail.clientHeight;
    if (rail === 0) return;
    const middle = row.offsetTop + row.offsetHeight / 2;
    const max = Math.max(0, this.#list.scrollHeight - rail);
    const y = Math.min(max, Math.max(0, middle - rail / 2));
    this.#list.style.transform = `translateY(${-y}px)`;
  }

  #drawBoard(system: CyberSystem, delay: number): void {
    clearTimeout(this.#boardTimer);
    const chips = this.#info?.chips ?? [];
    const draw = () => this.backdrop(circuitSvg(system.summary.name, chips));
    if (delay === 0) draw();
    else this.#boardTimer = setTimeout(draw, delay);
  }

  #render(system: CyberSystem): void {
    const s = system.summary;
    const info = this.#info;
    const maker = info?.specs?.maker ?? s.manufacturer;
    this.root.style.setProperty('--sys-rgb', systemRgb(maker, system.category));

    const logo = el('img', { class: 'logo', src: system.logo, alt: '' });
    logo.addEventListener('error', () => logo.remove());
    const title = el('h2', { class: 'name' }, info?.name ?? s.fullname ?? s.name);

    // The console; without a photo, the category's own neon drawing stands in.
    const stage = el('div', { class: 'console' });
    const photo = el('img', { class: 'photo', src: system.photo, alt: '' });
    photo.addEventListener('error', () => {
      photo.remove();
      const art = el('div', { class: 'art' });
      art.innerHTML = categoryArt(system.category);
      stage.append(art);
    });
    stage.append(photo);

    const year = s.releaseYear ? String(s.releaseYear) : null;
    const byline = [maker, info?.specs?.released ?? year].filter(Boolean).join(' · ');
    const callouts = (side: 'left' | 'right', specs: [Spec, string][]) => {
      const items = specs.flatMap(([key, label], n) => {
        const value = info?.specs?.[key];
        return value
          ? [
              el(
                'div',
                { class: 'spec', style: `--n: ${n}` },
                el('dt', {}, label),
                el('dd', {}, value)
              )
            ]
          : [];
      });
      return items.length ? el('dl', { class: `specs specs-${side}` }, ...items) : null;
    };

    const parts: (HTMLElement | null)[] = [
      year ? el('div', { class: 'year', 'aria-hidden': 'true' }, year) : null,
      el('div', { class: 'floor', 'aria-hidden': 'true' }),
      el(
        'div',
        { class: 'intro' },
        el('div', { class: 'heading' }, logo, title),
        byline ? el('p', { class: 'byline' }, byline) : null,
        info?.description ? el('p', { class: 'description' }, info.description) : null
      ),
      el(
        'div',
        { class: 'tally' },
        el('span', { class: 'count' }, s.gameCount.toLocaleString('en')),
        el('span', { class: 'unit' }, s.gameCount === 1 ? 'game' : 'games'),
        el(
          'span',
          { class: 'index' },
          `${String(this.#selected + 1).padStart(2, '0')} / ${String(this.#systems.length).padStart(2, '0')}`
        )
      ),
      el('div', { class: 'showcase' }, callouts('left', LEFT), stage, callouts('right', RIGHT)),
      el('aside', { class: 'fact' })
    ];
    this.#panel.replaceChildren(...parts.filter((p) => p !== null));
    this.#renderFact();
  }

  #renderFact(): void {
    const box = this.#panel.querySelector<HTMLElement>('.fact');
    if (!box) return;
    const facts = this.#info?.curiosities ?? [];
    const fact = facts[this.#fact % Math.max(1, facts.length)];
    box.hidden = !fact;
    box.replaceChildren(
      ...(fact
        ? [
            el(
              'span',
              { class: 'label' },
              `Did you know? ${(this.#fact % facts.length) + 1}/${facts.length}`
            ),
            el('p', {}, fact),
            // How long until the next one, when they move on by themselves.
            facts.length > 1 && this.rotateFacts
              ? el('span', { class: 'timer', style: `--fact-ms: ${FACT_MS}ms` })
              : null
          ].filter((p) => p !== null)
        : [])
    );
    clearInterval(this.#factTimer);
    if (facts.length > 1 && this.rotateFacts) {
      this.#factTimer = setInterval(() => this.nextFact(), FACT_MS);
    }
  }
}

function row(system: CyberSystem): HTMLElement {
  const s = system.summary;
  const logo = el('img', { class: 'logo', src: system.logo, alt: '' });
  const item = el(
    'li',
    { role: 'option' },
    logo,
    el('span', { class: 'name' }, s.fullname || s.name),
    el('span', { class: 'count' }, s.gameCount.toLocaleString('en'))
  );
  // Without a logo the name shows in its place.
  logo.addEventListener('error', () => {
    logo.remove();
    item.classList.add('no-logo');
  });
  return item;
}
