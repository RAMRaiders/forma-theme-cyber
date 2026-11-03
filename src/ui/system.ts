import type { CategoryId, CyberSystem, InfoStore, SystemInfo } from '../data/catalog.js';
import { categoryArt } from './art.js';
import { circuitSvg } from './circuit.js';
import { el } from './dom.js';
import { preload, ready } from './preload.js';

/** A curiosity stays this long before the next one. */
const FACT_MS = 10_000;
/**
 * The board follows the selection once it has rested a while: a new board is a full-screen
 * drawing, costly on a Pi, so moving through the rail does not redraw it at every step.
 */
const BOARD_MS = 450;
/** How long what was shown takes to fade, as the next system comes in. */
const LEAVE_MS = 220;
/**
 * The stage changes once the selection rests this long, so a quick run down the rail moves the
 * rail alone, without the stage flickering through every system on the way.
 */
const REST_MS = 60;
/** At most this long waiting for the next system's pictures (when not preloaded yet). */
const DECODE_MS = 250;
/** Text too long for its box scrolls through at this speed, in px per second. */
const SCROLL_PX_S = 16;

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

/** The parts of the stage that change together when the selection moves. */
type Slot = 'intro' | 'tally' | 'showcase' | 'fact';

/**
 * A category's systems: a rail of logos on the left, kept centred on the selection, and the
 * selected system on a stage: its console, lit and reflected on a neon floor (a photo in a frame,
 * or its logo, when there is no cut-out), its specs as callouts round it, its story above and its curiosities on a strip below. Moving on, the last system slides
 * away as the next comes in from the side it is moved toward, and the screen's colour (its
 * maker's) glides to the next. Nothing on it is boxed in: the circuit board shows through.
 */
export class SystemView {
  readonly root = el('div', { class: 'systems' });
  readonly #rail = el('div', { class: 'system-rail' });
  readonly #list = el('ul', { class: 'system-list', role: 'listbox' });
  readonly #panel = el('section', { class: 'system-panel', 'aria-live': 'polite' });
  readonly #slots = new Map<Slot, HTMLElement>();
  #rows: HTMLElement[] = [];
  #systems: CyberSystem[] = [];
  #selected = -1;
  /** Which system the stage shows. */
  #shown = -1;
  #info: SystemInfo | null = null;
  #fact = 0;
  #factTimer: ReturnType<typeof setInterval> | undefined;
  #boardTimer: ReturnType<typeof setTimeout> | undefined;
  #restTimer: ReturnType<typeof setTimeout> | undefined;
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
    this.#panel.replaceChildren(el('div', { class: 'floor', 'aria-hidden': 'true' }));
    this.#slots.clear();
    this.#selected = -1;
    this.#shown = -1;
    this.select(selected, true);
  }

  /** `now`: draw at once (entering the screen), not sliding in, nor the board after a rest. */
  select(index: number, now = false): void {
    this.#rows[this.#selected]?.classList.remove('selected');
    this.#selected = index;
    const r = this.#rows[index];
    const system = this.#systems[index];
    if (!r || !system) return;
    r.classList.add('selected');
    this.#centre(r);
    this.#preload(index);
    const ticket = ++this.#ticket;
    const show = (info: SystemInfo | null) => {
      if (ticket !== this.#ticket) return;
      this.#info = info;
      this.#fact = 0;
      this.#render(system, !now, ticket);
      this.#drawBoard(system, now ? 0 : BOARD_MS);
    };
    clearTimeout(this.#restTimer);
    const load = () => {
      // Loaded with the catalogue, so normally at hand: drawn once, never first without its info.
      const known = this.infos.peek(system.summary.name);
      if (known !== undefined) return show(known);
      void this.infos.get(system.summary.name).then(show);
    };
    if (now) load();
    else this.#restTimer = setTimeout(load, REST_MS);
  }

  /** The pictures of the systems either side go first in the preload queue. */
  #preload(index: number): void {
    preload(
      [index + 1, index - 1, index + 2, index - 2].flatMap((n) => {
        const system = this.#systems[n];
        return system ? [system.photo, system.logo] : [];
      }),
      true
    );
  }

  /** The next curiosity, now (Y), instead of waiting. */
  nextFact(): void {
    const facts = this.#info?.curiosities ?? [];
    if (facts.length < 2) return;
    this.#fact = (this.#fact + 1) % facts.length;
    this.#swap('fact', this.#factStrip(), true);
    this.#scrollOverflow();
    this.#scheduleFact();
  }

  /** Stops the curiosity timer when the screen goes away. */
  hide(): void {
    clearInterval(this.#factTimer);
    clearTimeout(this.#boardTimer);
    clearTimeout(this.#restTimer);
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

  /**
   * Puts `next` in a slot. With `animate`, what was there stays a moment where it was (lifted
   * out of the layout) and fades away the way the rail moved, as `next` comes in.
   */
  #swap(slot: Slot, next: HTMLElement | null, animate: boolean): void {
    const old = this.#slots.get(slot);
    // Anything still leaving from a quick earlier move goes at once.
    for (const gone of this.#panel.querySelectorAll(`.leaving.slot-${slot}`)) gone.remove();
    if (next) {
      next.classList.add(`slot-${slot}`);
      if (animate) next.classList.add('entering');
      if (old) old.after(next);
      else this.#panel.append(next);
      this.#slots.set(slot, next);
    } else this.#slots.delete(slot);
    if (!old) return;
    if (!animate) return old.remove();
    Object.assign(old.style, {
      position: 'absolute',
      margin: '0',
      top: `${old.offsetTop}px`,
      left: `${old.offsetLeft}px`,
      width: `${old.offsetWidth}px`,
      height: `${old.offsetHeight}px`
    });
    old.classList.remove('entering');
    old.classList.add('leaving');
    setTimeout(() => old.remove(), LEAVE_MS);
  }

  #render(system: CyberSystem, animate: boolean, ticket: number): void {
    const s = system.summary;
    const info = this.#info;
    const maker = info?.specs?.maker ?? s.manufacturer;
    animate &&= this.#shown !== this.#selected;

    const title = el('h2', { class: 'name' }, info?.name ?? s.fullname ?? s.name);
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
                scroller('dd', value)
              )
            ]
          : [];
      });
      return items.length ? el('dl', { class: `specs specs-${side}` }, ...items) : null;
    };

    const parts: [Slot, HTMLElement | null][] = [];
    parts.push([
      'intro',
      el(
        'div',
        { class: 'intro' },
        el('div', { class: 'heading' }, logoImage(system, 'logo'), title),
        byline ? el('p', { class: 'byline' }, byline) : null,
        info?.description ? scroller('p', info.description, 'description') : null
      )
    ]);
    parts.push([
      'tally',
      el(
        'div',
        { class: 'tally' },
        el('span', { class: 'count' }, s.gameCount.toLocaleString('en')),
        el('span', { class: 'unit' }, s.gameCount === 1 ? 'game' : 'games')
      )
    ]);
    parts.push([
      'showcase',
      el(
        'div',
        { class: 'showcase' },
        callouts('left', LEFT),
        stage(system, title.textContent ?? ''),
        callouts('right', RIGHT)
      )
    ]);
    parts.push(['fact', this.#factStrip()]);
    const apply = () => {
      if (ticket !== this.#ticket) return;
      this.root.style.setProperty('--sys', `rgb(${systemRgb(maker, system.category)})`);
      this.#shown = this.#selected;
      for (const [slot, part] of parts) this.#swap(slot, part, animate);
      this.#scrollOverflow();
      this.#scheduleFact();
    };
    // The next system shows whole, its pictures ready, rather than its words first.
    if (!animate) return apply();
    const images = parts.flatMap(([, part]) => (part ? [...part.querySelectorAll('img')] : []));
    void settle(images).then(apply);
  }

  /**
   * Words too long for their box (a long story, a long spec) scroll slowly through it and back,
   * resting at each end, so all of it can be read. Moved by a transform: cheap on a Pi.
   */
  #scrollOverflow(): void {
    requestAnimationFrame(() => {
      for (const box of this.#panel.querySelectorAll<HTMLElement>(':not(.leaving) .scroll')) {
        const inner = box.firstElementChild as HTMLElement | null;
        const over = (inner?.scrollHeight ?? 0) - box.clientHeight;
        if (!inner || over <= 2) continue;
        // Resting a quarter of the time at each end.
        const seconds = Math.max(6, (over / SCROLL_PX_S) * 2);
        box.style.setProperty('--scroll', `${-over}px`);
        box.style.setProperty('--scroll-s', `${seconds}s`);
        box.classList.add('scrolling');
      }
    });
  }

  #factStrip(): HTMLElement | null {
    const facts = this.#info?.curiosities ?? [];
    const fact = facts[this.#fact % Math.max(1, facts.length)];
    if (!fact) return null;
    return el(
      'aside',
      { class: 'fact' },
      el(
        'span',
        { class: 'label' },
        `Did you know? ${(this.#fact % facts.length) + 1}/${facts.length}`
      ),
      scroller('p', fact),
      // How long until the next one, when they move on by themselves.
      facts.length > 1 && this.rotateFacts
        ? el('span', { class: 'timer', style: `--fact-ms: ${FACT_MS}ms` })
        : null
    );
  }

  #scheduleFact(): void {
    clearInterval(this.#factTimer);
    const facts = this.#info?.curiosities ?? [];
    if (facts.length > 1 && this.rotateFacts) {
      this.#factTimer = setInterval(() => this.nextFact(), FACT_MS);
    }
  }
}

/** Text in a box that scrolls it through when it is too long (see `#scrollOverflow`). */
function scroller<K extends 'p' | 'dd'>(tag: K, text: string, cls = ''): HTMLElementTagNameMap[K] {
  return el(tag, { class: `${cls} scroll`.trim() }, el('span', { class: 'scroll-inner' }, text));
}

/** Waits for pictures to be decoded, so they show at once; not longer than `DECODE_MS`. */
function settle(images: HTMLImageElement[]): Promise<void> {
  // Preloaded at start-up: nothing to wait for.
  if (images.every((img) => ready(img.src) || ready(img.getAttribute('src') ?? ''))) {
    return Promise.resolve();
  }
  const decoded = images.map((img) =>
    typeof img.decode === 'function' ? img.decode().catch(() => undefined) : Promise.resolve()
  );
  return Promise.race([
    Promise.all(decoded).then(() => undefined),
    new Promise<void>((done) => setTimeout(done, DECODE_MS))
  ]);
}

/** A system's logo; a dark one gets a light halo; none (or a broken file) leaves nothing. */
function logoImage(system: CyberSystem, cls: string): HTMLImageElement | null {
  if (!system.logo) return null;
  const logo = el('img', {
    class: `${cls}${system.logoDark ? ' dark' : ''}`,
    src: system.logo,
    alt: ''
  });
  logo.addEventListener('error', () => logo.remove());
  return logo;
}

/**
 * The middle of the stage: the console cut out, standing on the floor; else a photo of it in a
 * neon frame; else, for what has no hardware to show (a port, an engine), its logo large over
 * Cyber's drawing for its category; else its name, in lights.
 */
function stage(system: CyberSystem, name: string): HTMLElement {
  const box = el('div', { class: 'console' });
  const fallback = () => {
    box.className = 'console hero';
    const art = el('div', { class: 'art', 'aria-hidden': 'true' });
    art.innerHTML = categoryArt(system.category);
    const nameplate = () => el('span', { class: 'hero-name' }, name);
    const logo = logoImage(system, 'hero-logo');
    logo?.addEventListener('error', () => box.append(nameplate()));
    box.replaceChildren(art, logo ?? nameplate());
  };
  if (!system.photo) {
    fallback();
    return box;
  }
  box.classList.add(system.photoKind);
  const photo = el('img', { class: 'photo', src: system.photo, alt: '' });
  photo.addEventListener('error', fallback);
  box.append(photo);
  return box;
}

function row(system: CyberSystem): HTMLElement {
  const s = system.summary;
  const logo = logoImage(system, 'logo');
  const item = el(
    'li',
    { role: 'option', ...(logo ? {} : { class: 'no-logo' }) },
    logo,
    el('span', { class: 'name' }, s.fullname || s.name),
    el('span', { class: 'count' }, s.gameCount.toLocaleString('en'))
  );
  // A logo that fails to load: the name shows in its place.
  logo?.addEventListener('error', () => item.classList.add('no-logo'));
  return item;
}
