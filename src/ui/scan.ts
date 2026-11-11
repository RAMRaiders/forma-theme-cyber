import type { Game, ScraperStatus } from '@ramraiders/forma-sdk';
import { el } from './dom.js';

/**
 * Longest wait, after its scrape, for the game to be drawn again with what came: Forma's
 * library notices the new files on its own time (slow on a Pi), then Cyber reloads. Only a
 * safety: the redraw ends the wait.
 */
const REDRAW_MS = 8000;
/** Drawn again while the scrape was still on: how long a later redraw may still come. */
const EARLY_MS = 3000;
/** Longest wait for its new pictures to load: a safety, they normally end it. */
const LOAD_MS = 5000;
/** How long the reveal takes, and how long "nothing found" stays. */
const REVEAL_MS = 900;
const VERDICT_MS = 1800;
/**
 * Forma saves a scrape in several writes, and the library says it changed after each: the game
 * is drawn again once they have stopped this long, not at each (each redraw froze the scan and
 * flickered the pictures under it).
 */
const QUIET_MS = 1200;

type State = 'idle' | 'scanning' | 'waiting' | 'loading' | 'revealing';

/**
 * Over the selected game while a scraper run is on it: a beam sweeping its stage and a reticle
 * turning, its name, what is going on. When its pictures have come and decoded, the beam
 * crosses once more and the new pictures show. Opacity and transforms only (cheap on a Pi).
 */
export class Scan {
  readonly root = el('div', { class: 'scan', 'aria-hidden': 'true' });
  #state: State = 'idle';
  #game: number | null = null;
  #name = '';
  #counts = { found: 0, notFound: 0, skipped: 0 };
  #images: HTMLImageElement[] | null = null;
  /** Which wait for pictures is the latest: a redraw during one starts another. */
  #round = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  /** The latest redraw of the scanned game, held while it is being scraped. */
  #redraw: (() => void) | null = null;
  #quiet: ReturnType<typeof setTimeout> | undefined;
  readonly #title = el('span', { class: 'scan-name' });
  readonly #phase = el('span', { class: 'scan-phase' });

  /**
   * `reveal`: shows the game `id` in its own way once its new pictures are in (returns whether
   * it did), the scan then going at once; else the beam crosses once more.
   */
  constructor(private readonly reveal?: (id: number) => boolean) {
    this.root.hidden = true;
    this.root.append(
      el('span', { class: 'scan-shade' }),
      el('span', { class: 'scan-grid' }),
      el('span', { class: 'scan-beam' }),
      el(
        'div',
        { class: 'scan-core' },
        el(
          'div',
          { class: 'scan-ring' },
          el('span', { class: 'arc a' }),
          el('span', { class: 'arc b' }),
          el('span', { class: 'dot' })
        ),
        el('span', { class: 'scan-title' }, 'Scanning archives'),
        this.#title,
        this.#phase,
        el(
          'div',
          { class: 'scan-bars' },
          ...Array.from({ length: 9 }, (_, n) => el('i', { style: `--n: ${n}` }))
        )
      )
    );
  }

  /** A run's progress, `game` the one selected now. */
  progress(status: ScraperStatus, game: Game | undefined): void {
    if (this.#state === 'scanning') {
      if (status.running && status.current === this.#name) return;
      this.#scraped(status);
      return;
    }
    if (status.running && game && status.current === game.name) this.#start(game, status);
  }

  /**
   * The game `id` is to be drawn again (its details changed): at once, unless it is the one being
   * scanned; then once its scrape is over and the library has gone quiet, and only once.
   */
  redraw(id: number, draw: () => void): void {
    if (this.#state === 'idle' || this.#state === 'revealing' || id !== this.#game) return draw();
    this.#redraw = draw;
    if (this.#state === 'scanning') return;
    // Waiting, or loading what a redraw before brought: this one replaces it.
    this.#round++;
    this.#state = 'waiting';
    this.#drawWhenQuiet();
  }

  #drawWhenQuiet(): void {
    clearTimeout(this.#quiet);
    this.#quiet = setTimeout(() => {
      const draw = this.#redraw;
      this.#redraw = null;
      draw?.();
    }, QUIET_MS);
  }

  /** The game on stage was drawn (again), with these pictures. */
  shown(id: number, images: HTMLImageElement[]): void {
    if (this.#state === 'idle') return;
    // Another game chosen meanwhile: this one's scan is not for it.
    if (id !== this.#game) {
      this.#redraw = null;
      return this.#stop();
    }
    // Drawn again before the run said it was done: kept for when it does.
    if (this.#state === 'scanning') {
      this.#images = images;
      return;
    }
    if (this.#state === 'waiting' || this.#state === 'loading') this.#load(images);
  }

  /**
   * Its pictures were just replaced (chosen and saved in Forma's menu, whose dark lifts as it
   * saves) and it is drawn again with `images`: dark over it at once, no fade in, so the screen
   * stays dark, until every one of them, the backdrop too, has loaded.
   */
  refreshed(game: Game, images: HTMLImageElement[]): void {
    clearTimeout(this.#timer);
    this.#game = game.id;
    this.#name = game.name;
    this.#title.textContent = game.name;
    this.#phase.textContent = 'Loading pictures…';
    this.root.className = 'scan found instant';
    this.root.hidden = false;
    this.#load(images);
  }

  #start(game: Game, status: ScraperStatus): void {
    clearTimeout(this.#timer);
    this.#state = 'scanning';
    this.#game = game.id;
    this.#name = game.name;
    this.#counts = { found: status.found, notFound: status.notFound, skipped: status.skipped };
    this.#images = null;
    this.#title.textContent = game.name;
    this.#phase.textContent = 'Asking the sources…';
    this.root.className = 'scan';
    this.root.hidden = false;
  }

  /** Its scrape is over: wait for it to be drawn again, or say nothing came. */
  #scraped(status: ScraperStatus): void {
    const found = status.found > this.#counts.found;
    const skipped = status.skipped > this.#counts.skipped;
    if (!found) {
      this.#phase.textContent = skipped ? 'Already complete' : 'Nothing found';
      this.root.classList.add('verdict');
      this.#state = 'revealing';
      this.#timer = setTimeout(() => this.#leave(), VERDICT_MS);
      this.#flush();
      return;
    }
    this.#state = 'waiting';
    this.#phase.textContent = 'Downloaded · loading pictures…';
    this.root.classList.add('found');
    // Up until the game is drawn again with what came (or, drawn already while the scrape was
    // on, a little longer in case the library's reload is still to come).
    const early = this.#images;
    if (this.#redraw) {
      this.#timer = setTimeout(() => this.#load([]), REDRAW_MS);
      return this.#drawWhenQuiet();
    }
    this.#timer = early
      ? setTimeout(() => this.#load(early), EARLY_MS)
      : setTimeout(() => this.#load([]), REDRAW_MS);
  }

  /** Drawn again: up until every picture it shows, the backdrop too, has loaded. */
  #load(images: HTMLImageElement[]): void {
    clearTimeout(this.#timer);
    this.#state = 'loading';
    const round = ++this.#round;
    const loaded = images.map((img) =>
      typeof img.decode === 'function' ? img.decode().catch(() => undefined) : Promise.resolve()
    );
    void Promise.race([Promise.all(loaded), new Promise((done) => setTimeout(done, LOAD_MS))]).then(
      () => {
        if (round === this.#round && this.#state === 'loading') this.#reveal();
      }
    );
  }

  /** All in: the beam crosses once more and the scan lifts off the new pictures. */
  #reveal(): void {
    if (this.#game !== null && this.reveal?.(this.#game)) return this.#stop();
    this.#state = 'revealing';
    this.#phase.textContent = 'Ready';
    this.root.classList.add('reveal');
    this.#timer = setTimeout(() => this.#leave(), REVEAL_MS);
  }

  #leave(): void {
    this.root.classList.add('gone');
    this.#timer = setTimeout(() => this.#stop(), 500);
  }

  /** A held redraw, now. */
  #flush(): void {
    clearTimeout(this.#quiet);
    const draw = this.#redraw;
    this.#redraw = null;
    draw?.();
  }

  #stop(): void {
    clearTimeout(this.#timer);
    this.#flush();
    this.#round++;
    this.#state = 'idle';
    this.#game = null;
    this.#images = null;
    this.root.hidden = true;
    this.root.className = 'scan';
  }
}
