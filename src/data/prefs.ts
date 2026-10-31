import type { Forma } from '@ramraiders/forma-sdk';

/** Cyber's own look and order, kept in its private theme settings. */
export interface Prefs {
  textSize: 'small' | 'normal' | 'large';
  /** The circuit board behind the screens. */
  board: 'on' | 'dim' | 'off';
  /** Pulsing traces, loaders, settling tiles. Off also when the system asks for less motion. */
  motion: boolean;
  /** Game preview videos in the list. */
  previews: boolean;
  /** The now-playing pill in the header. */
  nowPlaying: boolean;
  /** Curiosities move on by themselves on a system's page. */
  rotateFacts: boolean;
  /** A category's systems, in this order. */
  systemsSort: 'games' | 'name' | 'year' | 'maker';
}

export const DEFAULT_PREFS: Prefs = {
  textSize: 'normal',
  board: 'on',
  motion: true,
  previews: true,
  nowPlaying: true,
  rotateFacts: true,
  systemsSort: 'games'
};

const KEY = 'interface';

/**
 * A TV that cuts the picture's edges (overscan): Forma's own setting, shared by every theme and
 * its start-up screen, in percent of each side to keep clear (0–10).
 */
export const MARGINS_SETTING = 'display.margins';

export async function loadMargins(forma: Forma): Promise<number> {
  const saved = await forma.settings.getSystem<number>(MARGINS_SETTING).catch(() => null);
  return typeof saved === 'number' ? Math.min(10, Math.max(0, Math.round(saved))) : 0;
}

/** Everything (overlays too, being inside the body) shrinks evenly into the part the TV shows. */
export function applyMargins(margins: number, body: HTMLElement = document.body): void {
  body.style.transform = margins > 0 ? `scale(${1 - (2 * margins) / 100})` : '';
}

/** Saved prefs over the defaults; anything unknown or missing is the default. */
export async function loadPrefs(forma: Forma): Promise<Prefs> {
  const saved = await forma.settings.get<Partial<Prefs>>(KEY).catch(() => null);
  const prefs = { ...DEFAULT_PREFS };
  if (saved && typeof saved === 'object') {
    for (const key of Object.keys(DEFAULT_PREFS) as (keyof Prefs)[]) {
      const value = saved[key];
      if (typeof value === typeof DEFAULT_PREFS[key])
        (prefs as Record<string, unknown>)[key] = value;
    }
  }
  return prefs;
}

export async function savePrefs(forma: Forma, prefs: Prefs): Promise<void> {
  await forma.settings.set(KEY, prefs);
}

/** The look, as attributes on the page root that style.css follows. */
export function applyPrefs(prefs: Prefs, root: HTMLElement = document.documentElement): void {
  root.dataset.textSize = prefs.textSize;
  root.dataset.board = prefs.board;
  root.dataset.motion = prefs.motion ? 'on' : 'off';
}
