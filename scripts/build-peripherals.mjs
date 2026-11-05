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
      iiurlwidth: '900',
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

/** The picture with the white round it made transparent: a flood from every edge. */
async function cutOut(buf) {
  const { data, info: size } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = size;
  const white = (p) => data[p * 4] >= WHITE && data[p * 4 + 1] >= WHITE && data[p * 4 + 2] >= WHITE;
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
  return sharp(data, { raw: { width, height, channels: 4 } })
    .trim()
    .png()
    .toBuffer();
}

const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const picks = JSON.parse(readFileSync(join(ROOT, 'scripts', 'peripherals.json'), 'utf8'));
const art = JSON.parse(readFileSync(ART, 'utf8'));
const credits = [
  '# Peripherals',
  '',
  "Photos of each system's controllers and add-ons, from Wikimedia Commons, on the systems",
  'screen. Built by `scripts/build-peripherals.mjs`.',
  ''
];
for (const [id, items] of Object.entries(picks)) {
  if (only && !only.has(id)) {
    for (const p of art[id]?.peripherals ?? []) credits.push(`- **${id}**: ${p.name}`);
    continue;
  }
  const dir = join(SYSTEMS, id);
  mkdirSync(dir, { recursive: true });
  for (const old of readdirSync(dir).filter((f) => /^gear-\d+\.webp$/.test(f))) {
    rmSync(join(dir, old));
  }
  const entry = (art[id] ??= { logo: null, picture: null });
  const peripherals = [];
  for (const { file, name } of items) {
    try {
      const about = await info(file);
      const png = await cutOut(Buffer.from(await (await get(about.url)).arrayBuffer()));
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
