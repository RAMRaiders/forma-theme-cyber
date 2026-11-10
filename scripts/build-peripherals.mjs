#!/usr/bin/env node
/**
 * Fetches each system's peripherals for the shelf on the systems screen: photos from Wikimedia
 * Commons (most by Evan Amos, in the public domain), listed per system in
 * scripts/peripherals.json as `{ "file": "<Commons file name>", "name": "<what it is>" }`. The
 * white studio background is taken away (a flood from the edges, so white parts of the thing
 * itself stay), the picture trimmed to it, and written as public/systems/<id>/gear-<n>.webp;
 * public/systems/art.json lists them as `peripherals`, public/systems/PERIPHERALS.md credits
 * them.
 *
 *   node scripts/build-peripherals.mjs          ONLY=snes,n64 to fetch just some
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SYSTEMS = join(ROOT, 'public', 'systems');
const ART = join(SYSTEMS, 'art.json');
const UA = { 'User-Agent': 'forma-theme-cyber build script' };
/** Shown about 4.4rem tall: twice that at 1080p. */
const HEIGHT = 220;
/** How close to white the background is, 0–255 per channel. */
const WHITE = 232;

async function get(url, tries = 5) {
  for (let i = 0; ; i++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) return res;
    if (i + 1 >= tries || (res.status !== 429 && res.status < 500)) {
      throw new Error(`${res.status} ${url}`);
    }
    await new Promise((r) => setTimeout(r, 5000 * 2 ** i));
  }
}

/** The file's URL at a width, its author and licence. */
async function info(file) {
  const url =
    'https://commons.wikimedia.org/w/api.php?' +
    new URLSearchParams({
      action: 'query',
      format: 'json',
      prop: 'imageinfo',
      iiprop: 'url|extmetadata',
      iiurlwidth: '1600',
      titles: `File:${file}`
    });
  const page = Object.values((await (await get(url)).json()).query.pages)[0];
  const ii = page?.imageinfo?.[0];
  if (!ii) throw new Error(`no such file: ${file}`);
  const meta = ii.extmetadata ?? {};
  const text = (k) =>
    String(meta[k]?.value ?? '')
      .replace(/<[^>]+>/g, '')
      .trim();
  return {
    url: ii.thumburl ?? ii.url,
    page: ii.descriptionurl,
    author: text('Artist') || 'unknown',
    licence: text('LicenseShortName') || 'see its page'
  };
}

/** The picture cut down to `crop`, `[left, top, width, height]` as fractions of it. */
async function cropped(buf, crop) {
  if (!crop) return buf;
  const { width, height } = await sharp(buf).metadata();
  const [x, y, w, h] = crop;
  return sharp(buf)
    .extract({
      left: Math.round(x * width),
      top: Math.round(y * height),
      width: Math.round(w * width),
      height: Math.round(h * height)
    })
    .png()
    .toBuffer();
}

/** Makes everything but the largest connected shape transparent: specks, and a neighbour. */
function keepLargest(data, width, height) {
  const label = new Int32Array(width * height);
  const sizes = [0];
  for (let start = 0; start < width * height; start++) {
    if (label[start] || data[start * 4 + 3] === 0) continue;
    const id = sizes.length;
    let count = 0;
    const stack = [start];
    label[start] = id;
    while (stack.length) {
      const p = stack.pop();
      count++;
      const x = p % width;
      for (const q of [
        x > 0 ? p - 1 : -1,
        x < width - 1 ? p + 1 : -1,
        p >= width ? p - width : -1,
        p < width * (height - 1) ? p + width : -1
      ]) {
        if (q >= 0 && !label[q] && data[q * 4 + 3] !== 0) {
          label[q] = id;
          stack.push(q);
        }
      }
    }
    sizes.push(count);
  }
  const biggest = sizes.indexOf(Math.max(...sizes));
  for (let p = 0; p < width * height; p++) if (label[p] !== biggest) data[p * 4 + 3] = 0;
}

/**
 * The picture with the white round it made transparent: a flood from every edge. `limit`: how
 * near white counts (lower takes a soft shadow too). `largest`: only the biggest shape stays.
 * `holes`: white enclosed by the thing goes too (a trigger guard), for what has no white of its own.
 */
async function cutOut(buf, { limit = WHITE, largest = false, holes = false } = {}) {
  const { data, info: size } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = size;
  const white = (p) => data[p * 4] >= limit && data[p * 4 + 1] >= limit && data[p * 4 + 2] >= limit;
  const seen = new Uint8Array(width * height);
  const stack = [];
  for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1);
  while (stack.length) {
    const p = stack.pop();
    if (seen[p] || !white(p)) continue;
    seen[p] = 1;
    data[p * 4 + 3] = 0;
    const x = p % width;
    if (x > 0) stack.push(p - 1);
    if (x < width - 1) stack.push(p + 1);
    if (p >= width) stack.push(p - width);
    if (p < width * (height - 1)) stack.push(p + width);
  }
  if (holes) for (let p = 0; p < width * height; p++) if (white(p)) data[p * 4 + 3] = 0;
  if (largest) keepLargest(data, width, height);
  return sharp(data, { raw: { width, height, channels: 4 } })
    .trim()
    .png()
    .toBuffer();
}

const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const picks = JSON.parse(readFileSync(join(ROOT, 'scripts', 'peripherals.json'), 'utf8'));
const art = JSON.parse(readFileSync(ART, 'utf8'));
const before = readFileSync(join(SYSTEMS, 'PERIPHERALS.md'), 'utf8').split('\n');
const credits = [
  '# Peripherals',
  '',
  "Photos of each system's controllers and add-ons, from Wikimedia Commons, on the systems",
  'screen. Built by `scripts/build-peripherals.mjs`.',
  ''
];
for (const [id, items] of Object.entries(picks)) {
  if (only && !only.has(id)) {
    // Not fetched this time: its credits stay as they are.
    credits.push(...before.filter((line) => line.startsWith(`- **${id}**:`)));
    continue;
  }
  const dir = join(SYSTEMS, id);
  mkdirSync(dir, { recursive: true });
  for (const old of readdirSync(dir).filter((f) => /^gear-\d+\.webp$/.test(f))) {
    rmSync(join(dir, old));
  }
  const entry = (art[id] ??= { logo: null, picture: null });
  const peripherals = [];
  for (const { file, name, crop, limit, largest, holes } of items) {
    try {
      const about = await info(file);
      const whole = Buffer.from(await (await get(about.url)).arrayBuffer());
      const png = await cutOut(await cropped(whole, crop), { limit, largest, holes });
      const out = `gear-${peripherals.length + 1}.webp`;
      await sharp(png)
        .resize({ height: HEIGHT, width: HEIGHT * 2, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82, alphaQuality: 90 })
        .toFile(join(dir, out));
      peripherals.push({ file: out, name });
      credits.push(
        `- **${id}**: ${name}, [${file}](${about.page}), by ${about.author}, ${about.licence}.`
      );
      console.log(`${id}: ${name}`);
      // Commons asks for a gentle pace.
      await new Promise((r) => setTimeout(r, 1500));
    } catch (e) {
      console.warn(`${id}: ${file} skipped (${e.message})`);
    }
  }
  if (peripherals.length) entry.peripherals = peripherals;
  else delete entry.peripherals;
}
writeFileSync(ART, JSON.stringify(art, null, 2) + '\n');
writeFileSync(join(SYSTEMS, 'PERIPHERALS.md'), credits.join('\n') + '\n');
