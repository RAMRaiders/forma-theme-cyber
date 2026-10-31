/** Moving a selection with a gamepad. Pure, so it is tested without a screen. */

export type Move = 'up' | 'down' | 'left' | 'right' | 'pageUp' | 'pageDown';

/** Rows a page jump covers in a grid. */
const GRID_PAGE_ROWS = 3;

/**
 * A grid of `count` items in `columns` columns. Edges stop rather than wrap: on a TV a wrap
 * reads as a jump to somewhere unrelated. Down from a row above a short last row lands on
 * the last item instead of doing nothing.
 */
export function moveGrid(index: number, count: number, columns: number, move: Move): number {
  if (count === 0) return 0;
  const last = count - 1;
  const cols = Math.max(1, columns);
  switch (move) {
    case 'left':
      return Math.max(0, index - 1);
    case 'right':
      return Math.min(last, index + 1);
    case 'up':
      return index - cols >= 0 ? index - cols : index;
    case 'down':
      if (index + cols <= last) return index + cols;
      return Math.floor(index / cols) < Math.floor(last / cols) ? last : index;
    case 'pageUp':
      return Math.max(0, index - cols * GRID_PAGE_ROWS);
    case 'pageDown':
      return Math.min(last, index + cols * GRID_PAGE_ROWS);
  }
}

/**
 * A vertical list. Up from the top wraps to the bottom (and back), as EmulationStation does,
 * but only on a fresh press: a held direction stops at the end instead of racing round.
 * Left/right jump a page, like the shoulder buttons.
 */
export function moveList(
  index: number,
  count: number,
  move: Move,
  pageSize: number,
  repeat: boolean
): number {
  if (count === 0) return 0;
  const last = count - 1;
  switch (move) {
    case 'up':
      if (index > 0) return index - 1;
      return repeat ? 0 : last;
    case 'down':
      if (index < last) return index + 1;
      return repeat ? last : 0;
    case 'left':
    case 'pageUp':
      return Math.max(0, index - pageSize);
    case 'right':
    case 'pageDown':
      return Math.min(last, index + pageSize);
  }
}
