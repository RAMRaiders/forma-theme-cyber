/**
 * Cyber at rest while Forma's screensaver shows: what moves by itself on a timer (a stage's
 * acts, a system page's facts and shelves, the categories' logo rows) holds still. A step that
 * comes due meanwhile waits, and runs once when the screensaver goes, as if time had stopped.
 * Forma's shell pauses the CSS animations itself.
 */
let resting = false;
const due = new Set<() => void>();

export function isResting(): boolean {
  return resting;
}

/**
 * Rest, or wake. Waking runs what came due meanwhile, unless `drop` (the screen is drawn
 * afresh anyway, as the game views are when their video comes back).
 */
export function rest(on: boolean, drop = false): void {
  resting = on;
  document.documentElement.classList.toggle('resting', on);
  if (on) return;
  const steps = [...due];
  due.clear();
  if (!drop) steps.forEach((step) => step());
}

/** `step`, for a timer: run now if awake, else when the screensaver goes (once). */
export function awake(step: () => void): () => void {
  return () => {
    if (resting) due.add(step);
    else step();
  };
}
