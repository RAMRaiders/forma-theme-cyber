#!/usr/bin/env node
/**
 * Finds each system's own colours in its official logo, in colour (Batocera's carbon theme,
 * art/logos/<name>.svg: not the white `-w` ones Cyber shows), and writes them into
 * public/systems/art.json as `hues`: the logo's main hue, then a second one if it has one, in
 * degrees. Cyber's systems screen glows in them. A logo with no vivid colour (black, white,
 * grey) gets none, and the screen takes its maker's colour instead.
 *
 *   node scripts/build-colours.mjs <carbon art/logos dir>
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'public', 'systems', 'art.json');
/** Hue bins of this many degrees. */
const BIN = 10;
/** A second hue counts if it is this far from the first and this strong beside it. */
const APART = 40;
const SECOND_SHARE = 0.18;
/** Vivid pixels must be at least this share of the logo's opaque ones for any colour. */
const VIVID_SHARE = 0.04;

const [dir] = process.argv.slice(2);
if (!dir || !existsSync(dir)) {
  console.error('usage: build-colours.mjs <carbon art/logos dir>');
  process.exit(1);
}
const have = new Set(readdirSync(dir));
const systems = readFileSync(join(ROOT, 'scripts', 'batocera-systems.tsv'), 'utf8')
  .trim()
  .split('\n')
  .slice(1)
  .map((line) => {
    const [id, , , , , theme] = line.split('\t');
    return { id, theme: theme || id };
  });
const aliases = JSON.parse(readFileSync(join(ROOT, 'scripts', 'art-sources.json'), 'utf8')).aliases;

/** The logo's hues, strongest first: one or two, or none. */
function huesOf(rgba) {
  const bins = new Array(360 / BIN).fill(0);
  let opaque = 0;
  let vivid = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const a = rgba[i + 3] / 255;
    if (a < 0.5) continue;
    opaque++;
    const r = rgba[i] / 255;
    const g = rgba[i + 1] / 255;
    const b = rgba[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    const light = (max + min) / 2;
    if (chroma < 0.3 || light < 0.12 || light > 0.9) continue;
    let h;
    if (max === r) h = ((g - b) / chroma) % 6;
    else if (max === g) h = (b - r) / chroma + 2;
    else h = (r - g) / chroma + 4;
    const deg = (h * 60 + 360) % 360;
    bins[Math.floor(deg / BIN) % bins.length] += chroma;
    vivid++;
  }
  if (opaque === 0 || vivid / opaque < VIVID_SHARE) return [];
  // Each bin with its neighbours: a colour across a bin edge is still one colour.
  const n = bins.length;
  const smooth = bins.map((v, i) => v + 0.5 * (bins[(i + n - 1) % n] + bins[(i + 1) % n]));
  const centre = (i) => {
    // The weighted middle of a bin and its neighbours, in degrees.
    let x = 0;
    let y = 0;
    for (const j of [i - 1, i, i + 1]) {
      const k = (j + n) % n;
      const angle = ((k + 0.5) * BIN * Math.PI) / 180;
      x += Math.cos(angle) * bins[k];
      y += Math.sin(angle) * bins[k];
    }
    return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
  };
  const first = smooth.indexOf(Math.max(...smooth));
  const hues = [centre(first)];
  let second = -1;
  for (let i = 0; i < n; i++) {
    const apart = Math.min(Math.abs(i - first), n - Math.abs(i - first)) * BIN;
    if (apart < APART || smooth[i] < smooth[first] * SECOND_SHARE) continue;
    if (second < 0 || smooth[i] > smooth[second]) second = i;
  }
  if (second >= 0) hues.push(centre(second));
  return hues;
}

const art = JSON.parse(readFileSync(ART, 'utf8'));
for (const system of systems) {
  const entry = art[system.id];
  if (!entry) continue;
  const names = [system.theme, system.id, aliases[system.id]].filter(Boolean);
  const file = names.flatMap((n) => [`${n}.svg`, `${n}.png`]).find((f) => have.has(f));
  delete entry.hues;
  if (!file) continue;
  const { data } = await sharp(join(dir, file), { density: 72, limitInputPixels: false })
    .resize({ height: 160, fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const hues = huesOf(data);
  if (hues.length) entry.hues = hues;
  process.stdout.write(`${system.id}: ${hues.join(', ') || '—'}\n`);
}
writeFileSync(ART, JSON.stringify(art, null, 2) + '\n');
