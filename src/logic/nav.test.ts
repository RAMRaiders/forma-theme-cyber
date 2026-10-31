import { describe, expect, it } from 'vitest';
import { moveGrid, moveList } from './nav.js';

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
