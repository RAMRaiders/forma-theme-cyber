import type { Game } from '@ramraiders/forma-sdk';

import type { LazyList } from '../logic/pager.js';
import { el, remPx } from './dom.js';
import {
  ARCADE,
  type Achievements,
  type Kind,
  LANGUAGES,
  type MediaUrl,
  REGIONS,
  type ShowGame,
  captions,
  date,
  names,
  played,
  players
} from './stage.js';

/**
 * The Collector view: a game list as a collector keeps one.
 *
 * - The shelf, on the left: every game a box lying on its side, spine out; the selected one
 *   slides out of the stack.
 * - The showcase, in the middle: the game's box in 3D in a lit case, turning from its front to
 *   its spine to its back (or as the player turns it, left and right), its cartridge standing
 *   beside it, its screenshots as prints below, and a grading label on top.
 * - The dossier, on the right: everything known about it, what of it is in the collection, and
 *   what the player has done with it.
 *
 * What a game lacks is made up in Cyber's style: a spine from its logo and colour, a back from
 * its screenshot and story. No videos here: the box is the show.
 */

export interface CollectorOptions {
  media: MediaUrl;
  achievements?: (game: Game) => Promise<Achievements | null>;
  /** The game's colour, from a small picture of it. */
  accent?: (url: string) => Promise<string | null>;
  /** A system's name and small logo (`dark`: it needs a light plate). */
  system?: (name: string) => { name: string; logo: string | null; dark: boolean } | null;
  prepare?: (items: { gameId: number; kind: Kind; width: number }[]) => void;
}

/** Every picture the view shows, at the width it asks, the most needed first. */
export const COLLECTOR_PICTURES: readonly (readonly [Kind, number])[] = [
  ['thumbnail', 640],
  ['boxside', 160],
  ['fanart', 640],
  ['wheel', 560],
  ['boxback', 640],
  ['cartridge', 400],
  ['thumbnail', 64],
  ['marquee', 560],
  ['titleshot', 400],
  ['image', 400],
  ['mix', 400],
  ['map', 400]
];

/** Row height of the shelf in rem: each a box on its side. */
const ROW_REM = 2.5;
const OVERSCAN = 6;
/** A held direction: the showcase waits for the selection to settle. */
const SETTLE_MS = 150;
/** On a game: the box first turns after this, then every `TURN_MS`. */
const FIRST_TURN_MS = 3200;
const TURN_MS = 4600;
/** The story, a caption at a time. */
const CAPTION_MS = 7000;
/** After this long on a game, the pictures of the games around it are made ahead. */
const PREPARE_AFTER_MS = 3000;
const PREPARE_AROUND = 3;
/** The box's height in rem until the case is laid out; its width and depth follow its pictures. */
const BOX_REM = 17.5;
/** Then as tall as the case allows, between these. */
const BOX_MIN_REM = 12;
const BOX_MAX_REM = 26;
/** Kept clear under the box (the plinth) and on each side of it (the cartridge, the prints). */
const UNDER_REM = 4.6;
const SIDE_REM = 8.5;
/** Until its pictures say otherwise: a Mega Drive case's shape. */
const FRONT_RATIO = 0.72;
const SPINE_RATIO = 0.14;

/** The box's poses: how far it is turned for each, in degrees. */
const POSES = [
  { id: 'front', label: 'Front', angle: -24 },
  { id: 'spine', label: 'Spine', angle: 66 },
  { id: 'back', label: 'Back', angle: 156 }
] as const;

/** Screenshots, as prints. */
const PRINTS: Kind[] = ['titleshot', 'image', 'mix', 'map'];

const motion = () => document.documentElement.dataset.motion !== 'off';

function picture(src: string, cls: string): HTMLImageElement {
  return el('img', { src, alt: '', decoding: 'async', class: cls });
}

export class CollectorView {
  readonly root = el('div', { class: 'collector' });
  readonly #backdrop = el('div', { class: 'collector-backdrop', 'aria-hidden': 'true' });
  readonly #shelf = el('div', { class: 'shelf', role: 'listbox' });
  readonly #spacer = el('div', { class: 'spacer' });
  readonly #showcase = el('section', { class: 'showcase' });
  readonly #dossier = el('aside', { class: 'dossier' });
  readonly #options: CollectorOptions;
  #rows = new Map<number, HTMLElement>();
  #source: LazyList<Game> | null = null;
  #selected = 0;
  #pending = false;
  #lastMove = -Infinity;
  #settle: ReturnType<typeof setTimeout> | undefined;
  #timers: ReturnType<typeof setTimeout>[] = [];
  #intervals: ReturnType<typeof setInterval>[] = [];
  #accents = new Map<number, Promise<string | null>>();
  /** The shelf's colours, worked out one after another. */
  #colourQueue: Promise<void> = Promise.resolve();
  #achievements = new Map<number, Promise<Achievements | null>>();
  #game: ShowGame | null = null;
  #box: HTMLElement | null = null;
  /** Sizes the box to its case, once the case is laid out. */
  #fit: (() => void) | null = null;
  #dots: HTMLElement | null = null;
  #pose = 0;
  #angle: number = POSES[0].angle;

  /** Kept for the list views' common shape: the Collector view plays no videos. */
  previews = false;

  constructor(options: CollectorOptions) {
    this.#options = options;
    this.#shelf.append(this.#spacer);
    this.root.append(this.#backdrop, this.#shelf, this.#showcase, this.#dossier);
    this.#shelf.addEventListener('scroll', () => this.render(), { passive: true });
  }

  show(source: LazyList<Game>, selected: number): void {
    this.#source = source;
    this.#rows.forEach((row) => row.remove());
    this.#rows.clear();
    this.#spacer.style.height = `${source.total * ROW_REM}rem`;
    this.#selected = -1;
    this.select(selected);
  }

  get selected(): Game | undefined {
    return this.#source?.get(this.#selected);
  }

  pageSize(): number {
    return Math.max(1, Math.floor(this.#shelf.clientHeight / (ROW_REM * remPx())));
  }

  select(index: number): void {
    const changed = index !== this.#selected;
    this.#selected = index;
    const row = ROW_REM * remPx();
    this.#shelf.scrollTop = Math.max(0, index * row - (this.#shelf.clientHeight - row) / 2);
    this.render();
    if (!changed) return;
    const now = performance.now();
    const fast = now - this.#lastMove < SETTLE_MS;
    this.#lastMove = now;
    clearTimeout(this.#settle);
    if (fast) this.#settle = setTimeout(() => this.#showSelected(), SETTLE_MS);
    else this.#showSelected();
  }

  /** The visible shelf, from whatever is loaded; again as pages arrive. */
  render(): void {
    const source = this.#source;
    if (!source) return;
    const row = ROW_REM * remPx();
    const first = Math.max(0, Math.floor(this.#shelf.scrollTop / row) - OVERSCAN);
    const last = Math.min(
      source.total - 1,
      Math.ceil((this.#shelf.scrollTop + this.#shelf.clientHeight) / row) + OVERSCAN
    );
    for (const [i, node] of this.#rows) {
      if (i < first || i > last) {
        node.remove();
        this.#rows.delete(i);
      }
    }
    for (let i = first; i <= last; i++) {
      const game = source.get(i);
      let node = this.#rows.get(i);
      if (!node) {
        node = el('div', { class: 'spine-row', role: 'option' });
        node.style.top = `${i * ROW_REM}rem`;
        this.#shelf.append(node);
        this.#rows.set(i, node);
      }
      const key = game ? String(game.id) : '';
      if (node.dataset.key !== key) {
        node.dataset.key = key;
        node.replaceChildren(...(game ? shelfRow(game) : [el('span', { class: 'title' }, '…')]));
        node.classList.remove('tinted');
        if (game) this.#spineColour(game, node);
      }
      node.classList.toggle('selected', i === this.#selected);
      node.setAttribute('aria-selected', String(i === this.#selected));
    }
    if (this.#pending && this.selected) this.#showSelected();
  }

  refreshSelected(game: Game): void {
    this.#source?.set(this.#selected, game);
    this.render();
    if (this.#game?.id === game.id) {
      this.#game = game;
      const name = this.#dossier.querySelector('.head h2');
      this.#dossier.querySelector('.head .favourite')?.remove();
      if (game.favorite) name?.after(favouriteTag());
    } else {
      this.#showSelected();
    }
  }

  /** Turns the box to its next pose (`1`) or its last (`-1`); it stops turning by itself. */
  turn(direction: 1 | -1): void {
    if (!this.#box) return;
    this.#intervals.forEach(clearInterval);
    this.#intervals = [];
    this.#turnTo(direction);
  }

  leave(): void {
    clearTimeout(this.#settle);
    this.#stop();
  }

  resume(): void {
    if (this.#source) this.#showSelected(true);
  }

  #stop(): void {
    this.#timers.forEach(clearTimeout);
    this.#intervals.forEach(clearInterval);
    this.#timers = [];
    this.#intervals = [];
  }

  #later(work: () => void, ms: number): void {
    this.#timers.push(setTimeout(work, ms));
  }

  #every(work: () => void, ms: number): void {
    this.#intervals.push(setInterval(work, ms));
  }

  /** The selected game in the showcase; the one already there stays as it is, unless `again`. */
  #showSelected(again = false): void {
    const game = this.selected;
    this.#pending = !game;
    if (game && !again && this.#game?.id === game.id && this.#box) return;
    this.#stop();
    if (!game) return;
    this.#game = game;
    this.#pose = 0;
    this.#angle = POSES[0].angle;
    this.root.style.removeProperty('--game');
    this.#tint(game);
    this.#backdropFor(game);
    this.#showcase.replaceChildren(...this.#showcaseParts(game));
    this.#dossier.replaceChildren(...this.#dossierParts(game));
    requestAnimationFrame(() => this.#fit?.());
    if (motion()) {
      this.#later(() => {
        this.#turnTo(1);
        this.#every(() => this.#turnTo(1), TURN_MS);
      }, FIRST_TURN_MS);
    }
    this.#later(() => this.#prepareAround(), PREPARE_AFTER_MS);
  }

  #turnTo(direction: 1 | -1): void {
    const box = this.#box;
    if (!box) return;
    const next = (this.#pose + direction + POSES.length) % POSES.length;
    let delta = POSES[next]!.angle - POSES[this.#pose]!.angle;
    // Always on round the same way: never back the long way.
    if (direction > 0 && delta <= 0) delta += 360;
    if (direction < 0 && delta >= 0) delta -= 360;
    this.#pose = next;
    this.#angle += delta;
    box.style.transform = boxTransform(this.#angle);
    box.dataset.pose = POSES[next]!.id;
    this.#dots
      ?.querySelectorAll('span')
      .forEach((dot, i) => dot.classList.toggle('on', i === next));
  }

  /** The game's colour, from its box: Cyber's own until it is known. */
  /**
   * A shelf row in its game's own colour, from its box: grey until the colour is known (one
   * picture at a time, so scrolling stays smooth on a Pi); a colour from its name where it has
   * no picture at all.
   */
  #spineColour(game: Game, node: HTMLElement): void {
    const key = node.dataset.key;
    // Skipped if the row has gone by before its turn (scrolling fast through a long list).
    const colour = this.#colourOf(game, () => node.isConnected && node.dataset.key === key);
    if (!colour) {
      node.style.setProperty('--hue', String(hue(game.name)));
      node.classList.add('tinted');
      return;
    }
    void colour.then((c) => {
      // The row has since moved on to another game.
      if (node.dataset.key !== key) return;
      const degrees = c ? hueOf(c) : null;
      node.style.setProperty('--hue', String(degrees ?? hue(game.name)));
      node.classList.add('tinted');
    });
  }

  /**
   * A game's colour from its box (or its fan art), worked out once and kept. For the shelf
   * (`wanted` given) in turn, and not at all if no longer wanted by then; for the selected game
   * at once.
   */
  #colourOf(game: Game, wanted?: () => boolean): Promise<string | null> | null {
    const accent = this.#options.accent;
    const source =
      this.#options.media(game, 'thumbnail', 64) ?? this.#options.media(game, 'fanart', 64);
    if (!accent || !source) return null;
    let colour = this.#accents.get(game.id);
    if (colour) return colour;
    if (!wanted) {
      colour = accent(source).catch(() => null);
      this.#accents.set(game.id, colour);
      return colour;
    }
    const id = game.id;
    const queued = this.#colourQueue.then(async () => {
      if (wanted()) return accent(source).catch(() => null);
      // Not worked out: asked again when the row comes back.
      this.#accents.delete(id);
      return null;
    });
    this.#colourQueue = queued.then(() => undefined);
    this.#accents.set(id, queued);
    return queued;
  }

  #tint(game: Game): void {
    const colour = this.#colourOf(game);
    if (!colour) return;
    const id = game.id;
    void colour.then((c) => {
      if (c && this.#game?.id === id) this.root.style.setProperty('--game', c);
    });
  }

  /** The fan art, small and dim behind the room: upscaled, it is its own blur. */
  #backdropFor(game: Game): void {
    const old = [...this.#backdrop.children];
    const leave = () => {
      old.forEach((n) => n.classList.add('leaving'));
      setTimeout(() => old.forEach((n) => n.remove()), 900);
    };
    const src = this.#options.media(game, 'fanart', 640) ?? this.#options.media(game, 'image', 400);
    if (!src) return leave();
    const img = picture(src, 'waiting');
    this.#backdrop.append(img);
    img.addEventListener(
      'load',
      () => {
        img.classList.remove('waiting');
        leave();
      },
      { once: true }
    );
    img.addEventListener('error', () => img.remove(), { once: true });
  }

  #showcaseParts(game: ShowGame): HTMLElement[] {
    const media = this.#options.media;
    const box = this.#caseOf(game);
    this.#box = box;
    const floater = el('div', { class: 'float' }, box);

    const display = el(
      'div',
      { class: 'display' },
      el('div', { class: 'spotlight' }),
      el('div', { class: 'plinth' }, el('div', { class: 'ring' })),
      floater
    );
    const cartridge = media(game, 'cartridge', 400);
    if (cartridge) {
      const cart = picture(cartridge, 'cart');
      cart.addEventListener('error', () => cart.remove(), { once: true });
      display.append(cart);
      display.classList.add('has-cart');
    }

    this.#dots = el(
      'div',
      { class: 'poses', 'aria-hidden': 'true' },
      ...POSES.map((p, i) => el('span', { class: i === 0 ? 'on' : '' }, p.label))
    );

    // Beside the box, on the right, as the cartridge stands on its left.
    const prints = el('div', { class: 'prints' });
    PRINTS.map((k) => media(game, k, 400))
      .filter((u): u is string => u !== null)
      .slice(0, 3)
      .forEach((src, i) => {
        const img = picture(src, '');
        const print = el('div', { class: 'print' }, img);
        print.style.setProperty('--i', String(i));
        img.addEventListener('error', () => print.remove(), { once: true });
        prints.append(print);
      });

    display.append(prints);
    if (prints.childElementCount) display.classList.add('has-prints');
    return [this.#label(game), display, this.#dots];
  }

  /** The grading label on top of the case: the game, its system, its grade, its serial. */
  #label(game: ShowGame): HTMLElement {
    const system = this.#options.system?.(game.system);
    const mark = el('div', { class: 'mark' });
    if (system?.logo) {
      const img = picture(system.logo, `system${system.dark ? ' dark' : ''}`);
      img.addEventListener('error', () => img.replaceWith(system.name), { once: true });
      mark.append(img);
    } else {
      mark.append(el('span', {}, system?.name ?? game.system.toUpperCase()));
    }
    const grade = gradeOf(game.rating);
    const details = [
      game.releaseDate?.slice(0, 4),
      system?.name ?? game.system,
      game.region ? names(game.region, REGIONS) : null
    ].filter((t): t is string => !!t);
    return el(
      'div',
      { class: 'slab-label' },
      mark,
      el(
        'div',
        { class: 'what' },
        el('span', { class: 'brand' }, 'CYBER · COLLECTOR GRADE'),
        el('strong', {}, game.name),
        el('span', { class: 'line' }, details.join(' · ')),
        el('span', { class: 'serial' }, serial(game))
      ),
      barcode(game),
      el(
        'div',
        { class: `grade${grade ? '' : ' none'}` },
        el('strong', {}, grade?.score ?? '—'),
        el('span', {}, grade?.word ?? 'Ungraded')
      )
    );
  }

  /**
   * The box in 3D: front, back and spine from its pictures (made up where it has none), and
   * plain top, bottom and open side. Sized to its own pictures once they are in.
   */
  #caseOf(game: ShowGame): HTMLElement {
    const media = this.#options.media;
    const box = el('div', { class: 'cbox', 'data-pose': 'front' });
    box.style.transform = boxTransform(this.#angle);
    const size = { ratio: FRONT_RATIO, depth: SPINE_RATIO };
    const resize = () => {
      const display = box.closest<HTMLElement>('.display');
      const h = display?.clientHeight
        ? boxHeight(
            display.clientWidth / remPx() -
              SIDE_REM *
                (Number(display.classList.contains('has-cart')) +
                  Number(display.classList.contains('has-prints'))),
            display.clientHeight / remPx(),
            size.ratio,
            size.depth
          )
        : BOX_REM;
      box.style.setProperty('--h', `${h.toFixed(2)}rem`);
      box.style.setProperty('--w', `${(h * size.ratio).toFixed(2)}rem`);
      box.style.setProperty('--d', `${(h * size.depth).toFixed(2)}rem`);
    };
    resize();
    this.#fit = resize;

    const frontSrc = media(game, 'thumbnail', 640);
    const front = el('div', { class: 'face front' });
    if (frontSrc) {
      const img = picture(frontSrc, '');
      img.addEventListener(
        'load',
        () => {
          if (img.naturalHeight > 0) {
            size.ratio = clamp(img.naturalWidth / img.naturalHeight, 0.55, 1.4);
            resize();
          }
          box.classList.add('ready');
        },
        { once: true }
      );
      img.addEventListener(
        'error',
        () => {
          img.replaceWith(...madeCover(game, media));
          box.classList.add('ready');
        },
        { once: true }
      );
      front.append(img);
    } else {
      front.append(...madeCover(game, media));
      box.classList.add('ready', 'made');
    }

    const spineSrc = media(game, 'boxside', 160);
    const spine = el('div', { class: 'face spine' });
    if (spineSrc) {
      const img = picture(spineSrc, '');
      img.addEventListener(
        'load',
        () => {
          if (img.naturalHeight > 0) {
            size.depth = clamp(img.naturalWidth / img.naturalHeight, 0.05, 0.3);
            resize();
          }
        },
        { once: true }
      );
      img.addEventListener('error', () => img.replaceWith(...madeSpine(game, media)), {
        once: true
      });
      spine.append(img);
    } else {
      spine.append(...madeSpine(game, media));
    }

    const backSrc = media(game, 'boxback', 640);
    const back = el('div', { class: 'face back' });
    if (backSrc) {
      const img = picture(backSrc, '');
      img.addEventListener('error', () => img.replaceWith(...madeBack(game, media)), {
        once: true
      });
      back.append(img);
    } else {
      back.append(...madeBack(game, media));
    }

    box.append(
      front,
      back,
      spine,
      el('div', { class: 'face side' }),
      el('div', { class: 'face top' }),
      el('div', { class: 'face bottom' })
    );
    return box;
  }

  #dossierParts(game: ShowGame): HTMLElement[] {
    const media = this.#options.media;
    const head = el('header', { class: 'head' });
    const logo = media(game, 'wheel', 560) ?? media(game, 'marquee', 560);
    // Its logo, where it has one, is its name here: the label over the box has it in words.
    if (logo) {
      const img = picture(logo, 'logo');
      head.classList.add('has-logo');
      img.addEventListener(
        'error',
        () => {
          img.remove();
          head.classList.remove('has-logo');
        },
        { once: true }
      );
      head.append(img);
    }
    head.append(el('h2', {}, game.name));
    if (game.favorite) head.append(favouriteTag());

    const specs = el('dl', { class: 'specs' });
    const add = (label: string, value: string | null | undefined) => {
      if (value) specs.append(el('div', {}, el('dt', {}, label), el('dd', {}, value)));
    };
    add('Released', game.releaseDate ? date(game.releaseDate) : null);
    add('Developer', game.developer);
    add('Publisher', game.publisher);
    add('Genre', game.genre);
    add('Players', game.players ? players(game.players) : null);
    add('Region', game.region ? names(game.region, REGIONS) : null);
    add('Languages', game.lang ? names(game.lang, LANGUAGES) : null);
    if (game.rating !== null) {
      const stars = el('span', {
        class: 'stars',
        role: 'img',
        'aria-label': `${(game.rating * 10).toFixed(1)} of 10`
      });
      stars.style.setProperty('--rating', String(game.rating));
      specs.append(el('div', {}, el('dt', {}, 'Rating'), el('dd', {}, stars)));
    }

    const kept = inventory(game, media);
    const inv = el(
      'section',
      { class: 'inventory' },
      el('h3', {}, 'In the collection'),
      el('p', { class: 'status' }, kept.status),
      el(
        'ul',
        {},
        ...kept.items.map(([label, has]) =>
          el('li', { class: has ? 'has' : 'missing' }, `${has ? '✓' : '·'} ${label}`)
        )
      )
    );

    const record = el(
      'section',
      { class: 'record' },
      el('h3', {}, 'Play record'),
      el('p', {}, played(game) ?? 'Never yet')
    );
    this.#achievementsInto(game, record);

    const chunks = captions(game.description ?? '');
    const line = el('p', { class: 'line' }, chunks[0] ?? '');
    const story = el(
      'section',
      { class: 'story' },
      el('h3', {}, ARCADE.has(game.system) ? 'History' : 'Story'),
      line
    );
    if (chunks.length === 0) story.hidden = true;
    if (chunks.length > 1 && motion()) {
      let at = 0;
      this.#every(() => {
        at = (at + 1) % chunks.length;
        line.classList.add('turning');
        setTimeout(() => {
          line.textContent = chunks[at] ?? '';
          line.classList.remove('turning');
        }, 350);
      }, CAPTION_MS);
    }
    return [head, specs, inv, record, story];
  }

  #achievementsInto(game: Game, record: HTMLElement): void {
    const fetch = this.#options.achievements;
    if (game.raGameId === null || !fetch) return;
    let progress = this.#achievements.get(game.id);
    if (!progress) {
      progress = fetch(game).catch(() => null);
      this.#achievements.set(game.id, progress);
    }
    const id = game.id;
    void progress.then((a) => {
      if (!a || a.total === 0 || this.#game?.id !== id) return;
      const bar = el('div', { class: 'bar' });
      bar.style.setProperty('--done', String(a.earned / a.total));
      record.append(
        el('div', { class: 'achievements' }, el('span', {}, `🏆 ${a.earned} / ${a.total}`), bar)
      );
    });
  }

  #prepareAround(): void {
    const prepare = this.#options.prepare;
    const source = this.#source;
    if (!prepare || !source) return;
    const items: { gameId: number; kind: Kind; width: number }[] = [];
    for (let d = 1; d <= PREPARE_AROUND; d++) {
      for (const i of [this.#selected + d, this.#selected - d]) {
        const game = i >= 0 && i < source.total ? source.get(i) : undefined;
        if (!game) continue;
        const has = game.media as Partial<Record<string, string>>;
        for (const [kind, width] of COLLECTOR_PICTURES) {
          if (has[kind]) items.push({ gameId: game.id, kind, width });
        }
      }
    }
    if (items.length) prepare(items);
  }
}

/**
 * How tall the box stands, in rem, in `width` × `height` rem (the case, less what stands at its
 * sides): as tall as fits above the plinth, turned too (front and spine side by side).
 */
export function boxHeight(width: number, height: number, ratio: number, depth: number): number {
  const fits = Math.min(height - UNDER_REM, (width - 1) / (ratio + depth));
  return clamp(fits, BOX_MIN_REM, BOX_MAX_REM);
}

function boxTransform(angle: number): string {
  return `rotateX(-8deg) rotateY(${angle}deg)`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** A shelf row: the game's name down its spine, and its year. */
function shelfRow(game: Game): HTMLElement[] {
  return [
    el('span', { class: 'band', 'aria-hidden': 'true' }),
    el('span', { class: 'title' }, game.name),
    el('span', { class: 'year' }, game.releaseDate?.slice(0, 4) ?? '')
  ];
}

function favouriteTag(): HTMLElement {
  return el('span', { class: 'favourite' }, '★ Favourite');
}

/** The hue in an `hsl(...)` colour, in degrees; `null` if it is not one. */
export function hueOf(colour: string): number | null {
  const m = /^hsl\(\s*(-?[\d.]+)/.exec(colour);
  return m ? Number(m[1]) : null;
}

/** A colour of its own for a game with no picture, from its name. */
export function hue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** A rating (0–1) as a collector's grade: `7.0`, "Excellent". */
export function gradeOf(rating: number | null): { score: string; word: string } | null {
  if (rating === null) return null;
  const score = Math.round(rating * 100) / 10;
  const word =
    score >= 9.8
      ? 'Gem mint'
      : score >= 9
        ? 'Mint'
        : score >= 8
          ? 'Near mint'
          : score >= 7
            ? 'Excellent'
            : score >= 6
              ? 'Very good'
              : score >= 5
                ? 'Good'
                : 'Fair';
  return { score: score.toFixed(1), word };
}

/** The case's serial: the system and the game's number in the library. */
export function serial(game: Game): string {
  return `${game.system.toUpperCase()}-${String(game.id).padStart(6, '0')}`;
}

/** A barcode, the same for the same game. */
function barcode(game: Game): HTMLElement {
  const code = el('div', { class: 'barcode', 'aria-hidden': 'true' });
  let seed = hue(serial(game)) + game.id * 7919;
  for (let i = 0; i < 26; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const bar = el('i', {});
    bar.style.width = `${1 + (seed % 3)}px`;
    bar.style.marginRight = `${1 + ((seed >> 4) % 3)}px`;
    code.append(bar);
  }
  return code;
}

/** What of the game the collection holds, and what that makes it, in a collector's words. */
export function inventory(
  game: Game,
  media: MediaUrl
): { status: string; items: [string, boolean][] } {
  const has = (k: Kind) => media(game, k) !== null;
  const box = has('thumbnail');
  const cart = has('cartridge');
  const manual = has('manual');
  const status =
    box && cart && manual
      ? 'Complete in box'
      : box && cart
        ? 'Boxed, no manual'
        : box
          ? 'Box only'
          : cart
            ? 'Loose'
            : 'Digital copy';
  return {
    status,
    items: [
      ['Box', box],
      ['Back', has('boxback')],
      ['Spine', has('boxside')],
      [ARCADE.has(game.system) ? 'Board' : 'Cartridge', cart],
      ['Manual', manual],
      ['Video', has('video')],
      ['Fan art', has('fanart')]
    ]
  };
}

/** A front made up: the fan art (or a screenshot) under its logo (or its name). */
function madeCover(game: Game, media: MediaUrl): HTMLElement[] {
  const art = media(game, 'fanart', 640) ?? media(game, 'image', 400);
  const logo = media(game, 'wheel', 560) ?? media(game, 'marquee', 560);
  return [
    el(
      'div',
      { class: 'made-cover' },
      ...(art ? [picture(art, 'art')] : []),
      logo ? picture(logo, 'logo') : el('strong', {}, game.name)
    )
  ];
}

/** A spine made up: the game's colour, its logo (or its name) along it. */
function madeSpine(game: Game, media: MediaUrl): HTMLElement[] {
  const logo = media(game, 'wheel', 560) ?? media(game, 'marquee', 560);
  const along = el('div', { class: 'along' });
  if (logo) along.append(picture(logo, 'logo'));
  else along.append(el('strong', {}, game.name));
  const spine = el('div', { class: 'made-spine' }, along);
  spine.style.setProperty('--hue', String(hue(game.name)));
  return [spine];
}

/** A back made up: a screenshot and the first lines of its story. */
function madeBack(game: Game, media: MediaUrl): HTMLElement[] {
  const shot = PRINTS.map((k) => media(game, k, 400)).find((u) => u !== null);
  return [
    el(
      'div',
      { class: 'made-back' },
      ...(shot ? [picture(shot, 'shot')] : []),
      el('p', {}, captions(game.description ?? '')[0] ?? game.name)
    )
  ];
}
