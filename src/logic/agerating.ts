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

/** PEGI's ages, the youngest first. */
const PEGI_AGES = [3, 7, 12, 16, 18];
/** ESRB's ratings as PEGI's nearest. */
const ESRB_AS_PEGI: Record<string, number> = {
  EC: 3,
  E: 3,
  'K-A': 3,
  E10: 7,
  'E10+': 7,
  T: 12,
  M: 16,
  AO: 18
};

/**
 * The rating as PEGI gives it: the game's own PEGI rating where it has one; else its first
 * known rating as PEGI's nearest age (ESRB by its own table, the others by the age they ask for:
 * the youngest PEGI age at or over it). `from`: the rating it was worked out from, if any.
 */
export function asPegi(ratings: AgeRating[]): { age: number; from: AgeRating | null } | null {
  const own = ratings.find((r) => r.board === 'PEGI' && r.age !== null);
  if (own) return { age: own.age!, from: null };
  for (const r of ratings) {
    const esrb = r.board === 'ESRB' ? ESRB_AS_PEGI[r.rating] : undefined;
    if (esrb !== undefined) return { age: esrb, from: r };
    if (r.age !== null) {
      return { age: PEGI_AGES.find((a) => a >= r.age!) ?? 18, from: r };
    }
  }
  return null;
}
