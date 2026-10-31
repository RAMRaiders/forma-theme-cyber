import { el } from './dom.js';

/** Frames slower than this are counted as dropped at 60 Hz (one missed vsync and more). */
const DROPPED_MS = 1000 / 60 + 8;
/** Seconds of frames the numbers cover. */
const WINDOW_S = 3;

export interface PerfStats {
  /** Over the last few seconds. */
  fps: number;
  p95Ms: number;
  worstMs: number;
  /** Since the page loaded. */
  dropped: number;
  frames: number;
  at: string;
}

/**
 * Frame timing for the Batocera spike (#39): shown when the page is opened with `#perf`, which
 * Forma adds when started with `FORMA_PERF=1`. `report` receives the numbers once a second,
 * so they can be read off a device nobody is watching.
 */
export function startPerfOverlay(report: (stats: PerfStats) => void = () => {}): void {
  const panel = el('div', { class: 'perf', 'aria-hidden': 'true' });
  document.body.append(panel);
  const frames: number[] = [];
  let last = performance.now();
  let dropped = 0;
  let count = 0;
  let lastPaint = 0;
  let lastReport = 0;

  const tick = (now: number) => {
    const ms = now - last;
    last = now;
    frames.push(ms);
    count += 1;
    if (ms > DROPPED_MS) dropped += 1;
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
        frames: count,
        at: new Date().toISOString()
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
