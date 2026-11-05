import { type Bestseller, bestsellers } from '../data/bestsellers.js';
import {
  type CategoryId,
  type CyberSystem,
  type InfoStore,
  type MakerLogo,
  type SystemInfo,
  makerLogos
} from '../data/catalog.js';
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
const REST_MS = 170;
/** After this long resting on a system, the rail gives way to its shelf. */
const SHELF_REST_MS = 2400;
/**
 * Holding a direction: the stage waits this long after the last step, so only the rail moves
 * while the list runs (a Pi takes about a frame and a half to draw a new stage).
 */
const HELD_REST_MS = 220;
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

function rgbToHue(rgb: string): number {
  const [r, g, b] = rgb.split(' ').map((v) => Number(v) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** A neon colour (full saturation, bright) at a hue, as `r g b`. */
function neon(hue: number): string {
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    return Math.round(255 * (0.62 - 0.38 * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return `${f(0)} ${f(8)} ${f(4)}`;
}

/**
 * A system's own neon colours, `[main, accent]`: its logo's main colour, and its console's
 * (its buttons, its stripes) as the accent; else the logo's second colour, else its maker's.
 * A logo with no colour (black, white, grey) gives way to its maker's colour, then its
 * console's. Without any of them, a colour by its place in the list: a golden angle (about
 * 137°) round the wheel from the last, so neighbours are never alike. An accent too close to
 * the main colour is passed over for the next.
 */
export function systemColours(
  system: {
    hues: readonly number[];
    consoleHues?: readonly number[];
    maker?: string | null;
    category: CategoryId;
  },
  index: number
): [string, string, ...string[]] {
  const maker = system.maker ? makerRgb(system.maker) : null;
  const makerHue = maker ? rgbToHue(maker) : undefined;
  const consoleHues = system.consoleHues ?? [];
  const main =
    system.hues[0] ??
    makerHue ??
    consoleHues[0] ??
    (rgbToHue(CATEGORY_RGB[system.category]) + index * 137.508) % 360;
  const mainRgb = system.hues[0] === undefined && maker ? maker : neon(main);
  // The accent: the console's first colour, then the logo's others, then the maker's; then what
  // else the console has. Up to four colours, none within 30° of one before.
  const candidates = [
    consoleHues[0],
    ...system.hues.slice(1),
    makerHue,
    ...consoleHues.slice(1)
  ].filter((h): h is number => h !== undefined);
  const chosen = [main];
  for (const h of candidates) {
    if (chosen.length >= PALETTE_SIZE) break;
    if (chosen.every((c) => hueApart(h, c) > 30)) chosen.push(h);
  }
  const rgb = (h: number) => (h === makerHue && maker ? maker : neon(h));
  const [, accent, ...more] = chosen;
  return [mainRgb, accent === undefined ? neon((main + 45) % 360) : rgb(accent), ...more.map(rgb)];
}

/** At most this many colours for a system: its main one, its accent and two more. */
const PALETTE_SIZE = 4;

function hueApart(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

function makerRgb(maker: string): string | null {
  return MAKER_RGB.find(([re]) => re.test(maker.trim()))?.[1] ?? null;
}

/** The parts of the stage that change together when the selection moves. */
type Slot = 'intro' | 'tally' | 'showcase' | 'fact' | 'shelf';

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
  /** The stage showing: the slots' parent. */
  #page: HTMLElement | null = null;
  #rows: HTMLElement[] = [];
  #systems: CyberSystem[] = [];
  #selected = -1;
  /** Which system the stage shows. */
  #shown = -1;
  #info: SystemInfo | null = null;
  /** The makers' logos, once loaded: until then, the maker's name. */
  #makers: MakerLogo[] = [];
  #fact = 0;
  #factTimer: ReturnType<typeof setInterval> | undefined;
  #boardTimer: ReturnType<typeof setTimeout> | undefined;
  #restTimer: ReturnType<typeof setTimeout> | undefined;
  #shelfTimer: ReturnType<typeof setTimeout> | undefined;
  /** Curiosities move on by themselves; Interface → Rotate curiosities. */
  rotateFacts = true;
  /** What is behind the screen (Look → Systems background); `board`: each system's own. */
  look: 'neon' | 'grid' | 'board' = 'neon';
  /** The category whose backdrop is up, in the looks that have one per category. */
  #drawnFor: string | null = null;
  /** Which selection a pending info load belongs to: a quick scroll must not show a stale one. */
  #ticket = 0;

  constructor(
    private readonly infos: InfoStore,
    /** Shows a board behind the whole screen (the app's backdrop). */
    private readonly backdrop: (svg: string) => void
  ) {
    this.#rail.append(this.#list);
    this.root.append(this.#rail, this.#panel);
    void infos.makers().then((makers) => {
      this.#makers = makers;
    });
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
    this.#page = null;
    this.#selected = -1;
    this.#shown = -1;
    this.#drawnFor = null;
    this.select(selected, true);
  }

  /** Look → Systems background changed: the screen as it is, in the new look, at once. */
  refreshLook(): void {
    this.#drawnFor = null;
    if (this.#selected >= 0) {
      this.#shown = -1;
      this.select(this.#selected, true);
    }
  }

  /**
   * `now`: draw at once (entering the screen), not fading in, nor the board after a rest.
   * `held`: a repeat of a held direction; the stage follows once the list stops.
   */
  select(index: number, now = false, held = false): void {
    this.#rows[this.#selected]?.classList.remove('selected');
    this.#selected = index;
    const r = this.#rows[index];
    const system = this.#systems[index];
    if (!r || !system) return;
    r.classList.add('selected');
    this.#centre(r);
    this.#wake();
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
    else this.#restTimer = setTimeout(load, held ? HELD_REST_MS : REST_MS);
  }

  /** The pictures of the systems either side go first in the preload queue. */
  #preload(index: number): void {
    preload(
      [index + 1, index - 1, index + 2, index - 2].flatMap((n) => {
        const system = this.#systems[n];
        return system ? [system.photo, system.logoSmall] : [];
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

  /**
   * The rail back, and, after a rest on a system with a shelf (its manual, its magazines, its
   * peripherals), away again: the shelf shows in its place. Only fades: the stage under it
   * was laid out for both all along, so nothing moves.
   */
  #wake(): void {
    this.root.classList.remove('resting');
    clearTimeout(this.#shelfTimer);
    this.#shelfTimer = setTimeout(() => {
      if (this.#slots.has('shelf')) this.root.classList.add('resting');
    }, SHELF_REST_MS);
  }

  /** Stops the curiosity timer when the screen goes away. */
  hide(): void {
    this.#drawnFor = null;
    clearTimeout(this.#shelfTimer);
    this.root.classList.remove('resting');
    clearInterval(this.#factTimer);
    clearTimeout(this.#boardTimer);
    clearTimeout(this.#restTimer);
  }

  /**
   * The rail slides so the selected logo sits in its middle, under the selection bar, at the
   * ends of the list too (a transform: the compositor's work, cheap on a Pi).
   */
  #centre(row: HTMLElement): void {
    const rail = this.#rail.clientHeight;
    if (rail === 0) return;
    const y = row.offsetTop + row.offsetHeight / 2 - rail / 2;
    this.#list.style.transform = `translateY(${-y}px)`;
  }

  #drawBoard(system: CyberSystem, delay: number): void {
    clearTimeout(this.#boardTimer);
    // The other looks have nothing behind (only the dark), set once.
    if (this.look !== 'board') {
      const key = `${this.look}:${system.category}`;
      if (this.#drawnFor === key) return;
      this.#drawnFor = key;
      return this.backdrop('');
    }
    this.#drawnFor = null;
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
      if (animate) {
        next.classList.add('entering');
        // Its fade done, it leaves its own layer (memory on a Pi).
        const done = (e: Event) => {
          if (e.target !== next) return;
          next.classList.remove('entering');
          next.removeEventListener('animationend', done);
        };
        next.addEventListener('animationend', done);
      }
      if (old) old.after(next);
      else this.#page?.append(next);
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

  /**
   * Puts a new page on the stage with `parts`. With `animate` it fades in over the last, which
   * fades out: one blend of two layers, each drawn once.
   */
  #turnPage(parts: [Slot, HTMLElement | null][], animate: boolean): void {
    const old = this.#page;
    for (const gone of this.#panel.querySelectorAll('.stage-page.leaving')) gone.remove();
    const page = el('div', { class: animate ? 'stage-page entering' : 'stage-page' });
    this.#slots.clear();
    for (const [slot, part] of parts) {
      if (!part) continue;
      part.classList.add(`slot-${slot}`);
      page.append(part);
      this.#slots.set(slot, part);
    }
    this.#panel.append(page);
    this.#page = page;
    if (!old) return;
    if (!animate) return old.remove();
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
    const released = info?.specs?.released ?? year;
    const byline = bylineOf(maker, released, makerLogos(maker, this.#makers));

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
        byline,
        info?.description ? scroller('p', info.description, 'description') : null
      )
    ]);
    parts.push([
      'tally',
      el(
        'div',
        { class: 'tally' },
        el('span', { class: 'count' }, s.gameCount.toLocaleString('en')),
        el('span', { class: 'unit' }, s.gameCount === 1 ? 'game' : 'games'),
        bestsellerShelf(bestsellers(s.name, info?.bestsellers), info?.bestsellersBy !== 'classics')
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
    parts.push(['shelf', shelf(system)]);
    const apply = () => {
      if (ticket !== this.#ticket) return;
      // The system's own colours, on the page root: the backdrop, outside this view, takes
      // them too.
      // Every look: the logo's colours, the console's and the maker's.
      const [rgb, accent, third, fourth] = systemColours(
        {
          hues: system.hues,
          consoleHues: system.consoleHues,
          maker,
          category: system.category
        },
        this.#selected
      );
      const root = document.documentElement.style;
      root.setProperty('--sys', `rgb(${rgb})`);
      root.setProperty('--sys-rgb', rgb);
      root.setProperty('--sys2-rgb', accent);
      // A third and fourth where it has them; else its two again, the other way round.
      root.setProperty('--sys3-rgb', third ?? accent);
      root.setProperty('--sys4-rgb', fourth ?? rgb);
      this.#shown = this.#selected;
      this.#turnPage(parts, animate);
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

/**
 * The system's best sellers (or its classics), as pictures of their real cartridges or discs, ranked. A game
 * whose picture does not load is left out; nothing when there are none.
 */
function bestsellerShelf(best: Bestseller[], ranked: boolean): HTMLElement | null {
  if (!best.length) return null;
  return el(
    'div',
    { class: 'bestsellers' },
    // Classics have no order to show: no ranks on them.
    el('span', { class: 'label' }, ranked ? 'Best sellers' : 'Classics'),
    el(
      'ol',
      {},
      ...best.map((game, n) => {
        const art = el('img', { src: game.art, alt: game.name, decoding: 'async' });
        const item = el(
          'li',
          {},
          el(
            'span',
            { class: 'pic' },
            art,
            ranked ? el('span', { class: 'rank' }, String(n + 1)) : ''
          ),
          el('span', { class: 'name' }, game.name)
        );
        art.addEventListener('error', () => item.remove());
        return item;
      })
    )
  );
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

/**
 * Who made it and when: the maker as its logo where Cyber has it (its name for screen readers,
 * and in its place if the logo will not load), then the year. `null` when neither is known.
 */
function bylineOf(
  maker: string | null | undefined,
  released: string | null | undefined,
  logos: readonly string[]
): HTMLElement | null {
  if (!maker && !released) return null;
  const line = el('p', { class: 'byline' });
  if (maker && logos.length) {
    // All of them, or the name: never some logos and a gap.
    const imgs = logos.map((src) =>
      el('img', { class: 'maker-logo', src, alt: '', decoding: 'async' })
    );
    const makers = el('span', { class: 'makers', role: 'img', 'aria-label': maker }, ...imgs);
    for (const img of imgs) {
      img.addEventListener('error', () => makers.replaceWith(maker), { once: true });
    }
    line.append(makers);
  } else if (maker) {
    line.append(maker);
  }
  if (released) line.append(el('span', { class: 'year' }, maker ? ` · ${released}` : released));
  return line;
}

/** A system's logo; a dark one gets a light halo; none (or a broken file) leaves nothing. */
/** `big`: the full-size logo (the stage's hero); else the small one. */
function logoImage(system: CyberSystem, cls: string, big = false): HTMLImageElement | null {
  const src = big ? system.logo : system.logoSmall;
  if (!src) return null;
  const logo = el('img', {
    class: `${cls}${system.logoDark ? ' dark' : ''}`,
    src,
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
    const logo = logoImage(system, 'hero-logo', true);
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

/**
 * What came with the system and what was written about it, set out in the stage where the rail
 * was, once it fades after a rest: magazines about it fanned on a stand, its owner's manual
 * leaning in front of them, its peripherals lying on the floor before them, each named. Lit as
 * the console is: on the same floor, its glow under them. A picture that will not load is taken
 * away; `null` for a system with none of them.
 */
export function shelf(
  system: Pick<CyberSystem, 'manual' | 'magazines' | 'peripherals'>
): HTMLElement | null {
  const figure = (cls: string, src: string, alt: string, caption?: string) => {
    const fig = el(
      'figure',
      { class: cls },
      el('img', { src, alt, decoding: 'async' }),
      caption ? el('figcaption', {}, caption) : null
    );
    fig.querySelector('img')?.addEventListener('error', () => fig.remove(), { once: true });
    return fig;
  };
  // The first magazine in the middle of the fan: [2, 1, 3] across.
  const mags = system.magazines.slice(0, 3);
  const fan = mags.length === 3 ? [mags[1]!, mags[0]!, mags[2]!] : mags;
  const stand =
    fan.length || system.manual
      ? el(
          'div',
          { class: `stand n${fan.length}` },
          ...fan.map((m) => figure(m === mags[0] ? 'cover lead' : 'cover', m.src, m.title)),
          system.manual
            ? figure('manual', system.manual.src, `Owner's manual: ${system.manual.title}`)
            : null
        )
      : null;
  const gear = system.peripherals.length
    ? el(
        'div',
        { class: `gear n${Math.min(3, system.peripherals.length)}` },
        ...system.peripherals.slice(0, 3).map((p) => figure('item', p.src, p.name, p.name))
      )
    : null;
  if (!stand && !gear) return null;
  return el(
    'aside',
    { class: 'shelf', 'aria-label': 'Its manual, press and peripherals' },
    stand,
    gear
  );
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
