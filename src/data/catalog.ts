import type { SystemSummary } from '@ramraiders/forma-sdk';

/** Cyber's top level. Batocera's `hardware` type decides, unless a system's info says otherwise. */
export type CategoryId =
  | 'consoles'
  | 'handhelds'
  | 'computers'
  | 'arcade'
  | 'virtual'
  | 'educational'
  | 'ports'
  | 'engines';

export interface Category {
  /** A category, or `all`: the tile after them, for every game. */
  id: CategoryId | 'all';
  label: string;
  tagline: string;
}

/** In the order the home screen shows them. */
export const CATEGORIES: readonly Category[] = [
  { id: 'consoles', label: 'Consoles', tagline: 'Plugged into the living-room TV' },
  { id: 'handhelds', label: 'Handhelds', tagline: 'Batteries included' },
  { id: 'computers', label: 'Computers', tagline: 'Keyboards, tapes and floppies' },
  { id: 'arcade', label: 'Arcade', tagline: 'Insert coin' },
  { id: 'virtual', label: 'Virtual & homebrew', tagline: 'Consoles that never needed a factory' },
  { id: 'educational', label: 'Educational', tagline: 'Learning machines' },
  { id: 'ports', label: 'Recompiled & ports', tagline: 'Classics rebuilt to run natively' },
  { id: 'engines', label: 'Engines', tagline: 'Runtimes that play whole libraries' }
];

const BY_HARDWARE: Record<string, CategoryId> = {
  console: 'consoles',
  portable: 'handhelds',
  computer: 'computers',
  arcade: 'arcade',
  port: 'ports',
  library: 'engines',
  virtual: 'virtual',
  educational: 'educational'
};

/**
 * Systems Batocera types as `port` (or not at all) that Cyber files elsewhere, so they land right
 * even without an info.json. Batocera's `port` covers both one game rebuilt natively (a
 * decompilation, recompilation or source port: Cyber's "Recompiled & ports") and runtimes that
 * play whole libraries made with them (Cyber's "Engines").
 */
const BY_SYSTEM: Record<string, CategoryId> = {
  scummvm: 'engines',
  openbor: 'engines',
  solarus: 'engines',
  pygame: 'engines',
  easyrpg: 'engines',
  lutro: 'engines',
  flash: 'engines',
  pico8: 'virtual',
  tic80: 'virtual',
  wasm4: 'virtual',
  lowresnx: 'virtual',
  uzebox: 'virtual'
};

/** Batocera folders that are tools, not games. */
const HIDDEN = new Set(['imageviewer', 'moonlight', 'flatpak', 'steam', 'odcommander']);

export interface SystemInfo {
  name?: string;
  category?: CategoryId;
  description?: string;
  specs?: Partial<
    Record<
      'maker' | 'released' | 'cpu' | 'memory' | 'graphics' | 'sound' | 'media' | 'unitsSold',
      string
    >
  > &
    Record<string, string>;
  chips?: { role: string; part: string }[];
  curiosities?: string[];
  /** Its best-selling games, best first; `A|B` for other titles of the same game. */
  bestsellers?: string[];
}

/** What art a system has (public/systems/art.json, built by scripts/build-art.mjs). */
export interface SystemArt {
  logo: string | null;
  /** The logo is too dark for Cyber's background on its own: it gets a light halo. */
  logoDark?: boolean;
  picture: string | null;
  /** `cutout`: on a transparent background, stood on the stage; `framed`: a photo, in a frame. */
  kind?: 'cutout' | 'framed';
}

/** A system as Cyber shows it: Forma's summary, its category, and its art. */
export interface CyberSystem {
  summary: SystemSummary;
  category: CategoryId;
  /** Theme-relative URLs, or `null` where there is none: the UI falls back. */
  logo: string | null;
  /** The same logo, small (96 px high): for the rail, the tiles and headings. */
  logoSmall: string | null;
  logoDark: boolean;
  photo: string | null;
  photoKind: 'cutout' | 'framed';
}

function categoryOf(system: SystemSummary, info?: SystemInfo): CategoryId | null {
  if (HIDDEN.has(system.name)) return null;
  return (
    info?.category ?? BY_SYSTEM[system.name] ?? BY_HARDWARE[system.hardware ?? ''] ?? 'consoles'
  );
}

const art = (system: string, file: string) => `./systems/${encodeURIComponent(system)}/${file}`;

function cyberSystem(
  summary: SystemSummary,
  category: CategoryId,
  own: SystemArt | undefined
): CyberSystem {
  return {
    summary,
    category,
    logo: own?.logo ? art(summary.name, own.logo) : null,
    logoSmall: own?.logo ? art(summary.name, own.logo.replace(/\.webp$/, '-small.webp')) : null,
    logoDark: own?.logoDark ?? false,
    photo: own?.picture ? art(summary.name, own.picture) : null,
    photoKind: own?.kind ?? 'cutout'
  };
}

export type SystemsSort = 'games' | 'name' | 'year' | 'maker';

const SORTS: Record<SystemsSort, (a: CyberSystem, b: CyberSystem) => number> = {
  games: (a, b) => b.summary.gameCount - a.summary.gameCount || compareName(a, b),
  name: compareName,
  // Oldest first; a system without a year goes last.
  year: (a, b) =>
    (a.summary.releaseYear ?? 9999) - (b.summary.releaseYear ?? 9999) || compareName(a, b),
  maker: (a, b) =>
    (a.summary.manufacturer ?? '\uffff').localeCompare(b.summary.manufacturer ?? '\uffff') ||
    (a.summary.releaseYear ?? 9999) - (b.summary.releaseYear ?? 9999) ||
    compareName(a, b)
};

/** Categories that have games, each with its systems in `sort` order (biggest libraries first). */
export function group(
  systems: SystemSummary[],
  infos: ReadonlyMap<string, SystemInfo>,
  sort: SystemsSort = 'games',
  arts: Readonly<Record<string, SystemArt>> = {}
): { category: Category; systems: CyberSystem[] }[] {
  const by = new Map<Category['id'], CyberSystem[]>();
  for (const s of systems) {
    if (s.gameCount === 0) continue;
    const id = categoryOf(s, infos.get(s.name));
    if (!id) continue;
    const list = by.get(id) ?? [];
    list.push(cyberSystem(s, id, arts[s.name]));
    by.set(id, list);
  }
  return CATEGORIES.filter((c) => by.has(c.id)).map((category) => ({
    category,
    systems: by.get(category.id)!.sort(SORTS[sort])
  }));
}

/** The tile after the categories: every system, the biggest first, for its picture and logos. */
export const ALL_GAMES: Category = {
  id: 'all',
  label: 'All games',
  tagline: 'Every game, A to Z'
};

export function allGames(groups: { systems: CyberSystem[] }[]): {
  category: Category;
  systems: CyberSystem[];
} {
  return {
    category: ALL_GAMES,
    systems: groups
      .flatMap((g) => g.systems)
      .sort((a, b) => b.summary.gameCount - a.summary.gameCount)
  };
}

function compareName(a: CyberSystem, b: CyberSystem): number {
  return (a.summary.fullname || a.summary.name).localeCompare(b.summary.fullname || b.summary.name);
}

/**
 * Each system's `info.json`, fetched once. A system without one (another box can have systems
 * Cyber has never heard of) is shown from Forma's data alone.
 */
export class InfoStore {
  readonly #cache = new Map<string, Promise<SystemInfo | null>>();
  readonly #loaded = new Map<string, SystemInfo | null>();
  #art: Promise<Record<string, SystemArt>> | null = null;

  constructor(private readonly fetchJson: (url: string) => Promise<unknown> = defaultFetch) {}

  get(system: string): Promise<SystemInfo | null> {
    let pending = this.#cache.get(system);
    if (!pending) {
      pending = this.fetchJson(art(system, 'info.json'))
        .then((json) => (json && typeof json === 'object' ? (json as SystemInfo) : null))
        .catch(() => null)
        .then((info) => {
          this.#loaded.set(system, info);
          return info;
        });
      this.#cache.set(system, pending);
    }
    return pending;
  }

  /** A system's info if it has already loaded (`null`: it has none), else `undefined`. */
  peek(system: string): SystemInfo | null | undefined {
    return this.#loaded.get(system);
  }

  /** Every system's art, from art.json, fetched once; none if it cannot be read. */
  art(): Promise<Record<string, SystemArt>> {
    this.#art ??= this.fetchJson('./systems/art.json')
      .then((json) => (json && typeof json === 'object' ? (json as Record<string, SystemArt>) : {}))
      .catch(() => ({}));
    return this.#art;
  }

  /** Infos for many systems at once, for grouping. */
  async all(systems: string[]): Promise<Map<string, SystemInfo>> {
    const out = new Map<string, SystemInfo>();
    await Promise.all(
      systems.map(async (s) => {
        const info = await this.get(s);
        if (info) out.set(s, info);
      })
    );
    return out;
  }
}

async function defaultFetch(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}
