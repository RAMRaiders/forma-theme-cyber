import { el } from './dom.js';

/** How long the boot takes, from dark to the page; its CSS animations last as long. */
const BOOT_MS = 1500;

/**
 * Switched on, over `host`: dark, a line of light across the middle opening into a flash,
 * `mark` (a logo, or a name) lit in it, then `host` underneath. After `wait` (dark until
 * then). Gone in `BOOT_MS`; opacity and transforms only (cheap on a Pi). Not with motion off.
 * Returns how long it will be up, 0 when not shown.
 */
export function boot(
  host: HTMLElement,
  mark: HTMLElement,
  wait = 0,
  /**
   * Over the whole screen, header and hints too, lit in this colour (a game's); `top`: over the
   * launch screen too.
   */
  whole?: { colour: string; top?: boolean }
): number {
  const over = whole ? document.body : host;
  for (const old of over.querySelectorAll(':scope > .boot')) old.remove();
  if (document.documentElement.dataset.motion === 'off') return 0;
  const screen = el(
    'div',
    { class: whole ? `boot whole${whole.top ? ' top' : ''}` : 'boot', 'aria-hidden': 'true' },
    el('span', { class: 'beam' }),
    el('div', { class: 'boot-mark' }, mark)
  );
  screen.style.setProperty('--boot-wait', `${Math.round(wait)}ms`);
  if (whole) screen.style.setProperty('--sys', whole.colour);
  over.append(screen);
  setTimeout(() => screen.remove(), wait + BOOT_MS);
  return wait + BOOT_MS;
}

/** A logo for the boot from `src`, or `name` in its place when there is none or it fails. */
export function bootMark(src: string | null | undefined, name: string): HTMLElement {
  const words = el('span', { class: 'boot-name' }, name);
  if (!src) return words;
  const logo = el('img', { class: 'boot-logo', src, alt: '' });
  logo.addEventListener('error', () => logo.replaceWith(words), { once: true });
  return logo;
}
