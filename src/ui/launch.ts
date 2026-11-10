import { el } from './dom.js';
import { loader } from './loader.js';

/** What a game has to show while it starts; each is a URL, or `null` where it has none. */
export interface LaunchArt {
  box: string | null;
  shot: string | null;
  /** Full-screen art, or `soft`: a small picture stretched behind everything. */
  backdrop: string | null;
  soft: string | null;
  logo: string | null;
}

export interface LaunchSystem {
  name: string;
  logo: string | null;
  /** The logo is dark: it needs a light plate. */
  dark: boolean;
  photo: string | null;
}

const CELLS = 14;
const NO_ART: LaunchArt = { box: null, shot: null, backdrop: null, soft: null, logo: null };

/** A picture that takes itself away if it cannot load. */
function image(src: string, cls: string, gone?: () => void, alt = ''): HTMLElement {
  const img = el('img', { class: cls, src, alt, decoding: 'async' });
  img.addEventListener(
    'error',
    () => {
      img.remove();
      gone?.();
    },
    { once: true }
  );
  return img;
}

/** Power cells charging one after another, in the game's colour. */
function bootStatus(): HTMLElement {
  const cells = Array.from({ length: CELLS }, (_, i) => {
    const cell = el('span', {});
    cell.style.setProperty('--i', String(i));
    return cell;
  });
  return el(
    'div',
    { class: 'launch-status', role: 'status' },
    el('p', { class: 'loader-label' }, 'Starting game'),
    el('div', { class: 'launch-cells', 'aria-hidden': 'true' }, ...cells)
  );
}

/**
 * The screen while the emulator starts. A game with pictures is shown by them: its box beside
 * its logo, over its fan art. One with none is shown by its system: the console's photo behind,
 * the system's logo, and the game's name large.
 */
export function launchScreen(name: string, system: LaunchSystem, art = NO_ART): HTMLElement {
  const hero = art.box ?? art.shot;
  const hasArt = hero !== null || art.backdrop !== null || art.soft !== null || art.logo !== null;
  const root = el('div', { class: `launch ${hasArt ? 'has-art' : 'no-art'}` });

  const behind = hasArt ? (art.backdrop ?? art.soft) : system.photo;
  if (behind) root.append(image(behind, 'launch-backdrop'));
  if (hasArt) root.append(el('span', { class: 'launch-scan', 'aria-hidden': 'true' }));

  const title = el('h2', { class: 'launch-title' }, name);
  const words = el('div', { class: 'launch-words' });
  if (art.logo) {
    words.append(image(art.logo, 'launch-logo', () => words.prepend(title), name));
  } else {
    words.append(title);
  }
  const mark = system.logo
    ? image(system.logo, `launch-system${system.dark ? ' dark' : ''}`, () =>
        mark.replaceWith(el('p', { class: 'launch-system-name' }, system.name))
      )
    : el('p', { class: 'launch-system-name' }, system.name);
  if (hasArt) words.append(mark);
  else words.prepend(mark);
  words.append(hasArt ? bootStatus() : loader('Starting game'));

  if (hero) {
    const shown = image(hero, art.box ? 'launch-box' : 'launch-shot', () => {
      holder.remove();
      root.classList.add('alone');
    });
    const sheen = el('span', { class: 'launch-sheen', 'aria-hidden': 'true' });
    const holder = el(
      'div',
      { class: 'launch-hero' },
      el('div', { class: 'launch-case' }, shown, sheen)
    );
    root.append(holder);
  } else {
    root.classList.add('alone');
  }
  root.append(words);
  return root;
}
