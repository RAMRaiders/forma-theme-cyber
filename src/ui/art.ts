/**
 * Cyber's own pictures for its home tiles: neon line art, one per category, drawn in the
 * category's colour (`currentColor`, from the tile's `--cat`) with touches of white, cyan and
 * pink. Inline, so they take the colour and need no file; CSS gives them their glow.
 *
 * Every picture is drawn on the same 240 × 150 stage, standing on the same floor line (y 132),
 * so the tiles read as one set.
 */
import type { Category } from '../data/catalog.js';

const PINK = '#ff2e88';
const CYAN = '#22e4ff';
const WHITE = '#e8fbff';

/** A soft floor under each picture: the tile's halo meets it. */
const FLOOR = `<ellipse cx="120" cy="134" rx="78" ry="6" fill="currentColor" opacity=".18"/>`;

/** `dx`: moves a drawing whose middle is off the stage's middle (x 120) back onto it. */
const svg = (body: string, dx = 0) =>
  `<svg viewBox="0 0 240 150" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${FLOOR}<g transform="translate(${dx} 0)">${body}</g></svg>`;

/** A pad: two grips, a d-pad, four buttons. At (x, y), `s` its scale. */
const pad = (x: number, y: number, s: number) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <path d="M14 0h52c12 0 18 9 21 22l3 14c2 9-6 15-13 10l-12-9H15L3 46c-7 5-15-1-13-10l3-14C-4 9 2 0 14 0z" fill="currentColor" fill-opacity=".12"/>
    <path d="M18 14v14M11 21h14" stroke="${WHITE}"/>
    <circle cx="62" cy="15" r="3" fill="${PINK}" stroke="none"/>
    <circle cx="70" cy="22" r="3" fill="${CYAN}" stroke="none"/>
    <circle cx="54" cy="22" r="3" fill="${CYAN}" stroke="none"/>
    <circle cx="62" cy="29" r="3" fill="${PINK}" stroke="none"/>
  </g>`;

/** A pixel invader, row by row, at (x, y) with pixels `px` across. */
const INVADER = [
  '..X.....X..',
  '...X...X...',
  '..XXXXXXX..',
  '.XX.XXX.XX.',
  'XXXXXXXXXXX',
  'X.XXXXXXX.X',
  'X.X.....X.X',
  '...XX.XX...'
];
const invader = (x: number, y: number, px: number, colour: string) =>
  INVADER.flatMap((line, row) =>
    [...line].map((c, col) =>
      c === 'X'
        ? `<rect x="${x + col * px}" y="${y + row * px}" width="${px}" height="${px}" fill="${colour}" stroke="none"/>`
        : ''
    )
  ).join('');

const ART: Record<Category['id'], string> = {
  // A console, its disc lid lit, a pad wired to it.
  consoles: svg(
    `
    <rect x="34" y="62" width="112" height="62" rx="8" fill="currentColor" fill-opacity=".1"/>
    <circle cx="90" cy="88" r="18"/>
    <circle cx="90" cy="88" r="6" fill="${PINK}" stroke="none"/>
    <path d="M44 112h20M120 112h14" stroke="${WHITE}"/>
    <circle cx="128" cy="76" r="3" fill="${CYAN}" stroke="none"/>
    <path d="M146 100c14 0 18 10 26 10" stroke-dasharray="2 5"/>
    ${pad(150, 96, 0.82)}`,
    -9
  ),

  // A handheld, upright, its screen glowing, a game on it.
  handhelds: svg(`
    <rect x="82" y="14" width="76" height="114" rx="10" fill="currentColor" fill-opacity=".1"/>
    <rect x="92" y="24" width="56" height="44" rx="4" stroke="${WHITE}"/>
    <rect x="99" y="31" width="42" height="30" rx="1" fill="currentColor" fill-opacity=".35" stroke="none"/>
    <path d="M105 54h8v-6h8v6h8" stroke="${CYAN}" stroke-width="2.5"/>
    <rect x="128" y="40" width="5" height="5" fill="${PINK}" stroke="none"/>
    <path d="M102 88v16M94 96h16" stroke="${WHITE}"/>
    <circle cx="136" cy="92" r="5" fill="${PINK}" stroke="none"/>
    <circle cx="146" cy="84" r="5" fill="${PINK}" stroke="none"/>
    <path d="M108 116h8M124 116h8" stroke-width="2.5"/>`),

  // A home computer: a monitor with a prompt, a keyboard in front.
  computers: svg(`
    <rect x="62" y="12" width="116" height="78" rx="8" fill="currentColor" fill-opacity=".1"/>
    <rect x="72" y="22" width="96" height="58" rx="3" stroke="${WHITE}"/>
    <path d="M80 36h34M80 46h52M80 56h24" stroke="${CYAN}" stroke-width="2.5"/>
    <rect x="108" y="53" width="8" height="8" fill="${PINK}" stroke="none"/>
    <path d="M110 90v10h20V90"/>
    <path d="M46 108h148l10 22H36z" fill="currentColor" fill-opacity=".12"/>
    <path d="M56 116h128M50 124h140" stroke="${WHITE}" stroke-width="2" stroke-dasharray="6 4"/>`),

  // An arcade cabinet, flat from the front: a lit marquee, an invader on the screen, the
  // control panel with a stick and buttons, a coin door.
  arcade: svg(`
    <path d="M90 12h60v20l-4 6v40l10 10v40H84V88l10-10V38l-4-6z" fill="currentColor" fill-opacity=".1"/>
    <rect x="95" y="16" width="50" height="12" rx="2" fill="${PINK}" fill-opacity=".5" stroke="${PINK}"/>
    <rect x="100" y="40" width="40" height="32" rx="3" stroke="${WHITE}"/>
    ${invader(109, 47, 2, CYAN)}
    <path d="M84 88h72" />
    <path d="M104 86v-6" stroke="${WHITE}" stroke-width="2.5"/>
    <circle cx="104" cy="79" r="3.5" fill="${PINK}" stroke="none"/>
    <circle cx="124" cy="83" r="3" fill="${CYAN}" stroke="none"/>
    <circle cx="134" cy="83" r="3" fill="${CYAN}" stroke="none"/>
    <circle cx="144" cy="83" r="3" fill="${CYAN}" stroke="none"/>
    <rect x="108" y="100" width="24" height="16" rx="2" stroke-width="2.5"/>
    <path d="M116 105v6M124 105v6" stroke="${PINK}" stroke-width="2.5"/>`),

  // A homebrew cartridge on its board, the code that made it floating up.
  virtual: svg(`
    <path d="M70 52h100v76H70z" fill="currentColor" fill-opacity=".1"/>
    <path d="M82 52V34h76v18" />
    <rect x="92" y="62" width="56" height="40" rx="4" stroke="${WHITE}"/>
    <path d="M104 88l8-8-8-8M120 90h16" stroke="${CYAN}" stroke-width="2.5"/>
    <path d="M78 118h84" stroke-dasharray="4 6"/>
    <path d="M62 128h116"/>
    <text x="172" y="40" fill="${PINK}" stroke="none" font-family="DejaVu Sans Mono, monospace" font-size="20" font-weight="700">{ }</text>
    <rect x="46" y="24" width="7" height="7" fill="${CYAN}" stroke="none"/>
    <rect x="58" y="12" width="5" height="5" fill="${PINK}" stroke="none"/>`),

  // An open book with a lit bulb over it.
  educational: svg(`
    <path d="M120 70c-18-10-40-12-64-8v62c24-4 46-2 64 8 18-10 40-12 64-8V62c-24-4-46-2-64 8z" fill="currentColor" fill-opacity=".1"/>
    <path d="M120 70v62"/>
    <path d="M70 82c14-2 28 0 38 4M70 96c14-2 28 0 38 4M132 86c10-4 24-6 38-4M132 100c10-4 24-6 38-4" stroke="${WHITE}" stroke-width="2"/>
    <path d="M120 14a16 16 0 0 0-9 29v7h18v-7a16 16 0 0 0-9-29z" stroke="${PINK}" fill="${PINK}" fill-opacity=".25"/>
    <path d="M114 56h12" stroke="${PINK}"/>
    <path d="M96 22l-6-4M144 22l6-4M92 38h-7M148 38h7" stroke="${CYAN}" stroke-width="2.5"/>`),

  // A cartridge turned into a program: the cartridge, an arrow, a window running it.
  // Magazines: an issue standing, an invader on its cover, the last issue leaning behind it.
  magazines: svg(
    `
    <rect x="62" y="38" width="62" height="92" rx="3" transform="rotate(-9 93 130)" fill="currentColor" fill-opacity=".08"/>
    <path d="M70 52h36" transform="rotate(-9 93 130)" stroke-width="2.5" opacity=".6"/>
    <rect x="100" y="30" width="64" height="98" rx="3" fill="currentColor" fill-opacity=".14"/>
    <path d="M109 42h46" stroke="${PINK}" stroke-width="6"/>
    <rect x="109" y="54" width="46" height="36" rx="2" stroke="${CYAN}" stroke-width="2.5"/>
    ${invader(115.5, 60, 3, CYAN)}
    <path d="M109 101h30M109 111h22" stroke="${WHITE}" stroke-width="2.5"/>
    <circle cx="150" cy="111" r="7" stroke="${PINK}" stroke-width="2.5"/>`,
    7
  ),

  // A chip whose core is a gear, a second gear turning with it.
  engines: svg(
    `
    <rect x="76" y="34" width="88" height="88" rx="10" fill="currentColor" fill-opacity=".1"/>
    <path d="M90 34v-10M106 34v-10M122 34v-10M138 34v-10M154 34v-10M90 122v10M106 122v10M122 122v10M138 122v10M154 122v10M76 50H66M76 68H66M76 86H66M76 104H66M164 50h10M164 68h10M164 86h10M164 104h10" stroke-width="2.5"/>
    <circle cx="120" cy="78" r="22" stroke="${WHITE}"/>
    <path d="M120 50v6M120 100v6M92 78h6M142 78h6M100 58l4 4M136 94l4 4M100 98l4-4M136 62l4-4" stroke="${WHITE}" stroke-width="4"/>
    <path d="M114 68l16 10-16 10z" fill="${PINK}" stroke="${PINK}"/>
    <circle cx="174" cy="30" r="10" stroke="${CYAN}"/>
    <circle cx="174" cy="30" r="3" fill="${CYAN}" stroke="none"/>
    <path d="M174 16v-4M174 44v4M160 30h-4M188 30h4" stroke="${CYAN}" stroke-width="4"/>`,
    -9
  ),

  // The whole library: cartridges, discs and a floppy stacked on a shelf.
  all: svg(`
    <path d="M40 126h160" stroke-width="3.5"/>
    <rect x="48" y="58" width="22" height="68" rx="2" fill="currentColor" fill-opacity=".14"/>
    <rect x="72" y="46" width="22" height="80" rx="2" fill="${PINK}" fill-opacity=".2" stroke="${PINK}"/>
    <rect x="96" y="64" width="18" height="62" rx="2" fill="currentColor" fill-opacity=".14"/>
    <rect x="116" y="40" width="24" height="86" rx="2" fill="${CYAN}" fill-opacity=".18" stroke="${CYAN}"/>
    <rect x="142" y="56" width="20" height="70" rx="2" fill="currentColor" fill-opacity=".14"/>
    <path d="M166 62l20-6 14 66-20 6z" fill="currentColor" fill-opacity=".1"/>
    <path d="M54 70h10M78 58h10M100 76h10M122 52h12M146 68h12" stroke="${WHITE}" stroke-width="2.5"/>
    <circle cx="190" cy="34" r="16" stroke="${WHITE}"/>
    <circle cx="190" cy="34" r="4" fill="${WHITE}" stroke="none"/>`)
};

/** The picture for a category: Cyber's own line art. */
export function categoryArt(id: Category['id']): string {
  return ART[id];
}
