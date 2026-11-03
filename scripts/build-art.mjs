#!/usr/bin/env node
/**
 * Builds Cyber's art for every system Batocera knows (scripts/batocera-systems.tsv, from its
 * es_systems.cfg): each system's official logo and its console picture, into
 * public/systems/<id>/, with public/systems/art.json saying what each has and CREDITS.md where
 * it came from.
 *
 * - Logos and pictures come from Batocera's own carbon theme (copy its art/logos and
 *   art/consoles off a box: /usr/share/emulationstation/themes/es-theme-carbon/art). A white
 *   logo (`<name>-w.svg`) is preferred, Cyber being dark.
 * - Systems carbon has no picture for take one from Wikimedia Commons (scripts/art-sources.json),
 *   cut out of its plain background when it is a studio shot, else shown framed.
 *
 *   node scripts/build-art.mjs <carbon art dir> [cache dir]
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'systems');
const UA = 'FormaCyberArt/1.0 (https://github.com/RAMRaiders/forma-theme-cyber)';
/** Logos at this height: twice what a 1080p screen shows, enough for 4K. */
const LOGO_H = 200;
/** Pictures no larger than this either way. */
const PICTURE_MAX = 900;

const [carbon, cache = join(ROOT, 'node_modules', '.cache', 'cyber-art')] = process.argv.slice(2);
if (!carbon || !existsSync(join(carbon, 'logos'))) {
  console.error('usage: build-art.mjs <carbon art dir (with logos/ and consoles/)> [cache dir]');
  process.exit(1);
}
mkdirSync(cache, { recursive: true });

const systems = readFileSync(join(ROOT, 'scripts', 'batocera-systems.tsv'), 'utf8')
  .trim()
  .split('\n')
  .slice(1)
  .map((line) => {
    const [id, fullname, manufacturer, year, hardware, theme] = line.split('\t');
    return { id, fullname, manufacturer, year, hardware, theme: theme || id };
  });
const sources = JSON.parse(readFileSync(join(ROOT, 'scripts', 'art-sources.json'), 'utf8'));
/** The names carbon may file a system under. */
const namesOf = (system) => [system.theme, system.id, sources.aliases[system.id]].filter(Boolean);
const files = (dir) => new Set(readdirSync(join(carbon, dir)));
const logos = files('logos');
const consoles = files('consoles');

/** The first of `names` that carbon has in `dir`. */
const pick = (have, names) => names.find((n) => have.has(n));

async function logo(system) {
  const names = namesOf(system).flatMap((n) => [
    `${n}-w.svg`,
    `${n}.svg`,
    `${n}-w.png`,
    `${n}.png`
  ]);
  const file = pick(logos, names);
  let path = file && join(carbon, 'logos', file);
  let credit = null;
  if (!file) {
    if (!sources.logos[system.id]) return null;
    ({ file: path, credit } = await commons(sources.logos[system.id], true));
  }
  // SVGs drawn at a density that gives the height wanted, whatever their own size.
  const own = await sharp(path, { limitInputPixels: false }).metadata();
  const density = path.endsWith('.svg')
    ? Math.min(
        2400,
        Math.max(
          24,
          (72 * LOGO_H * 1.5) /
            Math.max(1, Math.min(own.height, (own.width * LOGO_H) / (LOGO_H * 5)))
        )
      )
    : 72;
  const image = sharp(path, { density, limitInputPixels: false })
    .resize({ height: LOGO_H, width: LOGO_H * 5, fit: 'inside' })
    .trim({ threshold: 1 });
  const out = join(OUT, system.id, 'logo.webp');
  await image.clone().webp({ quality: 90, alphaQuality: 100 }).toFile(out);
  // A logo mostly too dark to read on Cyber's background (#04060c, contrast under 2.2:1) gets a
  // light halo there.
  const { data, info } = await image
    .clone()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  let dim = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] < 128) continue;
    const L = 0.2126 * lin(data[i]) + 0.7152 * lin(data[i + 1]) + 0.0722 * lin(data[i + 2]);
    if ((L + 0.05) / 0.052 < 2.2) dim++;
    n++;
  }
  const dark = n > 0 && dim / n > 0.6;
  return { dark, credit };
}

async function carbonPicture(system) {
  const file = pick(
    consoles,
    namesOf(system).flatMap((n) => [`${n}.png`, `${n}.jpg`])
  );
  if (!file) return null;
  await sharp(join(carbon, 'consoles', file))
    .resize({ width: PICTURE_MAX, height: PICTURE_MAX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 88, alphaQuality: 100 })
    .toFile(join(OUT, system.id, 'photo.webp'));
  return { kind: 'cutout', source: `carbon:${file}` };
}

/** A Commons file and who made it; `original`: the file itself (an SVG), not a bitmap of it. */
async function commons(title, original = false) {
  const url =
    'https://commons.wikimedia.org/w/api.php?' +
    new URLSearchParams({
      action: 'query',
      titles: `File:${title}`,
      prop: 'imageinfo',
      iiprop: 'url|extmetadata',
      iiurlwidth: '1600',
      format: 'json'
    });
  const page = Object.values(
    (await (await fetch(url, { headers: { 'User-Agent': UA } })).json()).query.pages
  )[0];
  const info = page.imageinfo[0];
  const meta = info.extmetadata ?? {};
  const text = (k) => (meta[k]?.value ?? '').replace(/<[^>]+>/g, '').trim();
  const cached = join(cache, title.replace(/[^\w.-]/g, '_'));
  if (!existsSync(cached)) {
    const res = await fetch(original ? info.url : (info.thumburl ?? info.url), {
      headers: { 'User-Agent': UA }
    });
    if (!res.ok) throw new Error(`${title}: ${res.status}`);
    writeFileSync(cached, Buffer.from(await res.arrayBuffer()));
  }
  return {
    file: cached,
    credit: {
      title: page.title,
      page:
        info.descriptionurl ??
        `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
      author: text('Artist') || 'unknown',
      license: text('LicenseShortName') || 'see page'
    }
  };
}

/**
 * A studio shot cut out of its plain background: the colour round the edges, flooded in from
 * every edge while it stays close, then the edge softened and the empty margins trimmed.
 */
async function cutOut(file, out) {
  const { data, info } = await sharp(file)
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const at = (x, y) => (y * w + x) * 4;
  // The background: the average of the edge pixels.
  let bg = [0, 0, 0];
  let n = 0;
  for (let x = 0; x < w; x++)
    for (const y of [0, h - 1]) {
      const i = at(x, y);
      bg = bg.map((v, c) => v + data[i + c]);
      n++;
    }
  for (let y = 0; y < h; y++)
    for (const x of [0, w - 1]) {
      const i = at(x, y);
      bg = bg.map((v, c) => v + data[i + c]);
      n++;
    }
  bg = bg.map((v) => v / n);
  const near = (i) => Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]) < 42;
  const mask = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    const p = y * w + x;
    if (!mask[p] && near(p * 4)) {
      mask[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  const alpha = Buffer.alloc(w * h);
  for (let p = 0; p < w * h; p++) alpha[p] = mask[p] ? 0 : 255;
  const soft = await sharp(alpha, { raw: { width: w, height: h, channels: 1 } })
    .blur(1.2)
    .extractChannel(0)
    .raw()
    .toBuffer();
  for (let p = 0; p < w * h; p++) data[p * 4 + 3] = soft[p];
  await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .trim({ threshold: 1 })
    .resize({ width: PICTURE_MAX, height: PICTURE_MAX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 88, alphaQuality: 100 })
    .toFile(out);
}

async function commonsPicture(system) {
  const source = sources.pictures[system.id];
  if (!source) return null;
  const { file, credit } = await commons(source.file);
  const out = join(OUT, system.id, 'photo.webp');
  if (source.cut) await cutOut(file, out);
  else
    await sharp(file)
      .resize({ width: PICTURE_MAX, height: PICTURE_MAX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(out);
  return { kind: source.cut ? 'cutout' : 'framed', credit };
}

const art = {};
const credits = [];
for (const system of systems) {
  mkdirSync(join(OUT, system.id), { recursive: true });
  const l = await logo(system);
  const p = (await carbonPicture(system)) ?? (await commonsPicture(system));
  art[system.id] = {
    logo: l ? 'logo.webp' : null,
    ...(l?.dark ? { logoDark: true } : {}),
    picture: p ? 'photo.webp' : null,
    ...(p ? { kind: p.kind } : {})
  };
  for (const [what, c] of [
    ['picture', p?.credit],
    ['logo', l?.credit]
  ])
    if (c)
      credits.push(
        `- **${system.fullname}** (\`${system.id}\`), ${what}: [${c.title.replace(/^File:/, '')}](${c.page}), by ${c.author}, ${c.license}.`
      );
  process.stdout.write(`${system.id}${l ? '' : ' (no logo)'}${p ? '' : ' (no picture)'}\n`);
}
writeFileSync(join(OUT, 'art.json'), JSON.stringify(art, null, 2) + '\n');
writeFileSync(
  join(OUT, 'CREDITS.md'),
  `# Where the systems' art comes from

Built by \`scripts/build-art.mjs\`.

- **Logos**, and the **console pictures** of every system not listed below: Batocera's own
  theme, [es-theme-carbon](https://github.com/batocera-linux/batocera-emulationstation) (by
  Rookervik, based on simple by Nils Bonenberger; maintained by the Batocera team), which ships
  on every Batocera box. The logos are the systems' makers' trademarks.
- **From Wikimedia Commons**, each under its own licence:

${credits.join('\n')}
`
);
console.log(`${systems.length} systems`);
