/**
 * A game's age ratings, as Forma keeps them (`ESRB:M,PEGI:18`): which to show, and how old a
 * player it asks for. The badge is Cyber's own, not a board's logo.
 */

export interface AgeRating {
  board: string;
  rating: string;
  /** The youngest player it is for, 0 for everyone; null where the rating is not known. */
  age: number | null;
}

/** Each board's ratings to the age they ask for. Numeric ratings (PEGI 12, USK 16) are ages. */
const AGES: Record<string, Record<string, number>> = {
  ESRB: { EC: 3, E: 0, 'K-A': 0, E10: 10, 'E10+': 10, T: 13, M: 17, AO: 18 },
  CERO: { A: 0, ALL: 0, B: 12, C: 15, D: 17, Z: 18 },
  ACB: { G: 0, PG: 8, M: 15, MA15: 15, 'MA15+': 15, R18: 18, 'R18+': 18 },
  GRAC: { ALL: 0 },
  CLASSIND: { L: 0, ER: 0 },
  BBFC: { U: 0, PG: 8, '12A': 12 }
};

/** Boards by the regions that use them, to show the one for where the game is from. */
const BY_REGION: Record<string, string> = {
  us: 'ESRB',
  usa: 'ESRB',
  ca: 'ESRB',
  eu: 'PEGI',
  europe: 'PEGI',
  uk: 'PEGI',
  fr: 'PEGI',
  es: 'PEGI',
  it: 'PEGI',
  nl: 'PEGI',
  se: 'PEGI',
  pt: 'PEGI',
  dk: 'PEGI',
  fi: 'PEGI',
  no: 'PEGI',
  be: 'PEGI',
  ch: 'PEGI',
  at: 'PEGI',
  gr: 'PEGI',
  pl: 'PEGI',
  de: 'USK',
  germany: 'USK',
  jp: 'CERO',
  japan: 'CERO',
  au: 'ACB',
  australia: 'ACB',
  kr: 'GRAC',
  korea: 'GRAC',
  br: 'CLASSIND',
  brazil: 'CLASSIND'
};

/** `ESRB:M,PEGI:18` as ratings, in the order given; nothing for an empty or odd value. */
export function ageRatings(value: string | null | undefined): AgeRating[] {
  return (value ?? '')
    .split(',')
    .map((part) => part.split(':').map((s) => s.trim().toUpperCase()))
    .filter((p): p is [string, string] => p.length === 2 && !!p[0] && !!p[1])
    .map(([board, rating]) => ({ board, rating, age: ageOf(board, rating) }));
}

function ageOf(board: string, rating: string): number | null {
  const known = AGES[board]?.[rating];
  if (known !== undefined) return known;
  const n = /^(\d{1,2})\+?$/.exec(rating);
  return n ? Number(n[1]) : null;
}

/** The rating to show: the board of the game's own region where it has one, else the first. */
export function pickAgeRating(ratings: AgeRating[], regions: readonly string[]): AgeRating | null {
  for (const region of regions) {
    const board = BY_REGION[region.toLowerCase()];
    const found = ratings.find((r) => r.board === board);
    if (found) return found;
  }
  return ratings[0] ?? null;
}

/** How strict the rating is, for its colour: all, kids, teen, mature or adult. */
export function ageBand(
  age: number | null
): 'all' | 'kids' | 'teen' | 'mature' | 'adult' | 'unknown' {
  if (age === null) return 'unknown';
  if (age <= 3) return 'all';
  if (age <= 10) return 'kids';
  if (age <= 14) return 'teen';
  if (age <= 16) return 'mature';
  return 'adult';
}
