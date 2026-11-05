import type { SystemSummary } from '@ramraiders/forma-sdk';

/** Cyber's top level. Batocera's `hardware` type decides, unless a system's info says otherwise. */
export type CategoryId =
  'consoles' | 'handhelds' | 'computers' | 'arcade' | 'virtual' | 'educational' | 'engines';

export interface Category {
  /** A category; `all`: the tile after them, for every game; `magazines`: Forma's reader. */
  id: CategoryId | 'all' | 'magazines';
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
  { id: 'engines', label: 'Engines', tagline: 'Runtimes, ports and recompiled classics' }
];

const BY_HARDWARE: Record<string, CategoryId> = {
  console: 'consoles',
  portable: 'handhelds',
  computer: 'computers',
  arcade: 'arcade',
  port: 'engines',
  library: 'engines',
  virtual: 'virtual',
  educational: 'educational'
};

/**
 * Systems Batocera types as `port` (or not at all) that Cyber files elsewhere, so they land right
 * even without an info.json. Batocera's `port` covers both one game rebuilt natively (a
 * decompilation, recompilation or source port) and runtimes that play whole libraries made with
 * them: Cyber's "Engines" holds both, each still its own system.
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
  /** `ports`: Cyber's old category for rebuilt games, now part of Engines. */
  category?: CategoryId | 'ports';
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
  /**
   * `classics` where no sales figures are known: well-known games instead (the ones most rated
   * on the LaunchBox Games Database, or picked by hand), shown as such, not as best sellers.
   */
  bestsellersBy?: 'sales' | 'classics';
}

/** What art a system has (public/systems/art.json, built by scripts/build-art.mjs). */
export interface SystemArt {
  logo: string | null;
  /** The logo is too dark for Cyber's background on its own: it gets a light halo. */
  logoDark?: boolean;
  picture: string | null;
  /** `cutout`: on a transparent background, stood on the stage; `framed`: a photo, in a frame. */
  kind?: 'cutout' | 'framed';
  /** The colours of its logo, in colour: hues in degrees, the main one first. */
  hues?: number[];
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
  /** Its logo's hues, main first; none for a logo in black, white or grey. */
  hues: number[];
}

function categoryOf(system: SystemSummary, info?: SystemInfo): CategoryId | null {
  if (HIDDEN.has(system.name)) return null;
  const own = info?.category === 'ports' ? 'engines' : info?.category;
  return own ?? BY_SYSTEM[system.name] ?? BY_HARDWARE[system.hardware ?? ''] ?? 'consoles';
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
    photoKind: own?.kind ?? 'cutout',
    hues: own?.hues ?? []
  };
}

/** Categories that have games, each with its systems in the order Forma lists them (its setting). */
export function group(
  systems: SystemSummary[],
  infos: ReadonlyMap<string, SystemInfo>,
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
    systems: by.get(category.id)!
  }));
}

/** The tile after All games: Forma's magazine reader. */
export const MAGAZINES: Category = {
  id: 'magazines',
  label: 'Magazines',
  tagline: 'The classics, scanned'
};

/** The tile after the categories: every system, the biggest first, for its picture and logos. */
export const ALL_GAMES: Category = {
  id: 'all',
  label: 'All games',
  tagline: 'Every game, A to Z'
};

/** Every system with games, in the order Forma lists them (`order`, its setting). */
export function allGames(
  groups: { systems: CyberSystem[] }[],
  order: readonly SystemSummary[]
): {
  category: Category;
  systems: CyberSystem[];
} {
  const at = new Map(order.map((s, n) => [s.name, n]));
  return {
    category: ALL_GAMES,
    systems: groups
      .flatMap((g) => g.systems)
      .sort((a, b) => (at.get(a.summary.name) ?? 0) - (at.get(b.summary.name) ?? 0))
  };
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
