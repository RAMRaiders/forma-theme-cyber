import { type Bestseller, bestsellers } from '../data/bestsellers.js';
import { span } from './perf.js';
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
import { loopIndex, loopPlace } from '../logic/nav.js';
import { el, remPx } from './dom.js';
import { loopScroll } from './loopscroll.js';
import { preload, ready } from './preload.js';
import { awake } from './rest.js';
import { boot } from './boot.js';

/**
 * Words that take turns stay as long as they take to read from a sofa: a moment to look over,
 * then this long for each word (about 130 a minute), and never less than the shortest stay.
 */
const READ_START_MS = 3000;
const READ_WORD_MS = 450;
const READ_LEAST_MS = 6000;
/**
 * The board follows the selection once it has rested a while: a new board is a full-screen
 * drawing, costly on a Pi, so moving through the rail does not redraw it at every step.
 */
const BOARD_MS = 450;
/** How long what was shown takes to fade, as the next system comes in. */
const LEAVE_MS = 220;
/** One logo's place in the strip (as `--strip-item` in style.css). */
const STRIP_ITEM_REM = 6.8;
/** The strip of logos shows while moving, over the stage; this long after the last move it goes. */
const DROP_MS = 1400;
/** Steps closer together than this are the direction held: the strip then runs evenly. */
const HELD_MS = 130;
/**
 * The page is drawn, unseen in the dark under the strip, once the selection has rested this
 * long: quick steps through the systems draw nothing but the strip.
 */
const SETTLE_MS = 600;
/** How long the last page takes to fade under the next (as in style.css). */
const PAGE_LEAVE_MS = 380;
/** How long each of its shelves (best sellers, magazines, peripherals) stays. */
const SHELF_MS = 9000;
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
type Slot =
  'about' | 'maker' | 'life' | 'hardware' | 'tally' | 'console' | 'games' | 'reading' | 'fact';

/**
 * A category's systems: a strip of logos over the middle while moving, kept centred on the
 * selection, gone a moment after the last move; and the
 * selected system on a stage, switched on as it comes (a line of light opening on its logo): its
 * console large, lit on a neon floor (a photo in a frame, or its logo, when there is no cut-out);
 * beside it its logo, maker, how many of its games are here and its life from launch to the end,
 * its story under that and its curiosities on a strip below. Moving on, the last system slides
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
  /** The strip's logos, by place on its track: past the ends when it loops. */
  readonly #rows = new Map<number, HTMLElement>();
  /** The selected logo's place on the track. */
  #place = 0;
  #systems: CyberSystem[] = [];
  #selected = -1;
  /** Which system the stage shows. */
  #shown = -1;
  #info: SystemInfo | null = null;
  /** The makers' logos, once loaded: until then, the maker's name. */
  #makers: MakerLogo[] = [];
  #fact = 0;
  #factTimer: ReturnType<typeof setTimeout> | undefined;
  /** The description and story under the logo, scrolling (loopScroll). */
  #storyScroll: Animation | null = null;
  #boardTimer: ReturnType<typeof setTimeout> | undefined;
  #dropTimer: ReturnType<typeof setTimeout> | undefined;
  #shelfTimer: ReturnType<typeof setTimeout> | undefined;
  #settle: ReturnType<typeof setTimeout> | undefined;
  #steppedAt = 0;
  /** Between `show` and `hide`. */
  #onScreen = false;
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
    this.#rows.clear();
    this.#list.replaceChildren();
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
    const done = span('system.select');
    try {
      this.#selectTraced(index, now, quiet);
    } finally {
      done();
    }
  }

  #selectTraced(index: number, now = false, quiet = false): void {
    const from = this.#selected;
    const moved = index !== from;
    this.#selected = index;
    clearTimeout(this.#settle);
    const stepped = performance.now();
    this.#list.classList.toggle('held', moved && !quiet && stepped - this.#steppedAt < HELD_MS);
    if (moved) this.#steppedAt = stepped;
    const system = this.#systems[index];
    if (!system) return;
    const total = this.#systems.length;
    this.#place = from >= 0 && this.#loops() ? loopPlace(this.#place, from, index, total) : index;
    this.#drawStrip();
    this.#centre();
    // The selection frame in the system's colour at once, not when its page is drawn.
    if (moved) this.#railColour(system, index);
    if (!quiet) this.#browse();
    this.#preload(index);
    const ticket = ++this.#ticket;
    const show = (info: SystemInfo | null) => {
      if (ticket !== this.#ticket) return;
      this.#info = info;
      this.#fact = 0;
      this.#render(system, !now, ticket);
      this.#drawBoard(system, now ? 0 : BOARD_MS);
    };
    const load = () => {
      // Loaded with the catalogue, so normally at hand: drawn once, never first without its info.
      const known = this.infos.peek(system.summary.name);
      if (known !== undefined) return show(known);
      void this.infos.get(system.summary.name).then(show);
    };
    if (now) load();
    else this.#settle = setTimeout(load, SETTLE_MS);
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
   * move it fades, the page already changed under it. Only opacity changes. Under it the
   * screen is dark, and what is under the dark (the page, the board behind) is not drawn at
   * all meanwhile: on a Pi, repainting it at every step made the strip stutter.
   */
  #browse(): void {
    this.#browsing(true);
    clearTimeout(this.#dropTimer);
    this.#dropTimer = setTimeout(() => this.#browsing(false), DROP_MS);
  }

  #browsing(on: boolean): void {
    this.root.classList.toggle('browsing', on);
    document.documentElement.classList.toggle('systems-browsing', on);
  }

  /**
   * The selection frame in `system`'s colour, set on the strip alone: the page's own colours
   * wait for its page, drawn once the steps rest. From what the list already knows (its maker
   * from Forma, not yet its info's), so cheap at each step.
   */
  #railColour(system: CyberSystem, index: number): void {
    // The logo's own colours (its maker's where it has none), not its console's: the frame
    // lights in what the logo in it is drawn in.
    const colours = systemColours(
      { hues: system.hues, maker: system.summary.manufacturer, category: system.category },
      index
    ).map((rgb) => `rgb(${rgb})`);
    const style = this.#rail.style;
    style.setProperty('--sys', colours[0]!);
    // Four stops, the last colour again where the logo has fewer.
    for (let n = 1; n <= 4; n++) {
      style.setProperty(`--logo-${n}`, colours[Math.min(n, colours.length) - 1]!);
    }
  }

  /** Stops the curiosity timer when the screen goes away. */
  hide(): void {
    this.#onScreen = false;
    this.#drawnFor = null;
    clearTimeout(this.#dropTimer);
    clearTimeout(this.#settle);
    this.#browsing(false);
    clearTimeout(this.#factTimer);
    this.#storyScroll?.cancel();
    this.#storyScroll = null;
    clearTimeout(this.#boardTimer);
    clearTimeout(this.#shelfTimer);
  }

  /** With more systems than the strip shows at once, the last ones come before the first. */
  #loops(): boolean {
    const shown = this.#rail.clientHeight;
    return shown > 0 && this.#systems.length >= Math.ceil(shown / (STRIP_ITEM_REM * remPx())) + 2;
  }

  /** The logos on the track: every one, or when it loops, those round the selected one. */
  #drawStrip(): void {
    const done = span('system.drawStrip');
    try {
      this.#drawStripTraced();
    } finally {
      done();
    }
  }

  #drawStripTraced(): void {
    const total = this.#systems.length;
    const loops = this.#loops();
    const half = Math.ceil(this.#rail.clientHeight / (STRIP_ITEM_REM * remPx()) / 2) + 2;
    const first = loops ? this.#place - half : 0;
    const last = loops ? this.#place + half : total - 1;
    for (const [place, node] of this.#rows) {
      if (place < first || place > last) {
        node.remove();
        this.#rows.delete(place);
      }
    }
    for (let place = first; place <= last; place++) {
      let node = this.#rows.get(place);
      if (!node) {
        node = row(this.#systems[loops ? loopIndex(place, total) : place]!);
        node.style.setProperty('--place', String(place));
        this.#list.append(node);
        this.#rows.set(place, node);
      }
      node.classList.toggle('selected', place === this.#place);
    }
  }

  /**
   * The strip slides so the selected logo sits in its middle, under the selection frame, at the
   * ends of the list too (a transform: the compositor's work, cheap on a Pi).
   */
  #centre(): void {
    const games = this.#systems[this.#selected]?.summary.gameCount ?? 0;
    this.#where.textContent = `${games.toLocaleString('en')} ${games === 1 ? 'game' : 'games'}`;
    const strip = this.#rail.clientHeight;
    if (strip === 0) return;
    const item = STRIP_ITEM_REM * remPx();
    const y = this.#place * item + item / 2 - strip / 2;
    // Whole pixels: text on a layer moved by a fraction of one shimmers.
    this.#list.style.transform = `translateY(${-Math.round(y)}px)`;
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
    const done = span('system.turnPage');
    try {
      this.#turnPageTraced(parts, animate);
    } finally {
      done();
    }
  }

  #turnPageTraced(parts: [Slot, HTMLElement | null][], animate: boolean): void {
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
    const done = span('system.render');
    try {
      this.#renderTraced(system, animate, ticket);
    } finally {
      done();
    }
  }

  #renderTraced(system: CyberSystem, animate: boolean, ticket: number): void {
    const s = system.summary;
    const info = this.#info;
    const maker = info?.specs?.maker ?? s.manufacturer;
    animate &&= this.#shown !== this.#selected;

    const title = el('h2', { class: 'name' }, info?.name ?? s.fullname ?? s.name);
    const year = s.releaseYear ? String(s.releaseYear) : null;
    const released = info?.specs?.released ?? year;
    const mark = makerMark(maker, makerLogos(maker, this.#makers));
    const sold = info?.specs?.unitsSold;

    const parts: [Slot, HTMLElement | null][] = [];
    // Switched on, it settles into this: the console large on the left; on the right its logo
    // and maker, how many of its games are here, and its life from launch to the end.
    parts.push(['console', el('div', { class: 'stage' }, stage(system, title.textContent ?? ''))]);
    parts.push([
      'about',
      el(
        'div',
        { class: 'about' },
        el('div', { class: 'brand' }, logoImage(system, 'logo', true), title)
      )
    ]);
    // Its maker's logo, small, in the opposite corner.
    parts.push([
      'maker',
      mark || maker ? el('div', { class: 'maker' }, mark ?? el('span', {}, maker ?? '')) : null
    ]);
    // How many of its games are here is on the strip of systems already.
    parts.push(['life', lifeline(lifeEvents(released, info?.specs?.lifetime))]);
    // The middle band: its hardware, the console, its games.
    parts.push(['hardware', hardware(info?.specs)]);
    // Under the hardware, in the bottom-left corner: its generation and how many were sold.
    parts.push([
      'tally',
      tally([
        ['Generation', info?.specs?.generation ?? null],
        ['Sold', sold ? soldShort(sold) : null]
      ])
    ]);
    // Right of it, in turn: its best sellers, magazines about it, its peripherals.
    const shelves = [
      iconicGames(bestsellers(s.name, info?.bestsellers), info?.bestsellersBy !== 'classics'),
      shelf(
        'mags',
        'Magazines',
        system.magazines.slice(0, 3).map((m) => ({ src: m.src, name: m.title }))
      ),
      shelf('gear', 'Peripherals', system.peripherals.slice(0, 3))
    ].filter((part) => part !== null);
    const showcase = shelves.length ? el('div', { class: 'rotator' }, ...shelves) : null;
    parts.push(['games', showcase]);
    parts.push(['reading', this.#readingPart()]);
    parts.push(['fact', this.#factStrip()]);
    const apply = () => {
      const done = span('system.apply');
      try {
        applyNow();
      } finally {
        done();
      }
    };
    const applyNow = () => {
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
      // The page's colours caught up: the frame takes them again.
      this.#rail.style.removeProperty('--sys');
      this.#shown = this.#selected;
      this.#turnPage(parts, animate);
      this.#rotateShelves(showcase, SHELF_MS);
      this.#scrollOverflow();
      this.#scheduleFact();
    };
    // The next system shows whole, its pictures ready, rather than its words first.
    if (!animate) return apply();
    const images = parts.flatMap(([, part]) => (part ? [...part.querySelectorAll('img')] : []));
    void settle(images).then(apply);
  }

  /**
   * The selected system switched on as its games open: dark, a line of light across the middle
   * opening into the picture, its logo lit in it in its colour, then its games underneath. Over
   * the whole screen (the game list takes this view's place under it); gone in `BOOT_MS`. Only
   * then: moving from one system to the next, its page just changes.
   */
  bootSelected(): number {
    const system = this.selected;
    if (!system) return 0;
    const logo = logoImage(system, 'boot-logo', true);
    const name = el('span', { class: 'boot-name' }, system.summary.fullname || system.summary.name);
    logo?.addEventListener('error', () => logo.replaceWith(name));
    // Its colour as this view put it on the page (no style worked out to read it).
    const colour = document.documentElement.style.getPropertyValue('--sys').trim() || '#fff';
    return boot(this.root, logo ?? name, 0, { colour });
  }

  /**
   * The column right of the console: its first shelf there with the page from the start, still;
   * after `first`, the next, fading and sliding in, each for `SHELF_MS`, round and round. A
   * shelf whose pictures all failed is passed over.
   */
  #rotateShelves(box: HTMLElement | null, first: number): void {
    clearTimeout(this.#shelfTimer);
    if (!box) return;
    let at = 0;
    const shelves = [...box.children];
    shelves[0]?.classList.add('on', 'still');
    const next = () => {
      if (!box.isConnected) return;
      const ready = shelves.filter((shelf) => shelf.querySelector('li'));
      if (ready.length < 2) return;
      at = (at + 1) % ready.length;
      for (const shelf of shelves) {
        shelf.classList.remove('still');
        shelf.classList.toggle('on', shelf === ready[at]);
      }
      this.#shelfTimer = setTimeout(awake(next), SHELF_MS);
    };
    this.#shelfTimer = setTimeout(awake(next), first);
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
        // The story: read through to its end, then from its start again. Started once: other
        // words changing (the next curiosity) must not send it back to its start.
        if (box.classList.contains('looping')) continue;
        if (box.classList.contains('story')) {
          this.#storyScroll?.cancel();
          this.#storyScroll = loopScroll(inner, over);
          box.classList.add('looping');
          continue;
        }
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

  /**
   * The description and every chapter of the story, one text: longer than its box, it scrolls
   * slowly to its end, rests, and starts again from its beginning (`#scrollOverflow`).
   */
  #readingPart(): HTMLElement | null {
    const all = this.#readings();
    if (!all.length) return null;
    const paragraphs = all.map((text) => el('span', { class: 'para' }, text));
    return el(
      'div',
      { class: 'reading' },
      el(
        'p',
        { class: 'description scroll story' },
        el('span', { class: 'scroll-inner' }, ...paragraphs)
      )
    );
  }

  #factStrip(): HTMLElement | null {
    const facts = this.#info?.curiosities ?? [];
    const fact = facts[this.#fact % Math.max(1, facts.length)];
    if (!fact) return null;
    return el(
      'aside',
      { class: 'fact' },
      el('span', { class: 'label' }, 'Did you know?'),
      scroller('p', fact),
      // How long until the next one, when they move on by themselves (see `#scheduleFact`).
      facts.length > 1 && this.rotateFacts ? el('span', { class: 'timer' }) : null
    );
  }

  #scheduleFact(): void {
    clearTimeout(this.#factTimer);
    const facts = this.#info?.curiosities ?? [];
    if (facts.length < 2 || !this.rotateFacts) return;
    const strip = this.#slots.get('fact');
    const ms = stayMs(strip?.querySelector<HTMLElement>('.scroll'), facts[this.#fact] ?? '');
    strip?.querySelector<HTMLElement>('.timer')?.style.setProperty('--fact-ms', `${ms}ms`);
    this.#factTimer = setTimeout(
      awake(() => this.nextFact()),
      ms
    );
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
    img.addEventListener(
      'load',
      () => {
        const aspect = img.naturalWidth / img.naturalHeight;
        if (aspect > 0) img.style.setProperty('--maker-h', `${makerHeight(aspect).toFixed(2)}rem`);
      },
      { once: true }
    );
  }
  return makers;
}

let deckId = 0;

/**
 * The floor's still lines, running from the front to where they would meet (the vanishing point,
 * a seventh of the floor's depth above its horizon): drawn once, in the system's colour, fading
 * toward the horizon, the front and the sides.
 */
function deckRays(): string {
  const id = `deck-fade-${++deckId}`;
  // The floor box as 320 × 46; its front line spans 640 wide at the bottom, centred.
  const vy = -46 / 7;
  const rays: string[] = [];
  // Close together: the floor is wide, and stretched to it.
  for (let k = 0; k <= 30; k++) {
    const x = -200 + 24 * k;
    const side = Math.max(0, 1 - Math.abs(x - 160) / 220);
    if (side <= 0) continue;
    rays.push(
      `<line x1="160" y1="${vy.toFixed(2)}" x2="${x}" y2="46" stroke-opacity="${side.toFixed(2)}"/>`
    );
  }
  return (
    `<svg class="rays" viewBox="0 0 320 46" preserveAspectRatio="none">` +
    `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="46">` +
    `<stop offset="0" style="stop-color: rgb(var(--sys-rgb)); stop-opacity: 0.15"/>` +
    `<stop offset="0.45" style="stop-color: rgb(var(--sys-rgb)); stop-opacity: 0.6"/>` +
    `<stop offset="1" style="stop-color: rgb(var(--sys-rgb)); stop-opacity: 0"/>` +
    `</linearGradient></defs>` +
    `<g stroke="url(#${id})" stroke-width="1.5" vector-effect="non-scaling-stroke" fill="none">` +
    rays.join('') +
    `</g></svg>`
  );
}

/**
 * How tall a maker's logo stands in the corner, in rem, for its width over its height: about the
 * same area for every one (SEGA's, 3:1 at 1.9rem), so a square emblem (Atari's) is not a speck
 * beside a wordmark; 1.7rem to 3.6rem.
 */
export function makerHeight(aspect: number): number {
  return Math.min(3.6, Math.max(1.7, Math.sqrt(11 / aspect)));
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
  // A console on its own (no backdrop of its photo's) stands on a floor: a neon grid running
  // toward the player.
  if (system.photoKind === 'cutout') {
    const deck = el('div', { class: 'deck', 'aria-hidden': 'true' });
    deck.innerHTML = deckRays();
    for (let i = 0; i < 6; i++) deck.append(el('div', { class: 'cross' }));
    box.append(deck);
  }
  return box;
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

/** One moment of a system's life: a year, and what happened (where, as flags). */
export interface LifeEvent {
  year: number;
  what: string;
  regions: string[];
}

const REGION_NAMES: Record<string, string> = {
  JP: 'Japan',
  NA: 'North America',
  EU: 'Europe',
  UK: 'UK',
  DE: 'Germany',
  KR: 'Korea',
  TW: 'Taiwan'
};

/**
 * Its life from what the info says: launched where and when ("1987 JP · 1989 NA"), and when it
 * ended ("1987–1994 (7 years)"). One moment a year; none known, none.
 */
export function lifeEvents(
  released: string | null | undefined,
  lifetime: string | null | undefined
): LifeEvent[] {
  const events: LifeEvent[] = [];
  for (const m of (released ?? '').matchAll(/(\d{4})\s*(JP|NA|EU|UK|DE|KR|TW)?/g)) {
    const year = Number(m[1]);
    const region = m[2];
    let event = events.find((e) => e.year === year);
    if (!event) {
      event = { year, what: '', regions: [] };
      events.push(event);
    }
    if (region && !event.regions.includes(region)) event.regions.push(region);
  }
  events.sort((a, b) => a.year - b.year);
  events.forEach((e, n) => {
    e.what =
      n === 0
        ? 'Launch'
        : e.regions.length === 1
          ? REGION_NAMES[e.regions[0]!]!
          : e.regions.length
            ? 'Abroad'
            : 'Release';
  });
  const end = /\d{4}\s*[–-]\s*(\d{4})/.exec(lifetime ?? '')?.[1];
  const last = events.at(-1);
  if (end && last && Number(end) > last.year) {
    events.push({ year: Number(end), what: 'Last made', regions: [] });
  }
  return events;
}

/** The life as a line of moments, evenly spaced, the years over it. `null` with fewer than two. */
function lifeline(events: LifeEvent[]): HTMLElement | null {
  if (events.length < 2) return null;
  return el(
    'div',
    { class: 'life' },
    el(
      'ol',
      { style: `--moments: ${events.length}` },
      ...events.map((e) =>
        el(
          'li',
          {},
          el('span', { class: 'year' }, String(e.year)),
          el('span', { class: 'dot' }),
          el(
            'span',
            { class: 'what' },
            ...e.regions.map((r) =>
              el('img', { class: 'flag', src: `./flags/${REGION_FLAGS[r]}.svg`, alt: r })
            ),
            e.what
          )
        )
      )
    )
  );
}

/** "~61.9 million", "About 118.69 million (Game Boy and …)": the number and its word only. */
export function soldShort(text: string): string {
  const m = /([\d.,]+)\s*(million|thousand|billion)?/i.exec(text);
  return m ? `${m[1]}${m[2] ? ` ${m[2].toLowerCase()}` : ''}` : text;
}

/** The hardware's parts, in this order, as far as the info knows. */
const HARDWARE: [keyof NonNullable<SystemInfo['specs']>, string][] = [
  ['cpu', 'CPU'],
  ['memory', 'Memory'],
  ['graphics', 'Graphics'],
  ['sound', 'Sound']
];

/** A section of the page: its small title over what it holds. */
function section(cls: string, title: string, ...body: (HTMLElement | null)[]): HTMLElement {
  return el('section', { class: `part ${cls}` }, el('h3', {}, title), ...body);
}

/**
 * Left of the console: its hardware, part by part, each one's name small over its value (a long
 * value scrolls in its place). `null` when nothing is known.
 */
function hardware(specs: SystemInfo['specs']): HTMLElement | null {
  const cells = HARDWARE.flatMap(([key, label]) => {
    const value = specs?.[key];
    return value ? [el('div', { class: 'cell' }, el('dt', {}, label), scroller('dd', value))] : [];
  });
  return cells.length ? section('hardware', 'Hardware', el('dl', {}, ...cells)) : null;
}

/**
 * The bottom-left corner: its generation and units sold, each a small name over a large value.
 * `null` when neither is known.
 */
function tally(rows: [string, string | null][]): HTMLElement | null {
  const cells = rows.flatMap(([label, value]) =>
    value ? [el('div', { class: 'cell' }, el('dt', {}, label), el('dd', {}, value))] : []
  );
  return cells.length ? el('dl', { class: 'tally' }, ...cells) : null;
}

/**
 * Right of the console: its best sellers (or classics), each its real cartridge or disc with its
 * name beside it. A game whose picture will not load is left out; `null`
 * with none.
 */
function iconicGames(best: Bestseller[], ranked: boolean): HTMLElement | null {
  return shelf(
    'sellers',
    ranked ? 'Best sellers' : 'Classics',
    best.map((game) => ({ src: game.art, name: game.name }))
  );
}

/**
 * One shelf of the column right of the console: each thing's picture with its name beside it,
 * zigzagging. One whose picture will not load is left out; `null` with none.
 */
function shelf(
  cls: string,
  title: string,
  things: { src: string; name: string }[]
): HTMLElement | null {
  if (!things.length) return null;
  const items = things.map((thing, n) => {
    const art = el('img', { src: thing.src, alt: '', decoding: 'async' });
    const item = el(
      'li',
      { style: `--i: ${n}` },
      el('span', { class: 'pic' }, art),
      el('span', { class: 'game' }, thing.name)
    );
    art.addEventListener('error', () => item.remove(), { once: true });
    return item;
  });
  return section(`rack ${cls}`, title, el('ol', {}, ...items));
}
