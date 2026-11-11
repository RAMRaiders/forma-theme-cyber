// @vitest-environment jsdom
import type { Game, ScraperStatus } from '@ramraiders/forma-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Scan } from './scan.js';

const game = { id: 7, name: 'Bonk' } as Game;
const status = (over: Partial<ScraperStatus> = {}): ScraperStatus => ({
  running: true,
  scope: 'Bonk',
  total: 1,
  done: 0,
  found: 0,
  notFound: 0,
  skipped: 0,
  current: 'Bonk',
  problems: [],
  stopped: false,
  ...over
});
const phase = (scan: Scan) => scan.root.querySelector('.scan-phase')?.textContent;

describe('the scan over a game being scraped', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows while the run is on the selected game, and only then', () => {
    const scan = new Scan();
    expect(scan.root.hidden).toBe(true);
    scan.progress(status({ current: 'Other' }), game);
    expect(scan.root.hidden).toBe(true);
    scan.progress(status(), game);
    expect(scan.root.hidden).toBe(false);
    expect(scan.root.querySelector('.scan-name')?.textContent).toBe('Bonk');
  });

  it('says when nothing came, then goes', () => {
    const scan = new Scan();
    scan.progress(status(), game);
    scan.progress(status({ running: false, current: null, done: 1, notFound: 1 }), game);
    expect(phase(scan)).toBe('Nothing found');
    vi.advanceTimersByTime(3000);
    expect(scan.root.hidden).toBe(true);
  });

  it('waits for the game drawn again with what came, then reveals it', async () => {
    const scan = new Scan();
    scan.progress(status(), game);
    scan.progress(status({ running: false, current: null, done: 1, found: 1 }), game);
    expect(scan.root.classList.contains('found')).toBe(true);
    expect(scan.root.hidden).toBe(false);
    scan.shown(7, []);
    await vi.advanceTimersByTimeAsync(0);
    expect(scan.root.classList.contains('reveal')).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(scan.root.hidden).toBe(true);
  });

  it('stays until the game is drawn again and every picture it shows has loaded', async () => {
    const scan = new Scan();
    scan.progress(status(), game);
    scan.progress(status({ running: false, current: null, done: 1, found: 1 }), game);
    // The library is slow to notice the new files: still waiting, a while.
    await vi.advanceTimersByTimeAsync(6000);
    expect(scan.root.classList.contains('reveal')).toBe(false);
    let loaded = () => {};
    const backdrop = {
      decode: () => new Promise<void>((done) => (loaded = done))
    } as unknown as HTMLImageElement;
    scan.shown(7, [backdrop]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(scan.root.classList.contains('reveal')).toBe(false);
    loaded();
    await vi.advanceTimersByTimeAsync(0);
    expect(scan.root.classList.contains('reveal')).toBe(true);
  });

  it('never hangs: without a redraw, or with pictures that never load, it shows the game', async () => {
    const scan = new Scan();
    scan.progress(status(), game);
    scan.progress(status({ running: false, current: null, done: 1, found: 1 }), game);
    await vi.advanceTimersByTimeAsync(8000);
    expect(scan.root.classList.contains('reveal')).toBe(true);
    const stuck = new Scan();
    stuck.progress(status(), game);
    stuck.progress(status({ running: false, current: null, done: 1, found: 1 }), game);
    stuck.shown(7, [{ decode: () => new Promise<void>(() => {}) } as unknown as HTMLImageElement]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(stuck.root.classList.contains('reveal')).toBe(true);
  });

  it("hands the reveal to the view's own (the game's boot), then goes at once", async () => {
    const revealed: number[] = [];
    const scan = new Scan((id) => (revealed.push(id), true));
    scan.progress(status(), game);
    scan.progress(status({ running: false, current: null, done: 1, found: 1 }), game);
    scan.shown(7, []);
    await vi.advanceTimersByTimeAsync(0);
    expect(revealed).toEqual([7]);
    expect(scan.root.hidden).toBe(true);
  });

  it('stays over the game until the view is ready to show it (its logo loaded)', async () => {
    let ready = (_: boolean) => {};
    const scan = new Scan(() => new Promise<boolean>((done) => (ready = done)));
    scan.progress(status(), game);
    scan.progress(status({ running: false, current: null, done: 1, found: 1 }), game);
    scan.shown(7, []);
    await vi.advanceTimersByTimeAsync(0);
    expect(scan.root.hidden).toBe(false);
    ready(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(scan.root.hidden).toBe(true);
  });

  it('covers a game whose pictures were just saved until the new ones have loaded', async () => {
    const scan = new Scan();
    let loaded = () => {};
    const backdrop = {
      decode: () => new Promise<void>((done) => (loaded = done))
    } as unknown as HTMLImageElement;
    scan.refreshed(game, [backdrop]);
    expect(scan.root.hidden).toBe(false);
    expect(scan.root.classList.contains('instant')).toBe(true);
    await vi.advanceTimersByTimeAsync(4000);
    expect(scan.root.classList.contains('reveal')).toBe(false);
    loaded();
    await vi.advanceTimersByTimeAsync(0);
    expect(scan.root.classList.contains('reveal')).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(scan.root.hidden).toBe(true);
  });

  it('draws the scraped game again once, after the library has gone quiet', async () => {
    const scan = new Scan();
    const draws: number[] = [];
    scan.progress(status(), game);
    // The library changes several times while Forma saves: none drawn yet.
    scan.redraw(7, () => draws.push(1));
    scan.redraw(7, () => draws.push(2));
    expect(draws).toEqual([]);
    scan.progress(status({ running: false, current: null, done: 1, found: 1 }), game);
    await vi.advanceTimersByTimeAsync(800);
    scan.redraw(7, () => draws.push(3));
    await vi.advanceTimersByTimeAsync(800);
    expect(draws).toEqual([]);
    await vi.advanceTimersByTimeAsync(500);
    // Once, the latest.
    expect(draws).toEqual([3]);
    // Other games are drawn at once.
    scan.redraw(8, () => draws.push(4));
    expect(draws).toEqual([3, 4]);
  });

  it('draws a held redraw when nothing came', () => {
    const scan = new Scan();
    const draws: number[] = [];
    scan.progress(status(), game);
    scan.redraw(7, () => draws.push(1));
    scan.progress(status({ running: false, current: null, done: 1, notFound: 1 }), game);
    expect(draws).toEqual([1]);
  });

  it('goes when another game is chosen', () => {
    const scan = new Scan();
    scan.progress(status(), game);
    scan.shown(8, []);
    expect(scan.root.hidden).toBe(true);
  });
});
