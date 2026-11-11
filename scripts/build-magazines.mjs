#!/usr/bin/env node
/**
 * Fetches the magazine covers the systems screen shows behind each console, from the Internet
 * Archive: scripts/magazines.json lists, per system, the archive items whose front page is
 * about it (a launch issue, a guide, a special). An entry can instead be a cover elsewhere,
 * `{ "url": <a picture, or a scanned PDF whose first picture is its cover>, "title": …,
 * "page": <where it is credited> }` (Atarimania's scans, say). Each cover is written as
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
      /\((\d+ ?dpi|[A-Z]{2}|\d{4}-\d{2}|[^)]*(Publishing|Ziff|EMAP|Images|Geibunsha|Magazines)[^)]*)\)/gi,
      ''
    )
    .replace(/\(medium resolution\) Complete Set/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*$/, '')
    .trim();
}

/**
 * An item's front page: a scanned book's cover; else, for a folder of pictures, its first
 * picture by name.
 */
async function cover(item) {
  try {
    return await get(`https://archive.org/download/${item}/page/cover_h${HEIGHT * 2}.jpg`, 2);
  } catch {
    const { result = [] } = await (await get(`https://archive.org/metadata/${item}/files`)).json();
    const first = result
      .map((f) => f.name)
      .filter((n) => /\.(jpe?g|png)$/i.test(n) && !/thumb|__ia/i.test(n))
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))[0];
    if (!first) throw new Error(`no cover in ${item}`);
    return get(
      `https://archive.org/download/${item}/${encodeURIComponent(first).replace(/%2F/g, '/')}`
    );
  }
}

/** `ONLY=snes,psx`: just these systems, the others kept as they are. */
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;

const art = JSON.parse(readFileSync(ART, 'utf8'));
const before = readFileSync(join(SYSTEMS, 'MAGAZINES.md'), 'utf8').split('\n');
const credits = [
  '# Magazines',
  '',
  'Front pages of magazines about each system, from the Internet Archive, shown on the systems',
  'screen. Built by `scripts/build-magazines.mjs`.',
  ''
];

/**
 * A scanned PDF's first JPEG picture: its cover, for a scan whose pages are each one picture
 * (no PDF renderer needed).
 */
function firstJpeg(pdf) {
  const tag = pdf.indexOf('/DCTDecode');
  if (tag < 0) throw new Error('no JPEG picture in the PDF');
  let start = pdf.indexOf('stream', tag) + 'stream'.length;
  while (pdf[start] === 0x0d || pdf[start] === 0x0a) start++;
  return pdf.subarray(start, pdf.indexOf('endstream', start));
}

/** An entry's front page, written into the system's folder as `file`; its title. */
async function fetchCover(id, item, file) {
  let title, jpg;
  if (typeof item === 'object') {
    title = item.title;
    const bytes = Buffer.from(await (await get(item.url)).arrayBuffer());
    jpg = /\.pdf$/i.test(item.url) ? firstJpeg(bytes) : bytes;
  } else {
    const meta = await (await get(`https://archive.org/metadata/${item}/metadata`)).json();
    title = tidy(String(meta.result?.title ?? item));
    jpg = Buffer.from(await (await cover(item)).arrayBuffer());
  }
  await sharp(jpg)
    .resize({ height: HEIGHT, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(join(SYSTEMS, id, file));
  const page = typeof item === 'object' ? item.page : `https://archive.org/details/${item}`;
  credits.push(`- **${id}**: [${title}](${page})`);
  console.log(`${id}: ${title}`);
  return { file, title };
}

/** The system's entry in art.json, made if it has no art of its own (no logo, no photo). */
function entryOf(id) {
  mkdirSync(join(SYSTEMS, id), { recursive: true });
  return (art[id] ??= { logo: null, picture: null });
}

const keep = (id) => only && !only.has(id);

{
  const picks = JSON.parse(readFileSync(join(ROOT, 'scripts', 'magazines.json'), 'utf8'));
  for (const [id, items] of Object.entries(picks)) {
    if (keep(id)) continue;
    const entry = entryOf(id);
    const dir = join(SYSTEMS, id);
    for (const old of readdirSync(dir).filter((f) => /^mag-\d+\.webp$/.test(f))) {
      rmSync(join(dir, old));
    }
    const magazines = [];
    for (const item of items) {
      try {
        magazines.push(await fetchCover(id, item, `mag-${magazines.length + 1}.webp`));
      } catch (e) {
        console.warn(`${id}: ${item.title ?? item} skipped (${e.message})`);
      }
    }
    if (magazines.length) entry.magazines = magazines;
    else delete entry.magazines;
  }
}

// Those not fetched this time keep their credits as they are.
for (const id of Object.keys(art)) {
  if (keep(id)) credits.push(...before.filter((line) => line.startsWith(`- **${id}**:`)));
}
writeFileSync(ART, JSON.stringify(art, null, 2) + '\n');
writeFileSync(join(SYSTEMS, 'MAGAZINES.md'), credits.join('\n') + '\n');
