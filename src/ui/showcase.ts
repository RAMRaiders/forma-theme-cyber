import type { Game } from '@ramraiders/forma-sdk';

import { el } from './dom.js';

/**
 * The selected game, shown with everything known about it: its fan art filling the screen,
 * its box turning between front and back with the cartridge beside it, its screenshots and
 * video, its details, rating, history and how much it has been played.
 *
 * What a game lacks is simply left out, so a game with only a screenshot still looks whole.
 * Pictures are asked for at the size they are shown, and the ones not needed at once (the box
 * back, the cartridge, the strip of screenshots, achievements) come a moment later, so moving
 * through a list on a Raspberry Pi stays smooth.
 */

/** Every media kind the showcase uses: the SDK's own, and those newer Formas add. */
export type Kind =
  | 'fanart'
  | 'thumbnail'
  | 'boxback'
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

/** A game as the showcase reads it: newer Formas add its region and languages. */
export type ShowGame = Game & { region?: string | null; lang?: string | null };

/** A URL for `kind` of `game` at `width` pixels, or `null` when the game has none. */
export type MediaUrl = (game: Game, kind: Kind, width?: number) => string | null;

export interface Achievements {
  earned: number;
  total: number;
}

export interface ShowcaseOptions {
  media: MediaUrl;
  /** The game's RetroAchievements progress, if it has any. */
  achievements?: (game: Game) => Promise<Achievements | null>;
}

/** Wait before the video preview starts, so scrolling past a game does not start it. */
const VIDEO_DELAY_MS = 900;
/** Wait before what is not needed at once is fetched: the selection may move on. */
const EXTRAS_DELAY_MS = 450;
/** How long the box shows each side, and each screenshot stays. */
const FLIP_MS = 5000;
const STILL_MS = 4500;
/** The story scrolls at this many pixels a second, after a pause to read its start. */
const STORY_SPEED = 14;

/** Screenshots, in the order they are shown. */
const STILLS: { kind: Kind; label: string }[] = [
  { kind: 'image', label: 'In game' },
  { kind: 'titleshot', label: 'Title' },
  { kind: 'mix', label: 'Mix' },
  { kind: 'map', label: 'Map' }
];

/** Systems whose games' descriptions are arcade histories. */
const ARCADE = new Set([
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

const REGIONS: Record<string, string> = {
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
  asi: 'Asia',
  ss: 'ScreenScraper'
};

const LANGUAGES: Record<string, string> = {
  en: 'English',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
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

export class Showcase {
  /** The panel beside the list. */
  readonly root = el('aside', { class: 'detail game-show' });
  /** The fan art behind the whole screen. */
  readonly stage = el('div', { class: 'fanart-stage', 'aria-hidden': 'true' });
  /** Preview videos after a short pause on a game; Interface → Video previews. */
  previews = true;
  #timers: ReturnType<typeof setTimeout>[] = [];
  #intervals: ReturnType<typeof setInterval>[] = [];
  /** The preview being fetched or shown: cancelled, and its blob freed, when the game changes. */
  #preview: { abort: AbortController; url?: string } | null = null;
  #achievements = new Map<number, Promise<Achievements | null>>();
  #game: ShowGame | null = null;

  constructor(private readonly options: ShowcaseOptions) {}

  /** Clears the panel: no game is selected (yet). */
  clear(): void {
    this.#stop();
    this.#game = null;
    this.root.replaceChildren();
  }

  /** Shows `game`; called again for the same game after it changed (a favourite). */
  show(game: ShowGame): void {
    const same = this.#game?.id === game.id;
    this.#stop();
    this.#game = game;
    const media: MediaUrl = this.options.media;
    if (!same) this.#backdrop(game);

    const stills = STILLS.map((s) => ({ ...s, url: media(game, s.kind, 960) })).filter(
      (s): s is typeof s & { url: string } => s.url !== null
    );
    const collector = this.#collector(game);
    const screen = this.#screen(game, stills);
    this.root.classList.toggle('no-box', !collector);
    this.root.replaceChildren(
      this.#head(game),
      ...(collector ? [collector] : []),
      screen,
      this.#facts(game),
      this.#story(game)
    );
  }

  /** The fan art, faded in over the last one; a blown-up screenshot when there is none. */
  #backdrop(game: Game): void {
    const fanart = this.options.media(game, 'fanart', 1280);
    const src = fanart ?? this.options.media(game, 'image', 320);
    const old = [...this.stage.children];
    if (!src) {
      for (const n of old) n.classList.add('leaving');
      setTimeout(() => old.forEach((n) => n.remove()), 700);
      return;
    }
    // In the page at once, hidden until its picture is decoded; then it fades in over the last.
    const layer = el('div', { class: fanart ? 'layer waiting' : 'layer soft waiting' });
    const img = picture(src, '');
    layer.append(img);
    this.stage.append(layer);
    const fade = (out: Element[]) => {
      for (const n of out) n.classList.add('leaving');
      setTimeout(() => out.forEach((n) => n.remove()), 700);
    };
    img.addEventListener(
      'load',
      () => {
        layer.classList.remove('waiting');
        fade(old);
      },
      { once: true }
    );
    img.addEventListener('error', () => fade([...old, layer]), { once: true });
  }

  /** The logo (or the name), the rating, and what kind of game it is at a glance. */
  #head(game: ShowGame): HTMLElement {
    const head = el('header', { class: 'head' });
    const logo = this.options.media(game, 'wheel', 640) ?? this.options.media(game, 'marquee', 640);
    const title = el('h2', {}, game.favorite ? `★ ${game.name}` : game.name);
    const name = el('div', { class: 'name' });
    if (logo) {
      const img = picture(logo, 'logo');
      img.addEventListener('error', () => head.classList.remove('has-logo'));
      head.classList.add('has-logo');
      name.append(img);
    }
    name.append(title);

    const badges = el('div', { class: 'badges' });
    const year = game.releaseDate?.slice(0, 4);
    for (const text of [
      year,
      game.genre,
      game.players ? players(game.players) : null,
      this.options.media(game, 'manual') ? 'Manual' : null
    ]) {
      if (text) badges.append(el('span', { class: 'badge' }, text));
    }
    if (game.favorite) badges.prepend(el('span', { class: 'badge favourite' }, '★ Favourite'));
    name.append(badges);
    head.append(name, this.#stats(game));

    if (game.rating !== null) {
      const score = Math.round(game.rating * 100) / 10;
      const bar = el('div', { class: 'stars', role: 'img', 'aria-label': `${score} out of 10` });
      bar.style.setProperty('--rating', String(game.rating));
      head.append(
        el(
          'div',
          { class: 'rating' },
          el('span', { class: 'score' }, score.toFixed(1)),
          el('span', { class: 'out-of' }, '/10'),
          bar
        )
      );
    }
    return head;
  }

  /**
   * The box, turning between front and back, with the cartridge (or disc) beside it; a 3D
   * render of the box when there is no front. `null` when there is no box at all.
   */
  #collector(game: Game): HTMLElement | null {
    const media = this.options.media;
    const front = media(game, 'thumbnail', 480);
    const render = media(game, 'boxart', 480);
    const cartridge = media(game, 'cartridge', 360);
    if (!front && !render && !cartridge) return null;
    const collector = el('div', { class: 'collector' });
    if (front) {
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
      turn.append(face, el('div', { class: 'spine' }));
      box.append(turn);
      collector.append(box);
      const back = media(game, 'boxback', 480);
      this.#later(() => {
        if (back) {
          turn.append(picture(back, 'back'));
          box.classList.add('has-back');
          if (motion()) {
            this.#every(() => box.classList.toggle('flipped'), FLIP_MS);
          }
        }
      }, EXTRAS_DELAY_MS);
    } else if (render) {
      collector.append(picture(render, 'render'));
    }
    if (cartridge) {
      this.#later(() => collector.append(picture(cartridge, 'cartridge')), EXTRAS_DELAY_MS);
    }
    return collector;
  }

  /** The screen: screenshots in turn, then the video; a strip of what there is below. */
  #screen(game: Game, stills: { kind: Kind; label: string; url: string }[]): HTMLElement {
    const screen = el('div', { class: 'screen' });
    const frame = el('div', { class: 'frame' });
    const strip = el('div', { class: 'strip' });
    screen.append(frame, strip);
    if (stills.length === 0) frame.classList.add('empty');

    let at = 0;
    const showStill = (i: number) => {
      const still = stills[i];
      if (!still) return;
      at = i;
      const img = picture(still.url, 'still');
      const before = [...frame.querySelectorAll('img.still')];
      const settle = () => {
        frame.append(img);
        before.forEach((b) => b.classList.add('leaving'));
        setTimeout(() => before.forEach((b) => b.remove()), 600);
      };
      if (before.length === 0) settle();
      else img.addEventListener('load', settle, { once: true });
      strip.querySelectorAll('.thumb').forEach((t, n) => t.classList.toggle('active', n === i));
    };
    showStill(0);

    const video = this.previews ? this.options.media(game, 'video') : null;
    this.#later(() => {
      for (const s of stills) {
        const thumb = el('div', { class: 'thumb' }, el('span', { class: 'label' }, s.label));
        const small = this.options.media(game, s.kind, 200);
        if (small) thumb.prepend(picture(small, ''));
        strip.append(thumb);
      }
      if (video || this.options.media(game, 'video')) {
        strip.append(
          el('div', { class: 'thumb video' }, el('span', { class: 'label' }, '▶ Video'))
        );
      }
      showStill(at);
      if (stills.length > 1 && motion()) {
        this.#every(() => {
          if (!screen.classList.contains('playing')) showStill((at + 1) % stills.length);
        }, STILL_MS);
      }
    }, EXTRAS_DELAY_MS);

    if (video) this.#later(() => this.#playPreview(video, frame, screen, strip), VIDEO_DELAY_MS);
    return screen;
  }

  #playPreview(url: string, frame: HTMLElement, screen: HTMLElement, strip: HTMLElement): void {
    const preview: { abort: AbortController; url?: string } = { abort: new AbortController() };
    this.#preview = preview;
    // From a blob: WebKitGTK's media player (GStreamer) loads only http(s) and blob URLs, so
    // a video straight from forma:// fails as an unsupported format.
    fetch(url, { signal: preview.abort.signal })
      .then((response) =>
        response.ok ? response.blob() : Promise.reject(new Error(`HTTP ${response.status}`))
      )
      .then((blob) => {
        if (this.#preview !== preview) return;
        preview.url = URL.createObjectURL(blob);
        const player = el('video', {
          src: preview.url,
          muted: '',
          autoplay: '',
          loop: '',
          playsinline: '',
          class: 'movie'
        });
        player.muted = true;
        // The screenshots stay until the video really plays: a box without a decoder for it
        // (a Pi 5 has no H.264 hardware) would otherwise show an empty frame.
        player.addEventListener('playing', () => {
          screen.classList.add('playing');
          strip.querySelectorAll('.thumb').forEach((t) => {
            t.classList.toggle('active', t.classList.contains('video'));
          });
        });
        player.addEventListener('error', () => player.remove());
        frame.append(player);
      })
      .catch(() => {});
  }

  /** Everything else known: who made it, where from, and how much it has been played. */
  #facts(game: ShowGame): HTMLElement {
    const list = el('dl', { class: 'facts' });
    const add = (label: string, value: string | null | undefined) => {
      if (value) list.append(el('div', {}, el('dt', {}, label), el('dd', {}, value)));
    };
    add('Released', game.releaseDate ? date(game.releaseDate) : null);
    add('Developer', game.developer);
    add('Publisher', game.publisher);
    add('Region', game.region ? names(game.region, REGIONS) : null);
    add('Languages', game.lang ? names(game.lang, LANGUAGES) : null);

    const facts = el('div', { class: 'info' }, list);
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
          facts.append(
            el(
              'div',
              { class: 'achievements' },
              el('span', {}, `🏆 ${a.earned} / ${a.total} achievements`),
              bar
            )
          );
        });
      }, EXTRAS_DELAY_MS);
    }
    return facts;
  }

  /** How much it has been played. */
  #stats(game: Game): HTMLElement {
    const stats = el('div', { class: 'stats' });
    const stat = (value: string, label: string) =>
      stats.append(el('div', { class: 'stat' }, el('b', {}, value), el('span', {}, label)));
    stat(
      game.playCount > 0 ? `${game.playCount}×` : '—',
      game.playCount > 0 ? 'Played' : 'Never played'
    );
    if (game.gameTime > 0) stat(playtime(game.gameTime), 'Time played');
    if (game.lastPlayed) stat(ago(game.lastPlayed), 'Last played');
    return stats;
  }

  /** Its description: an arcade game's history; it scrolls by itself when it is long. */
  #story(game: Game): HTMLElement {
    const text = el('div', { class: 'text' });
    for (const part of (game.description ?? '').split(/\n\s*\n/)) {
      if (part.trim()) text.append(el('p', {}, part.trim()));
    }
    const story = el(
      'section',
      { class: 'story' },
      el('h3', {}, ARCADE.has(game.system) ? 'History' : 'About'),
      el('div', { class: 'window' }, text)
    );
    if (!game.description?.trim()) {
      text.append(el('p', { class: 'none' }, 'No description yet: Start → Scraper can find one.'));
    }
    // Once laid out: how far it overflows, and a pace to read it at.
    this.#later(() => {
      const window = text.parentElement;
      if (!window || !motion()) return;
      const overflow = text.scrollHeight - window.clientHeight;
      if (overflow <= 8) return;
      text.style.setProperty('--overflow', `${overflow}px`);
      // 6 s at each end, to read the start and the end.
      text.style.setProperty('--story-time', `${Math.round(overflow / STORY_SPEED + 12)}s`);
      text.classList.add('rolling');
    }, 1500);
    return story;
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
    this.#preview?.abort.abort();
    if (this.#preview?.url) URL.revokeObjectURL(this.#preview.url);
    this.#preview = null;
  }
}

/** `1-2` → `1–2 players`. */
function players(p: string): string {
  const n = p.replace('-', '–');
  return n === '1' ? '1 player' : `${n} players`;
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

function playtime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}
