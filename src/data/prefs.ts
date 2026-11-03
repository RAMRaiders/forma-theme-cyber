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
  rotateFacts: true,
  systemsSort: 'games'
};

/** Where Cyber kept its prefs before Forma's menu showed them: one object, read once more. */
const LEGACY_KEY = 'interface';

/**
 * A TV that cuts the picture's edges (overscan): Forma's own setting, shared by every theme and
 * its start-up screen, in percent of each side to keep clear (0–10). Set in Forma's menu.
 */
export const MARGINS_SETTING = 'display.margins';

/** A stored margins value, made safe. */
export function margins(value: unknown): number {
  return typeof value === 'number' ? Math.min(10, Math.max(0, Math.round(value))) : 0;
}

export async function loadMargins(forma: Forma): Promise<number> {
  return margins(await forma.settings.getSystem<number>(MARGINS_SETTING).catch(() => null));
}

/** Everything (overlays too, being inside the body) shrinks evenly into the part the TV shows. */
export function applyMargins(margins: number, body: HTMLElement = document.body): void {
  body.style.transform = margins > 0 ? `scale(${1 - (2 * margins) / 100})` : '';
}

/** One setting as Forma's menu sets it, as a change to the prefs; `null` if it is not one. */
export function prefUpdate(key: string, value: unknown): Partial<Prefs> | null {
  if (!(key in DEFAULT_PREFS)) return null;
  const k = key as keyof Prefs;
  return typeof value === typeof DEFAULT_PREFS[k] ? { [k]: value } : null;
}

/**
 * The prefs, each from its own setting (declared in theme.json, set in Forma's menu), over the
 * old single object, over the defaults. Anything unknown or the wrong type is the default.
 */
export async function loadPrefs(forma: Forma): Promise<Prefs> {
  const keys = Object.keys(DEFAULT_PREFS) as (keyof Prefs)[];
  const [legacy, ...values] = await Promise.all([
    forma.settings.get<Partial<Record<keyof Prefs, unknown>>>(LEGACY_KEY).catch(() => null),
    ...keys.map((k) => forma.settings.get(k).catch(() => null))
  ]);
  let prefs: Prefs = { ...DEFAULT_PREFS };
  keys.forEach((key, i) => {
    const value = values[i] ?? (legacy && typeof legacy === 'object' ? legacy[key] : undefined);
    prefs = { ...prefs, ...prefUpdate(key, value) };
  });
  return prefs;
}

/** The look, as attributes on the page root that style.css follows. */
export function applyPrefs(prefs: Prefs, root: HTMLElement = document.documentElement): void {
  root.dataset.textSize = prefs.textSize;
  root.dataset.board = prefs.board;
  root.dataset.motion = prefs.motion ? 'on' : 'off';
}
