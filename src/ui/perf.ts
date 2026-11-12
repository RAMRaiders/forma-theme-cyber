import { el } from './dom.js';

/** Frames slower than this are counted as dropped at 60 Hz (one missed vsync and more). */
const DROPPED_MS = 1000 / 60 + 8;
/** Seconds of frames the numbers cover. */
const WINDOW_S = 3;

/** A frame this slow is kept with what ran in it. */
const SLOW_MS = 50;
let tracing = false;
const totals = new Map<string, { n: number; total: number; max: number }>();
let inFrame: string[] = [];
const slow: { ms: number; t: number; ran: string[]; moving: boolean }[] = [];
const noop = () => {};

/**
 * Times a piece of work, from now to the call of what it returns, in perf mode only (`#perf`):
 * each slow frame is kept with what ran in it, to find what makes a step stutter on a Pi.
 */
export function span(label: string): () => void {
  if (!tracing) return noop;
  const start = performance.now();
  return () => {
    const ms = performance.now() - start;
    const t = totals.get(label) ?? { n: 0, total: 0, max: 0 };
    t.n += 1;
    t.total += ms;
    t.max = Math.max(t.max, ms);
    totals.set(label, t);
    if (ms >= 2) inFrame.push(`${label} ${Math.round(ms)}`);
  };
}

/**
 * Notes that `label` happened (perf mode only), with the frame it happened in: a slow frame
 * lists the events in it, so a stall nothing measured ran in can still be pinned to one.
 */
export function mark(label: string): void {
  if (tracing) inFrame.push(`@${label}`);
}

export interface PerfStats {
  /** Over the last few seconds. */
  fps: number;
  p95Ms: number;
  worstMs: number;
  /** Since the page loaded. */
  dropped: number;
  frames: number;
  at: string;
  /** All the time spent in slow frames so far. */
  slowMs?: number;
  /** The slowest pieces of work so far, and the latest slow frames with what ran in them. */
  work?: string[];
  slow?: { ms: number; t: number; ran: string[]; moving: boolean }[];
}

/**
 * Frame timing for the Batocera spike (#39): shown when the page is opened with `#perf`, which
 * Forma adds when started with `FORMA_PERF=1`. `report` receives the numbers once a second,
 * so they can be read off a device nobody is watching.
 */
export function startPerfOverlay(report: (stats: PerfStats) => void = () => {}): void {
  tracing = true;
  const panel = el('div', { class: 'perf', 'aria-hidden': 'true' });
  document.body.append(panel);
  const frames: number[] = [];
  let last = performance.now();
  let dropped = 0;
  let count = 0;
  let lastPaint = 0;
  let lastReport = 0;
  let slowTotal = 0;

  const tick = (now: number) => {
    const ms = now - last;
    last = now;
    frames.push(ms);
    count += 1;
    if (ms > DROPPED_MS) dropped += 1;
    if (ms > SLOW_MS) {
      slowTotal += ms;
      const moving = document.querySelector('.browsing') !== null;
      slow.push({ ms: Math.round(ms), t: Math.round(now), ran: inFrame.slice(0, 16), moving });
      if (slow.length > 60) slow.shift();
    }
    inFrame = [];
    let total = frames.reduce((a, b) => a + b, 0);
    while (total > WINDOW_S * 1000 && frames.length > 1) total -= frames.shift()!;

    if (now - lastPaint > 250) {
      lastPaint = now;
      const sorted = [...frames].sort((a, b) => a - b);
      const stats: PerfStats = {
        fps: Math.round((frames.length / total) * 1000),
        p95Ms: Math.round((sorted[Math.floor(sorted.length * 0.95)] ?? 0) * 10) / 10,
        worstMs: Math.round(Math.max(...frames)),
        dropped,
        slowMs: Math.round(slowTotal),
        frames: count,
        at: new Date().toISOString(),
        work: [...totals]
          .sort((a, b) => b[1].max - a[1].max)
          .slice(0, 30)
          .map(
            ([k, v]) => `${k}: n ${v.n} avg ${(v.total / v.n).toFixed(1)} max ${Math.round(v.max)}`
          ),
        slow: [...slow]
      };
      panel.textContent = `${stats.fps} fps · p95 ${stats.p95Ms} ms · worst ${stats.worstMs} ms · dropped ${dropped}`;
      if (now - lastReport > 1000) {
        lastReport = now;
        report(stats);
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
