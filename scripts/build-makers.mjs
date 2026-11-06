#!/usr/bin/env node
/**
 * Builds companies' logos from Wikimedia Commons: the makers' for Cyber's systems screen
 * (scripts/makers.json says which), or with `--set=companies` the game developers' and
 * publishers' for the Collector view (scripts/companies.json). Into public/<set>/: `<id>.webp`,
 * `<set>.json` (each one's pattern and logo) and CREDITS.md. A logo in black or near it is made
 * white, Cyber being dark.
 *
 *   node scripts/build-makers.mjs [--set=makers|companies] [cache dir]
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const SET = args.find((a) => a.startsWith('--set='))?.slice(6) ?? 'makers';
const OUT = join(ROOT, 'public', SET);
const UA = 'FormaCyberArt/1.0 (https://github.com/RAMRaiders/forma-theme-cyber)';
/** Twice the height the byline shows them at 1080p. */
const HEIGHT = 96;
const [cache = join(ROOT, 'node_modules', '.cache', 'cyber-art')] = args.filter(
  (a) => !a.startsWith('--')
);
mkdirSync(cache, { recursive: true });
mkdirSync(OUT, { recursive: true });

const { [SET]: makers } = JSON.parse(readFileSync(join(ROOT, 'scripts', `${SET}.json`), 'utf8'));

async function commons(title) {
  const url =
    'https://commons.wikimedia.org/w/api.php?' +
    new URLSearchParams({
      action: 'query',
      titles: `File:${title}`,
      prop: 'imageinfo',
      iiprop: 'url|extmetadata',
      format: 'json'
    });
  const page = Object.values(
    (await (await fetch(url, { headers: { 'User-Agent': UA } })).json()).query.pages
  )[0];
  const info = page.imageinfo[0];
  const meta = info.extmetadata ?? {};
  const text = (k) => (meta[k]?.value ?? '').replace(/<[^>]+>/g, '').trim();
  const cached = join(cache, `maker-${title.replace(/[^\w.-]/g, '_')}`);
  if (!existsSync(cached)) {
    let res = await fetch(info.url, { headers: { 'User-Agent': UA } });
    // Commons asks to slow down now and then: wait, and try again.
    for (let wait = 5000; res.status === 429 && wait <= 40000; wait *= 2) {
      await new Promise((r) => setTimeout(r, wait));
      res = await fetch(info.url, { headers: { 'User-Agent': UA } });
    }
    if (!res.ok) throw new Error(`${title}: ${res.status}`);
    writeFileSync(cached, Buffer.from(await res.arrayBuffer()));
    await new Promise((r) => setTimeout(r, 400));
  }
  return {
    file: cached,
    credit: {
      title: page.title,
      page: info.descriptionurl,
      author: text('Artist') || 'unknown',
      license: text('LicenseShortName') || 'see page'
    }
  };
}

/**
 * How bright the logo's opaque pixels look on average (relative luminance, 0–1), and how much
 * of the picture is opaque: a logo on a box of its own is nearly all.
 */
async function looks(png) {
  const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  let sum = 0;
  let n = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    sum += 0.2126 * lin(data[i]) + 0.7152 * lin(data[i + 1]) + 0.0722 * lin(data[i + 2]);
    n++;
  }
  return { luminance: n ? sum / n : 1, opaque: n / (data.length / 4) };
}

/** `png` with the pixels `which` picks made white, their transparency kept. */
async function whiten(png, which) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] > 0 && which(data[i], data[i + 1], data[i + 2])) {
      data[i] = data[i + 1] = data[i + 2] = 255;
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

const out = [];
const credits = [];
for (const maker of makers) {
  const { file, credit } = await commons(maker.file);
  const meta = await sharp(file).metadata();
  const density = Math.min(
    2400,
    Math.max(72, Math.ceil((72 * HEIGHT * 2) / (meta.height || HEIGHT)))
  );
  let png = await sharp(file, { density })
    .resize({ height: HEIGHT, fit: 'inside' })
    .trim()
    .png()
    .toBuffer();
  // Cut out (not on a box of its own): its black and dark grey made white, Cyber being dark;
  // its colours kept, unless they are too dark to see as well.
  let dark = false;
  if ((await looks(png)).opaque < 0.85) {
    png = await whiten(png, (r, g, b) => {
      const max = Math.max(r, g, b);
      return max < 90 && max - Math.min(r, g, b) < 40;
    });
    if ((await looks(png)).luminance < 0.06) {
      png = await whiten(png, () => true);
      dark = true;
    }
  }
  await sharp(png)
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(join(OUT, `${maker.id}.webp`));
  out.push({ id: maker.id, match: maker.match, logo: `${maker.id}.webp` });
  credits.push(
    `- **${maker.id}**: [${credit.title.replace(/^File:/, '')}](${credit.page}), by ${credit.author}, ${credit.license}${dark ? ' (made white)' : ''}.`
  );
  process.stdout.write(`${maker.id}${dark ? ' (made white)' : ''}\n`);
}
writeFileSync(join(OUT, `${SET}.json`), JSON.stringify(out, null, 2) + '\n');
writeFileSync(
  join(OUT, 'CREDITS.md'),
  `# Where the ${SET}' logos come from\n\nAll from Wikimedia Commons; built by scripts/build-makers.mjs${SET === 'makers' ? '' : ` --set=${SET}`}.\n\n${credits.join('\n')}\n`
);
