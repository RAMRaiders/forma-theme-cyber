import type { Game } from '@ramraiders/forma-sdk';

import type { LazyList } from '../logic/pager.js';
import { ageRatings, asPegi } from '../logic/agerating.js';
import { flaggedRegions, languageFlag, regionFlag, romName } from '../logic/romname.js';
import { DEFAULT_BACK, DEFAULT_FRONT, hue } from './cover.js';
import { el, remPx } from './dom.js';
import {
  ARCADE,
  type Achievements,
  type Kind,
  LANGUAGES,
  type MediaUrl,
  REGIONS,
  type ShowGame,
  isIconic,
  sameDetails,
  ago,
  captions,
  date,
  names,
  players,
  playtime
} from './stage.js';

/**
 * The Collector view: a game list as a collector keeps one.
 *
 * - The shelf, over the middle while the selection moves: every game a box lying on its side,
 *   spine out, the selected one in the middle; a moment after the last move it fades away.
 * - Then the screen, over the game's fan art, in bays under a grading label: the case (the
 *   game's box in 3D, turning from its front to its spine to its back, or as
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

/** Another file of the same game, as the library's versions list gives it. */
export interface OtherVersion {
  path: string;
  tags: string[];
}

export interface CollectorOptions {
  media: MediaUrl;
  achievements?: (game: Game) => Promise<Achievements | null>;
  /** The other versions of this game in the library: only ones on disk. */
  otherVersions?: (game: Game) => Promise<OtherVersion[]>;
  /** A developer's or publisher's logo, from its name; `null` where Cyber has none. */
  company?: (name: string) => string | null;
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

/** The fan art's width: the whole view's background, shaded, so half the screen's is enough
 * (a quarter of the pixels to decode and hold on a Pi). */
const BACKDROP_W = 960;

/** Every picture the view shows, at the width it asks, the most needed first. */
export const COLLECTOR_PICTURES: readonly (readonly [Kind, number])[] = [
  ['thumbnail', 640],
  ['boxside', 160],
  ['fanart', BACKDROP_W],
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
const ROW_REM = 3.2;
const OVERSCAN = 10;
/** The shelf over the middle while moving; this long after the last move it fades. */
const DROP_MS = 1400;
/** Steps closer together than this are the direction held: the shelf runs at an even speed. */
const HELD_MS = 130;
/** The fan art behind the shelf, a sneak peek, once the selection pauses this long: longer than
 * between two quick presses, or the whole screen changes at each of them. */
const PEEK_MS = 220;
/** Fan art kept decoded, the game shown and those round it: going to them is then at once. */
const FANART_KEPT = 12;
/** On a game this long, its video plays in the footage bay. */
const VIDEO_AFTER_MS = 2500;
/** With no video, the footage bay shows the screenshots in turn. */
const SHOT_MS = 4000;
/** This copy and the play record take turns, each this long. */
const ALTERNATE_MS = 10_000;
/** The story a page at a time: each this long, fading this long between. */
const STORY_PAGE_MS = 12_000;
const STORY_FADE_MS = 300;
/** The showcase behind the shelf waits for the selection to rest this long: made anew at each
 * step, it held up the shelf's glide on a Pi. */
const SETTLE_MS = 300;
/** The box and the cartridge sliding past each other, slowly (as in style.css). */
const SLIDE_MS = 2200;
/** On a game: the box first turns after this, then every `TURN_MS`. */
const FIRST_TURN_MS = 3200;
/** A new game's fan art fading in over the last (as in style.css). */
const BACKDROP_FADE_MS = 650;
/** A picture that arrives after its bay has, fading in rather than popping. */
const PICTURE_FADE_MS = 300;
/** A new game's bays fading in, well before its box turns or its video starts (as in style.css). */
const ARRIVE_MS = 360;
const TURN_MS = 4600;
/** After this long on a game, the pictures of the games around it are made ahead. */
const PREPARE_AFTER_MS = 1000;
const PREPARE_AROUND = 3;
/** The box's height in rem until the case is laid out; its width and depth follow its pictures. */
const BOX_REM = 17.5;
/** Then as tall as the case allows, between these. */
const BOX_MIN_REM = 12;
const BOX_MAX_REM = 22;
/** Kept clear under the box. */
const UNDER_REM = 1.6;
/** Until its pictures say otherwise: a Mega Drive case's shape. */
const FRONT_RATIO = 0.72;
const SPINE_RATIO = 0.14;

/** A pose: how far the box is turned for it, in degrees; `null`: the box away, its cartridge out. */
interface Pose {
  id: string;
  label: string;
  angle: number | null;
}

/** The box's poses. */
const POSES: readonly Pose[] = [
  // Each face square on, flat as a picture of it; the box turns in 3D only between them.
  { id: 'front', label: 'Front', angle: 0 },
  { id: 'spine', label: 'Spine', angle: 90 },
  { id: 'back', label: 'Back', angle: 180 }
];

/** Screenshots, as prints. */
const PRINTS: Kind[] = ['titleshot', 'image', 'mix', 'map'];

const motion = () => document.documentElement.dataset.motion !== 'off';

function picture(src: string, cls: string): HTMLImageElement {
  return el('img', { src, alt: '', decoding: 'async', class: cls });
}

/**
 * The pictures under `root` still loading fade in when they arrive, instead of popping in. Up to
 * each picture's own opacity (no keyframe to end on), so one meant to be hidden stays hidden.
 */
function fadeInAsLoaded(root: HTMLElement): void {
  for (const img of root.querySelectorAll('img')) {
    if (img.complete) continue;
    img.addEventListener(
      'load',
      () => img.animate?.([{ opacity: 0, offset: 0 }], { duration: PICTURE_FADE_MS }),
      { once: true }
    );
  }
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
  #settle: ReturnType<typeof setTimeout> | undefined;
  #peek: ReturnType<typeof setTimeout> | undefined;
  /** When the selection last moved. */
  #steppedAt = -Infinity;
  /** The fan art behind the view, or on its way there. */
  #backdropSrc: string | null = null;
  /** Fan art kept decoded, oldest first; fetched one after another. */
  #fanart = new Map<string, HTMLImageElement>();
  #fanartQueue: Promise<unknown> = Promise.resolve();
  #arriving: ReturnType<typeof setTimeout> | undefined;
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
  /** The case's stage: the box and, when the game has one, its cartridge. */
  #display: HTMLElement | null = null;
  /** The game's poses: its cartridge's first, when it has one, then the box's. */
  #poses: Pose[] = [...POSES];
  /** The footage bay's screen: screenshots, and the video's window once it plays. */
  #footage: HTMLElement | null = null;
  #pose = 0;
  #angle = 0;
  /** The cartridge out of sight to the right, ready to come in from the left again. */
  #slideDone: ReturnType<typeof setTimeout> | undefined;

  /** The game's video behind the case after a moment; Interface → Video previews. */
  previews = true;
  #dropTimer: ReturnType<typeof setTimeout> | undefined;
  /** A video asked for, until it is stopped. */
  #video = false;
  /** Room above the first row and below the last, so any row can sit in the middle. */
  #pad = 0;

  /** Its animations were stopped by `leave`: the game shown next starts them again. */
  #left = false;

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
    // The same game as before (the list reloaded, after a favourite say): no shelf, the case
    // goes on as it was, only what changed about the game is shown.
    const now = source.get(selected);
    const same = !!now && !!this.#box && this.#game?.id === now.id && !this.#left;
    this.select(selected, same);
    if (same && now) this.#update(now);
    else {
      // Opening a list: its game shown at once; only moves along the shelf wait to rest.
      clearTimeout(this.#settle);
      clearTimeout(this.#peek);
      this.#showSelected();
    }
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

  /** A new game's bays fade in (not its label, which follows each step along the shelf). */
  #arrive(): void {
    clearTimeout(this.#arriving);
    this.root.classList.remove('arriving');
    void this.root.offsetWidth;
    this.root.classList.add('arriving');
    this.#arriving = setTimeout(() => this.root.classList.remove('arriving'), ARRIVE_MS);
  }

  /**
   * The label over the shelf at once for the game picked (it stays lit while the shelf shows):
   * only the label, cheap; the rest of the showcase waits for the selection to rest.
   */
  #labelNow(): void {
    const game = this.selected;
    const label = this.#showcase.querySelector('.slab-label');
    if (game && label && label.getAttribute('data-id') !== String(game.id)) {
      label.replaceWith(this.#label(game));
    }
  }

  get selected(): Game | undefined {
    return this.#source?.get(this.#selected);
  }

  pageSize(): number {
    return Math.max(1, Math.floor(this.#shelf.clientHeight / (ROW_REM * remPx())));
  }

  /** `quiet`: the same game again (a reload), not a move: no shelf, nothing restarted. */
  select(index: number, quiet = false): void {
    const changed = index !== this.#selected;
    this.#selected = index;
    const now = performance.now();
    const held = changed && !quiet && now - this.#steppedAt < HELD_MS;
    if (changed) this.#steppedAt = now;
    this.#track.classList.toggle('held', held);
    const row = ROW_REM * remPx();
    this.#measure();
    // The selected row in the middle, at the ends of the list too; the rows glide there. Whole
    // pixels: text on a layer moved by a fraction of one shimmers.
    this.#track.style.transform = `translateY(${Math.round(this.#pad - index * row)}px)`;
    this.render();
    if (!changed || quiet) return;
    this.#browse();
    this.#stopVideo();
    // While held the shelf says which game it is; the label's pictures would only flicker past.
    if (!held) this.#labelNow();
    clearTimeout(this.#peek);
    this.#peek = setTimeout(() => {
      const game = this.selected;
      if (game) this.#backdropFor(game);
    }, PEEK_MS);
    clearTimeout(this.#settle);
    this.#settle = setTimeout(() => this.#showSelected(), SETTLE_MS);
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
   * A game on the shelf: its own spine picture lying on its side, where it has one (its name
   * still there for screen readers); else a spine in its colour with its name. Every row as long
   * as the others, the picture filling it.
   */
  #shelfRow(game: Game, node: HTMLElement): HTMLElement[] {
    const parts = [
      el('span', { class: 'band', 'aria-hidden': 'true' }),
      el('span', { class: 'title' }, game.name)
    ];
    const src = this.#options.media(game, 'boxside', 160);
    node.classList.toggle('pictured', !!src);
    if (!src) return parts;
    const img = picture(src, 'spine-pic');
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
    if (this.#game?.id === game.id) this.#update(game);
    else this.#showSelected();
  }

  /** The game shown, as it is now: its star in the label, or all of it if its details changed. */
  #update(game: Game): void {
    const changed = !!this.#game && !sameDetails(this.#game, game);
    this.#game = game;
    if (changed) return this.#showSelected(true);
    this.#showcase.querySelector('.slab-label .fav')?.classList.toggle('on', game.favorite);
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
    clearTimeout(this.#peek);
    clearTimeout(this.#dropTimer);
    this.root.classList.remove('browsing');
    this.#stop();
    this.#left = true;
  }

  resume(): void {
    if (this.#source) this.#showSelected(true);
  }

  #stop(): void {
    this.#timers.forEach(clearTimeout);
    this.#intervals.forEach(clearInterval);
    this.#timers = [];
    this.#intervals = [];
    clearTimeout(this.#slideDone);
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
        // Stopped while Forma was still starting it: the stop came too soon to catch it.
        if (!this.#video) return this.#options.stopVideo?.();
        if (playing && this.#game?.id === id) this.#seeThrough(true);
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
    // The fan art stays round the video's window: a hole cut where the screen is.
    const r = on ? this.#footage?.getBoundingClientRect() : null;
    if (r?.width) {
      const [x0, y0, x1, y1] = [r.left, r.top, r.right, r.bottom].map((n) => `${Math.round(n)}px`);
      this.#backdrop.style.clipPath =
        `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ` +
        `${x0} ${y0}, ${x0} ${y1}, ${x1} ${y1}, ${x1} ${y0}, ${x0} ${y0})`;
    } else {
      this.#backdrop.style.removeProperty('clip-path');
    }
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
    if (game && !again && !this.#left && this.#game?.id === game.id && this.#box) {
      return this.#labelNow();
    }
    this.#stop();
    if (!game) return;
    this.#left = false;
    this.#game = game;
    this.#angle = 0;
    this.root.style.removeProperty('--game');
    this.#tint(game);
    this.#backdropFor(game);
    this.#showcase.replaceChildren(...this.#showcaseParts(game));
    this.#dossier.replaceChildren(...this.#dossierParts(game));
    fadeInAsLoaded(this.#showcase);
    fadeInAsLoaded(this.#dossier);
    this.#arrive();
    requestAnimationFrame(() => this.#fit?.());
    if (motion()) {
      this.#later(() => {
        this.#turnTo(1);
        this.#every(() => this.#turnTo(1), TURN_MS);
      }, FIRST_TURN_MS);
    }
    this.#later(() => {
      this.#prepareAround();
      this.#keepFanartAround();
    }, PREPARE_AFTER_MS);
    this.#later(() => this.#startVideo(game), VIDEO_AFTER_MS);
  }

  /**
   * The next pose (`1`) or the last (`-1`). Between the box's, it turns. After its back, the
   * box slides slowly off to the right as its cartridge comes in from the left, at the same
   * speed; then the cartridge goes on out to the right as the box comes back in from the left,
   * already turned to its pose. Everything goes one way, left to right.
   */
  #turnTo(direction: 1 | -1): void {
    const box = this.#box;
    const display = this.#display;
    if (!box) return;
    const poses = this.#poses;
    const from = poses[this.#pose];
    const next = (this.#pose + direction + poses.length) % poses.length;
    const to = poses[next]!;
    this.#pose = next;
    clearTimeout(this.#slideDone);
    if (to.angle === null) {
      display?.classList.remove('cart-leaving');
      display?.classList.add('cart-out');
    } else if (!from || from.angle === null) {
      // Out of sight: turned to its pose at once, and moved round to the left to come in.
      this.#angle += (((to.angle - this.#angle) % 360) + 360) % 360;
      box.style.transition = 'none';
      box.style.transform = boxTransform(this.#angle);
      display?.classList.add('box-from-left');
      void box.offsetWidth;
      box.style.removeProperty('transition');
      display?.classList.remove('cart-out', 'box-from-left');
      display?.classList.add('cart-leaving');
      this.#slideDone = setTimeout(() => display?.classList.remove('cart-leaving'), SLIDE_MS + 100);
    } else {
      let delta = to.angle - from.angle;
      // Always on round the same way: never back the long way.
      if (direction > 0 && delta <= 0) delta += 360;
      if (direction < 0 && delta >= 0) delta -= 360;
      this.#angle += delta;
      box.style.transform = boxTransform(this.#angle);
    }
    box.dataset.pose = to.id;
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

  #fanartOf(game: Game): string | null {
    return (
      this.#options.media(game, 'fanart', BACKDROP_W) ?? this.#options.media(game, 'image', 400)
    );
  }

  /**
   * The fan art behind the whole view, shaded so the words over it read. The new one fades in
   * over the old, once decoded (a picture decoded mid-fade caught on a Pi); the old goes when
   * it is covered. Both are opaque, so the screen stays as bright all through the fade.
   */
  #backdropFor(game: Game): void {
    const src = this.#fanartOf(game);
    if (src === this.#backdropSrc) return;
    this.#backdropSrc = src;
    // Still loading: those are for games already passed by.
    this.#backdrop.querySelectorAll('img.waiting').forEach((n) => n.remove());
    const old = [...this.#backdrop.children];
    const removeOld = () => old.forEach((n) => n.remove());
    // A little over the fade: on a busy Pi it can start late, and the old must not go first.
    const removeOldLater = () => setTimeout(removeOld, BACKDROP_FADE_MS + 200);
    if (!src) {
      old.forEach((n) => n.classList.add('leaving'));
      removeOldLater();
      return;
    }
    const img = picture(src, 'waiting');
    img.addEventListener('transitionend', removeOld, { once: true });
    this.#backdrop.append(img);
    img.addEventListener(
      'load',
      () => {
        void (img.decode?.() ?? Promise.resolve())
          .catch(() => {})
          .then(() => {
            if (!img.isConnected) return;
            img.classList.remove('waiting');
            removeOldLater();
          });
      },
      { once: true }
    );
    img.addEventListener(
      'error',
      () => {
        img.remove();
        this.#backdropSrc = null;
      },
      { once: true }
    );
  }

  /** The fan art of the game shown and those round it, decoded ahead and kept, within a limit. */
  #keepFanartAround(): void {
    const source = this.#source;
    if (!source) return;
    for (let d = PREPARE_AROUND; d >= -PREPARE_AROUND; d--) {
      const i = this.#selected + d;
      const game = i >= 0 && i < source.total ? source.get(i) : undefined;
      const src = game && this.#fanartOf(game);
      if (src) this.#keepFanart(src);
    }
  }

  #keepFanart(src: string): void {
    const kept = this.#fanart.get(src);
    this.#fanart.delete(src);
    if (kept) {
      this.#fanart.set(src, kept);
      return;
    }
    const img = new Image();
    img.decoding = 'async';
    this.#fanart.set(src, img);
    for (const oldest of this.#fanart.keys()) {
      if (this.#fanart.size <= FANART_KEPT) break;
      this.#fanart.delete(oldest);
    }
    this.#fanartQueue = this.#fanartQueue.then(async () => {
      // Pushed out by others before its turn: not worth fetching.
      if (this.#fanart.get(src) !== img) return;
      img.src = src;
      await img.decode?.().catch(() => {});
    });
  }

  #showcaseParts(game: ShowGame): HTMLElement[] {
    const media = this.#options.media;
    const box = this.#caseOf(game);
    this.#box = box;
    const floater = el('div', { class: 'float' }, box);

    const cart = this.#cartOf(game);
    const display = el(
      'div',
      { class: 'display' },
      ...(cart ? [cart] : []),
      el('div', { class: 'mover' }, floater)
    );
    this.#display = display;
    this.#poses = cart
      ? [
          ...POSES,
          { id: 'cartridge', label: ARCADE.has(game.system) ? 'Board' : 'Cartridge', angle: null }
        ]
      : [...POSES];
    // On its front first; the cartridge's turn comes after its back.
    this.#pose = 0;

    this.#dots = el(
      'div',
      { class: 'poses', 'aria-hidden': 'true' },
      ...this.#poses.map((p, i) => el('span', { class: i === this.#pose ? 'on' : '' }, p.label))
    );

    const shots = PRINTS.map((k) => media(game, k, 400)).filter((u): u is string => u !== null);
    this.#footage = el('div', { class: 'screen' });
    this.#footage.append(...shots.map((src, i) => shotImage(src, i === 0)));
    if (!shots.length) this.#footage.append(noSignal());
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
      this.#storyBay(game)
    ];
  }

  /**
   * The cartridge (an arcade game's board), hidden behind the box until its turn comes; without a
   * picture of it, the box has the poses to itself.
   */
  #cartOf(game: ShowGame): HTMLElement | null {
    const src = this.#options.media(game, 'cartridge', 400);
    if (!src) return null;
    const img = picture(src, 'cart');
    // Ready before its turn: decoded now, not as it slides in.
    void img.decode?.().catch(() => {});
    const stage = el('div', { class: 'cart-stage', 'aria-hidden': 'true' }, img);
    img.addEventListener(
      'error',
      () => {
        stage.remove();
        const at = this.#poses.findIndex((p) => p.angle === null);
        if (at < 0) return;
        if (this.#display?.classList.contains('cart-out')) this.#turnTo(1);
        this.#poses.splice(at, 1);
        if (this.#pose > at) this.#pose -= 1;
        this.#dots?.children[at]?.remove();
      },
      { once: true }
    );
    return stage;
  }

  /** The game's story, all of it; when longer than its bay it scrolls slowly through. */
  /**
   * The game's story, a page at a time: cut where it fills the bay, between sentences, each
   * page shown in turn with its number under it (`2 / 3`).
   */
  #storyBay(game: ShowGame): HTMLElement {
    const all = game.description ?? '';
    const box = el('div', { class: 'text' }, all);
    const pager = el('span', { class: 'pager', 'aria-hidden': 'true' });
    const story = bay('story', ARCADE.has(game.system) ? 'History' : 'Story', box, pager);
    // No story: the footage has its room.
    this.root.classList.toggle('no-story', !all);
    const id = game.id;
    requestAnimationFrame(() => {
      if (this.#game?.id !== id || !box.clientHeight) return;
      const pages = paginate(all, box);
      box.textContent = pages[0] ?? '';
      if (pages.length < 2) return;
      let at = 0;
      const show = () => (pager.textContent = `${at + 1} / ${pages.length}`);
      show();
      this.#every(() => {
        box.classList.add('turning');
        this.#later(() => {
          at = (at + 1) % pages.length;
          box.textContent = pages[at] ?? '';
          show();
          box.classList.remove('turning');
        }, STORY_FADE_MS);
      }, STORY_PAGE_MS);
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
      { class: 'slab-label', 'data-id': String(game.id) },
      mark,
      el(
        'div',
        { class: 'what' },
        el('span', { class: 'brand' }, 'CYBER · COLLECTOR GRADE'),
        el('strong', {}, game.name),
        el(
          'span',
          { class: 'line' },
          [isIconic(game) ? 'Iconic' : '', ...details].filter(Boolean).join(' · ')
        ),
        el('span', { class: 'serial' }, serial(game))
      ),
      // The favourite's gold star, right after its name and details (only when it is one).
      el(
        'div',
        { class: `fav${game.favorite ? ' on' : ''}`, 'aria-label': 'Favourite' },
        el('span', { 'aria-hidden': 'true' }, '★')
      ),
      // The grade's seal, at the right end.
      el(
        'div',
        { class: 'seals' },
        el(
          'div',
          { class: `seal grade${grade ? '' : ' none'}` },
          el('strong', {}, grade?.score ?? '—', grade ? el('small', {}, '/5') : ''),
          el(
            'span',
            { class: 'foot' },
            game.rating !== null ? stars(game.rating) : '',
            el('span', { class: 'word' }, grade?.word ?? 'Ungraded')
          )
        )
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
      // On the case's stage too: the cartridge is never bigger than the box hiding it.
      for (const node of display ? [box, display] : [box]) {
        node.style.setProperty('--h', `${h.toFixed(2)}rem`);
        node.style.setProperty('--w', `${(h * size.ratio).toFixed(2)}rem`);
        node.style.setProperty('--d', `${(h * size.depth).toFixed(2)}rem`);
      }
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

    const section = (title: string, ...rows: (HTMLElement | null)[]) => {
      const kept = rows.filter((r): r is HTMLElement => r !== null);
      return kept.length
        ? el(
            'section',
            { class: 'part' },
            el('h3', {}, title),
            el('dl', { class: 'specs' }, ...kept)
          )
        : null;
    };
    const row = (label: string, value: string | HTMLElement | null | undefined) =>
      value ? el('div', {}, el('dt', {}, label), el('dd', {}, value)) : null;
    // The ROM's own name first (it is the copy at hand), the scraper's data after.
    const rom = romName(game.path);
    const regions = rom.regions.length ? rom.regions : codes(game.region);
    const languages = rom.languages.length ? rom.languages : codes(game.lang);
    const company = (name: string | null) => {
      if (!name) return null;
      const src = this.#options.company?.(name);
      if (!src) return name;
      const img = el('img', { class: 'company', src, alt: name, title: name, decoding: 'async' });
      img.addEventListener('error', () => img.replaceWith(name), { once: true });
      return img;
    };
    const flags = (
      list: string[],
      table: Record<string, string>,
      flag: (c: string) => string | null
    ) =>
      list.length
        ? el(
            'span',
            { class: 'flags' },
            ...list.map((c) => flagChip(table[c] ?? c.toUpperCase(), flag(c)))
          )
        : null;
    const released = game.releaseDate
      ? `${date(game.releaseDate)} · ${ago(game.releaseDate).toLowerCase()}`
      : null;

    const release = section(
      'Release',
      row('Released', released),
      row('Developer', company(game.developer)),
      row('Publisher', company(game.publisher)),
      row('Genre', game.genre)
    );
    const copy = section(
      'This copy',
      row('Region', flags(flaggedRegions(regions), REGIONS, regionFlag)),
      row('Languages', flags(languages, LANGUAGES, languageFlag)),
      row('Version', versionText(rom.version)),
      row('Media', this.#archive(game))
    );
    const record =
      section(
        'Play record',
        row('Played', game.playCount > 0 ? `${game.playCount}×` : 'Never yet'),
        row('Time', game.gameTime > 0 ? playtime(game.gameTime) : null),
        row('Last', game.lastPlayed ? ago(game.lastPlayed) : null)
      ) ?? el('section', { class: 'part' });
    this.#achievementsInto(game, record);
    if (copy) this.#versionsInto(game, copy, row);

    // This copy and the play record take turns in one place.
    const turns = [copy, record].filter((p): p is HTMLElement => p !== null);
    turns[0]?.classList.add('shown');
    const alternate = el('div', { class: 'alternate' }, ...turns);
    if (turns.length > 1) {
      let at = 0;
      this.#every(() => {
        turns[at]?.classList.remove('shown');
        at = (at + 1) % turns.length;
        turns[at]?.classList.add('shown');
      }, ALTERNATE_MS);
    }
    const parts = [head, this.#marks(game), release, alternate].filter(
      (p): p is HTMLElement => p !== null
    );

    return parts;
  }

  /** What pictures and extras the game has, in short: lit when there, faint when not. */
  #archive(game: ShowGame): HTMLElement {
    const has = (...kinds: Kind[]) => kinds.some((k) => this.#options.media(game, k) !== null);
    const items: [string, boolean][] = [
      ['Box', has('thumbnail')],
      ['Back', has('boxback')],
      ['Spine', has('boxside')],
      [ARCADE.has(game.system) ? 'Board' : 'Cart', has('cartridge')],
      ['Shots', has('titleshot', 'image')],
      ['Video', has('video')],
      ['Fan art', has('fanart')],
      ['Manual', has('manual')]
    ];
    return el(
      'span',
      { class: 'archive' },
      ...items.map(([label, on]) => el('span', { class: on ? 'on' : '' }, label))
    );
  }

  /**
   * What the game offers and what it is, as tiles: how many play, achievements, a manual (lit
   * when it has it, faint when not), and its age rating as PEGI's badge.
   */
  #marks(game: ShowGame): HTMLElement {
    return el(
      'ul',
      { class: 'marks' },
      mark(
        'players',
        ICONS.players,
        game.players ? players(game.players) : 'Players ?',
        !!game.players
      ),
      mark('cheevos', ICONS.cheevos, 'Achievements', game.raGameId !== null),
      pegiMark(game)
    );
  }

  /** "Also owned", in this copy's details, for a game with other versions in the library. */
  #versionsInto(
    game: Game,
    copy: HTMLElement,
    row: (label: string, value: string) => HTMLElement | null
  ): void {
    const fetch = this.#options.otherVersions;
    if (!fetch) return;
    const id = game.id;
    void fetch(game)
      .catch(() => [])
      .then((others) => {
        const text = versionsText(others);
        const line = text ? row('Also owned', text) : null;
        if (line && this.#game?.id === id) copy.querySelector('.specs')?.append(line);
      });
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
 * the poses, turned too (front and spine side by side).
 */
export function boxHeight(width: number, height: number, ratio: number, depth: number): number {
  const fits = Math.min(height - UNDER_REM, (width - 1) / (ratio + depth));
  return clamp(fits, BOX_MIN_REM, BOX_MAX_REM);
}

/**
 * `text` cut into pages that each fit `box` as it is laid out: between sentences, or between
 * words for a sentence longer than a page. Leaves the box's text as it found it.
 */
export function paginate(text: string, box: HTMLElement): string[] {
  const before = box.textContent;
  const fits = (t: string) => {
    box.textContent = t;
    return box.scrollHeight <= box.clientHeight + 1;
  };
  const pieces = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?…])\s+/)
    .filter(Boolean)
    .flatMap((sentence) => (fits(sentence) ? [sentence] : sentence.split(' ')));
  const pages: string[] = [];
  let page = '';
  for (const piece of pieces) {
    const next = page ? `${page} ${piece}` : piece;
    if (!page || fits(next)) page = next;
    else {
      pages.push(page);
      page = piece;
    }
  }
  if (page) pages.push(page);
  box.textContent = before;
  return pages;
}

/** Where an element is on the screen, as fractions of it; `null` if it is not laid out. */
function screenArea(node: HTMLElement): ScreenArea | null {
  const r = node.getBoundingClientRect();
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (!r.width || !r.height || !w || !h) return null;
  return { left: r.left / w, top: r.top / h, width: r.width / w, height: r.height / h };
}

/** A section of the screen: no frame, its name in a small tag. */
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
/** The hue in an `hsl(...)` colour, in degrees; `null` if it is not one. */
export function hueOf(colour: string): number | null {
  const m = /^hsl\(\s*(-?[\d.]+)/.exec(colour);
  return m ? Number(m[1]) : null;
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
/**
 * The age rating as PEGI gives it, among the marks as its badge alone, in PEGI's colours (green to 7, orange to 16, red at
 * 18): its own PEGI rating, else the nearest from another board's, that one in its title.
 */
function pegiMark(game: ShowGame): HTMLElement {
  const all = ageRatings(game.ageRating);
  const pegi = asPegi(all);
  if (!pegi) return el('li', { class: 'mark pegi none', 'aria-hidden': 'true' });
  const words = all.map((r) => `${r.board} ${r.rating}`).join(', ');
  const colour = pegi.age <= 7 ? 'green' : pegi.age <= 16 ? 'orange' : 'red';
  const note = pegi.from ? `PEGI ${pegi.age}, from ${pegi.from.board} ${pegi.from.rating}` : words;
  return el(
    'li',
    { class: `mark pegi ${colour}`, title: note, 'aria-label': `Age rating ${note}` },
    el('strong', {}, String(pegi.age), el('span', {}, 'PEGI'))
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
/** A region or a language as its flag alone, its name for a screen reader; its name where it has no flag. */
function flagChip(name: string, flag: string | null): HTMLElement {
  const chip = el('span', { class: 'chip', title: name });
  if (!flag) {
    chip.append(name);
    return chip;
  }
  const img = el('img', { src: flag, alt: name, class: 'flag' });
  img.addEventListener('error', () => img.replaceWith(name), { once: true });
  chip.append(img);
  return chip;
}

/**
 * The dump's version, as its file name gives it, in words: `Rev 1` → `Revision 1`, `v1.1` →
 * `Version 1.1`, `Unl` → `Unlicensed`; with none, the first release as it came out.
 */
export function versionText(version: string | null): string {
  if (!version) return 'Original release';
  return version.split(' · ').map(versionWords).join(' · ');
}

function versionWords(version: string): string {
  const rev = /^rev\s*([\w.]+)$/i.exec(version);
  if (rev) return `Revision ${rev[1]!.toUpperCase()}`;
  const v = /^v\s*([\d.]+\w*)$/i.exec(version);
  if (v) return `Version ${v[1]}`;
  const words: Record<string, string> = {
    proto: 'Prototype',
    beta: 'Beta',
    demo: 'Demo',
    sample: 'Sample',
    unl: 'Unlicensed',
    pirate: 'Pirate',
    bootleg: 'Bootleg',
    aftermarket: 'Aftermarket',
    homebrew: 'Homebrew',
    hack: 'Hack'
  };
  return words[version.toLowerCase()] ?? version;
}

/** Line icons for the marks, in Cyber's style. */
const ICONS = {
  players:
    '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.2c2.8.2 5 2.3 5 5.8"/>',
  cheevos:
    '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5"/><path d="M12 14v3M8.5 20.5h7M10 17h4v3.5h-4z"/>'
} as const;

function mark(cls: string, icon: string, label: string, on: boolean): HTMLElement {
  const glyph = el('span', { class: 'glyph', 'aria-hidden': 'true' });
  glyph.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${icon}</svg>`;
  return el('li', { class: `mark ${cls}${on ? ' on' : ''}` }, glyph, el('span', {}, label));
}

/** A front made up: the fan art (or a screenshot) under its logo (or its name). */
function madeCover(game: Game, media: MediaUrl): HTMLElement[] {
  const art = media(game, 'fanart', BACKDROP_W) ?? media(game, 'image', 400);
  const logo = media(game, 'wheel', 560) ?? media(game, 'marquee', 560);
  if (!art && !logo) return [picture(DEFAULT_FRONT, '')];
  return [
    el(
      'div',
      { class: 'made-cover' },
      ...(art ? [picture(art, 'art')] : []),
      logo ? picture(logo, 'logo') : el('strong', {}, game.name)
    )
  ];
}

/** An untuned set: a still of static (drawn once), and only the words blink. */
function noSignal(): HTMLElement {
  return el('div', { class: 'no-signal' }, el('span', {}, 'No signal'));
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
  if (!shot && !captions(game.description ?? '').length) return [picture(DEFAULT_BACK, '')];
  return [
    el(
      'div',
      { class: 'made-back' },
      ...(shot ? [picture(shot, 'shot')] : []),
      el('p', {}, captions(game.description ?? '')[0] ?? game.name)
    )
  ];
}

/**
 * The other versions in a line: `Japan, USA · English patch ×8`. Long lists stop at three kinds
 * and say how many more. Empty when there are none.
 */
export function versionsText(others: OtherVersion[]): string {
  const counts = new Map<string, number>();
  for (const other of others) {
    const rom = romName(other.path);
    const region = rom.regions[0];
    const place = region ? (REGIONS[region] ?? region.toUpperCase()) : null;
    const patched = other.tags.some((t) => /^(t-en|translated en)/i.test(t));
    const kind = patched ? 'English patch' : rom.version && versionText(rom.version);
    const label = [place, kind].filter(Boolean).join(' · ') || (other.tags[0] ?? 'Other version');
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const labels = [...counts].map(([label, n]) => (n > 1 ? `${label} ×${n}` : label));
  const extra = labels.length - 3;
  return extra > 0 ? `${labels.slice(0, 3).join(', ')} +${extra}` : labels.join(', ');
}
