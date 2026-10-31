/**
 * A circuit board for a system, drawn as SVG: its real chips as labelled packages, traces running
 * out of their pins at 90° and 45°, vias, small parts. Seeded from the system's id, so each system
 * always gets the same board, and no two look alike.
 */

export interface Chip {
  role: string;
  part: string;
}

const W = 1600;
const H = 900;
const GRID = 25;

/** A small, fast, seedable PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.codePointAt(0)!, 16777619);
  return h >>> 0;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: Box, b: Box, gap: number) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

const snap = (v: number) => Math.round(v / GRID) * GRID;

function escape(s: string): string {
  return s.replace(
    /[<>&"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!
  );
}

/**
 * The board for `id`. With no known chips it still draws a board, with unlabelled packages.
 * `pulses` traces get a travelling light; 0 for a still image.
 */
export function circuitSvg(id: string, chips: Chip[] = [], pulses = 6): string {
  const rand = rng(hash(id));
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const parts: string[] = [];
  const traces: string[] = [];

  // Chips: the first (usually the CPU) largest, each wide enough for its label, spread over the
  // whole board so some always show around the screen's panels.
  const list =
    chips.length > 0
      ? chips.slice(0, 6)
      : [
          { role: '', part: '' },
          { role: '', part: '' }
        ];
  const boxes: (Box & Chip)[] = [];
  for (const [i, chip] of list.entries()) {
    const size = i === 0 ? 1.4 : 1 - Math.min(i, 3) * 0.08;
    const w = snap(Math.max(200 * size + rand() * 50, chip.part.length * 17 + 50));
    const h = snap(150 * size + rand() * 50);
    for (let attempt = 0; attempt < 60; attempt++) {
      const box = {
        x: snap(40 + rand() * (W - 80 - w)),
        y: snap(60 + rand() * (H - 120 - h)),
        w,
        h,
        ...chip
      };
      if (boxes.every((b) => !overlaps(b, box, 90))) {
        boxes.push(box);
        break;
      }
    }
  }

  // Traces: out of a pin, straight, one 45° bend, straight again, ending in a via.
  const trace = (x: number, y: number, dx: number, dy: number, len: number) => {
    const a = snap(len * (0.3 + rand() * 0.5));
    const bend = snap(GRID * (1 + Math.floor(rand() * 4)));
    const side = rand() < 0.5 ? -1 : 1;
    const x1 = x + dx * a;
    const y1 = y + dy * a;
    // The diagonal turns across the direction of travel.
    const x2 = x1 + (dx === 0 ? side * bend : dx * bend);
    const y2 = y1 + (dy === 0 ? side * bend : dy * bend);
    const rest = snap(len - a);
    const x3 = x2 + dx * rest;
    const y3 = y2 + dy * rest;
    traces.push(`M${x} ${y}L${x1} ${y1}L${x2} ${y2}L${x3} ${y3}`);
    parts.push(`<circle class="via" cx="${x3}" cy="${y3}" r="6"/>`);
  };

  for (const box of boxes) {
    const pins = (n: number, from: number, span: number) =>
      Array.from({ length: n }, (_, k) => from + ((k + 1) * span) / (n + 1));
    const nx = Math.max(4, Math.floor(box.w / 22));
    const ny = Math.max(3, Math.floor(box.h / 22));
    // Pins on all four sides; some carry traces away.
    for (const px of pins(nx, box.x, box.w)) {
      parts.push(`<rect class="pin" x="${px - 3}" y="${box.y - 12}" width="6" height="12"/>`);
      parts.push(`<rect class="pin" x="${px - 3}" y="${box.y + box.h}" width="6" height="12"/>`);
      if (rand() < 0.45) trace(px, box.y - 12, 0, -1, 80 + rand() * 260);
      if (rand() < 0.45) trace(px, box.y + box.h + 12, 0, 1, 80 + rand() * 260);
    }
    for (const py of pins(ny, box.y, box.h)) {
      parts.push(`<rect class="pin" x="${box.x - 12}" y="${py - 3}" width="12" height="6"/>`);
      parts.push(`<rect class="pin" x="${box.x + box.w}" y="${py - 3}" width="12" height="6"/>`);
      if (rand() < 0.45) trace(box.x - 12, py, -1, 0, 80 + rand() * 320);
      if (rand() < 0.45) trace(box.x + box.w + 12, py, 1, 0, 80 + rand() * 320);
    }
    const label =
      box.part === ''
        ? ''
        : `<text class="part" x="${box.x + box.w / 2}" y="${box.y + box.h / 2}">${escape(box.part)}</text>` +
          `<text class="role" x="${box.x + box.w / 2}" y="${box.y + box.h / 2 + 30}">${escape(box.role)}</text>`;
    parts.push(
      `<rect class="chip" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="6"/>` +
        `<circle class="dot" cx="${box.x + 18}" cy="${box.y + 18}" r="6"/>` +
        label
    );
  }

  // Background wiring across the whole board, and small parts (resistors, capacitors).
  for (let i = 0; i < 36; i++) {
    const vertical = rand() < 0.5;
    const x = snap(rand() * W);
    const y = snap(rand() * H);
    trace(x, y, vertical ? 0 : pick([-1, 1]), vertical ? pick([-1, 1]) : 0, 120 + rand() * 400);
  }
  for (let i = 0; i < 26; i++) {
    const x = snap(rand() * W);
    const y = snap(rand() * H);
    const across = rand() < 0.5;
    parts.push(
      `<rect class="part-small" x="${x}" y="${y}" width="${across ? 36 : 14}" height="${across ? 14 : 36}" rx="3"/>`
    );
  }

  const paths = traces.map((d) => `<path class="trace" d="${d}"/>`).join('');
  const lit = traces
    .filter((_, i) => i % Math.max(1, Math.floor(traces.length / Math.max(1, pulses))) === 0)
    .slice(0, pulses)
    .map(
      (d, i) => `<path class="pulse" style="animation-delay:${(i * 0.9).toFixed(1)}s" d="${d}"/>`
    )
    .join('');

  return (
    `<svg class="circuit" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" ` +
    `xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${paths}${lit}${parts.join('')}</svg>`
  );
}
