/**
 * What a ROM's file name says about it, as the naming conventions put it in brackets: No-Intro
 * and Redump (`Chrono Trigger (USA) (Rev 1).sfc`, `(Europe) (En,Fr,De)`) and GoodTools
 * (`(U) [!]`, `(JUE)`). Regions as Cyber's region codes, languages as two-letter codes.
 */
export interface RomName {
  regions: string[];
  languages: string[];
  /** `Rev 1`, `v1.1`, `Beta`, `Proto`…; `null` when the name gives none. */
  version: string | null;
  /** What kind of copy it is: `Unl`, `Aftermarket`, `Hack`, `Translation`…; `null` for none. */
  status: string | null;
}

/** No-Intro's region words. */
const REGION_WORDS: Record<string, string> = {
  world: 'wor',
  usa: 'us',
  europe: 'eu',
  japan: 'jp',
  uk: 'uk',
  'united kingdom': 'uk',
  france: 'fr',
  germany: 'de',
  spain: 'es',
  italy: 'it',
  netherlands: 'nl',
  sweden: 'se',
  brazil: 'br',
  korea: 'kr',
  china: 'cn',
  taiwan: 'tw',
  'hong kong': 'hk',
  australia: 'au',
  canada: 'ca',
  asia: 'asi',
  portugal: 'pt',
  russia: 'ru',
  poland: 'pl',
  denmark: 'dk',
  finland: 'fi',
  norway: 'no',
  belgium: 'be',
  switzerland: 'ch',
  austria: 'at',
  greece: 'gr',
  scandinavia: 'se'
};

/** GoodTools' one-letter regions, which may come together: `(JUE)`. */
const REGION_LETTERS: Record<string, string> = {
  W: 'wor',
  U: 'us',
  E: 'eu',
  J: 'jp',
  F: 'fr',
  G: 'de',
  S: 'es',
  I: 'it',
  K: 'kr',
  B: 'br',
  A: 'au',
  C: 'cn',
  H: 'nl',
  D: 'nl',
  SW: 'se',
  UK: 'uk'
};

/** `En`, `Pt-BR`, `Zh-Hant`; not `Re-release`. */
const LANGUAGE = /^[A-Z][a-z](-([A-Z]{2}|[A-Z][a-z]+))?$/;
/** Brazilian Portuguese stands apart, with its own flag; every other language by its first two. */
const languageCode = (tag: string) => {
  const code = tag.toLowerCase();
  return code === 'pt-br' ? code : code.slice(0, 2);
};
const VERSION =
  /^(rev\s*[\w.]+|v\s?\d[\w.]*|alpha(\s*\d+)?|beta(\s*\d+)?|proto(type)?(\s*\d+)?|demo(\s*\d+)?|sample|kiosk|promo|debug|alt(\s*\d+)?)$/i;
const STATUS = /^(unl|unlicensed|pirate|bootleg|aftermarket|homebrew|hack)$/i;

/** GoodTools' square brackets, those that say a copy is not the official release. */
const BRACKETS: [RegExp, string][] = [
  [/^h(\d|[A-Z])/, 'Hack'],
  [/^p\d*$/, 'Pirate']
];

/** A fan translation and the language it is into: `T-En by Someone`, `T+Por1.0`, `Translated En`. */
const TRANSLATED = /^(?:Translated\s+|T[-+])([A-Za-z]{2,3})(?![a-z])/;
/** GoodTools' three-letter languages. */
const GOODTOOLS_LANGUAGES: Record<string, string> = {
  eng: 'en',
  fre: 'fr',
  ger: 'de',
  spa: 'es',
  ita: 'it',
  por: 'pt',
  bra: 'pt-br',
  dut: 'nl',
  swe: 'sv',
  pol: 'pl',
  rus: 'ru',
  jap: 'ja',
  kor: 'ko',
  chi: 'zh',
  gre: 'el'
};

/** The language `group` says the copy was translated into: `''` if unknown, `null` if it is not one. */
function translatedInto(group: string): string | null {
  const tag = TRANSLATED.exec(group.trim())?.[1]?.toLowerCase();
  if (!tag) return null;
  return tag.length === 2 ? tag : (GOODTOOLS_LANGUAGES[tag] ?? '');
}

/**
 * Who made a fan translation's patch, as its name credits them: `Twilight Translations v1.0`
 * from `[T-En by Twilight Translations v1.0]`; `null` when it credits no one.
 */
export function patchBy(path: string): string | null {
  const file = path.split('/').pop() ?? path;
  for (const [, group = ''] of file.matchAll(/[([]([^()[\]]*)[)\]]/g)) {
    if (translatedInto(group) === null) continue;
    const by = /\bby\s+(.+)$/i.exec(group.trim())?.[1]?.trim();
    if (by) return by;
  }
  return null;
}

export function romName(path: string): RomName {
  const file = path.split('/').pop() ?? path;
  const regions: string[] = [];
  const languages: string[] = [];
  const versions: string[] = [];
  const statuses: string[] = [];
  const translation = (language: string) => {
    if (language) languages.push(language);
    statuses.push('Translation');
  };
  for (const [, group = ''] of file.matchAll(/\(([^()]*)\)/g)) {
    const into = translatedInto(group);
    if (into !== null) {
      translation(into);
      continue;
    }
    const parts = group.split(',').map((p) => p.trim());
    const asRegions = parts.map((p) => REGION_WORDS[p.toLowerCase()]);
    if (asRegions.every((r) => r)) {
      regions.push(...(asRegions as string[]));
      continue;
    }
    if (parts.every((p) => LANGUAGE.test(p))) {
      languages.push(...parts.map(languageCode));
      continue;
    }
    if (VERSION.test(group.trim())) {
      versions.push(group.trim());
      continue;
    }
    if (STATUS.test(group.trim())) {
      statuses.push(group.trim());
      continue;
    }
    // GoodTools: one region (`U`, `UK`) or letters together (`JUE`).
    if (/^[A-Z]{1,3}$/.test(group)) {
      const one = REGION_LETTERS[group];
      const each = one ? [one] : [...group].map((l) => REGION_LETTERS[l]);
      if (each.every((r) => r)) regions.push(...(each as string[]));
    }
  }
  for (const [, group = ''] of file.matchAll(/\[([^[\]]*)\]/g)) {
    const into = translatedInto(group);
    if (into !== null) {
      translation(into);
      continue;
    }
    const found = BRACKETS.find(([tag]) => tag.test(group.trim()));
    if (found) statuses.push(found[1]);
  }
  return {
    regions: [...new Set(regions)],
    languages: [...new Set(languages)],
    version: versions.length ? [...new Set(versions)].join(' · ') : null,
    status: statuses.length ? [...new Set(statuses)].join(' · ') : null
  };
}

/** The flag file (in public/flags) for a region code or a language code; `null` for none. */
const REGION_FLAGS: Record<string, string> = { uk: 'gb', wor: '', asi: '' };
const LANGUAGE_FLAGS: Record<string, string> = {
  en: 'gb',
  fr: 'fr',
  de: 'de',
  es: 'es',
  it: 'it',
  pt: 'pt',
  'pt-br': 'br',
  nl: 'nl',
  sv: 'se',
  da: 'dk',
  fi: 'fi',
  no: 'no',
  pl: 'pl',
  ru: 'ru',
  ja: 'jp',
  ko: 'kr',
  zh: 'cn',
  el: 'gr'
};
const FLAGS = new Set(
  'us eu jp gb fr de es it nl se br kr cn tw hk au ca pt ru pl dk fi no be ch at gr'.split(' ')
);

/** Regions as they are flagged: a World copy shows the three the consoles were sold in. */
export function flaggedRegions(regions: string[]): string[] {
  return [...new Set(regions.flatMap((r) => (r === 'wor' ? ['jp', 'us', 'eu'] : [r])))];
}

export function regionFlag(code: string): string | null {
  const c = code.toLowerCase();
  const file = REGION_FLAGS[c] ?? c;
  return FLAGS.has(file) ? `./flags/${file}.svg` : null;
}

export function languageFlag(code: string): string | null {
  const file = LANGUAGE_FLAGS[code.toLowerCase()];
  return file && FLAGS.has(file) ? `./flags/${file}.svg` : null;
}

/** What a catalogue (No-Intro, Redump) calls a game's file, once Forma has matched it. */
export interface Catalogued {
  path: string;
  dump?: { status: string; name: string | null } | null;
}

/**
 * A game's tags, from the best source first: the catalogue's name when Forma matched its file to
 * a No-Intro or Redump entry (it is the dump's own name, whatever the file is called), then the
 * file's name for what that leaves out. Matched, its version and status are the catalogue's
 * alone: none there means the original release, whatever the file says.
 */
export function gameTags(game: Catalogued): RomName & { fromCatalogue: boolean } {
  const file = romName(game.path);
  const name = game.dump && game.dump.status !== 'notCatalogued' ? game.dump.name : null;
  if (!name) return { ...file, fromCatalogue: false };
  const listed = romName(name);
  return {
    regions: listed.regions.length ? listed.regions : file.regions,
    languages: listed.languages.length ? listed.languages : file.languages,
    version: listed.version,
    status: listed.status,
    fromCatalogue: true
  };
}
