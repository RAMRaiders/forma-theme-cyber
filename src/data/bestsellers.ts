import type { Game, MediaKind } from '@ramraiders/forma-sdk';

/** A best-selling game the user has, with its box art. */
export interface Bestseller {
  name: string;
  art: string;
}

/** What the lookup needs from Forma: a search, and a small copy of a game's picture. */
export interface Lookup {
  search: (query: string, limit?: number) => Promise<Game[]>;
  mediaUrl: (gameId: number, kind: MediaKind, width?: number) => string;
}

/** The art is shown small: a resized copy, never the full-size box. */
const ART_WIDTH = 200;
/** How many are shown. */
const SHOWN = 3;
/** Search results to look through for one title: "Tetris" is on many systems. */
const SEARCH_LIMIT = 300;

/**
 * A title as it compares: no accents, case, punctuation, region tags, "The" or "Version", so
 * "Pokémon : Red Version (USA)" is "pokemon red".
 */
export function normalise(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|version)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The best sellers (`bestsellers` in a system's info.json, best first; `A|B` for other titles
 * of the same game) that the user has on this system and that have art, at most three.
 */
export async function findBestsellers(
  lookup: Lookup,
  system: string,
  titles: string[]
): Promise<Bestseller[]> {
  const found: Bestseller[] = [];
  for (const title of titles) {
    if (found.length === SHOWN) break;
    for (const alias of title.split('|').map(normalise)) {
      if (!alias) continue;
      const games = await lookup.search(alias, SEARCH_LIMIT).catch(() => []);
      const game = games.find(
        (g) =>
          g.system === system &&
          !g.hidden &&
          (g.media.thumbnail || g.media.image) &&
          normalise(g.name) === alias
      );
      if (!game) continue;
      const kind: MediaKind = game.media.thumbnail ? 'thumbnail' : 'image';
      found.push({ name: game.name, art: lookup.mediaUrl(game.id, kind, ART_WIDTH) });
      break;
    }
  }
  return found;
}

/** Each system's best sellers, looked up once (until the library changes). */
export class BestsellerStore {
  readonly #cache = new Map<string, Promise<Bestseller[]>>();
  readonly #found = new Map<string, Bestseller[]>();

  constructor(private readonly lookup: Lookup) {}

  /** What a system's lookup found, if it has finished. */
  peek(system: string): Bestseller[] | undefined {
    return this.#found.get(system);
  }

  get(system: string, titles: string[] | undefined): Promise<Bestseller[]> {
    if (!titles?.length) return Promise.resolve([]);
    let found = this.#cache.get(system);
    if (!found) {
      found = findBestsellers(this.lookup, system, titles).then((best) => {
        this.#found.set(system, best);
        return best;
      });
      this.#cache.set(system, found);
    }
    return found;
  }

  clear(): void {
    this.#cache.clear();
    this.#found.clear();
  }
}
