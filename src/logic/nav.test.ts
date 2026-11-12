import { describe, expect, it } from 'vitest';
import { loopIndex, loopPlace, moveGrid, moveHome, moveList, raceStep } from './nav.js';

describe('moveGrid', () => {
  // 10 items in 4 columns:
  //  0 1 2 3
  //  4 5 6 7
  //  8 9
  it('moves within rows and columns and stops at edges', () => {
    expect(moveGrid(5, 10, 4, 'left')).toBe(4);
    expect(moveGrid(0, 10, 4, 'left')).toBe(0);
    expect(moveGrid(9, 10, 4, 'right')).toBe(9);
    expect(moveGrid(5, 10, 4, 'up')).toBe(1);
    expect(moveGrid(1, 10, 4, 'up')).toBe(1);
    expect(moveGrid(5, 10, 4, 'down')).toBe(9);
  });

  it('lands on the last item when the row below is short', () => {
    expect(moveGrid(7, 10, 4, 'down')).toBe(9);
    expect(moveGrid(9, 10, 4, 'down')).toBe(9);
  });

  it('jumps three rows a page, and copes with empty grids', () => {
    expect(moveGrid(0, 40, 4, 'pageDown')).toBe(12);
    expect(moveGrid(12, 40, 4, 'pageUp')).toBe(0);
    expect(moveGrid(38, 40, 4, 'pageDown')).toBe(39);
    expect(moveGrid(0, 0, 4, 'down')).toBe(0);
    expect(moveGrid(2, 10, 0, 'down')).toBe(3);
  });
});

describe('a looping list', () => {
  it('shows the last items before the first, and the first after the last', () => {
    expect(loopIndex(-1, 8)).toBe(7);
    expect(loopIndex(8, 8)).toBe(0);
    expect(loopIndex(19, 8)).toBe(3);
  });

  it('steps across the ends by one place, and jumps within the list as they are', () => {
    expect(loopPlace(0, 0, 7, 8)).toBe(-1);
    expect(loopPlace(7, 7, 0, 8)).toBe(8);
    expect(loopPlace(16, 0, 1, 8)).toBe(17);
    expect(loopPlace(2, 2, 5, 8)).toBe(5);
  });
});

describe('moveList', () => {
  it('wraps on a fresh press but stops when held', () => {
    expect(moveList(0, 5, 'up', 10, false)).toBe(4);
    expect(moveList(0, 5, 'up', 10, true)).toBe(0);
    expect(moveList(4, 5, 'down', 10, false)).toBe(0);
    expect(moveList(4, 5, 'down', 10, true)).toBe(4);
    expect(moveList(2, 5, 'down', 10, true)).toBe(3);
  });

  it('jumps a page with left/right and the shoulders', () => {
    expect(moveList(3, 100, 'right', 10, false)).toBe(13);
    expect(moveList(95, 100, 'pageDown', 10, false)).toBe(99);
    expect(moveList(5, 100, 'left', 10, false)).toBe(0);
    expect(moveList(50, 100, 'pageUp', 10, false)).toBe(40);
    expect(moveList(0, 0, 'down', 10, false)).toBe(0);
  });
});

describe('Cyber’s home: categories, then a row of shortcuts', () => {
  // Seven categories in four columns (4 + 3), then four shortcuts (7 to 10).
  const move = (index: number, m: Parameters<typeof moveHome>[4]) => moveHome(index, 7, 4, 4, m);

  it('moves in the categories as a grid, and down from the last row to the shortcuts', () => {
    expect(move(1, 'down')).toBe(5);
    expect(move(3, 'down')).toBe(6);
    expect(move(4, 'down')).toBe(7);
    expect(move(6, 'down')).toBe(10);
  });

  it('moves along the shortcuts, stopping at the ends, and up to the categories', () => {
    expect(move(7, 'left')).toBe(7);
    expect(move(7, 'right')).toBe(8);
    expect(move(10, 'right')).toBe(10);
    expect(move(10, 'down')).toBe(10);
    expect(move(7, 'up')).toBe(4);
    expect(move(10, 'up')).toBe(6);
  });

  it('works with no shortcuts, as a plain grid', () => {
    expect(moveHome(6, 7, 4, 0, 'down')).toBe(6);
    expect(moveHome(3, 7, 4, 0, 'down')).toBe(6);
  });
});

describe('raceStep', () => {
  it('goes one at a time until held a second, then doubles each second, up to sixteen', () => {
    expect(raceStep(0)).toBe(1);
    expect(raceStep(999)).toBe(1);
    expect(raceStep(1000)).toBe(2);
    expect(raceStep(2000)).toBe(4);
    expect(raceStep(3500)).toBe(8);
    expect(raceStep(4000)).toBe(16);
    expect(raceStep(60_000)).toBe(16);
  });

  it('moves a list that far, stopping at its ends', () => {
    expect(moveList(10, 100, 'down', 10, true, 8)).toBe(18);
    expect(moveList(95, 100, 'down', 10, true, 8)).toBe(99);
    expect(moveList(3, 100, 'up', 10, true, 8)).toBe(0);
  });
});
