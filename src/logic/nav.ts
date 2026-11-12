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
 * Left/right jump a page, like the shoulder buttons. Up and down go `by` at a time (a held
 * direction racing, see {@link raceStep}).
 */
export function moveList(
  index: number,
  count: number,
  move: Move,
  pageSize: number,
  repeat: boolean,
  by = 1
): number {
  if (count === 0) return 0;
  const last = count - 1;
  switch (move) {
    case 'up':
      if (index > 0) return Math.max(0, index - by);
      return repeat ? 0 : last;
    case 'down':
      if (index < last) return Math.min(last, index + by);
      return repeat ? last : 0;
    case 'left':
    case 'pageUp':
      return Math.max(0, index - pageSize);
    case 'right':
    case 'pageDown':
      return Math.min(last, index + pageSize);
  }
}

/** Which item of `total` a place on a looping list's endless track shows. */
export function loopIndex(place: number, total: number): number {
  return ((place % total) + total) % total;
}

/** A looping list's place after moving from item `from` to item `to`, the short way round. */
export function loopPlace(place: number, from: number, to: number, total: number): number {
  const step = to - from;
  return place + (Math.abs(step) * 2 > total ? step - Math.sign(step) * total : step);
}

/**
 * Cyber's home: a grid of `count` categories in `columns` columns, then one row of `shortcuts`
 * under it (favourites and the like), all in one index: the shortcuts follow the categories.
 * Down from the categories' last row reaches the shortcut below; up from a shortcut, the
 * category above it. Edges stop.
 */
export function moveHome(
  index: number,
  count: number,
  columns: number,
  shortcuts: number,
  move: Move
): number {
  const cols = Math.max(1, columns);
  const lastRow = Math.floor(Math.max(0, count - 1) / cols);
  // Where a column of the one row lands on the other, which may have a different number.
  const across = (at: number, from: number, to: number) =>
    to <= 1 ? 0 : Math.min(to - 1, Math.round((at * (to - 1)) / Math.max(1, from - 1)));
  if (index >= count) {
    const at = index - count;
    switch (move) {
      case 'left':
        return count + Math.max(0, at - 1);
      case 'right':
        return count + Math.min(shortcuts - 1, at + 1);
      case 'up':
      case 'pageUp': {
        if (count === 0) return index;
        const first = lastRow * cols;
        return first + across(at, shortcuts, count - first);
      }
      default:
        return index;
    }
  }
  const onLastRow = Math.floor(index / cols) === lastRow;
  if (shortcuts > 0 && onLastRow && (move === 'down' || move === 'pageDown')) {
    return count + across(index - lastRow * cols, count - lastRow * cols, shortcuts);
  }
  return moveGrid(index, count, cols, move);
}

/** A direction held this long races: each repeat goes further. */
const RACE_AFTER_MS = 1000;
/** The furthest a repeat goes: past it, too fast to follow even by the letter. */
const RACE_MAX_STEP = 16;

/**
 * How far one repeat of a direction held `heldMs` goes: one, until it races; then two, doubling
 * each second it is held on (at a repeat every 80 ms: 25, 50, 100, 200 games a second).
 */
export function raceStep(heldMs: number): number {
  if (heldMs < RACE_AFTER_MS) return 1;
  return Math.min(RACE_MAX_STEP, 2 ** (1 + Math.floor((heldMs - RACE_AFTER_MS) / 1000)));
}
