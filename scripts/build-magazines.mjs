#!/usr/bin/env node
/**
 * Fetches the magazine covers the systems screen shows behind each console, from the Internet
 * Archive: scripts/magazines.json lists, per system, the archive items whose front page is
 * about it (a launch issue, a guide, a special). Each cover is written as
 * public/systems/<id>/mag-<n>.webp, and listed in public/systems/art.json as `magazines`, with
 * its title; public/systems/MAGAZINES.md says where each came from.
 *
 *   node scripts/build-magazines.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SYSTEMS = join(ROOT, 'public', 'systems');
const ART = join(SYSTEMS, 'art.json');
const UA = { 'User-Agent': 'forma-theme-cyber build script' };
/** Covers stand about 11rem tall: twice that in pixels at 1080p, for a sharp print. */
const HEIGHT = 520;

async function get(url, tries = 4) {
  for (let i = 0; ; i++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) return res;
    if (i + 1 >= tries || (res.status !== 429 && res.status < 500)) {
      throw new Error(`${res.status} ${url}`);
    }
    await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
  }
}

/** An archive title without its scanner's notes: `(600DPI)`, `(EMAP Images)(GB)`, `[+400dpi]`. */
function tidy(title) {
  return title
    .replace(/\[[^\]]*\]/g, '')
    .replace(
      /\((\d+ ?dpi|[A-Z]{2}|\d{4}-\d{2}|[^)]*(Publishing|Ziff|EMAP|Images|Geibunsha)[^)]*)\)/gi,
      ''
    )
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*$/, '')
    .trim();
}

const picks = JSON.parse(readFileSync(join(ROOT, 'scripts', 'magazines.json'), 'utf8'));
const art = JSON.parse(readFileSync(ART, 'utf8'));
const credits = [
  '# Magazine covers',
  '',
  'Front pages of magazines about each system, from the Internet Archive, shown small behind',
  'the console on the systems screen. Built by `scripts/build-magazines.mjs`.',
  ''
];
for (const [id, items] of Object.entries(picks)) {
  // A system without art of its own (no logo, no photo) can still have its press.
  const entry = (art[id] ??= { logo: null, picture: null });
  const dir = join(SYSTEMS, id);
  mkdirSync(dir, { recursive: true });
  for (const old of readdirSync(dir).filter((f) => /^mag-\d+\.webp$/.test(f))) {
    rmSync(join(dir, old));
  }
  const magazines = [];
  for (const item of items) {
    try {
      const meta = await (await get(`https://archive.org/metadata/${item}/metadata`)).json();
      const title = tidy(String(meta.result?.title ?? item));
      const jpg = Buffer.from(
        await (
          await get(`https://archive.org/download/${item}/page/cover_h${HEIGHT * 2}.jpg`)
        ).arrayBuffer()
      );
      const file = `mag-${magazines.length + 1}.webp`;
      await sharp(jpg)
        .resize({ height: HEIGHT, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toFile(join(dir, file));
      magazines.push({ file, title });
      credits.push(`- **${id}**: [${title}](https://archive.org/details/${item})`);
      console.log(`${id}: ${title}`);
    } catch (e) {
      console.warn(`${id}: ${item} skipped (${e.message})`);
    }
  }
  if (magazines.length) entry.magazines = magazines;
  else delete entry.magazines;
}
writeFileSync(ART, JSON.stringify(art, null, 2) + '\n');
writeFileSync(join(SYSTEMS, 'MAGAZINES.md'), credits.join('\n') + '\n');
