import type { Game } from '@ramraiders/forma-sdk';

import type { LazyList } from '../logic/pager.js';
import { ageBand, ageRatings, pickAgeRating } from '../logic/agerating.js';
import { languageFlag, regionFlag, romName } from '../logic/romname.js';
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
 * - The shelf, over the middle while the selection moves: every game a box lying on its side,
 *   spine out, the selected one in the middle; a moment after the last move it fades away.
 * - Then the screen, in bays framed in Cyber's style under a grading label: the case (the
 *   game's box in 3D on a lit plinth, turning from its front to its spine to its back, or as
 *   the player turns it); the footage (its screenshots in turn, then
 *   its video, played by Forma in that window); its story; and the dossier (everything known
 *   about it, what it offers, what the player has done with it), with its cartridge in a bay under it when it has one.
 *
 * What a game lacks is made up in Cyber's style: a spine from its logo and colour, a back from
 * its screenshot and story.
 */

/** Part of the screen, as fractions of it (0–1) from its top left. */
export interface ScreenArea {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CollectorOptions {
  media: MediaUrl;
  achievements?: (game: Game) => Promise<Achievements | null>;
  /** What the game's emulator supports (`netplay`, `cheevos`); empty when unknown. */
  features?: (game: Game) => Promise<string[]>;
  /** The game's colour, from a small picture of it. */
  accent?: (url: string) => Promise<string | null>;
  /** A system's name and small logo (`dark`: it needs a light plate). */
  system?: (name: string) => { name: string; logo: string | null; dark: boolean } | null;
  prepare?: (items: { gameId: number; kind: Kind; width: number }[]) => void;
  /**
   * Plays a game's video, full screen under the page (Forma's player); `playing` once it shows.
   * Without it, no videos.
   */
  play?: (game: Game, area: ScreenArea) => Promise<{ playing: boolean }>;
  stopVideo?: () => void;
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
/** A row's own height, and the longest a spine picture lies along it. */
const ROW_H_REM = 2.2;
const SPINE_MAX_REM = 24;
const OVERSCAN = 6;
/** The shelf over the middle while moving; this long after the last move it fades. */
const DROP_MS = 1100;
/** On a game this long, its video plays in the footage bay. */
const VIDEO_AFTER_MS = 2500;
/** With no video, the footage bay shows the screenshots in turn. */
const SHOT_MS = 4000;
/** The story scrolls this fast when longer than its bay, px a second. */
const STORY_PX_S = 14;
/** A held direction: the showcase waits for the selection to settle. */
const SETTLE_MS = 150;
/** On a game: the box first turns after this, then every `TURN_MS`. */
const FIRST_TURN_MS = 3200;
const TURN_MS = 4600;
/** After this long on a game, the pictures of the games around it are made ahead. */
const PREPARE_AFTER_MS = 3000;
const PREPARE_AROUND = 3;
/** The box's height in rem until the case is laid out; its width and depth follow its pictures. */
const BOX_REM = 17.5;
/** Then as tall as the case allows, between these. */
const BOX_MIN_REM = 12;
const BOX_MAX_REM = 30;
/** Kept clear under the box: the plinth. */
const UNDER_REM = 4.6;
/** Until its pictures say otherwise: a Mega Drive case's shape. */
const FRONT_RATIO = 0.72;
const SPINE_RATIO = 0.14;

/** The box's poses: how far it is turned for each, in degrees. */
const POSES = [
  // Each face square on, flat as a picture of it; the box turns in 3D only between them.
  { id: 'front', label: 'Front', angle: 0 },
  { id: 'spine', label: 'Spine', angle: 90 },
  { id: 'back', label: 'Back', angle: 180 }
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
  /** The rows, moved as one so the selected sits in the middle: a transform, gliding. */
  readonly #track = el('div', { class: 'track' });
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
  /** The footage bay's screen: screenshots, and the video's window once it plays. */
  #footage: HTMLElement | null = null;
  #pose = 0;
  #angle: number = POSES[0].angle;

  /** The game's video behind the case after a moment; Interface → Video previews. */
  previews = true;
  #dropTimer: ReturnType<typeof setTimeout> | undefined;
  /** A video asked for, until it is stopped. */
  #video = false;
  /** Room above the first row and below the last, so any row can sit in the middle. */
  #pad = 0;

  constructor(options: CollectorOptions) {
    this.#options = options;
    this.#shelf.append(this.#track);
    this.root.append(this.#backdrop, this.#shelf, this.#showcase, this.#dossier);
  }

  show(source: LazyList<Game>, selected: number): void {
    this.#source = source;
    this.#rows.forEach((row) => row.remove());
    this.#rows.clear();
    this.#selected = -1;
    // Straight to it, no glide from wherever the last list was.
    this.#track.classList.add('still');
    this.select(selected);
    requestAnimationFrame(() => this.#track.classList.remove('still'));
  }

  /** The shelf's room above the first row, so any row can sit in the middle. */
  #measure(): void {
    const row = ROW_REM * remPx();
    this.#pad = Math.max(0, (this.#shelf.clientHeight - row) / 2);
  }

  /**
   * The shelf shows over the middle while the selection moves; a moment after the last move it
   * fades, and the case has the screen. Only opacity changes.
   */
  #browse(): void {
    this.root.classList.add('browsing');
    clearTimeout(this.#dropTimer);
    this.#dropTimer = setTimeout(() => this.root.classList.remove('browsing'), DROP_MS);
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
    this.#measure();
    // The selected row in the middle, at the ends of the list too; the rows glide there.
    this.#track.style.transform = `translateY(${this.#pad - index * row}px)`;
    this.render();
    if (!changed) return;
    this.#browse();
    this.#stopVideo();
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
    // Those in sight round the selected one, and a few more for the glide.
    const half = Math.ceil(this.#shelf.clientHeight / row / 2) + OVERSCAN;
    const at = Math.max(0, this.#selected);
    const first = Math.max(0, at - half);
    const last = Math.min(source.total - 1, at + half);
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
        this.#track.append(node);
        this.#rows.set(i, node);
      }
      const key = game ? String(game.id) : '';
      if (node.dataset.key !== key) {
        node.dataset.key = key;
        node.replaceChildren(
          ...(game ? this.#shelfRow(game, node) : [el('span', { class: 'title' }, '…')])
        );
        node.classList.remove('tinted');
        if (game) this.#spineColour(game, node);
      }
      node.classList.toggle('selected', i === this.#selected);
      node.setAttribute('aria-selected', String(i === this.#selected));
    }
    if (this.#pending && this.selected) this.#showSelected();
  }

  /**
   * A game on the shelf: its own spine picture, whole, lying on its side, where it has one (its
   * name still there for screen readers); else a spine in its colour with its name.
   */
  #shelfRow(game: Game, node: HTMLElement): HTMLElement[] {
    const parts = [
      el('span', { class: 'band', 'aria-hidden': 'true' }),
      el('span', { class: 'title' }, game.name)
    ];
    const src = this.#options.media(game, 'boxside', 160);
    node.classList.toggle('pictured', !!src);
    node.style.removeProperty('--len');
    if (!src) return parts;
    const img = picture(src, 'spine-pic');
    // The row as long as the spine is, at the row's height: all of it, nothing round it.
    img.addEventListener(
      'load',
      () => {
        if (!img.naturalWidth) return;
        const len = Math.min(SPINE_MAX_REM, ROW_H_REM * (img.naturalHeight / img.naturalWidth));
        node.style.setProperty('--len', `${len.toFixed(2)}rem`);
      },
      { once: true }
    );
    img.addEventListener(
      'error',
      () => {
        img.remove();
        node.classList.remove('pictured');
      },
      { once: true }
    );
    return [img, ...parts];
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
    clearTimeout(this.#dropTimer);
    this.root.classList.remove('browsing');
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
    this.#stopVideo();
  }

  /** Asks Forma for the game's video; once it plays, the page lets it through behind the case. */
  #startVideo(game: Game): void {
    const play = this.#options.play;
    const area = this.#footage ? screenArea(this.#footage) : null;
    if (!this.previews || !play || !area || !this.#options.media(game, 'video')) return;
    this.#video = true;
    const id = game.id;
    play(game, area)
      .then(({ playing }) => {
        if (playing && this.#video && this.#game?.id === id) this.#seeThrough(true);
      })
      .catch(() => {});
  }

  #stopVideo(): void {
    if (!this.#video) return;
    this.#video = false;
    // Opaque again at once: the video's last picture never shows over the next game.
    this.#seeThrough(false);
    this.#options.stopVideo?.();
  }

  #seeThrough(on: boolean): void {
    this.root.classList.toggle('video-on', on);
    document.documentElement.classList.toggle('video-through', on);
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
    this.#later(() => this.#startVideo(game), VIDEO_AFTER_MS);
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

    this.#dots = el(
      'div',
      { class: 'poses', 'aria-hidden': 'true' },
      ...POSES.map((p, i) => el('span', { class: i === 0 ? 'on' : '' }, p.label))
    );

    const shots = PRINTS.map((k) => media(game, k, 400)).filter((u): u is string => u !== null);
    this.#footage = el('div', { class: 'screen' });
    this.#footage.append(...shots.map((src, i) => shotImage(src, i === 0)));
    if (!shots.length) this.#footage.append(el('span', { class: 'no-signal' }, 'No signal'));
    if (shots.length > 1 && motion()) {
      let at = 0;
      this.#every(() => {
        const all = [...(this.#footage?.querySelectorAll('img') ?? [])];
        if (all.length < 2) return;
        all[at % all.length]?.classList.remove('on');
        at += 1;
        all[at % all.length]?.classList.add('on');
      }, SHOT_MS);
    }

    return [
      this.#label(game),
      bay('case', 'Case', display, this.#dots),
      bay('footage', 'Footage', this.#footage),
      this.#storyBay(game),
      this.#cartridgeBay(game)
    ].filter((p): p is HTMLElement => p !== null);
  }

  /**
   * The cartridge (an arcade game's board) in a bay of its own, under the dossier; without one
   * the dossier has the whole column.
   */
  #cartridgeBay(game: ShowGame): HTMLElement | null {
    const src = this.#options.media(game, 'cartridge', 400);
    this.root.classList.toggle('no-cart', !src);
    if (!src) return null;
    const img = picture(src, 'cart');
    img.addEventListener(
      'error',
      () => {
        img.closest('.bay')?.remove();
        this.root.classList.add('no-cart');
      },
      { once: true }
    );
    return bay('cartridge', ARCADE.has(game.system) ? 'Board' : 'Cartridge', img);
  }

  /** The game's story, all of it; when longer than its bay it scrolls slowly through. */
  #storyBay(game: ShowGame): HTMLElement {
    const text = el('div', { class: 'scroll-inner' }, game.description ?? '');
    const box = el('div', { class: 'text' }, text);
    const story = bay('story', ARCADE.has(game.system) ? 'History' : 'Story', box);
    // No story: the footage has its room.
    this.root.classList.toggle('no-story', !game.description);
    requestAnimationFrame(() => {
      const over = text.scrollHeight - box.clientHeight;
      if (over <= 2 || !motion()) return;
      box.style.setProperty('--scroll', `${-over}px`);
      box.style.setProperty('--scroll-s', `${Math.max(8, (over / STORY_PX_S) * 2)}s`);
      box.classList.add('scrolling');
    });
    return story;
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
      regionLine(game)
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
      ageBadge(game),
      el(
        'div',
        { class: `grade${grade ? '' : ' none'}` },
        el('strong', {}, grade?.score ?? '—'),
        game.rating !== null ? stars(game.rating) : '',
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
            display.clientWidth / remPx(),
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
    // The ROM's own name first (it is the copy at hand), the scraper's data after.
    const rom = romName(game.path);
    const regions = rom.regions.length ? rom.regions : codes(game.region);
    const languages = rom.languages.length ? rom.languages : codes(game.lang);
    const flagged = (
      label: string,
      list: string[],
      table: Record<string, string>,
      flag: (c: string) => string | null
    ) => {
      if (!list.length) return;
      specs.append(
        el(
          'div',
          {},
          el('dt', {}, label),
          el(
            'dd',
            { class: 'flags' },
            ...list.map((c) => flagChip(table[c] ?? c.toUpperCase(), flag(c)))
          )
        )
      );
    };
    flagged('Region', regions, REGIONS, regionFlag);
    flagged('Languages', languages, LANGUAGES, languageFlag);
    add('Version', rom.version);

    const marks = this.#marks(game);

    const record = el(
      'section',
      { class: 'record' },
      el('h3', {}, 'Play record'),
      el('p', {}, played(game) ?? 'Never yet')
    );
    this.#achievementsInto(game, record);

    const parts = [head, marks, specs, record];

    return parts;
  }

  /**
   * What the game offers, as icons: achievements, netplay, a manual, how many play. Lit when it
   * has it, faint when not; netplay once the emulator's features are known.
   */
  #marks(game: ShowGame): HTMLElement {
    const has = (k: Kind) => this.#options.media(game, k) !== null;
    const netplay = mark('netplay', ICONS.netplay, 'Netplay', false);
    const list = el(
      'ul',
      { class: 'marks' },
      mark(
        'players',
        ICONS.players,
        game.players ? players(game.players) : 'Players ?',
        !!game.players
      ),
      mark('cheevos', ICONS.cheevos, 'Achievements', game.raGameId !== null),
      netplay,
      mark('manual', ICONS.manual, 'Manual', has('manual'))
    );
    const id = game.id;
    void this.#options
      .features?.(game)
      .then((f) => {
        if (this.#game?.id === id) netplay.classList.toggle('on', f.includes('netplay'));
      })
      .catch(() => {});
    return list;
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
 * How tall the box stands, in rem, in `width` × `height` rem (its case): as tall as fits above
 * the plinth, turned too (front and spine side by side).
 */
export function boxHeight(width: number, height: number, ratio: number, depth: number): number {
  const fits = Math.min(height - UNDER_REM, (width - 1) / (ratio + depth));
  return clamp(fits, BOX_MIN_REM, BOX_MAX_REM);
}

/** Where an element is on the screen, as fractions of it; `null` if it is not laid out. */
function screenArea(node: HTMLElement): ScreenArea | null {
  const r = node.getBoundingClientRect();
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (!r.width || !r.height || !w || !h) return null;
  return { left: r.left / w, top: r.top / h, width: r.width / w, height: r.height / h };
}

/** A section of the screen in Cyber's style: framed, its name in a small tag. */
function bay(cls: string, name: string, ...content: (HTMLElement | null)[]): HTMLElement {
  return el(
    'section',
    { class: `bay ${cls}` },
    el('span', { class: 'bay-tag', 'aria-hidden': 'true' }, name),
    ...content.filter((c): c is HTMLElement => c !== null)
  );
}

function shotImage(src: string, on: boolean): HTMLImageElement {
  const img = picture(src, on ? 'on' : '');
  img.addEventListener('error', () => img.remove(), { once: true });
  return img;
}

function boxTransform(angle: number): string {
  return `rotateY(${angle}deg)`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** A shelf row: the game's name down its spine, and its year. */
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

/** A rating (0–1) as a collector's grade: `3.5` (of 5, as the stars), "Excellent". */
/** A rating (0–1) as five stars, the part of each lit. */
function stars(rating: number): HTMLElement {
  const node = el('span', {
    class: 'stars',
    role: 'img',
    'aria-label': `${(rating * 5).toFixed(1)} of 5`
  });
  node.style.setProperty('--rating', String(rating));
  return node;
}

export function gradeOf(rating: number | null): { score: string; word: string } | null {
  if (rating === null) return null;
  // Out of 5, as the stars show it; the words from the same rating out of 10.
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
  return { score: (Math.round(rating * 50) / 10).toFixed(1), word };
}

/** The case's serial: the system and the game's number in the library. */
export function serial(game: Game): string {
  return `${game.system.toUpperCase()}-${String(game.id).padStart(6, '0')}`;
}

/**
 * The game's age rating, as a badge of Cyber's own (not the board's logo): the rating large,
 * the board under it, coloured by how old a player it asks for. The board of the game's region
 * where it has one; all of them in its title. Empty where the game has none.
 */
function ageBadge(game: ShowGame): HTMLElement {
  const all = ageRatings(game.ageRating);
  const rom = romName(game.path).regions;
  const shown = pickAgeRating(all, rom.length ? rom : codes(game.region ?? null));
  if (!shown) return el('div', { class: 'age none', 'aria-hidden': 'true' });
  const words = all.map((r) => `${r.board} ${r.rating}`).join(', ');
  return el(
    'div',
    {
      class: `age ${ageBand(shown.age)}`,
      title: words,
      'aria-label': `Age rating ${words}`
    },
    el('strong', {}, shown.rating),
    el('span', {}, shown.board === 'CLASSIND' ? 'ClassInd' : shown.board)
  );
}

/** The game's regions in words, from its ROM's name first, else the gamelist's. */
function regionLine(game: Game): string | null {
  const rom = romName(game.path).regions;
  const list = rom.length ? rom : codes(game.region);
  return list.length ? names(list.join(','), REGIONS) : null;
}

/** Region or language codes as the gamelist gives them (`us,eu`), lower-case. */
function codes(list: string | null): string[] {
  return (list ?? '')
    .split(/[,;/ ]+/)
    .filter(Boolean)
    .map((c) => c.toLowerCase());
}

/** A region or language: its flag where there is one, its name beside. */
function flagChip(name: string, flag: string | null): HTMLElement {
  const chip = el('span', { class: 'chip' });
  if (flag) {
    const img = el('img', { src: flag, alt: '', class: 'flag' });
    img.addEventListener('error', () => img.remove(), { once: true });
    chip.append(img);
  }
  chip.append(name);
  return chip;
}

/** Line icons for the marks, in Cyber's style. */
const ICONS = {
  players:
    '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.2c2.8.2 5 2.3 5 5.8"/>',
  cheevos:
    '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5"/><path d="M12 14v3M8.5 20.5h7M10 17h4v3.5h-4z"/>',
  netplay:
    '<rect x="2.5" y="5" width="7.5" height="5.5" rx="1"/><rect x="14" y="13.5" width="7.5" height="5.5" rx="1"/><path d="M6.2 10.5v5.2h7.8M17.8 13.5V8.3H10"/>',
  manual:
    '<path d="M4 5.5C6.5 4 9.5 4 12 5.5v14c-2.5-1.5-5.5-1.5-8 0z"/><path d="M20 5.5C17.5 4 14.5 4 12 5.5v14c2.5-1.5 5.5-1.5 8 0z"/>'
} as const;

function mark(cls: string, icon: string, label: string, on: boolean): HTMLElement {
  const glyph = el('span', { class: 'glyph', 'aria-hidden': 'true' });
  glyph.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${icon}</svg>`;
  return el('li', { class: `mark ${cls}${on ? ' on' : ''}` }, glyph, el('span', {}, label));
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
