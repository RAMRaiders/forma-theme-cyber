import type { Game, GameSaves, ScraperStatus } from '@ramraiders/forma-sdk';
import { mark as perfMark, perfOn, span, timing } from './perf.js';

import type { LazyList } from '../logic/pager.js';
import { ageRatings, asPegi } from '../logic/agerating.js';
import { flaggedRegions, languageFlag, regionFlag, gameTags, patchBy } from '../logic/romname.js';
import { DEFAULT_BACK, DEFAULT_FRONT, hue } from './cover.js';
import { loopIndex, loopPlace } from '../logic/nav.js';
import { el, remPx } from './dom.js';
import { loopScroll } from './loopscroll.js';
import { Scan } from './scan.js';
import { boot, scrapedMark } from './boot.js';
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
import { awake } from './rest.js';
import { borderOf, placeTrimmed, placedBox, trimmedAspect } from './trim.js';

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

export interface CollectorOptions {
  media: MediaUrl;
  /** The game as Forma has it now (its media just scraped, say), not the list's copy. */
  fresh?: (id: number) => Promise<Game | null>;
  achievements?: (game: Game) => Promise<Achievements | null>;
  /** What the game has saved (Forma since SDK 1.35.0); its tile lights when there are some. */
  saves?: (game: Game) => Promise<GameSaves | null>;
  /** A developer's or publisher's logo, from its name; `null` where Cyber has none. */
  company?: (name: string) => string | null;
  /** The game's colour, from a small picture of it. */
  accent?: (url: string) => Promise<string | null>;
  /**
   * A system's name and small logo (`dark`: it needs a light plate); its category and the year it
   * came out pick the TV its games are previewed on.
   */
  system?: (name: string) => {
    name: string;
    logo: string | null;
    dark: boolean;
    category?: string;
    released?: number | null;
  } | null;
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
  ['marquee', 320],
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

/**
 * A spine on the shelf, in rem, as style.css draws it: a Mega Drive box's shape. A list of
 * slimmer boxes makes every spine longer: as long as its stubbiest box asks (a TurboGrafx-16
 * case, about 11 times as tall as wide), the slimmer ones (a PC Engine HuCard's, about 18) fitted
 * into that.
 */
const SPINE_LEN_REM = 22;
const SPINE_H_REM = 2.85;
/** Systems whose spines are drawn a little bigger, rows and all: Atari's short cartridge labels
 * read small at the usual size. */
const BIGGER_SPINES = /^atari/;
const BIGGER_SCALE = 1.12;
/** How much shorter than its shape asks a long spine is drawn. */
const SPINE_SQUEEZE = 0.94;

/** Spine pictures looked at, when a system's list opens, to size its shelf. */
const SPINE_PROBES = 8;
/** Games loaded ahead of those in sight, in the way the shelf is going: a long list's next page
 * is there before the shelf reaches it, never rows of "…". */
const LOAD_AHEAD = 60;

/** Each system's spine length (rem), worked out once: its shelf never changes while browsed. */
const spineLengths = new Map<string, number>();

/** Row height of the shelf in rem: each a box on its side. */
const ROW_REM = 3.2;
const OVERSCAN = 10;
/** The shelf over the middle while moving; this long after the last move it fades. */
const DROP_MS = 1400;
/** Steps closer together than this are the direction held: the shelf runs at an even speed. */
const HELD_MS = 130;
/** The fan art behind the shelf, a sneak peek, once the selection pauses this long: longer than
 * between two quick presses, or the whole screen changes at each of them. */
const PEEK_MS = 180;
/** While held, the fan art and the label follow the shelf this often: a preview of the games
 * run past, not only of the one stopped on. */
const HELD_PREVIEW_MS = 500;
/** Held this long, the shelf races: nothing is loaded till it stops (#race). */
const RACE_MS = 1000;
/** Fan art kept decoded, the game shown and those round it: going to them is then at once. */
const FANART_KEPT = 12;
/** The TV's pictures and logos kept decoded (and measured), the game shown's and those round it. */
const NAV_PIC_KEPT = 20;
/** How many games each side of the one shown get their TV picture ready ahead. */
const NAV_PIC_AROUND = 2;
/** After a list opens, how long its game's own pictures have before its neighbours' are asked for. */
const AROUND_AFTER_OPEN_MS = 400;
/** Longest the game shown stays while the next one's pictures load: then it is replaced anyway. */
const SWAP_WAIT_MS = 700;
/** On a game this long, its video plays in the footage bay. */
const VIDEO_AFTER_MS = 2500;
/** With no video, the footage bay shows the screenshots in turn. */
const SHOT_MS = 4000;
/** The story a page at a time (motion off): each this long, fading this long between. */
const STORY_PAGE_MS = 12_000;
const STORY_FADE_MS = 300;
/** The showcase behind the shelf waits for the selection to rest this long: made anew at each
 * step, it held up the shelf's glide on a Pi. At 900 ms a game moved to at an unhurried pace
 * showed nearly a second late (measured on a Pi 5: drawn 870 ms after the press, its pictures,
 * made ahead by Forma, in 15 ms after); its drawing now costs 10 ms (27 at most). Long enough
 * that quick presses pass games by undrawn, short enough that each slow press shows its game
 * before the next. The colours, the dossier and the TV come at the peek, sooner. */
const SETTLE_MS = 320;
/** The box swallowing the cartridge again (as in style.css). */
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
 * Pictures already on screen under `from` reused in `parts` (being drawn in its place) where
 * they show the same thing: a new picture is blank until decoded, so a part drawn again at each
 * step (the label's system logo, the dossier's flags and logos) blinked, and faded in again.
 */
/** Company logos asked for that were not there: not asked for again. */
const NO_LOGO = new Set<string>();

function keepPictures(from: ParentNode, parts: Element[]): void {
  // Every one shown, the same picture twice too (a developer that is also the publisher).
  const shown = new Map<string, HTMLImageElement[]>();
  for (const img of from.querySelectorAll('img')) {
    const src = img.getAttribute('src');
    if (!src || !img.complete || !img.naturalWidth) continue;
    shown.set(src, [...(shown.get(src) ?? []), img]);
  }
  if (!shown.size) return;
  for (const part of parts) {
    for (const img of part.querySelectorAll('img')) {
      const src = img.getAttribute('src');
      const old = src ? shown.get(src)?.shift() : undefined;
      if (!old) continue;
      old.className = img.className;
      img.replaceWith(old);
    }
  }
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
  /** The system whose shelf is sized; its spine length kept in `spineLengths`. */
  #shelfSystem: string | null = null;
  /** How much bigger than usual this system's spines are (BIGGER_SPINES). */
  #spineScale = 1;
  /** How long a spine can be, in rem, about the shelf's middle; 0 until measured. */
  #shelfRoom = 0;
  /** The rows, moved as one so the selected sits in the middle: a transform, gliding. */
  readonly #track = el('div', { class: 'track' });
  /**
   * The selection's frame, still in the shelf's middle, the rows gliding under it (and the rows
   * above and below dimmed by its two panels): a step only moves the track. A selected row
   * restyled (bigger, brighter, framed) was painted again at each step, it and the last one.
   */
  readonly #lens = el(
    'div',
    { class: 'lens', 'aria-hidden': 'true' },
    el('i', { class: 'above' }),
    el('i', { class: 'frame' }),
    el('i', { class: 'below' })
  );
  readonly #showcase = el('section', { class: 'showcase' });
  readonly #dossier = el('aside', { class: 'dossier' });
  /** Over it all while the scraper is on the selected game. */
  /** A scrape's new data in: shown by the game's boot, as on entering its list. */
  #aroundTimer: ReturnType<typeof setTimeout> | undefined;
  /** The TV's pictures loaded ahead (#keepNavPicsAround), the latest last. */
  readonly #navKept = new Map<string, HTMLImageElement>();
  readonly #scan = new Scan(async (id) => {
    const game = this.selected;
    return game?.id === id && (await this.#boot(game)) > 0;
  });
  readonly #options: CollectorOptions;
  #rows = new Map<number, HTMLElement>();
  #source: LazyList<Game> | null = null;
  #selected = 0;
  #pending = false;
  #settle: ReturnType<typeof setTimeout> | undefined;
  #peek: ReturnType<typeof setTimeout> | undefined;
  /** When the fan art and the label last followed a held shelf. */
  #previewedAt = 0;
  /**
   * Where the case was, while the shelf shows: the selected game's picture, on a TV of its
   * console's day (a plain frame for other systems).
   */
  readonly #navScreen = el('div', { class: 'tv-screen' });
  readonly #tv = tvSet(this.#navScreen, 'tv empty');
  readonly #navPic = el('div', { class: 'nav-pic', 'aria-hidden': 'true' }, this.#tv);
  #navPicSrc: string | null = null;
  /** The selected game's colour, as on its parts (#paint); `null` for the view's own. */
  #colour: string | null = null;
  /** The shelf's height (px), measured once a list opens or the window is resized, not at each
   * step: measuring right after a step's class change made the page work out all its styles
   * and layout in the key press. */
  #shelfH = 0;
  /** The game whose colours are on the page. */
  #tinted: number | null = null;
  /** Which draw of a game is the latest: one whose pictures load after another began is dropped. */
  #drawRound = 0;
  /** The game whose pictures are loading to replace the one shown, if any. */
  #drawing: number | null = null;
  #labelTimer: ReturnType<typeof setTimeout> | undefined;
  /** When the selection last moved. */
  #steppedAt = -Infinity;
  /** The fan art behind the view, or on its way there. */
  #backdropSrc: string | null = null;
  /** Fan art kept decoded, oldest first; fetched one after another. */
  #fanart = new Map<string, HTMLImageElement>();
  #fanartQueue: Promise<unknown> = Promise.resolve();
  #arriving: ReturnType<typeof setTimeout> | undefined;
  #timers: ReturnType<typeof setTimeout>[] = [];
  /** The story scrolling (#scrollStory); paused while the shelf is up. */
  #storyScroll: Animation | null = null;
  #intervals: ReturnType<typeof setInterval>[] = [];
  #accents = new Map<number, Promise<string | null>>();
  /** The shelf's colours, worked out one after another. */
  #colourQueue: Promise<void> = Promise.resolve();
  #achievements = new Map<number, Promise<Achievements | null>>();
  /** Each game's saves, asked for once until it is played again. */
  readonly #saves = new Map<number, Promise<GameSaves | null>>();
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
  /** When the direction began to be held, and whether the shelf is racing (#race). */
  #heldSince = 0;
  /** The box drawn under the shelf: its turns start as the shelf goes. */
  #turnsDue = false;
  #racing = false;
  /** The letter the shelf is at, on the TV while it races. */
  readonly #letter = el('b', { class: 'tv-letter', 'aria-hidden': 'true' });
  /** A video asked for, until it is stopped. */
  #video = false;
  /** Its video, stopped while the shelf is up: it plays again when the shelf goes. */
  #videoHeld = false;
  /** Room above the first row and below the last, so any row can sit in the middle. */
  #pad = 0;
  /** The selected row's place on the track: past the ends when the shelf loops. */
  #place = 0;

  /** Its animations were stopped by `leave`: the game shown next starts them again. */
  #left = false;

  constructor(options: CollectorOptions) {
    this.#options = options;
    window.addEventListener('resize', () => (this.#shelfH = 0));
    this.#shelf.append(this.#track, this.#lens);
    this.#navScreen.append(this.#letter);
    this.root.append(
      this.#backdrop,
      this.#navPic,
      this.#shelf,
      this.#showcase,
      this.#dossier,
      this.#scan.root
    );
  }

  show(source: LazyList<Game>, selected: number): void {
    this.#source = source;
    this.#shelfH = 0;
    this.#rows.forEach((row) => row.remove());
    this.#rows.clear();
    this.#selected = -1;
    // Straight to it, no glide from wherever the last list was.
    this.#track.classList.add('still');
    // The same game as before (the list reloaded, after a favourite say): no shelf, the case
    // goes on as it was, only what changed about the game is shown.
    const now = source.get(selected);
    if (now && now.system !== this.#shelfSystem) {
      this.#shelfSystem = now.system;
      this.#sizeShelf(now.system, source, selected);
    }
    const same = !!now && !!this.#box && this.#game?.id === now.id && !this.#left;
    this.select(selected, same);
    if (same && now) this.#update(now);
    else {
      // Opening a list: its game shown at once; only moves along the shelf wait to rest.
      clearTimeout(this.#settle);
      clearTimeout(this.#labelTimer);
      clearTimeout(this.#peek);
      this.#showSelected();
      // Its shot on the shelf's TV too: the stop that puts it there was just called off.
      if (now) this.#navPicFor(now);
      // Then, once its own pictures are on their way, its neighbours' TV pictures and
      // achievements: the first step from here (Up or Down from its details) shows them at once.
      clearTimeout(this.#aroundTimer);
      this.#aroundTimer = setTimeout(() => this.#keepNavPicsAround(), AROUND_AFTER_OPEN_MS);
    }
    requestAnimationFrame(() => this.#track.classList.remove('still'));
  }

  /** With more games than the shelf shows at once, the last ones come before the first. */
  #loops(total: number, row: number): boolean {
    const shown = this.#shelfHeight;
    return shown > 0 && total >= Math.ceil(shown / row) + 2;
  }

  get #shelfHeight(): number {
    if (!this.#shelfH) this.#shelfH = this.#shelf.clientHeight;
    return this.#shelfH;
  }

  /** The shelf's room above the first row, so any row can sit one row above the middle. */
  #measure(): void {
    const row = this.#rowRem * remPx();
    const pad = Math.max(0, (this.#shelfHeight - row) / 2 - row);
    if (pad === this.#pad) return;
    this.#pad = pad;
    // Where the selected row sits: the lens there.
    this.#shelf.style.setProperty('--pad', `${Math.round(pad)}px`);
  }

  /**
   * The shelf shows over the middle while the selection moves; a moment after the last move it
   * fades, and the case has the screen. Only opacity changes. While it shows, everything behind
   * it rests (the box's turns, the screenshots, the story's pages, the video), and goes on once
   * it is gone.
   */
  #browse(): void {
    this.root.classList.add('browsing');
    this.#storyScroll?.pause();
    if (this.#video) {
      this.#stopVideo();
      this.#videoHeld = true;
    }
    clearTimeout(this.#dropTimer);
    this.#dropTimer = setTimeout(() => this.#drop(), DROP_MS);
  }

  /**
   * The shelf kept up `ms` more before it goes as after any move: the list opened under the
   * system's switch-on (app.ts), whose dark hid it for most of its usual time.
   */
  holdShelf(ms: number): void {
    if (this.#resting() || ms <= 0) return;
    clearTimeout(this.#dropTimer);
    this.#dropTimer = setTimeout(() => this.#drop(), ms + DROP_MS);
  }

  /** The shelf goes, the selection at rest. */
  #drop(): void {
    perfMark('drop');
    // The case, footage and dossier fade in by themselves, and the shade off the fan art
    // (style.css). No fade from the dark over the whole screen on top: an animation on the
    // shade, which has a transition of its own, it came back for a frame as it ended on a Pi
    // (recorded: one dark frame 320 ms in, at every drop).
    this.root.classList.remove('browsing');
    this.#storyScroll?.play();
    if (this.#turnsDue) this.#startTurns();
    if (!this.#videoHeld) return;
    this.#videoHeld = false;
    if (this.#game && !this.#left) this.#startVideo(this.#game);
  }

  /** Nothing over the case: its animations may run. */
  #resting(): boolean {
    return !this.root.classList.contains('browsing');
  }

  /** A new game's bays fade in (not its label, which follows each step along the shelf). */
  #arrive(): void {
    clearTimeout(this.#arriving);
    this.root.classList.remove('arriving');
    // Again from the next frame: reading the layout here to restart it at once made the browser
    // lay the whole view out in the middle of drawing it (a long frame on a Pi).
    requestAnimationFrame(() => {
      this.root.classList.add('arriving');
      this.#arriving = setTimeout(() => this.root.classList.remove('arriving'), ARRIVE_MS);
    });
  }

  /**
   * The label over the shelf at once for the game picked (it stays lit while the shelf shows):
   * only the label, cheap; the rest of the showcase waits for the selection to rest.
   */
  #labelNow(): void {
    const done = span('collector.labelNow');
    try {
      this.#labelNowTraced();
    } finally {
      done();
    }
  }

  #labelNowTraced(): void {
    const game = this.selected;
    const label = this.#showcase.querySelector('.slab-label');
    if (game && label && label.getAttribute('data-id') !== String(game.id)) {
      const next = this.#label(game);
      keepPictures(label, [next]);
      // Its contents changed, the bar itself kept: a new bar is a new layer on a Pi, blank for a
      // frame before it is painted, and the bar blinked at each step.
      label.replaceChildren(...next.childNodes);
      label.setAttribute('data-id', String(game.id));
    }
  }

  get selected(): Game | undefined {
    return this.#source?.get(this.#selected);
  }

  pageSize(): number {
    return Math.max(1, Math.floor(this.#shelfHeight / (this.#rowRem * remPx())));
  }

  /** `quiet`: the same game again (a reload), not a move: no shelf, nothing restarted. */
  select(index: number, quiet = false): void {
    const done = span('collector.select');
    try {
      this.#selectTraced(index, quiet);
    } finally {
      done();
    }
  }

  #selectTraced(index: number, quiet = false): void {
    const changed = index !== this.#selected;
    const from = this.#selected;
    this.#selected = index;
    const now = performance.now();
    const held = changed && !quiet && now - this.#steppedAt < HELD_MS;
    if (changed) this.#steppedAt = now;
    this.#track.classList.toggle('held', held);
    const row = this.#rowRem * remPx();
    this.#measure();
    // The selected row a row above the middle, at the ends of the list too; the rows glide there. Whole
    // pixels: text on a layer moved by a fraction of one shimmers.
    const total = this.#source?.total ?? 0;
    this.#place =
      from >= 0 && this.#loops(total, row) ? loopPlace(this.#place, from, index, total) : index;
    this.#track.style.transform = `translateY(${Math.round(this.#pad - this.#place * row)}px)`;
    this.render();
    if (!changed || quiet) return;
    clearTimeout(this.#aroundTimer);
    this.#browse();
    this.#stopVideo();
    // The dossier follows at the peek, once the steps pause: not at each step of a held press.
    // While held the shelf says which game it is; the label's pictures would only flicker past.
    clearTimeout(this.#labelTimer);
    // A step loads nothing: games passed by quickly would queue their pictures on a Pi ahead of
    // the one stopped at. The peek below brings it all, the moment the steps pause.
    // Its label alone follows each step (words and the system's logo, cheap).
    if (!held) {
      this.#labelNow();
      this.#previewedAt = now;
      // Its TV picture at once (shown as soon as decoded, at once when loaded ahead), not the
      // last game's left there till the peek. Its details and achievements wait for the peek:
      // built in the frame after each step, they held up the shelf's glide on a Pi.
      const game = this.selected;
      if (game) this.#navPicFor(game);
    }
    // Held a while: racing through the list. Nothing is loaded (the TV blank, the dossier empty):
    // the TV shows the letter the shelf is at, and all comes for the game stopped at.
    if (!held) this.#heldSince = now;
    else if (now - this.#heldSince >= RACE_MS) this.#race();
    // Held: the game passed now, every so often, behind and above the shelf.
    if (this.#racing) {
      // (the letter only, above)
    } else if (held && now - this.#previewedAt >= HELD_PREVIEW_MS) {
      this.#previewedAt = now;
      const game = this.selected;
      if (game) {
        this.#labelNow();
        // The TV is the sneak peek: only its small picture follows (one at a time, the one
        // loading finishes first). The fan art waits for a pause: decoding it at every step
        // made scrolling stutter on a Pi.
        if (!this.#navPic.querySelector('img.waiting')) this.#navPicFor(game);
      }
    }
    clearTimeout(this.#peek);
    this.#peek = setTimeout(() => {
      perfMark('peek');
      // Let go: the race is over, the game stopped at loads as after any step.
      this.#endRace();
      const game = this.selected;
      if (!game) return;
      // Its colours first (worked out from a tiny picture), then the rest, a frame each: all at
      // once was one long frame on a Pi (measured: 80 ms), most of it the page restyling.
      this.#tintSelected(game);
      this.#labelNow();
      void this.#achievementsOf(game);
      this.#inTurn(game, [
        () => this.#navPicFor(game),
        () => this.#dossierFor(game),
        () => this.#backdropFor(game),
        () => this.#keepNavPicsAround()
      ]);
    }, PEEK_MS);
    clearTimeout(this.#settle);
    this.#settle = setTimeout(() => this.#showSelected(), SETTLE_MS);
  }

  /** Racing through the list: the TV blank but for the letter the shelf is at, the dossier empty. */
  #race(): void {
    const game = this.selected;
    const letter = game ? initial(game.name) : '';
    if (this.#letter.textContent !== letter) this.#letter.textContent = letter;
    if (this.#racing) return;
    this.#racing = true;
    this.#navScreen.querySelectorAll('img').forEach((img) => img.remove());
    this.#navPicSrc = null;
    this.#dossier.replaceChildren();
    this.#dossier.dataset.id = '';
    this.root.classList.add('racing');
  }

  #endRace(): void {
    if (!this.#racing) return;
    this.#racing = false;
    this.root.classList.remove('racing');
  }

  /** The visible shelf, from whatever is loaded; again as pages arrive. */
  render(): void {
    const done = span('collector.render');
    try {
      this.#renderTraced();
    } finally {
      done();
    }
  }

  #renderTraced(): void {
    const source = this.#source;
    if (!source) return;
    const row = this.#rowRem * remPx();
    // Those in sight round the selected one, and a few more for the glide.
    const half = Math.ceil(this.#shelfHeight / row / 2) + OVERSCAN;
    const loops = this.#loops(source.total, row);
    const at = loops ? this.#place : Math.max(0, this.#selected);
    const first = loops ? at - half : Math.max(0, at - half);
    const last = loops ? at + half : Math.min(source.total - 1, at + half);
    // The pages beyond, both ways: loaded before the shelf gets there.
    for (const i of [first - LOAD_AHEAD, last + LOAD_AHEAD]) {
      if (loops) source.get(loopIndex(i, source.total));
      else if (i >= 0 && i < source.total) source.get(i);
    }
    for (const [i, node] of this.#rows) {
      if (i < first || i > last) {
        node.remove();
        this.#rows.delete(i);
      }
    }
    for (let i = first; i <= last; i++) {
      const game = source.get(loops ? loopIndex(i, source.total) : i);
      let node = this.#rows.get(i);
      if (!node) {
        node = el('div', { class: 'spine-row', role: 'option' });
        node.style.top = `${Math.round(i * this.#rowRem * 1000) / 1000}rem`;
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
      // Which is selected, for screen readers only: the lens shows it (no style follows it).
      const selected = i === (loops ? at : this.#selected);
      if (node.getAttribute('aria-selected') !== String(selected)) {
        node.setAttribute('aria-selected', String(selected));
      }
    }
    if (this.#pending && this.selected) this.#showSelected();
  }

  /**
   * A game on the shelf: its own spine picture lying on its side, where it has one (its name
   * still there for screen readers); else a spine in its colour, with its marquee (its logo) on
   * it where it has one, else its name. Every row as long as the others, a spine picture
   * filling it.
   */
  #shelfRow(game: Game, node: HTMLElement): HTMLElement[] {
    const parts = [
      el('span', { class: 'band', 'aria-hidden': 'true' }),
      el('span', { class: 'title' }, game.name)
    ];
    const src = this.#options.media(game, 'boxside', 160);
    node.classList.toggle('pictured', !!src);
    const marquee = src ? null : this.#options.media(game, 'marquee', 320);
    node.classList.toggle('marked', !!marquee);
    if (marquee) {
      const logo = picture(marquee, 'spine-mark');
      logo.addEventListener(
        'error',
        () => {
          logo.remove();
          node.classList.remove('marked');
        },
        { once: true }
      );
      return [parts[0]!, logo, parts[1]!];
    }
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

  /**
   * The shelf's spine length for a system, the same for every list of it and fixed while it is
   * browsed: worked out once, when its first list opens, from the spine pictures of the games
   * loaded then (the stubbiest decides), and kept. Without spine pictures, the usual length.
   * Only the length differs from system to system; the shelf moves the same for all.
   */
  #sizeShelf(system: string, source: LazyList<Game>, selected: number): void {
    this.#spineScale = BIGGER_SPINES.test(system) ? BIGGER_SCALE : 1;
    if (this.#spineScale === 1) this.#shelf.style.removeProperty('--spine-h');
    else this.#shelf.style.setProperty('--spine-h', `${this.#len(SPINE_H_REM)}rem`);
    const known = spineLengths.get(system);
    this.#shelf.style.setProperty('--spine-len', `${known ?? this.#len(SPINE_LEN_REM)}rem`);
    if (known !== undefined) return;
    const urls: string[] = [];
    for (let i = 0; i < source.total && urls.length < SPINE_PROBES; i++) {
      // The games round the one opened first: those are loaded.
      const game = source.get(loopIndex(selected + i, source.total));
      const url = game ? this.#options.media(game, 'boxside', 160) : null;
      if (url) urls.push(url);
    }
    if (urls.length === 0) {
      spineLengths.set(system, this.#len(SPINE_LEN_REM));
      return;
    }
    void Promise.all(urls.map(spineShapeOf)).then((shapes) => {
      const known = shapes.filter((s): s is number => s !== null);
      if (!this.#shelfRoom) this.#centreShelf();
      const length = this.#len(
        known.length ? shelfShape(Math.min(...known), this.#shelfRoom) : SPINE_LEN_REM
      );
      spineLengths.set(system, length);
      if (this.#shelfSystem === system) {
        this.#shelf.style.setProperty('--spine-len', `${length}rem`);
      }
    });
  }

  /** A spine length (rem) at this system's spine size. */
  #len(rem: number): number {
    return Math.round(rem * this.#spineScale * 100) / 100;
  }

  /** The distance (rem) from one row to the next, at this system's spine size. */
  get #rowRem(): number {
    return ROW_REM * this.#spineScale;
  }

  /**
   * The shelf's middle over the footage; a long spine may reach over the case's side (put away
   * while the shelf shows), never over the dossier, lit beside it (a PC Engine's ran into it).
   */
  #centreShelf(): void {
    const bay = this.root.querySelector('.bay.footage');
    const shelf = this.#shelf.getBoundingClientRect();
    const footage = bay?.getBoundingClientRect();
    if (!footage?.width || !shelf.width) return;
    const mid = footage.left + footage.width / 2 - shelf.left;
    this.#shelf.style.setProperty('--mid', `${mid}px`);
    const dossier = this.#dossier.getBoundingClientRect();
    // Up to the dossier, when it is beside the footage (not laid out yet: the whole view).
    const edge = dossier.left - shelf.left;
    const right = dossier.width && edge > mid ? edge : shelf.width;
    this.#shelfRoom = (2 * Math.min(mid, right - mid)) / remPx();
  }

  /** A game's pictures were replaced: draws again its spine and, if it is the one shown, its case. */
  mediaChanged(id: number): void {
    for (const node of this.#rows.values()) {
      if (node.dataset.key === String(id)) node.dataset.key = '';
    }
    this.render();
    const game = this.selected;
    if (game?.id !== id) return;
    // A scraper run on it: drawn again as its scan says, once the run is done with it.
    if (this.#scan.busyWith(id)) return this.#scan.redraw(id, () => this.#showSelected(true));
    this.#showSelected(true);
    this.#scan.refreshed(game, this.#pictures());
  }

  /** The game switched on over the view: its logo, or its name, lit in a line of light. */
  async #boot(game: Game): Promise<number> {
    const media = this.#options.media;
    // Its logo as the scrape just brought it, loaded before the boot lights it.
    const mark = await scrapedMark(
      game,
      (g) => media(g, 'wheel', 560) ?? media(g, 'marquee', 560),
      this.#options.fresh
    );
    if (this.selected?.id !== game.id) return 0;
    return boot(this.root, mark, 0, {
      colour: this.#colour ?? 'var(--neon)'
    });
  }

  /** Every picture it shows now: behind it, its case, its dossier. */
  #pictures(): HTMLImageElement[] {
    return [
      ...this.#backdrop.querySelectorAll('img'),
      ...this.#showcase.querySelectorAll('img'),
      ...this.#dossier.querySelectorAll('img')
    ];
  }

  /** A scraper run moved on: the scan over the selected game follows it. */
  scrapeProgress(status: ScraperStatus): void {
    this.#scan.progress(status, this.selected);
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
    if (changed) return this.#scan.redraw(game.id, () => this.#showSelected(true));
    this.#showcase.querySelector('.slab-label .fav')?.classList.toggle('on', game.favorite);
  }

  /** Turns the box to its next pose (`1`) or its last (`-1`); it stops turning by itself. */
  turn(direction: 1 | -1): void {
    if (!this.#box) return;
    this.#intervals.forEach(clearInterval);
    this.#intervals = [];
    this.#turnTo(direction);
  }

  /** The shelf shown a while, as if moved along: the list changed (filtered, or every game again). */
  reveal(): void {
    this.#browse();
  }

  leave(): void {
    this.#endRace();
    clearTimeout(this.#settle);
    clearTimeout(this.#labelTimer);
    clearTimeout(this.#peek);
    clearTimeout(this.#dropTimer);
    this.root.classList.remove('browsing');
    this.#stop();
    this.#left = true;
  }

  resume(): void {
    if (this.#source) this.#showSelected(true);
  }

  /** Forma's menu over the view: its video stopped under it, and played again once it closes. */
  menu(open: boolean): void {
    if (open) {
      if (!this.#video) return;
      this.#stopVideo();
      this.#videoHeld = true;
      return;
    }
    if (!this.#videoHeld || this.#left) return;
    this.#videoHeld = false;
    if (this.#game) this.#startVideo(this.#game);
  }

  #stop(): void {
    this.#videoHeld = false;
    this.#turnsDue = false;
    this.#timers.forEach(clearTimeout);
    this.#intervals.forEach(clearInterval);
    this.#storyScroll?.cancel();
    this.#storyScroll = null;
    this.#timers = [];
    this.#intervals = [];
    clearTimeout(this.#slideDone);
    this.#stopVideo();
  }

  /** Asks Forma for the game's video; once it plays, the page lets it through behind the case. */
  #startVideo(game: Game): void {
    // The shelf is up: it plays once the shelf goes.
    if (!this.#resting()) {
      this.#videoHeld = true;
      return;
    }
    const play = this.#options.play;
    const area = this.#footage ? videoArea(this.#footage) : null;
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
    // The fan art stays round the video's window: a hole cut where the screen is, its corners
    // as round as the screen's (a TV's tube), so the video's square corners never show.
    const r = on ? this.#footage?.getBoundingClientRect() : null;
    const round = this.#footage ? cornerOf(this.#footage) : { rx: 0, ry: 0 };
    if (r?.width) {
      const b = this.#backdrop.getBoundingClientRect();
      this.#backdrop.style.clipPath = holeIn(b.width, b.height, {
        left: r.left - b.left,
        top: r.top - b.top,
        right: r.right - b.left,
        bottom: r.bottom - b.top,
        ...round
      });
    } else {
      this.#backdrop.style.removeProperty('clip-path');
    }
    // A TV round it: its body is painted behind the tube, so it gets the same hole (else the
    // video showed its wood, not the game).
    const set = this.#footage?.closest('.tv')?.querySelector<HTMLElement>('.tv-set');
    if (set) {
      const s = set.getBoundingClientRect();
      if (r?.width && s.width) {
        // In its body only (style.css), rounded as the tube is.
        set.style.setProperty(
          '--hole',
          holeIn(s.width, s.height, {
            left: r.left - s.left,
            top: r.top - s.top,
            right: r.right - s.left,
            bottom: r.bottom - s.top,
            ...round
          })
        );
      } else {
        set.style.removeProperty('--hole');
      }
    }
    this.root.classList.toggle('video-on', on);
    document.documentElement.classList.toggle('video-through', on);
  }

  #later(work: () => void, ms: number): void {
    this.#timers.push(setTimeout(awake(work), ms));
  }

  /** Over and over, every `ms`; not while the shelf is up (a turn missed, not caught up). */
  #every(work: () => void, ms: number): void {
    this.#intervals.push(
      setInterval(
        awake(() => {
          if (this.#resting()) work();
        }),
        ms
      )
    );
  }

  /** The selected game in the showcase; the one already there stays as it is, unless `again`. */
  #showSelected(again = false): void {
    const done = span('collector.showSelected');
    try {
      this.#showSelectedTraced(again);
    } finally {
      done();
    }
  }

  #showSelectedTraced(again = false): void {
    const game = this.selected;
    this.#pending = !game;
    // The same game, its dossier there too (a race emptied it: drawn again below).
    if (
      game &&
      !again &&
      !this.#left &&
      this.#game?.id === game.id &&
      this.#box &&
      this.#dossier.dataset.id === String(game.id)
    ) {
      return this.#labelNow();
    }
    // Already on its way (the list reloaded meanwhile, as it does while Forma checks the
    // library): that draw goes on, not started again, or on a Pi it never finished.
    if (game && !again && this.#drawing === game.id) return;
    const round = ++this.#drawRound;
    this.#drawing = null;
    if (!game) {
      this.#stop();
      return;
    }
    this.#backdropFor(game);
    const showcase = this.#showcaseParts(game);
    const dossier = this.#dossierParts(game);
    // Drawn again where it is (its pictures just replaced, its details changed): at once.
    // Or nothing shown to keep (a list just opened, back from elsewhere): at once too.
    if (again || !this.#game || this.#left) return this.#draw(game, showcase, dossier, true);
    // Another game: the one shown stays until the next's pictures have loaded, then is
    // replaced by it whole, rather than emptied first and filled in as they come.
    this.#drawing = game.id;
    const images = [...showcase, ...dossier].flatMap((part) => [
      ...(part instanceof HTMLImageElement ? [part] : []),
      ...part.querySelectorAll('img')
    ]);
    const loaded = images.map((img) =>
      typeof img.decode === 'function' ? img.decode().catch(() => undefined) : Promise.resolve()
    );
    void Promise.race([
      Promise.all(loaded),
      new Promise((done) => setTimeout(done, SWAP_WAIT_MS))
    ]).then(() => {
      if (round !== this.#drawRound) return;
      this.#drawing = null;
      if (this.selected?.id !== game.id) return;
      this.#draw(game, showcase, dossier);
    });
  }

  /**
   * The dossier for `game` at once, at the peek: its details as soon as the steps pause, ahead
   * of the showcase. The draw at the settle then keeps it as it is.
   */
  #dossierFor(game: ShowGame): void {
    if (this.selected?.id !== game.id || this.#dossier.dataset.id === String(game.id)) return;
    const parts = this.#dossierParts(game);
    keepPictures(this.#dossier, parts);
    // Its words this frame, its pictures (the logo first among them) the next: decoding a
    // logo in the same frame as the words made that one frame long on a Pi.
    const later: [HTMLImageElement, string][] = [];
    for (const part of parts) {
      for (const img of part.querySelectorAll('img')) {
        const src = img.getAttribute('src');
        if (!src || img.complete) continue;
        img.decoding = 'async';
        img.removeAttribute('src');
        later.push([img, src]);
      }
    }
    this.#dossier.replaceChildren(...parts);
    this.#dossier.dataset.id = String(game.id);
    this.#dossier.classList.remove('kept');
    if (later.length) {
      const id = String(game.id);
      requestAnimationFrame(() => {
        if (this.#dossier.dataset.id !== id) return;
        for (const [img, src] of later) img.setAttribute('src', src);
        fadeInAsLoaded(this.#dossier);
      });
    }
    if (perfOn() && this.#steppedAt)
      timing('dossier after step', performance.now() - this.#steppedAt);
  }

  /** Perf mode: how long after the last step the game was drawn, and its pictures all in. */
  #timeDraw(): void {
    const since = this.#steppedAt;
    if (!since || !perfOn()) return;
    timing('drawn after step', performance.now() - since);
    const images = [
      ...this.#showcase.querySelectorAll('img'),
      ...this.#dossier.querySelectorAll('img')
    ];
    void Promise.all(
      images.map((img) =>
        img.complete || typeof img.decode !== 'function'
          ? Promise.resolve()
          : img.decode().catch(() => undefined)
      )
    ).then(() => {
      if (this.#steppedAt === since) timing('pictures after step', performance.now() - since);
    });
  }

  /** The game in the showcase and the dossier, its parts made: put in, and set going. */
  /** `fresh`: the dossier drawn anew even if it already shows this game (its details changed). */
  #draw(game: Game, showcase: HTMLElement[], dossier: HTMLElement[], fresh = false): void {
    perfMark('draw');
    this.#stop();
    this.#left = false;
    this.#game = game;
    this.#angle = 0;
    // Its colours, unless they are on already (the peek put them on): taken off and put back,
    // the label and all in them flashed the default colour in between.
    if (this.#tinted !== game.id) {
      this.#paint(null);
      this.#tinted = null;
    }
    this.#tint(game);
    // The label, already showing this game (it follows each step), is kept as it is: drawn
    // again, the same, it flickered. Otherwise its pictures only are kept where the same: the
    // box sizes itself as its own load, so they are always new.
    const label = this.#showcase.querySelector<HTMLElement>('.slab-label');
    const at = showcase.findIndex((p) => p.classList.contains('slab-label'));
    if (label && at >= 0) {
      if (fresh || label.dataset.id !== String(game.id)) {
        // Another game's: the bar given this one's contents, the bar itself kept.
        const next = showcase[at]!;
        keepPictures(label, [next]);
        label.replaceChildren(...next.childNodes);
        label.dataset.id = String(game.id);
      }
      showcase[at] = label;
    }
    if (label && showcase[at] === label) {
      // Left where it is, the rest round it: taken out and put back, it was a new layer again.
      for (const part of [...this.#showcase.children]) if (part !== label) part.remove();
      label.before(...showcase.slice(0, at));
      label.after(...showcase.slice(at + 1));
    } else {
      this.#showcase.replaceChildren(...showcase);
    }
    // Followed the shelf already: kept as it is, not drawn again, nor faded in again (it
    // flickered as the shelf went).
    const keep = !fresh && this.#dossier.dataset.id === String(game.id);
    this.#dossier.classList.toggle('kept', keep);
    if (!keep) {
      keepPictures(this.#dossier, dossier);
      this.#dossier.replaceChildren(...dossier);
      this.#dossier.dataset.id = String(game.id);
    }
    fadeInAsLoaded(this.#showcase);
    fadeInAsLoaded(this.#dossier);
    this.#timeDraw();
    this.#scan.shown(game.id, this.#pictures());
    this.#arrive();
    requestAnimationFrame(() => {
      this.#fit?.();
      this.#centreShelf();
    });
    // Its turns from when it is first seen: drawn under the shelf, it waits there on its front
    // (it had turned to its spine or back under the shelf, and came out so).
    if (motion()) {
      if (this.#resting()) this.#startTurns();
      else this.#turnsDue = true;
    }
    this.#later(() => {
      this.#prepareAround();
      this.#keepFanartAround();
    }, PREPARE_AFTER_MS);
    this.#later(() => this.#startVideo(game), VIDEO_AFTER_MS);
  }

  #startTurns(): void {
    this.#turnsDue = false;
    this.#later(() => {
      if (this.#resting()) this.#turnTo(1);
      this.#every(() => this.#turnTo(1), TURN_MS);
    }, FIRST_TURN_MS);
  }

  /**
   * The next pose (`1`) or the last (`-1`). Between the box's, it turns. After its back, the
   * box swipes off to the left and its cartridge comes in from there; then the cartridge backs
   * off to the left as the box comes in from the left, already turned to its pose, and swallows
   * it on the way back to the middle.
   */
  #turnTo(direction: 1 | -1): void {
    const done = span('collector.turnTo');
    try {
      this.#turnToTraced(direction);
    } finally {
      done();
    }
  }

  #turnToTraced(direction: 1 | -1): void {
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
      // Out of sight on the left: turned to its pose at once, to come in from there over the
      // cartridge (style.css: box-swallows).
      this.#angle += (((to.angle - this.#angle) % 360) + 360) % 360;
      box.style.transition = 'none';
      box.style.transform = boxTransform(this.#angle);
      void box.offsetWidth;
      box.style.removeProperty('transition');
      display?.classList.remove('cart-out');
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

  /**
   * The selected game's colour (`--game`) on the parts that show it: the showcase (the label
   * and the bays), the dossier, the shelf's TV and its lens. Not on the whole view: a
   * custom property changed there restyled every spine on the shelf at each game (a Pi frame
   * or more). `null`: the view's own (neon) again.
   */
  #paint(colour: string | null): void {
    this.#colour = colour;
    for (const part of [this.#showcase, this.#dossier, this.#navPic, this.#lens]) {
      if (colour) part.style.setProperty('--game', colour);
      else part.style.removeProperty('--game');
    }
  }

  #tint(game: Game): void {
    const colour = this.#colourOf(game);
    if (!colour) return;
    const id = game.id;
    void colour.then((c) => {
      if (!c || this.#game?.id !== id) return;
      this.#paint(c);
      this.#tinted = id;
    });
  }

  /** `steps`, one a frame, while `game` is still the one selected. */
  #inTurn(game: Game, steps: (() => void)[]): void {
    const next = () => {
      const step = steps.shift();
      if (!step || this.selected?.id !== game.id) return;
      step();
      if (steps.length) requestAnimationFrame(next);
    };
    next();
  }

  /** The selected game's colours over the page as soon as they are known, before it is drawn. */
  #tintSelected(game: Game): void {
    const colour = this.#colourOf(game);
    if (!colour) return;
    const id = game.id;
    void colour.then((c) => {
      if (!c || this.selected?.id !== id) return;
      this.#paint(c);
      this.#tinted = id;
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
    // At each stop as the shelf moves too, under its shade (not while racing: no stop then).
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

  /**
   * The game's picture left of the shelf (its screenshot, else its title screen, else its box):
   * the next one in once decoded, the last kept until then, so it never goes blank.
   */
  #navPicFor(game: Game): void {
    const system = this.#options.system?.(game.system);
    // Set only when it changes: set again, even the same, the TV was styled anew at each step.
    const era = tvEra(system?.category, system?.released);
    if (this.#tv.dataset.era !== era) this.#tv.dataset.era = era;
    const { shot, src } = this.#navPicOf(game);
    if (src === this.#navPicSrc) return;
    this.#navPicSrc = src;
    const screen = this.#navScreen;
    screen.querySelectorAll('img.waiting').forEach((n) => n.remove());
    if (!src) {
      screen.querySelectorAll('img').forEach((n) => n.remove());
      this.#tv.classList.add('empty');
      return;
    }
    const img = picture(src, 'waiting');
    screen.append(img);
    const show = () => {
      if (!img.isConnected) return;
      // Its own shape, for a plain frame to fit it (style.css): a screenshot's without its
      // black bars, cut off (trim.ts). Not the box's, shown when there is no screenshot.
      if (img.naturalWidth && img.naturalHeight) {
        const trim = src === shot ? borderOf(img) : null;
        const shape = trim ? trimmedAspect(img, trim) : img.naturalWidth / img.naturalHeight;
        const ar = shape.toFixed(3);
        if (this.#tv.style.getPropertyValue('--ar') !== ar) this.#tv.style.setProperty('--ar', ar);
        const era = this.#tv.dataset.era ?? 'plain';
        if (trim) placeTrimmed(img, trim, era === 'plain' ? shape : screenAspect(era));
      }
      for (const old of [...screen.querySelectorAll('img')]) if (old !== img) old.remove();
      img.classList.remove('waiting');
      this.#tv.classList.remove('empty');
      if (perfOn() && this.#steppedAt) timing('tv after step', performance.now() - this.#steppedAt);
    };
    img.addEventListener(
      'load',
      () => void (img.decode?.() ?? Promise.resolve()).catch(() => {}).then(show),
      { once: true }
    );
    img.addEventListener(
      'error',
      () => {
        img.remove();
        if (this.#navPicSrc === src) this.#navPicSrc = null;
      },
      { once: true }
    );
  }

  /** The TV's picture for `game`: its screenshot, else its title screen, else its box. */
  #navPicOf(game: Game): { shot: string | null; src: string | null } {
    const media = this.#options.media;
    const shot = media(game, 'image', 400) ?? media(game, 'titleshot', 400);
    return { shot, src: shot ?? media(game, 'thumbnail', 640) };
  }

  /**
   * The TV pictures of the games round the one shown, loaded, decoded and measured (their black
   * bars) ahead, the nearest first: a step to one of them shows it at once. A few kept only.
   */
  #keepNavPicsAround(): void {
    const source = this.#source;
    if (!source || this.#racing) return;
    for (let d = 1; d <= NAV_PIC_AROUND; d++) {
      for (const i of [this.#selected + d, this.#selected - d]) {
        const game = i >= 0 && i < source.total ? source.get(i) : undefined;
        if (!game) continue;
        // Its achievements too: RetroAchievements is slow to answer, so asked for ahead.
        void this.#achievementsOf(game);
        const { shot, src } = this.#navPicOf(game);
        // Its logo too, for the dossier the step to it draws at once.
        const media = this.#options.media;
        const logo = media(game, 'wheel', 560) ?? media(game, 'marquee', 560);
        for (const url of [src, logo]) {
          if (!url) continue;
          const kept = this.#navKept.get(url);
          this.#navKept.delete(url);
          if (kept) {
            this.#navKept.set(url, kept);
            continue;
          }
          const img = new Image();
          img.decoding = 'async';
          img.src = url;
          this.#navKept.set(url, img);
          // Its bars measured now, while nothing moves: on the step to it, only looked up.
          void (typeof img.decode === 'function' ? img.decode() : Promise.resolve())
            .then(() => {
              if (url === shot) borderOf(img);
            })
            .catch(() => {});
        }
      }
    }
    for (const oldest of this.#navKept.keys()) {
      if (this.#navKept.size <= NAV_PIC_KEPT) break;
      this.#navKept.delete(oldest);
    }
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
    const shown = this.#options.system?.(game.system);
    const era = tvEra(shown?.category, shown?.released);
    this.#footage.append(...shots.map((src, i) => shotImage(src, i === 0, screenAspect(era))));
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
      bay('footage', 'Footage', this.#footageSet(game, this.#footage)),
      this.#storyBay(game)
    ];
  }

  /**
   * The footage's screen in a TV of its console's day (the same as the shelf's preview), the
   * screen its tube: the video plays in the screen's own box, the TV's body over its corners.
   * Other systems: the screen in its plain monitor bezel.
   */
  #footageSet(game: ShowGame, screen: HTMLElement): HTMLElement {
    const system = this.#options.system?.(game.system);
    const era = tvEra(system?.category, system?.released);
    if (era === 'plain') return screen;
    const tube = el('div', { class: 'tv-screen' }, screen);
    const set = tvSet(tube);
    set.dataset.era = era;
    return set;
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

  /**
   * The game's story, all of it: longer than its bay, it scrolls slowly to its end, then shows
   * from its start again, over and over (paused while the shelf is up). With motion off, a page
   * at a time instead: cut where it fills the bay, between sentences, its number under it.
   */
  #storyBay(game: ShowGame): HTMLElement {
    const all = game.description ?? '';
    const lines = el('div', { class: 'lines' }, all);
    const box = el('div', { class: 'text' }, lines);
    const pager = el('span', { class: 'pager', 'aria-hidden': 'true' });
    const story = bay('story', ARCADE.has(game.system) ? 'History' : 'Story', box, pager);
    // No story: the footage has its room.
    this.root.classList.toggle('no-story', !all);
    const id = game.id;
    requestAnimationFrame(() => {
      if (this.#game?.id !== id || !box.clientHeight) return;
      if (document.documentElement.dataset.motion !== 'off') {
        this.#scrollStory(lines, lines.scrollHeight - box.clientHeight);
        return;
      }
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

  /** The story's lines moved up `by` pixels, slowly, then back to the start (loopScroll). */
  #scrollStory(lines: HTMLElement, by: number): void {
    this.#storyScroll?.cancel();
    this.#storyScroll = loopScroll(lines, by);
    if (!this.#resting()) this.#storyScroll?.pause();
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
    // Its year, system and regions (its genre is in the dossier's release).
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
        el('strong', {}, game.name),
        // Who put it out, under its name; the line kept when unknown (the bar's lines stay put).
        el('span', { class: 'publisher' }, game.publisher ?? ''),
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
    // On its front, a new box: its angle reset here where it is built (reset only once drawn, it
    // began at the last box's turn, its spine or its back, and was turned on from there).
    this.#angle = 0;
    const box = el('div', { class: 'cbox', 'data-pose': 'front' });
    box.style.transform = boxTransform(0);
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
    // The catalogue's name first (the dump it is), the file's after, the scraper's last.
    const rom = gameTags(game);
    const tags = releaseOf(rom.version, rom.status);
    const regions = rom.regions.length ? rom.regions : codes(game.region);
    const languages = rom.languages.length ? rom.languages : codes(game.lang);
    const company = (name: string | null) => {
      if (!name) return null;
      const src = this.#options.company?.(name);
      // The logo with its name beside it: a logo alone may not say whose it is. Its slot there
      // with no logo too, so the name never moves, and a logo that is not there is asked for
      // once, not at every game.
      const slot = el('span', { class: 'company-slot' });
      if (src && !NO_LOGO.has(src)) {
        const img = el('img', { class: 'company', src, alt: '', decoding: 'async' });
        img.addEventListener(
          'error',
          () => {
            NO_LOGO.add(src);
            img.remove();
          },
          { once: true }
        );
        slot.append(img);
      }
      return el('span', { class: 'company-line' }, slot, el('span', {}, name));
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
    // How long ago, smaller, after the date.
    const released = game.releaseDate
      ? el(
          'span',
          {},
          `${date(game.releaseDate)} `,
          el('span', { class: 'ago' }, `· ${ago(game.releaseDate).toLowerCase()}`)
        )
      : null;

    // The game itself, as made and sold.
    const about = section(
      'Game',
      row('Genre', game.genre),
      row('Region', flags(flaggedRegions(regions), REGIONS, regionFlag)),
      // Who made it and who sold it, together.
      row('Developer', company(game.developer)),
      row('Publisher', company(game.publisher)),
      row('Released', released)
    );
    // The copy at hand: what kind it is, as released (a release, a prototype, a demo, homebrew,
    // unlicensed…) and as changed since (a fan translation, a hack), together; its number
    // apart; who made a translation's patch; in what languages; and whether the file is the
    // dump No-Intro or Redump lists, once Forma has checked it.
    const changed = tags.status
      ? versionText(tags.status).replace(/\bTranslation\b/, 'Fan translation')
      : null;
    const dump = section(
      'Dump',
      row('Type', [tags.kind, changed].filter(Boolean).join(' · ') || 'Release'),
      row('Version', tags.number),
      row('Patch', patchBy(game.path)),
      row('Languages', flags(languages, LANGUAGES, languageFlag)),
      row('Integrity', dumpText(game.dump))
    );
    // Each its own room, as if every row were there, even with none: nothing below ever moves.
    const room = (part: HTMLElement | null, name: string) => {
      const kept = part ?? el('section', { class: 'part' });
      kept.classList.add(name);
      return kept;
    };
    const aboutRoom = room(about, 'about');
    const dumpRoom = room(dump, 'copy');
    const record =
      section(
        'Play record',
        row('Played', game.playCount > 0 ? `${game.playCount}×` : 'Never yet'),
        row('Time', game.gameTime > 0 ? playtime(game.gameTime) : null),
        row('Last', game.lastPlayed ? ago(game.lastPlayed) : null)
      ) ?? el('section', { class: 'part' });

    // The play record in the place its pair once shared (its styles still say `alternate`).
    record.classList.add('shown');
    const alternate = el('div', { class: 'alternate' }, record);
    const marks = this.#marks(game);
    this.#achievementsInto(game, marks);
    this.#savesInto(game, marks);
    const parts = [head, marks, aboutRoom, dumpRoom, alternate];

    return parts;
  }

  /**
   * What the game offers and what it is, as tiles, always all four (faded where it has none):
   * how many play, its manual, its achievements (filled in when they arrive), and its age
   * rating as PEGI's badge.
   */
  #marks(game: ShowGame): HTMLElement {
    const cheevos = mark('cheevos', ICONS.cheevos, '– / –', false);
    cheevos.setAttribute('aria-label', 'No achievements');
    const manual = !!this.#options.media(game, 'manual');
    return el(
      'ul',
      { class: 'marks' },
      mark(
        'players',
        ICONS.players,
        game.players ? players(game.players) : 'Players ?',
        !!game.players
      ),
      mark('manual', ICONS.manual, manual ? 'Manual' : 'No manual', manual),
      // Faded until its saves are known, and when it has none: lit with their count.
      mark('saves', ICONS.saves, 'No saves', false),
      cheevos,
      pegiMark(game)
    );
  }

  /** `game`'s achievements, asked for once (and kept); `null` where it has none to ask for. */
  #achievementsOf(game: Game): Promise<Achievements | null> | null {
    const fetch = this.#options.achievements;
    if (game.raGameId === null || !fetch) return null;
    let progress = this.#achievements.get(game.id);
    if (!progress) {
      const id = game.id;
      progress = fetch(game).catch(() => null);
      // None came (offline, say): asked again next time, not kept empty.
      void progress.then((a) => {
        if (!a && this.#achievements.get(id) === progress) this.#achievements.delete(id);
      });
      this.#achievements.set(id, progress);
    }
    return progress;
  }

  /** The game `id` was just played: its achievements and saves are asked for afresh. */
  played(id: number): void {
    this.#achievements.delete(id);
    this.#saves.delete(id);
  }

  /** `game`'s saves, asked for once until it is played again; `null` where none can be asked. */
  #savesOf(game: Game): Promise<GameSaves | null> | null {
    const fetch = this.#options.saves;
    if (!fetch) return null;
    let saves = this.#saves.get(game.id);
    if (!saves) {
      saves = fetch(game).catch(() => null);
      this.#saves.set(game.id, saves);
    }
    return saves;
  }

  /** Its saves' tile lit with their count, once known, when it has some. */
  #savesInto(game: Game, marks: HTMLElement): void {
    const saves = this.#savesOf(game);
    if (!saves) return;
    const id = game.id;
    void saves.then((s) => {
      if (!s || this.#dossier.dataset.id !== String(id)) return;
      const total = s.states + (s.battery ? 1 : 0);
      if (total === 0) return;
      const tile = mark('saves', ICONS.saves, total === 1 ? '1 save' : `${total} saves`, true);
      const what = [
        s.states > 0 ? `${s.states} save state${s.states === 1 ? '' : 's'}` : null,
        s.battery ? 'a battery save' : null
      ].filter(Boolean);
      tile.setAttribute(
        'aria-label',
        `${what.join(' and ')}${s.latest ? `, the latest ${ago(s.latest)}` : ''}`
      );
      marks.querySelector('.mark.saves')?.replaceWith(tile);
    });
  }

  /** How many of its achievements are won, in their tile, once known. */
  #achievementsInto(game: Game, marks: HTMLElement): void {
    const progress = this.#achievementsOf(game);
    if (!progress) return;
    const id = game.id;
    void progress.then((a) => {
      if (!a || a.total === 0 || this.#dossier.dataset.id !== String(id)) return;
      const tile = mark('cheevos', ICONS.cheevos, `${a.earned} / ${a.total}`, true);
      tile.setAttribute('aria-label', `${a.earned} of ${a.total} achievements`);
      marks.querySelector('.mark.cheevos')?.replaceWith(tile);
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

/** A drawn TV round `screen` (its tube): style.css draws it as its `data-era` says. */
function tvSet(screen: HTMLElement, cls = 'tv'): HTMLElement {
  return el(
    'div',
    { class: cls },
    el(
      'div',
      { class: 'tv-set' },
      screen,
      el(
        'div',
        { class: 'tv-panel' },
        el('i', { class: 'grille' }),
        el('i', { class: 'knob' }),
        el('i', { class: 'knob' }),
        el('i', { class: 'led' })
      )
    )
  );
}

/**
 * The TV a console's games are previewed on, from the year it came out: a wood-grain set for the
 * late '70s and early '80s, a beige one for the late '80s, a black one for the '90s, a flat screen
 * after. Other systems (handhelds, computers…): `plain`, the picture in a frame.
 */
export function tvEra(category?: string, released?: number | null): string {
  if (category !== 'consoles' || !released) return 'plain';
  if (released < 1984) return 'wood';
  if (released < 1993) return 'beige';
  if (released < 2000) return 'black';
  return 'flat';
}

/**
 * How long a shelf's spines are, in rem, for pictures `shape` times as tall as wide, with `room`
 * about the shelf's middle: as long as their shape asks at the usual height, as far as there is
 * room, a touch shorter (a spine squeezed that little does not show it). Never shorter than the
 * usual, nor thinner: rows of spines with gaps between look wrong.
 */
export function shelfShape(shape: number, room: number): number {
  const most = Math.max(SPINE_LEN_REM, room - 4);
  return Math.round(clamp(SPINE_H_REM * shape * SPINE_SQUEEZE, SPINE_LEN_REM, most) * 100) / 100;
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

/** A screenshot in the footage's screen (of shape `aspect`), its black bars cut off (trim.ts). */
function shotImage(src: string, on: boolean, aspect: number): HTMLImageElement {
  const img = picture(src, on ? 'on' : '');
  img.addEventListener('error', () => img.remove(), { once: true });
  const fit = () => {
    const trim = borderOf(img);
    if (trim) placeTrimmed(img, trim, aspect);
  };
  if (img.complete && img.naturalWidth) fit();
  else img.addEventListener('load', fit, { once: true });
  return img;
}

/** How round an element's corners are, in px across and down (its top-left's; all alike). */
function cornerOf(node: HTMLElement): { rx: number; ry: number } {
  const [x = '0', y = x] = getComputedStyle(node).borderTopLeftRadius.split(' ');
  const px = (v: string) => (v.endsWith('px') ? Number.parseFloat(v) || 0 : 0);
  return { rx: px(x), ry: px(y) };
}

/**
 * A clip path for a box `width` × `height` with a hole in it: the rectangle given, its corners
 * rounded `rx` × `ry` (a TV's tube), in whole pixels.
 */
export function holeIn(
  width: number,
  height: number,
  hole: { left: number; top: number; right: number; bottom: number; rx: number; ry: number }
): string {
  const n = (v: number) => Math.round(v);
  const [x0, y0, x1, y1] = [hole.left, hole.top, hole.right, hole.bottom].map(n) as [
    number,
    number,
    number,
    number
  ];
  const rx = Math.min(n(hole.rx), Math.floor((x1 - x0) / 2));
  const ry = Math.min(n(hole.ry), Math.floor((y1 - y0) / 2));
  const arc = (x: number, y: number) => `A${rx} ${ry} 0 0 1 ${x} ${y}`;
  const outer = `M0 0H${n(width)}V${n(height)}H0Z`;
  const inner =
    `M${x0 + rx} ${y0}H${x1 - rx}${arc(x1, y0 + ry)}V${y1 - ry}${arc(x1 - rx, y1)}` +
    `H${x0 + rx}${arc(x0, y1 - ry)}V${y0 + ry}${arc(x0 + rx, y0)}Z`;
  return `path(evenodd, '${outer}${inner}')`;
}

/** A TV's screen shape for its era (style.css: .tv-screen), the plain monitor's too. */
function screenAspect(era: string): number {
  return era === 'flat' ? 16 / 9 : 4 / 3;
}

/**
 * Where the footage's video plays: its screen, or, if the screenshot shown there had black bars
 * cut off, as much bigger as that cut asked, so the video's own bars (the same, as a rule) fall
 * under the TV's body and the game fills the screen. Forma plays it in the area it is given.
 */
function videoArea(screen: HTMLElement): ScreenArea | null {
  const area = screenArea(screen);
  const shot = screen.querySelector<HTMLImageElement>('img');
  const box = area && shot ? placedBox(shot) : null;
  if (!area || !box) return area;
  return {
    left: area.left + area.width * box.left,
    top: area.top + area.height * box.top,
    width: area.width * box.width,
    height: area.height * box.height
  };
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
/** The age rating in words, for a screen reader; the badge shows it. */
function ratingNote(game: Pick<Game, 'ageRating'>): string | null {
  const all = ageRatings(game.ageRating);
  const pegi = asPegi(all);
  if (!pegi) return null;
  if (pegi.from) return `PEGI ${pegi.age}, from ${pegi.from.board} ${pegi.from.rating}`;
  return all.map((r) => `${r.board} ${r.rating}`).join(' · ');
}

function pegiMark(game: ShowGame): HTMLElement {
  const all = ageRatings(game.ageRating);
  const pegi = asPegi(all);
  if (!pegi) {
    // No badge to show: a tile like the others, faded.
    const none = mark('rating', ICONS.rating, 'No rating', false);
    none.setAttribute('aria-label', 'No age rating');
    return none;
  }
  const colour = pegi.age <= 7 ? 'green' : pegi.age <= 16 ? 'orange' : 'red';
  const note = ratingNote(game) ?? '';
  return el(
    'li',
    { class: `mark pegi ${colour}`, 'aria-label': `Age rating ${note}` },
    el('strong', {}, String(pegi.age), el('span', {}, 'PEGI'))
  );
}

/** The game's regions in words, from its ROM's name first, else the gamelist's. */
function regionLine(game: Game): string | null {
  const rom = gameTags(game).regions;
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

/** A region or a language: its flag where there is one, its name beside it, always. */
function flagChip(name: string, flag: string | null): HTMLElement {
  const chip = el('span', { class: 'chip' });
  if (flag) {
    const img = el('img', { src: flag, alt: '', class: 'flag' });
    img.addEventListener('error', () => img.remove(), { once: true });
    chip.append(img);
  }
  chip.append(el('span', { class: 'name' }, name));
  return chip;
}

/**
 * The dump's version, as its file name gives it, in words: `Rev 1` → `Revision 1`, `v1.1` →
 * `Version 1.1`, `Unl` → `Unlicensed`; with none, the first release as it came out.
 */
/**
 * The dump's version tags taken apart: what kind of release it is (`Prototype`, `Beta`,
 * `Demo`…; `null` for the release itself) and its number (`Proto 2` → `2`, `v1.1` → `1.1`,
 * `Rev A` → `Revision A`).
 */
export function releaseOf(
  version: string | null,
  status: string | null = null
): { kind: string | null; number: string | null; status: string | null } {
  const kinds: string[] = [];
  // Released that way (homebrew, unlicensed, a pirate cart) is a kind of release; changed
  // after (a hack, a translation) stays a status.
  const changed: string[] = [];
  const released: string[] = [];
  for (const part of status?.split(' · ') ?? []) {
    if (/^(unl|unlicensed|pirate|bootleg|aftermarket|homebrew)$/i.test(part)) {
      released.push(versionWords(part));
    } else changed.push(part);
  }
  const numbers: string[] = [];
  for (const part of version?.split(' · ') ?? []) {
    const kind = /^(proto(?:type)?|alpha|beta|demo|sample|kiosk|promo|debug)\s*(\d+)?$/i.exec(part);
    if (kind) {
      kinds.push(versionWords(kind[1]!));
      if (kind[2]) numbers.push(kind[2]);
      continue;
    }
    const v = /^v\s*([\d.]+\w*)$/i.exec(part);
    if (v) {
      numbers.push(v[1]!);
      continue;
    }
    const alt = /^alt\s*(\d+)?$/i.exec(part);
    if (alt) {
      numbers.push(alt[1] ? `Alternate ${alt[1]}` : 'Alternate');
      continue;
    }
    numbers.push(versionWords(part));
  }
  const once = (list: string[]) => (list.length ? [...new Set(list)].join(' · ') : null);
  return { kind: once([...kinds, ...released]), number: once(numbers), status: once(changed) };
}

export function versionText(version: string | null): string {
  if (!version) return 'Original release';
  return [...new Set(version.split(' · ').map(versionWords))].join(' · ');
}

function versionWords(version: string): string {
  const rev = /^rev\s*([\w.]+)$/i.exec(version);
  if (rev) return `Revision ${rev[1]!.toUpperCase()}`;
  const v = /^v\s*([\d.]+\w*)$/i.exec(version);
  if (v) return `Version ${v[1]}`;
  const numbered = /^(proto|prototype|beta|alpha|demo)\s*(\d+)$/i.exec(version);
  if (numbered) return `${versionWords(numbered[1]!)} ${numbered[2]}`;
  const words: Record<string, string> = {
    proto: 'Prototype',
    prototype: 'Prototype',
    alpha: 'Alpha',
    beta: 'Beta',
    kiosk: 'Kiosk demo',
    promo: 'Promotional',
    debug: 'Debug build',
    demo: 'Demo',
    sample: 'Sample',
    unl: 'Unlicensed',
    unlicensed: 'Unlicensed',
    pirate: 'Pirate',
    bootleg: 'Bootleg',
    aftermarket: 'Homebrew',
    homebrew: 'Homebrew',
    hack: 'Hack'
  };
  return words[version.toLowerCase()] ?? version;
}

/** Line icons for the marks, in Cyber's style. */
const ICONS = {
  /** A shield with an age's place on it, for a game with no rating. */
  rating: '<path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z"/><path d="M9.5 12.5h5"/>',
  manual:
    '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/><path d="M9 7h6M9 10.5h6"/>',
  players:
    '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.2c2.8.2 5 2.3 5 5.8"/>',
  /** A floppy disk: something kept. */
  saves:
    '<path d="M5 4h11.5L19 6.5V20H5z"/><path d="M8 4v5h7V4"/><rect x="8" y="13" width="8" height="7"/>',
  cheevos:
    '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5"/><path d="M12 14v3M8.5 20.5h7M10 17h4v3.5h-4z"/>'
} as const;

/** One of the line icons, for show. Never an emoji: the Pi has no font for them, they come out
 * as squares. */
function glyph(icon: string): HTMLElement {
  const span = el('span', { class: 'glyph', 'aria-hidden': 'true' });
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${icon}</svg>`;
  return span;
}

/** A tile: lit where the game has it, faded where not. */
function mark(cls: string, icon: string, label: string, on: boolean): HTMLElement {
  return el(
    'li',
    { class: `mark ${cls} ${on ? 'on' : 'off'}` },
    glyph(icon),
    el('span', {}, label)
  );
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

const CATALOGUES: Record<string, string> = { 'no-intro': 'No-Intro', redump: 'Redump' };

/** A dump check's verdict in words, and how sure it is: `verified`, `doubtful`, `unknown`. */
function verdictOf(status: string): [string, string] {
  return status === 'verified'
    ? ['Verified', 'verified']
    : status === 'crcOnly'
      ? ['CRC32 match', 'doubtful']
      : status === 'badDump'
        ? ['Bad dump', 'doubtful']
        : ['Not catalogued', 'unknown'];
}

/**
 * A game's dump checks as badges in a row, one per catalogue that lists the file: the
 * catalogue's name (No-Intro) joined to its verdict (Verified), as one label. One check or
 * several (a file more than one catalogue lists); nothing while unknown.
 */
export function dumpText(
  dumps: Game['dump'] | readonly NonNullable<Game['dump']>[] | undefined
): HTMLElement | null {
  const all = (Array.isArray(dumps) ? dumps : dumps ? [dumps] : []) as NonNullable<Game['dump']>[];
  if (!all.length) return null;
  const listed = all.filter((d) => d.catalogue && d.status !== 'notCatalogued');
  if (!listed.length) {
    return el('span', { class: 'dump unknown', 'aria-label': 'Not catalogued' }, 'Not catalogued');
  }
  const badges = listed.map((d) => {
    const catalogue = CATALOGUES[d.catalogue ?? ''] ?? d.catalogue ?? '';
    const [text, kind] = verdictOf(d.status);
    return el(
      'span',
      {
        class: `badge ${kind} ${d.catalogue ?? ''}`.trim(),
        'aria-label': `${text} by ${catalogue}`
      },
      el('span', { class: 'seal' }, catalogue),
      el('span', { class: 'verdict' }, text)
    );
  });
  const best = listed.find((d) => d.status === 'verified') ?? listed[0]!;
  return el(
    'span',
    {
      class: `dump ${verdictOf(best.status)[1]}`,
      'aria-label': badges.map((b) => b.getAttribute('aria-label')).join(', ')
    },
    ...badges
  );
}

/** How many times as tall as wide a spine picture is; `null` if it will not load. */
function spineShapeOf(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve(img.naturalWidth && img.naturalHeight ? img.naturalHeight / img.naturalWidth : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** A name's first letter, for the race's index: a digit or sign is `#`. */
function initial(name: string): string {
  const c = name.trim().charAt(0).toUpperCase();
  return /\p{L}/u.test(c) ? c : '#';
}
