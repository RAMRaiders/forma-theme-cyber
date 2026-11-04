/** A best-selling game, with a picture of its real cartridge or disc. */
export interface Bestseller {
  name: string;
  art: string;
}

/** How many are shown. */
const SHOWN = 3;

/**
 * A system's best sellers (`bestsellers` in its info.json, best first; `A|B` for other titles
 * of the same game, the first is shown), at most three, each with the picture of its cartridge
 * or disc that comes with the theme: `systems/<system>/bestsellers/<rank>.webp`.
 */
export function bestsellers(system: string, titles: string[] | undefined): Bestseller[] {
  return (titles ?? []).slice(0, SHOWN).map((title, n) => ({
    name: title.split('|')[0]!.trim(),
    art: `./systems/${encodeURIComponent(system)}/bestsellers/${n + 1}.webp`
  }));
}
