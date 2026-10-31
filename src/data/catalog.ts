import type { SystemSummary } from '@ramraiders/forma-sdk';

/** Cyber's top level. Batocera's `hardware` type decides, unless a system's info says otherwise. */
export type CategoryId =
  'consoles' | 'handhelds' | 'computers' | 'arcade' | 'virtual' | 'educational' | 'ports';

export interface Category {
  id: CategoryId;
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
  { id: 'ports', label: 'Ports & engines', tagline: 'Games rebuilt from source' }
];

const BY_HARDWARE: Record<string, CategoryId> = {
  console: 'consoles',
  portable: 'handhelds',
  computer: 'computers',
  arcade: 'arcade',
  port: 'ports',
  library: 'ports',
  virtual: 'virtual',
  educational: 'educational'
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
}

/** A system as Cyber shows it: Forma's summary, its category, and where its art lives. */
export interface CyberSystem {
  summary: SystemSummary;
  category: CategoryId;
  /** Theme-relative URLs; the files may be missing, and the UI falls back. */
  logo: string;
  photo: string;
}

function categoryOf(system: SystemSummary, info?: SystemInfo): CategoryId | null {
  if (HIDDEN.has(system.name)) return null;
  return info?.category ?? BY_HARDWARE[system.hardware ?? ''] ?? 'consoles';
}

const art = (system: string, file: string) => `./systems/${encodeURIComponent(system)}/${file}`;

function cyberSystem(summary: SystemSummary, category: CategoryId): CyberSystem {
  return {
    summary,
    category,
    logo: art(summary.name, 'logo.png'),
    photo: art(summary.name, 'photo.webp')
  };
}

/** Categories that have games, each with its systems, biggest libraries first. */
export function group(
  systems: SystemSummary[],
  infos: ReadonlyMap<string, SystemInfo>
): { category: Category; systems: CyberSystem[] }[] {
  const by = new Map<CategoryId, CyberSystem[]>();
  for (const s of systems) {
    if (s.gameCount === 0) continue;
    const id = categoryOf(s, infos.get(s.name));
    if (!id) continue;
    const list = by.get(id) ?? [];
    list.push(cyberSystem(s, id));
    by.set(id, list);
  }
  return CATEGORIES.filter((c) => by.has(c.id)).map((category) => ({
    category,
    systems: by
      .get(category.id)!
      .sort((a, b) => b.summary.gameCount - a.summary.gameCount || compareName(a, b))
  }));
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

  constructor(private readonly fetchJson: (url: string) => Promise<unknown> = defaultFetch) {}

  get(system: string): Promise<SystemInfo | null> {
    let pending = this.#cache.get(system);
    if (!pending) {
      pending = this.fetchJson(art(system, 'info.json'))
        .then((json) => (json && typeof json === 'object' ? (json as SystemInfo) : null))
        .catch(() => null);
      this.#cache.set(system, pending);
    }
    return pending;
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
