import type { Game } from '@ramraiders/forma-sdk';
import { span } from './perf.js';

import { romName } from '../logic/romname.js';
import { DEFAULT_BACK, DEFAULT_FRONT } from './cover.js';
import { el } from './dom.js';

/**
 * The selected game on a stage of its own: it fills the screen and plays out in acts while
 * the player rests on it.
 *
 * 1. Its fan art, its logo (or name) large, its rating and what kind of game it is.
 * 2. Its box flies in and turns between front and back, the cartridge beside it and
 *    screenshots fanned behind; who made it, where from, and how much it has been played
 *    slide up beneath the logo.
 * 3. Its video fills the screen behind everything (or its screenshots do, in turn), the box
 *    steps back to a corner, and its story runs as captions.
 *
 * Moving to another game starts it again from act 1. The game's own art gives the stage its
 * colour. What a game lacks is left out of every act; with animations off it stays on act 2.
 */

/** Every media kind the stage uses: the SDK's own, and those newer Formas add. */
export type Kind =
  | 'fanart'
  | 'thumbnail'
  | 'boxback'
  | 'boxside'
  | 'boxart'
  | 'cartridge'
  | 'image'
  | 'titleshot'
  | 'mix'
  | 'map'
  | 'video'
  | 'marquee'
  | 'wheel'
  | 'manual';

/** A game as the stage reads it: newer Formas add its region and languages. */
export type ShowGame = Game & {
  region?: string | null;
  lang?: string | null;
  /** `ESRB:M,PEGI:18`, from Forma 1.24.0. */
  ageRating?: string | null;
};

/** A URL for `kind` of `game` at `width` pixels, or `null` when the game has none. */
export type MediaUrl = (game: Game, kind: Kind, width?: number) => string | null;

/** One of the games its system is remembered for (Forma 1.25; the SDK's types will follow). */
export function isIconic(game: Game): boolean {
  return (game as Game & { iconic?: boolean }).iconic === true;
}

export interface Achievements {
  earned: number;
  total: number;
}

export interface StageOptions {
  media: MediaUrl;
  /** The game's RetroAchievements progress, if it has any. */
  achievements?: (game: Game) => Promise<Achievements | null>;
  /** The game's colour, from a small picture of it; `null` keeps Cyber's own. */
  accent?: (url: string) => Promise<string | null>;
  /**
   * Plays a game's video, full screen under the page (Forma's player: the page's own breaks up
   * on a Raspberry Pi); `playing` once it shows. Without it, there are no videos.
   */
  play?: (game: Game) => Promise<{ playing: boolean }>;
  /** Stops it. */
  stopVideo?: () => void;
  /** Has the pictures of games about to be shown made ahead, nearest first. */
  prepare?: (items: { gameId: number; kind: Kind; width: number }[]) => void;
}

/**
 * Every picture the stage shows, at the width it asks: the order is what matters most first
 * when there is not time for them all.
 */
export const STAGE_PICTURES: readonly (readonly [Kind, number])[] = [
  ['fanart', 1280],
  // The list's rows: the logos of the games around the selection.
  ['wheel', 360],
  ['wheel', 720],
  ['marquee', 720],
  ['thumbnail', 520],
  ['boxart', 520],
  ['thumbnail', 64],
  ['boxback', 520],
  ['cartridge', 360],
  ['image', 480],
  ['image', 960],
  ['titleshot', 480],
  ['titleshot', 960],
  ['mix', 480],
  ['mix', 960],
  ['map', 480],
  ['map', 960]
];

/** When each act starts, after the game is chosen. */
export const ACT_TWO_MS = 1600;
export const ACT_THREE_MS = 5200;
/** How long the box shows each side, and each caption and backdrop screenshot stays. */
const FLIP_MS = 4500;
const CAPTION_MS = 6000;
const STILL_MS = 5000;
/** A caption is a sentence or two, up to about this long. */
const CAPTION_CHARS = 170;

/** Screenshots, in the order they are shown. */
const STILLS: Kind[] = ['image', 'titleshot', 'mix', 'map'];

/** Systems whose games' descriptions are arcade histories. */
export const ARCADE = new Set([
  'mame',
  'fbneo',
  'neogeo',
  'naomi',
  'naomi2',
  'atomiswave',
  'cps1',
  'cps2',
  'cps3',
  'model2',
  'model3',
  'daphne',
  'hikaru',
  'triforce',
  'chihiro',
  'lindbergh',
  'gaelco',
  'segastv',
  'namco2x6',
  'arcade'
]);

export const REGIONS: Record<string, string> = {
  wor: 'World',
  us: 'USA',
  eu: 'Europe',
  jp: 'Japan',
  uk: 'United Kingdom',
  fr: 'France',
  de: 'Germany',
  es: 'Spain',
  it: 'Italy',
  nl: 'Netherlands',
  se: 'Sweden',
  br: 'Brazil',
  kr: 'Korea',
  cn: 'China',
  tw: 'Taiwan',
  au: 'Australia',
  ca: 'Canada',
  asi: 'Asia'
};

export const LANGUAGES: Record<string, string> = {
  en: 'English',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  'pt-br': 'Portuguese (Brazil)',
  nl: 'Dutch',
  sv: 'Swedish',
  da: 'Danish',
  fi: 'Finnish',
  no: 'Norwegian',
  pl: 'Polish',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese'
};

const motion = () => document.documentElement.dataset.motion !== 'off';

/** An `<img>` that removes itself if the file is gone (scraped paths go stale). */
function picture(src: string, cls: string): HTMLImageElement {
  const img = el('img', { src, alt: '', decoding: 'async', class: cls });
  img.addEventListener('error', () => img.remove());
  return img;
}

/** A video asked of Forma: it must hear when it should stop. */
interface Preview {
  /** It shows, and the page is see-through. */
  shown: boolean;
}

/** What a game's page does not draw from, or only touches lightly: these change in place. */
const NOT_ITS_DETAILS = new Set(['favorite', 'hidden', 'playCount', 'lastPlayed', 'gameTime']);

/** Whether two versions of a game show the same details and pictures (a scrape changes them). */
export function sameDetails(a: object, b: object): boolean {
  const details = (game: object) =>
    JSON.stringify(Object.entries(game).filter(([key]) => !NOT_ITS_DETAILS.has(key)));
  return details(a) === details(b);
}

export class Stage {
  /** The acts, over the screen. */
  readonly root = el('section', { class: 'detail stage', 'data-act': '1' });
  /** Behind everything: the fan art, then the video or screenshots. */
  readonly backdrop = el('div', { class: 'stage-backdrop', 'aria-hidden': 'true' });
  /** Preview videos after a moment on a game; Interface → Video previews. */
  previews = true;
  #timers: ReturnType<typeof setTimeout>[] = [];
  #intervals: ReturnType<typeof setInterval>[] = [];
  /** The preview being fetched or shown: cancelled, and its blob freed, when the game changes. */
  #preview: Preview | null = null;
  #achievements = new Map<number, Promise<Achievements | null>>();
  #accents = new Map<number, Promise<string | null>>();
  #game: ShowGame | null = null;
  #title: HTMLElement | null = null;
  /** When the game on show was chosen: act 3 never comes before its time. */
  #shownAt = 0;

  constructor(private readonly options: StageOptions) {}

  /** The act on show: 1, 2 or 3. */
  get act(): number {
    return Number(this.root.dataset.act);
  }

  /** No game is selected (yet). */
  clear(): void {
    this.#stop();
    this.#game = null;
    this.#title = null;
    this.root.replaceChildren();
    this.#fadeOut([...this.backdrop.children]);
  }

  /** Shows `game` from act 1; the same game again (a favourite toggled) keeps its act. */
  show(game: ShowGame, again = false): void {
    const done = span('stage.show');
    try {
      this.#showTraced(game, again);
    } finally {
      done();
    }
  }

  #showTraced(game: ShowGame, again = false): void {
    if (!again && this.#game?.id === game.id && this.#title && sameDetails(this.#game, game)) {
      this.#game = game;
      const title = this.#titleBlock(game);
      this.#title.replaceWith(title);
      this.#title = title;
      return;
    }
    this.#stop();
    this.#game = game;
    this.#shownAt = Date.now();
    this.root.dataset.act = '1';
    this.root.style.removeProperty('--game');
    this.backdrop.style.removeProperty('--game');
    this.#tint(game);
    if (!this.#layer(this.options.media(game, 'fanart', 1280), 'fanart')) {
      this.#layer(this.options.media(game, 'image', 320), 'soft');
    }

    this.#title = this.#titleBlock(game);
    const collection = this.#collection(game);
    this.root.replaceChildren(
      this.#title,
      this.#factsBlock(game),
      collection,
      this.#captions(game)
    );

    if (!motion()) {
      this.root.dataset.act = '2';
      this.#startVideo(game, false);
      return;
    }
    this.#later(() => {
      this.root.dataset.act = '2';
    }, ACT_TWO_MS);
    // The video starts only now, not while act 2 moves in (starting the player then made the
    // Pi stutter): act 3 waits for it to show. Without one, the screenshots take over.
    this.#later(() => {
      if (!this.#startVideo(game, true)) this.#actThree(game);
    }, ACT_THREE_MS);
  }

  /** The pictures it shows now: its own, and the newest behind it. */
  images(): HTMLImageElement[] {
    const back = this.backdrop.lastElementChild;
    return [...this.root.querySelectorAll('img'), ...(back ? back.querySelectorAll('img') : [])];
  }

  /** The game's colour, from its box (or fan art): Cyber's own until it is known. */
  #tint(game: Game): void {
    const accent = this.options.accent;
    const source =
      this.options.media(game, 'thumbnail', 64) ?? this.options.media(game, 'fanart', 64);
    if (!accent || !source) return;
    let colour = this.#accents.get(game.id);
    if (!colour) {
      colour = accent(source).catch(() => null);
      this.#accents.set(game.id, colour);
    }
    const id = game.id;
    void colour.then((c) => {
      if (!c || this.#game?.id !== id) return;
      this.root.style.setProperty('--game', c);
      this.backdrop.style.setProperty('--game', c);
    });
  }

  /** A full-screen picture behind the stage, faded in over the last once decoded. */
  #layer(src: string | null, kind: 'fanart' | 'soft' | 'still'): boolean {
    if (!src) {
      this.#fadeOut([...this.backdrop.children]);
      return false;
    }
    const old = [...this.backdrop.children];
    const layer = el('div', { class: `layer ${kind} waiting` });
    const img = picture(src, '');
    layer.append(img);
    this.backdrop.append(layer);
    img.addEventListener(
      'load',
      () => {
        layer.classList.remove('waiting');
        this.#fadeOut(old);
      },
      { once: true }
    );
    img.addEventListener('error', () => this.#fadeOut([layer]), { once: true });
    return true;
  }

  #fadeOut(layers: Element[]): void {
    for (const n of layers) n.classList.add('leaving');
    setTimeout(() => layers.forEach((n) => n.remove()), 900);
  }

  /** Act 1's heart: the logo (or the name), the score, and what kind of game it is. */
  #titleBlock(game: ShowGame): HTMLElement {
    const block = el('div', { class: 'title-block' });
    const logo = this.options.media(game, 'wheel', 720) ?? this.options.media(game, 'marquee', 720);
    if (logo) {
      const img = picture(logo, 'logo');
      img.addEventListener('error', () => block.classList.remove('has-logo'));
      block.classList.add('has-logo');
      block.append(img);
    }
    block.append(el('h2', {}, game.name));

    // Marks first (a favourite), then the score and what kind of game it is.
    const line = el('div', { class: 'tagline' });
    if (game.favorite) line.append(el('span', { class: 'tag favourite' }, '★ Favourite'));
    if (isIconic(game)) line.append(el('span', { class: 'tag iconic' }, 'Iconic'));
    if (game.rating !== null) {
      const score = Math.round(game.rating * 100) / 10;
      const stars = el('span', { class: 'stars', role: 'img', 'aria-label': `${score} of 10` });
      stars.style.setProperty('--rating', String(game.rating));
      line.append(el('span', { class: 'score' }, score.toFixed(1)), stars);
    }
    for (const text of [
      game.releaseDate?.slice(0, 4),
      game.genre,
      game.players ? players(game.players) : null
    ]) {
      if (text) line.append(el('span', { class: 'tag' }, text));
    }
    block.append(line);
    return block;
  }

  /** Act 2: who made it, where from, and what the player has done with it. */
  #factsBlock(game: ShowGame): HTMLElement {
    const facts = el('dl', { class: 'facts' });
    const add = (label: string, value: string | null | undefined) => {
      if (value) facts.append(el('div', {}, el('dt', {}, label), el('dd', {}, value)));
    };
    add('Released', game.releaseDate ? date(game.releaseDate) : null);
    add('Developer', game.developer);
    add('Publisher', game.publisher !== game.developer ? game.publisher : null);
    add('Region', game.region ? names(game.region, REGIONS) : null);
    // As in the Collector: the ROM's own name first (it is the copy at hand), the scraper's after.
    const languages = romName(game.path).languages.join(',') || game.lang;
    add('Languages', languages ? names(languages, LANGUAGES) : null);
    add('Played', played(game));
    if (this.options.media(game, 'manual')) add('Manual', 'In the box');

    const block = el('div', { class: 'facts-block' }, facts);
    if (game.raGameId !== null && this.options.achievements) {
      let progress = this.#achievements.get(game.id);
      if (!progress) {
        progress = this.options.achievements(game).catch(() => null);
        this.#achievements.set(game.id, progress);
      }
      const id = game.id;
      this.#later(() => {
        void progress.then((a) => {
          if (!a || a.total === 0 || this.#game?.id !== id) return;
          const bar = el('div', { class: 'bar' });
          bar.style.setProperty('--done', String(a.earned / a.total));
          block.append(
            el(
              'div',
              { class: 'achievements' },
              el('span', {}, `${a.earned} of ${a.total} achievements`),
              bar
            )
          );
        });
      }, ACT_TWO_MS);
    }
    return block;
  }

  /**
   * Act 2's other half: the box in 3D, turning; the cartridge leaning on it; screenshots fanned
   * behind. `null` when the game has none of them.
   */
  #collection(game: Game): HTMLElement {
    const media = this.options.media;
    const scanned = media(game, 'thumbnail', 520) ?? media(game, 'boxart', 520);
    const front = scanned ?? DEFAULT_FRONT;
    const back = !scanned
      ? DEFAULT_BACK
      : media(game, 'thumbnail')
        ? media(game, 'boxback', 520)
        : null;
    const cartridge = media(game, 'cartridge', 360);
    const shots = STILLS.map((k) => media(game, k, 480))
      .filter((u): u is string => u !== null)
      .slice(0, 3);

    const collection = el('div', { class: 'collection' });
    const fan = el('div', { class: 'shots' });
    shots.forEach((src, i) => {
      const card = el('div', { class: 'shot' }, picture(src, ''));
      card.style.setProperty('--i', String(i));
      fan.append(card);
    });
    collection.append(fan);

    const box = el('div', { class: 'box3d' });
    const turn = el('div', { class: 'case' });
    // Sized to the box's own shape once its picture is in: the faces and spine follow it.
    const face = picture(front, 'front');
    face.addEventListener(
      'load',
      () => {
        if (face.naturalWidth > 0) {
          turn.style.aspectRatio = `${face.naturalWidth} / ${face.naturalHeight}`;
          box.classList.add('ready');
        }
      },
      { once: true }
    );
    face.addEventListener('error', () => turn.prepend(picture(DEFAULT_FRONT, 'front')), {
      once: true
    });
    turn.append(face);
    turn.append(el('div', { class: 'spine' }));
    if (back) {
      turn.append(picture(back, 'back'));
      box.classList.add('has-back');
    }
    box.append(turn);
    collection.append(box);
    if (back && motion()) {
      this.#later(() => {
        box.classList.add('flipped');
        // While the video plays, the box rests: the Pi's decoder has the time to itself.
        this.#every(() => {
          if (!this.backdrop.classList.contains('through')) {
            box.classList.toggle('flipped');
          }
        }, FLIP_MS);
      }, ACT_TWO_MS + 1800);
    }
    if (cartridge) collection.append(picture(cartridge, 'cartridge'));
    return collection;
  }

  /** Act 3: the story, a sentence or two at a time. */
  #captions(game: Game): HTMLElement {
    const chunks = captions(game.description ?? '');
    const line = el('p', { class: 'line' }, chunks[0] ?? '');
    const box = el(
      'div',
      { class: 'captions' },
      el('span', { class: 'label' }, ARCADE.has(game.system) ? 'History' : 'Story'),
      line
    );
    if (chunks.length === 0) box.hidden = true;
    if (chunks.length > 1 && motion()) {
      let at = 0;
      this.#later(() => {
        this.#every(() => {
          at = (at + 1) % chunks.length;
          line.classList.add('turning');
          setTimeout(() => {
            line.textContent = chunks[at] ?? '';
            line.classList.remove('turning');
          }, 350);
        }, CAPTION_MS);
      }, ACT_THREE_MS);
    }
    return box;
  }

  /** Act 3: the video behind everything, once it plays; or the screenshots, in turn. */
  #actThree(game: Game): void {
    if (this.#game?.id !== game.id) return;
    this.root.dataset.act = '3';
    if (this.backdrop.classList.contains('through')) return;
    const stills = STILLS.map((k) => this.options.media(game, k, 960)).filter(
      (u): u is string => u !== null
    );
    if (stills.length === 0) return;
    let at = 0;
    this.#layer(stills[0]!, 'still');
    if (stills.length > 1) {
      this.#every(() => {
        at = (at + 1) % stills.length;
        this.#layer(stills[at]!, 'still');
      }, STILL_MS);
    }
  }

  /** Asks Forma to play the game's video: `false` if there is none to ask for. */
  #startVideo(game: Game, actThree: boolean): boolean {
    const play = this.options.play;
    if (!this.previews || !play || !this.options.media(game, 'video')) return false;
    const preview: Preview = { shown: false };
    this.#preview = preview;
    const without = () => {
      if (this.#preview !== preview) return;
      this.#preview = null;
      if (actThree) this.#actThree(game);
    };
    play(game)
      .then(({ playing }) => {
        if (this.#preview !== preview) {
          // Stopped while Forma was still starting it: the stop came too soon to catch it.
          if (this.#preview === null) this.options.stopVideo?.();
          return;
        }
        if (!playing) return without();
        // Shown no sooner than act 3 would have been.
        const wait = actThree ? Math.max(0, this.#shownAt + ACT_THREE_MS - Date.now()) : 0;
        this.#later(() => {
          preview.shown = true;
          this.#seeThrough(true);
          if (actThree) this.#actThree(game);
        }, wait);
      })
      .catch(without);
    return true;
  }

  /**
   * The page see-through behind the stage, so the video under it shows: the art behind fades
   * away; the shades over it, the words and the box stay.
   */
  #seeThrough(on: boolean): void {
    this.backdrop.classList.toggle('through', on);
    document.documentElement.classList.toggle('video-through', on);
  }

  #later(work: () => void, ms: number): void {
    this.#timers.push(setTimeout(work, ms));
  }

  #every(work: () => void, ms: number): void {
    this.#intervals.push(setInterval(work, ms));
  }

  #stop(): void {
    this.#timers.forEach(clearTimeout);
    this.#intervals.forEach(clearInterval);
    this.#timers = [];
    this.#intervals = [];
    const preview = this.#preview;
    this.#preview = null;
    if (!preview) return;
    // Opaque again at once: the video's last picture never shows over the next game.
    this.#seeThrough(false);
    this.options.stopVideo?.();
  }
}

/** The colour of a small picture: the average of its vivid pixels, as `hsl(...)`. */
export async function accentOf(url: string): Promise<string | null> {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 24;
  canvas.height = 24;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, 24, 24);
  return vivid(ctx.getImageData(0, 0, 24, 24).data);
}

/** The average hue of the vivid pixels in RGBA `data`, as a bright `hsl(...)`. */
export function vivid(data: ArrayLike<number>): string | null {
  let x = 0;
  let y = 0;
  let weight = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i]! / 255;
    const g = data[i + 1]! / 255;
    const b = data[i + 2]! / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const light = (max + min) / 2;
    const chroma = max - min;
    if (chroma < 0.25 || light < 0.15 || light > 0.85) continue;
    let hue: number;
    if (max === r) hue = ((g - b) / chroma) % 6;
    else if (max === g) hue = (b - r) / chroma + 2;
    else hue = (r - g) / chroma + 4;
    const angle = (hue * 60 * Math.PI) / 180;
    x += Math.cos(angle) * chroma;
    y += Math.sin(angle) * chroma;
    weight += chroma;
  }
  if (weight < 1) return null;
  const degrees = Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
  return `hsl(${degrees} 95% 70%)`;
}

/** A description as captions: whole sentences, a sentence or two at a time. */
export function captions(text: string): string[] {
  const sentences = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?…])\s+(?=[A-Z0-9"“‘(])/);
  const out: string[] = [];
  for (const s of sentences) {
    if (!s) continue;
    const last = out.at(-1);
    if (last && last.length + s.length + 1 <= CAPTION_CHARS) out[out.length - 1] = `${last} ${s}`;
    else out.push(s);
  }
  return out;
}

/** `1-2` → `1–2 players`. */
export function players(p: string): string {
  const n = p.replace('-', '–');
  return n === '1' ? '1 player' : `${n} players`;
}

/** How much it has been played, in a line; `null` when never. */
function played(game: Game): string | null {
  if (game.playCount <= 0) return 'Never yet';
  const parts = [`${game.playCount}×`];
  if (game.gameTime > 0) parts.push(playtime(game.gameTime));
  if (game.lastPlayed) parts.push(`last ${ago(game.lastPlayed).toLowerCase()}`);
  return parts.join(' · ');
}

/** `1985-09-13` → `13 Sep 1985`; ES's `01-01` stands for "the year only". */
export function date(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!m || (m === '01' && (!d || d === '01'))) return y ?? iso;
  const month = new Date(Date.UTC(2000, Number(m) - 1, 1)).toLocaleString('en', {
    month: 'short',
    timeZone: 'UTC'
  });
  return d && d !== '01' ? `${Number(d)} ${month} ${y}` : `${month} ${y}`;
}

/** `us,eu` → `USA, Europe`; unknown codes as they are, upper-case. */
export function names(codes: string, table: Record<string, string>): string {
  return codes
    .split(/[,;/ ]+/)
    .filter(Boolean)
    .map((c) => table[c.toLowerCase()] ?? c.toUpperCase())
    .join(', ');
}

/** How long ago, in words. */
export function ago(iso: string, now = Date.now()): string {
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  if (Number.isNaN(days)) return '—';
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  const years = Math.round(days / 365);
  return years === 1 ? 'A year ago' : `${years} years ago`;
}

export function playtime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}
