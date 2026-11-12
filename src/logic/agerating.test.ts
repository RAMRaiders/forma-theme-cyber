import { describe, expect, it } from 'vitest';
import { ageRatings, asPegi } from './agerating.js';

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

  it('gives the rating as PEGI: its own, else the nearest from another board', () => {
    expect(asPegi(ageRatings('ESRB:M,PEGI:18'))).toEqual({ age: 18, from: null });
    expect(asPegi(ageRatings('ESRB:E'))).toEqual({
      age: 3,
      from: { board: 'ESRB', rating: 'E', age: 0 }
    });
    expect(asPegi(ageRatings('ESRB:T'))?.age).toBe(12);
    expect(asPegi(ageRatings('ESRB:E10+'))?.age).toBe(7);
    expect(asPegi(ageRatings('CERO:C'))?.age).toBe(16);
    expect(asPegi(ageRatings('USK:6'))?.age).toBe(7);
    expect(asPegi(ageRatings('CERO:Z'))?.age).toBe(18);
    expect(asPegi(ageRatings('XYZ:odd'))).toBeNull();
    expect(asPegi([])).toBeNull();
  });
});

describe('ESRB Kids to Adults', () => {
  it('is read as scrapers write it, KA or K-A (BC Racers on 32X)', () => {
    for (const value of ['ESRB:KA', 'ESRB:K-A']) {
      expect(ageRatings(value)[0]?.age).toBe(0);
      expect(asPegi(ageRatings(value))?.age).toBe(3);
    }
  });
});
