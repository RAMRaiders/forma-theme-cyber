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

/**
 * Words that take turns stay as long as they take to read from a sofa: a moment to look over,
 * then this long for each word (about 130 a minute), and never less than the shortest stay.
 */
const READ_START_MS = 3000;
const READ_WORD_MS = 450;
const READ_LEAST_MS = 6000;
/** How long the text under the logo takes to fade out, before the next fades in. */
const READ_FADE_MS = 300;
/**
 * The board follows the selection once it has rested a while: a new board is a full-screen
 * drawing, costly on a Pi, so moving through the rail does not redraw it at every step.
 */
const BOARD_MS = 450;
/** How long what was shown takes to fade, as the next system comes in. */
const LEAVE_MS = 220;
/**
 * The strip of logos shows while moving, over the stage; this long after the last move it goes
 * and the page changes to the system picked. Until then only the strip moves; A does it at once
 * ({@link SystemView.settleNow}).
 */
const DROP_MS = 2000;
/** The strip stays this long over the new page, so the page is there before the strip goes. */
const PAGE_SHOWN_MS = 420;
/** How long the last page takes to fade under the next (as in style.css). */
const PAGE_LEAVE_MS = 380;
/** The system's colours: a page keeps its own while it fades out. */
const SYSTEM_COLOURS = [
  '--sys',
  '--sys-rgb',
  '--sys2-rgb',
  '--sys3-rgb',
  '--sys4-rgb',
  '--sys-10',
  '--sys-20',
  '--sys-30',
  '--sys-45',
  '--sys-70'
];
/** The magazines' front cover turns away this often, taking this long (as in style.css). */
const COVER_MS = 7000;
const COVER_TURN_MS = 650;
/** At most this long waiting for the next system's pictures (when not preloaded yet). */
const DECODE_MS = 250;
/** Text too long for its box scrolls through at this speed, in px per second. */
const SCROLL_PX_S = 16;
/** Text too long for its box waits this long before it starts to scroll (as in style.css). */
const SCROLL_START_MS = 1500;

/** How long `text` should stay on screen for someone to read all of it. */
export function readingMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(READ_LEAST_MS, READ_START_MS + words * READ_WORD_MS);
}

/** How long one pass of the scroll takes for words this many px too long for their box. */
function scrollSeconds(over: number): number {
  // Resting a quarter of the time at each end.
  return Math.max(6, (over / SCROLL_PX_S) * 2);
}

/** How long the words in `box` should stay: to read them, and for any scroll to reach the end. */
function stayMs(box: HTMLElement | null | undefined, text: string): number {
  const over = (box?.firstElementChild?.scrollHeight ?? 0) - (box?.clientHeight ?? 0);
  const scroll = over > 2 ? SCROLL_START_MS + scrollSeconds(over) * 1000 : 0;
  return Math.max(readingMs(text), scroll);
}

type Spec = keyof NonNullable<SystemInfo['specs']>;

/** The callouts round the console, as on a schematic: two each side. */
const LEFT: [Spec, string][] = [
  ['cpu', 'CPU'],
  ['memory', 'Memory']
];
const RIGHT: [Spec, string][] = [
  ['graphics', 'Graphics'],
  ['sound', 'Sound']
];

/** What the technical sheet beside the logo adds to its maker and dates, as far as it has room. */
const SHEET: [Spec, string][] = [
  ['generation', 'Generation:'],
  ['lifetime', 'Lifetime:'],
  ['unitsSold', 'Units sold:'],
  ['engine', 'Engine:'],
  ['language', 'Language:'],
  ['license', 'License:']
];
/** The sheet's rows: all that fit beside the logo. */
const SHEET_ROWS = 5;

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
type Slot = 'intro' | 'reading' | 'press' | 'showcase' | 'best' | 'gear' | 'fact';

/**
 * A category's systems: a strip of logos over the middle while moving, kept centred on the
 * selection, gone a moment after the last move; and the
 * selected system on a stage: its console, lit and reflected on a neon floor (a photo in a frame,
 * or its logo, when there is no cut-out), its specs as callouts round it, its story above and its curiosities on a strip below. Moving on, the last system slides
 * away as the next comes in from the side it is moved toward, and the screen's colour (its
 * maker's) glides to the next. Nothing on it is boxed in: the circuit board shows through.
 */
export class SystemView {
  readonly root = el('div', { class: 'systems' });
  readonly #rail = el('div', { class: 'system-rail' });
  readonly #list = el('ul', { class: 'system-list', role: 'listbox' });
  /** Where the selection is in the list: "4 / 23". */
  readonly #where = el('span', { class: 'where' });
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
  #factTimer: ReturnType<typeof setTimeout> | undefined;
  /** Which of the description and the story's chapters shows under the logo. */
  #read = 0;
  #readTimer: ReturnType<typeof setTimeout> | undefined;
  #coverTimer: ReturnType<typeof setInterval> | undefined;
  #boardTimer: ReturnType<typeof setTimeout> | undefined;
  #dropTimer: ReturnType<typeof setTimeout> | undefined;
  /** Between `show` and `hide`. */
  #onScreen = false;
  /** What to do once the page asked for is drawn: let the strip go. */
  #onDrawn: (() => void) | null = null;
  /** The new page is up and the strip is only about to go: A is for the page now. */
  #holding = false;
  /** Shows the selected system on the stage, while it is still waiting to. */
  #load: (() => void) | null = null;
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
    this.#rail.append(
      this.#list,
      this.#where,
      el('span', { class: 'edge top' }),
      el('span', { class: 'edge bottom' })
    );
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

  /**
   * Fills the screen. Called again while it is up when the library changes (a copy, a scrape,
   * one game at a time): the same systems then only take their new numbers, and even a changed
   * list is redrawn without the strip, which is for the user's own moves.
   */
  show(systems: CyberSystem[], selected: number): void {
    const refresh = this.#onScreen;
    const same =
      systems.length === this.#systems.length &&
      systems.every((s, i) => s.summary.name === this.#systems[i]?.summary.name);
    if (refresh && same && selected === this.#selected) {
      this.#systems = systems;
      return;
    }
    this.#onScreen = true;
    this.#systems = systems;
    this.#rows = systems.map(row);
    this.#list.replaceChildren(...this.#rows);
    this.#panel.replaceChildren(el('div', { class: 'floor', 'aria-hidden': 'true' }));
    this.#slots.clear();
    this.#page = null;
    this.#selected = -1;
    this.#shown = -1;
    this.#drawnFor = null;
    // Straight to it, no glide from wherever the last list was.
    this.#list.classList.add('still');
    // Arriving, or the list changing, is not moving: the strip waits for the first press.
    this.select(selected, true, true);
    requestAnimationFrame(() => this.#list.classList.remove('still'));
  }

  /** Look → Systems background changed: the screen as it is, in the new look, at once. */
  refreshLook(): void {
    this.#drawnFor = null;
    if (this.#selected >= 0) {
      this.#shown = -1;
      this.select(this.#selected, true, true);
    }
  }

  /**
   * `now`: draw at once (entering the screen), not fading in, nor the board after a rest.
   * `quiet`: the user did not move, so the strip stays away.
   */
  select(index: number, now = false, quiet = false): void {
    this.#rows[this.#selected]?.classList.remove('selected');
    this.#selected = index;
    const r = this.#rows[index];
    const system = this.#systems[index];
    if (!r || !system) return;
    r.classList.add('selected');
    this.#centre(r);
    if (!quiet) this.#browse();
    this.#preload(index);
    const ticket = ++this.#ticket;
    const show = (info: SystemInfo | null) => {
      if (ticket !== this.#ticket) return;
      this.#info = info;
      this.#fact = 0;
      this.#read = 0;
      this.#render(system, !now, ticket);
      this.#drawBoard(system, now ? 0 : BOARD_MS);
    };
    const load = () => {
      this.#load = null;
      // Loaded with the catalogue, so normally at hand: drawn once, never first without its info.
      const known = this.infos.peek(system.summary.name);
      if (known !== undefined) return show(known);
      void this.infos.get(system.summary.name).then(show);
    };
    if (now) load();
    else this.#load = load;
  }

  /** The strip showing: the selection still moving, or just moved. */
  get browsing(): boolean {
    return this.root.classList.contains('browsing') && !this.#holding;
  }

  /** The system picked on the stage now (A on the strip, or the wait over); then the strip goes. */
  settleNow(): void {
    if (this.#onDrawn) return;
    clearTimeout(this.#dropTimer);
    const load = this.#load;
    if (!load) return this.#stripGone();
    this.#onDrawn = () => {
      this.#onDrawn = null;
      this.#holding = true;
      this.#dropTimer = setTimeout(() => this.#stripGone(), PAGE_SHOWN_MS);
    };
    load();
  }

  #stripGone(): void {
    this.#holding = false;
    this.root.classList.remove('browsing');
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
   * The strip of logos over the middle of the stage while moving; a moment after the last
   * move it fades, and the page changes to the system picked. Only opacity changes.
   */
  #browse(): void {
    this.root.classList.add('browsing');
    this.#onDrawn = null;
    this.#holding = false;
    clearTimeout(this.#dropTimer);
    this.#dropTimer = setTimeout(() => this.settleNow(), DROP_MS);
  }

  /** Stops the curiosity timer when the screen goes away. */
  hide(): void {
    this.#onScreen = false;
    this.#drawnFor = null;
    clearTimeout(this.#dropTimer);
    this.#onDrawn = null;
    this.#stripGone();
    clearTimeout(this.#factTimer);
    clearTimeout(this.#readTimer);
    clearInterval(this.#coverTimer);
    clearTimeout(this.#boardTimer);
    this.#load = null;
  }

  /**
   * The strip slides so the selected logo sits in its middle, under the selection frame, at the
   * ends of the list too (a transform: the compositor's work, cheap on a Pi).
   */
  #centre(row: HTMLElement): void {
    const games = this.#systems[this.#selected]?.summary.gameCount ?? 0;
    this.#where.textContent = `${games.toLocaleString('en')} ${games === 1 ? 'game' : 'games'}`;
    const strip = this.#rail.clientHeight;
    if (strip === 0) return;
    const y = row.offsetTop + row.offsetHeight / 2 - strip / 2;
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
    setTimeout(() => old.remove(), PAGE_LEAVE_MS);
  }

  /** The page on the stage keeps the colours it has, whatever the next system sets. */
  #keepPageColours(): void {
    if (!this.#page) return;
    const current = getComputedStyle(this.#page);
    for (const name of SYSTEM_COLOURS) {
      const value = current.getPropertyValue(name);
      if (value) this.#page.style.setProperty(name, value);
    }
  }

  #render(system: CyberSystem, animate: boolean, ticket: number): void {
    const s = system.summary;
    const info = this.#info;
    const maker = info?.specs?.maker ?? s.manufacturer;
    animate &&= this.#shown !== this.#selected;

    const title = el('h2', { class: 'name' }, info?.name ?? s.fullname ?? s.name);
    const year = s.releaseYear ? String(s.releaseYear) : null;
    const released = info?.specs?.released ?? year;
    const sheet = technicalSheet(maker, makerLogos(maker, this.#makers), released, info?.specs);

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
        el(
          'div',
          { class: 'heading' },
          el('div', { class: 'brand' }, logoImage(system, 'logo'), title),
          sheet
        )
      )
    ]);
    parts.push(['reading', this.#readingPart()]);
    parts.push([
      'best',
      bestsellerShelf(bestsellers(s.name, info?.bestsellers), info?.bestsellersBy !== 'classics')
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
    parts.push(['press', press(system)]);
    parts.push(['gear', gear(system)]);
    parts.push(['fact', this.#factStrip()]);
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
      if (animate) this.#keepPageColours();
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
      this.#scheduleReading();
      this.#scheduleCover();
      this.#onDrawn?.();
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
        box.style.setProperty('--scroll', `${-over}px`);
        box.style.setProperty('--scroll-s', `${scrollSeconds(over)}s`);
        box.classList.add('scrolling');
      }
    });
  }

  /** What shows under the logo, in turn: the description, then each chapter of the story. */
  #readings(): string[] {
    const info = this.#info;
    return [...(info?.description ? [info.description] : []), ...(info?.story ?? [])];
  }

  #readingPart(): HTMLElement | null {
    const all = this.#readings();
    const text = all[this.#read % Math.max(1, all.length)];
    if (!text) return null;
    return el(
      'div',
      { class: 'reading' },
      scroller('p', text, 'description'),
      // Which page of how many, when they take turns.
      all.length > 1 ? el('span', { class: 'page' }, this.#pageOf(all.length)) : null
    );
  }

  #pageOf(total: number): string {
    return `${(this.#read % total) + 1}/${total}`;
  }

  /**
   * The next of the description and the story's chapters: only the words fade out and back in,
   * in the same box; nothing else on the page is touched.
   */
  #nextReading(): void {
    const box = this.#slots.get('reading')?.querySelector<HTMLElement>('.description');
    const all = this.#readings();
    if (!box || all.length < 2) return;
    this.#read += 1;
    const text = all[this.#read % all.length] ?? '';
    const page = this.#pageOf(all.length);
    const counter = this.#slots.get('reading')?.querySelector('.page');
    box.classList.add('fading');
    this.#readTimer = setTimeout(() => {
      const fresh = scroller('p', text, 'description fading');
      box.replaceWith(fresh);
      if (counter) counter.textContent = page;
      this.#scrollOverflow();
      requestAnimationFrame(() => requestAnimationFrame(() => fresh.classList.remove('fading')));
      this.#scheduleReading();
    }, READ_FADE_MS);
  }

  /** The next page comes when this one has been read: each stays as long as its words need. */
  #scheduleReading(): void {
    clearTimeout(this.#readTimer);
    const all = this.#readings();
    if (all.length < 2 || !this.rotateFacts) return;
    const box = this.#slots.get('reading')?.querySelector<HTMLElement>('.description');
    const ms = stayMs(box, all[this.#read % all.length] ?? '');
    this.#readTimer = setTimeout(() => this.#nextReading(), ms);
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
      // How long until the next one, when they move on by themselves (see `#scheduleFact`).
      facts.length > 1 && this.rotateFacts ? el('span', { class: 'timer' }) : null
    );
  }

  #scheduleCover(): void {
    clearInterval(this.#coverTimer);
    if (this.rotateFacts) {
      this.#coverTimer = setInterval(() => {
        const stand = this.#slots.get('press');
        if (stand) turnCover(stand);
      }, COVER_MS);
    }
  }

  #scheduleFact(): void {
    clearTimeout(this.#factTimer);
    const facts = this.#info?.curiosities ?? [];
    if (facts.length < 2 || !this.rotateFacts) return;
    const strip = this.#slots.get('fact');
    const ms = stayMs(strip?.querySelector<HTMLElement>('.scroll'), facts[this.#fact] ?? '');
    strip?.querySelector<HTMLElement>('.timer')?.style.setProperty('--fact-ms', `${ms}ms`);
    this.#factTimer = setTimeout(() => this.nextFact(), ms);
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
    el('span', { class: 'label' }, ranked ? 'Best sellers' : 'Classics'),
    el(
      'ol',
      {},
      ...best.map((game) => {
        const art = el('img', { src: game.art, alt: game.name, decoding: 'async' });
        const item = el(
          'li',
          {},
          el('span', { class: 'pic' }, art),
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

/** The regions release dates name, and the flag (in public/flags/) each is shown with. */
const REGION_FLAGS: Record<string, string> = {
  JP: 'jp',
  NA: 'us',
  EU: 'eu',
  UK: 'gb',
  DE: 'de',
  KR: 'kr',
  TW: 'tw'
};

/** A release date with each region's code as its flag: "1988 JP · 1989 NA". */
export function releaseDates(text: string): (string | HTMLElement)[] {
  return text
    .split(/\b(JP|NA|EU|UK|DE|KR|TW)\b/)
    .map((part, n) =>
      n % 2
        ? el('img', { class: 'flag', src: `./flags/${REGION_FLAGS[part]}.svg`, alt: part })
        : part
    );
}

/**
 * The technical sheet beside the logo: who made it (its logo where Cyber has one), when, and
 * what else is known. `null` when nothing is.
 */
function technicalSheet(
  maker: string | null | undefined,
  logos: readonly string[],
  released: string | null | undefined,
  specs: SystemInfo['specs']
): HTMLElement | null {
  const row = (label: string, value: HTMLElement) =>
    el('div', { class: 'sheet-row' }, el('dt', {}, label), value);
  const rows: HTMLElement[] = [];
  if (maker) {
    const mark = makerMark(maker, logos);
    rows.push(row('Manufacturer:', mark ? el('dd', {}, mark) : scroller('dd', maker)));
  }
  if (released) {
    rows.push(
      row(
        'Release date:',
        el(
          'dd',
          { class: 'scroll' },
          el('span', { class: 'scroll-inner' }, ...releaseDates(released))
        )
      )
    );
  }
  for (const [key, label] of SHEET) {
    const value = specs?.[key];
    if (value) rows.push(row(label, scroller('dd', value)));
  }
  return rows.length ? el('dl', { class: 'sheet' }, ...rows.slice(0, SHEET_ROWS)) : null;
}

/** The maker's logos; `null` where Cyber has none (its name is used). */
function makerMark(maker: string | null | undefined, logos: readonly string[]): HTMLElement | null {
  if (!maker || !logos.length) return null;
  // All of them, or the name: never some logos and a gap.
  const imgs = logos.map((src) =>
    el('img', { class: 'maker-logo', src, alt: '', decoding: 'async' })
  );
  const makers = el('span', { class: 'makers', role: 'img', 'aria-label': maker }, ...imgs);
  for (const img of imgs) {
    img.addEventListener('error', () => makers.replaceWith(maker), { once: true });
  }
  return makers;
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

/** A figure for the press or the gear: taken away if its picture will not load. */
function shelfFigure(cls: string, src: string, alt: string, caption?: string): HTMLElement {
  const fig = el(
    'figure',
    { class: cls },
    el('img', { src, alt, decoding: 'async' }),
    caption ? el('figcaption', {}, caption) : null
  );
  fig.querySelector('img')?.addEventListener('error', () => fig.remove(), { once: true });
  return fig;
}

/**
 * Magazines about the system, a stack of up to five, the front one whole and big enough to
 * read, the start of each of the others showing behind it. `null` for a system with none.
 */
export function press(system: Pick<CyberSystem, 'magazines'>): HTMLElement | null {
  const mags = system.magazines.slice(0, 5);
  if (!mags.length) return null;
  return el(
    'div',
    { class: 'stand', 'aria-label': 'In the press' },
    ...mags.map((m, n) => {
      const fig = shelfFigure('cover', m.src, m.title);
      fig.dataset.pos = String(n);
      return fig;
    })
  );
}

/**
 * The front cover turns away like a page and goes to the back of the stack; those behind it
 * come forward. Transform and opacity only.
 */
export function turnCover(stand: HTMLElement): void {
  const covers = [...stand.querySelectorAll<HTMLElement>('.cover')].sort(
    (a, b) => Number(a.dataset.pos) - Number(b.dataset.pos)
  );
  const [front, next, ...rest] = covers;
  if (!front || !next) return;
  front.classList.add('turning');
  [next, ...rest].forEach((cover, n) => {
    cover.dataset.pos = String(n);
  });
  setTimeout(() => {
    // Straight to the back, unseen, then the stack's own moves again.
    front.classList.add('parked');
    front.classList.remove('turning');
    front.dataset.pos = String(rest.length + 1);
    requestAnimationFrame(() => requestAnimationFrame(() => front.classList.remove('parked')));
  }, COVER_TURN_MS);
}

/**
 * The system's peripherals, up to four, two by two, each on its lit spot of floor and named.
 * `null` for a system with none.
 */
export function gear(system: Pick<CyberSystem, 'peripherals'>): HTMLElement | null {
  const items = system.peripherals.slice(0, 4);
  if (!items.length) return null;
  return el(
    'div',
    { class: `gear n${items.length}` },
    el('h3', {}, 'Peripherals'),
    ...items.map((p) => shelfFigure('item', p.src, p.name, p.name))
  );
}

/**
 * How tall a logo stands in the column, in rem, for its width over its height: the same area for
 * every one (about 3 × 11rem), so a wide logo is low and a square one taller; 1.5rem to 3rem.
 */
export function logoHeight(aspect: number): number {
  return Math.min(3, Math.max(1.5, 5.6 / Math.sqrt(aspect)));
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
  // Every logo the same weight, whatever its shape: a wide one low, a square one taller.
  logo?.addEventListener('load', () => {
    const aspect = logo.naturalWidth / Math.max(1, logo.naturalHeight);
    if (aspect > 0) logo.style.setProperty('--logo-h', `${logoHeight(aspect).toFixed(2)}rem`);
  });
  return item;
}
