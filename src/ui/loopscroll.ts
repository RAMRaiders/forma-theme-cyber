import { remPx } from './dom.js';

/** Its start read this long before it moves. */
const HOLD_START_MS = 5000;
/** Up at about a line in two seconds: slow enough to read as it goes. */
const REM_PER_S = 0.6;
/** Its end read this long before it starts over. */
const HOLD_END_MS = 4000;
/** Fading out at the end, and in again at the start. */
const SWAP_MS = 400;

/**
 * Words longer than their box, read from start to end: `lines` (the words, in a box that hides
 * what overflows) rests at its start, moves up `by` pixels slowly to its end, rests there, then
 * fades out and in again at its start, over and over. A whole pixel at a time: text moved by a
 * fraction of one shimmers. A transform and an opacity: the compositor's work, cheap on a Pi.
 * `null` when it fits (or the browser cannot animate).
 */
export function loopScroll(lines: HTMLElement, by: number): Animation | null {
  const px = Math.round(by);
  if (px <= 0 || typeof lines.animate !== 'function') return null;
  const scroll = (px / (REM_PER_S * remPx())) * 1000;
  const total = HOLD_START_MS + scroll + HOLD_END_MS + 2 * SWAP_MS;
  let at = 0;
  const mark = (ms: number) => (at += ms) / total;
  const top = 'translateY(0)';
  const end = `translateY(-${px}px)`;
  return lines.animate(
    [
      { offset: 0, transform: top, opacity: 1 },
      { offset: mark(HOLD_START_MS), transform: top, opacity: 1, easing: `steps(${px})` },
      { offset: mark(scroll), transform: end, opacity: 1 },
      { offset: mark(HOLD_END_MS), transform: end, opacity: 1 },
      { offset: mark(SWAP_MS), transform: end, opacity: 0, easing: 'step-end' },
      { offset: Math.min(1, at / total + 0.0001), transform: top, opacity: 0 },
      { offset: 1, transform: top, opacity: 1 }
    ],
    { duration: total, iterations: Infinity }
  );
}
