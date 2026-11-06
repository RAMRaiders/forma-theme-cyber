import { describe, expect, it } from 'vitest';
import { ageBand, ageRatings, pickAgeRating } from './agerating.js';

describe('age ratings', () => {
  it('reads what Forma keeps, with the age each asks for', () => {
    expect(ageRatings('ESRB:M,PEGI:18,CERO:A,USK:12,ACB:MA15+')).toEqual([
      { board: 'ESRB', rating: 'M', age: 17 },
      { board: 'PEGI', rating: '18', age: 18 },
      { board: 'CERO', rating: 'A', age: 0 },
      { board: 'USK', rating: '12', age: 12 },
      { board: 'ACB', rating: 'MA15+', age: 15 }
    ]);
    expect(ageRatings(null)).toEqual([]);
    expect(ageRatings('nonsense,:x')).toEqual([]);
  });

  it("shows the board of the game's region, else the first", () => {
    const all = ageRatings('ESRB:T,PEGI:12,CERO:B');
    expect(pickAgeRating(all, ['eu'])?.board).toBe('PEGI');
    expect(pickAgeRating(all, ['Japan', 'USA'])?.board).toBe('CERO');
    expect(pickAgeRating(all, ['de'])?.board).toBe('ESRB');
    expect(pickAgeRating([], ['us'])).toBeNull();
  });

  it('bands ages for the colour', () => {
    expect([0, 7, 12, 16, 18, null].map(ageBand)).toEqual([
      'all',
      'kids',
      'teen',
      'mature',
      'adult',
      'unknown'
    ]);
  });
});
