/**
 * Cyber settles when no one plays with it: a while after the last button, what only decorates
 * (the board's pulses, the floor's lines, the fan art's drift, the logo rows, the song card's
 * disc) holds still (style.css, `:root.idle`), and the next button sets it going again. On a
 * Pi each of them kept WebKit and Forma drawing every frame for nothing: a quarter of the CPU
 * on the home screen, half on a system's page, with no one looking.
 */
export const IDLE_MS = 20_000;

let timer: ReturnType<typeof setTimeout> | undefined;

/** A button, or Cyber starting: awake now, idle `IDLE_MS` after unless poked again. */
export function poke(root: HTMLElement = document.documentElement): void {
  root.classList.remove('idle');
  clearTimeout(timer);
  timer = setTimeout(() => root.classList.add('idle'), IDLE_MS);
}
