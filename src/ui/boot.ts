import type { Game } from '@ramraiders/forma-sdk';

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
  /** Over the whole screen, header and hints too, lit in this colour (a game's). */
  whole?: { colour: string }
): number {
  const over = whole ? document.body : host;
  for (const old of over.querySelectorAll(':scope > .boot')) old.remove();
  if (document.documentElement.dataset.motion === 'off') return 0;
  const screen = el(
    'div',
    { class: whole ? 'boot whole' : 'boot', 'aria-hidden': 'true' },
    el('span', { class: 'beam' }),
    el('div', { class: 'boot-mark' }, mark)
  );
  screen.style.setProperty('--boot-wait', `${Math.round(wait)}ms`);
  if (whole) screen.style.setProperty('--sys', whole.colour);
  over.append(screen);
  setTimeout(() => screen.remove(), wait + BOOT_MS);
  return wait + BOOT_MS;
}

/** How long a just-scraped game's logo is looked for: Forma may save it a little after the rest. */
const SCRAPED_LOGO_MS = 6000;
const SCRAPED_RETRY_MS = 1000;

/**
 * The boot's mark for a game just scraped: its logo (wheel, else marquee) as the scrape brought
 * it, from the game as Forma has it now (`fresh`; the list's copy may still be the one from
 * before the scrape), asked again for a few seconds while it has none yet, and loaded before
 * the boot lights it. Its name when no logo comes.
 */
export async function scrapedMark(
  game: Game,
  logo: (game: Game) => string | null,
  fresh?: (id: number) => Promise<Game | null>
): Promise<HTMLElement> {
  const until = Date.now() + SCRAPED_LOGO_MS;
  for (;;) {
    const now = fresh ? ((await fresh(game.id).catch(() => null)) ?? game) : game;
    const src = logo(now);
    if (src) return bootMarkLoaded(src, game.name, 8000);
    if (!fresh || Date.now() + SCRAPED_RETRY_MS > until) return bootMarkLoaded(null, game.name);
    await new Promise((done) => setTimeout(done, SCRAPED_RETRY_MS));
  }
}

/**
 * A logo for the boot from `src`, once it has loaded (up to `ms`): so the boot lights the logo,
 * not the name while it is still coming. `name` in its place when there is none or it fails.
 */
export async function bootMarkLoaded(
  src: string | null | undefined,
  name: string,
  ms = 4000
): Promise<HTMLElement> {
  const words = el('span', { class: 'boot-name' }, name);
  if (!src) return words;
  const logo = el('img', { class: 'boot-logo', src, alt: '' });
  const loaded = await Promise.race([
    (typeof logo.decode === 'function' ? logo.decode() : Promise.resolve()).then(
      () => true,
      () => false
    ),
    new Promise<boolean>((done) => setTimeout(() => done(false), ms))
  ]);
  return loaded ? logo : words;
}
