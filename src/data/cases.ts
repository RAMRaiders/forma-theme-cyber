/**
 * Each Batocera system's game case, as it was sold: the box's shape until a game's own pictures
 * say otherwise, and so the shape of its spines on the shelf. A system with no games yet, or
 * games with no pictures, still gets its own box, not a Mega Drive's.
 */
export interface CaseShape {
  /** The front's width over its height. */
  ratio: number;
  /** The box's depth over its height. */
  depth: number;
  /** The spine runs along the top (a Super Nintendo's, a Nintendo 64's), the box being wide. */
  lying: boolean;
  /** How thick its spine is, mm: the box's depth (a jewel case's, its spine card's). */
  spine: number;
}

/** Cases by kind, from real ones (width × height × depth, mm). */
const KINDS = {
  /** Sega's plastic clamshell: Mega Drive, Master System, 32X (134 × 187, its spine 24). */
  clamshell: { ratio: 0.72, depth: 0.13, lying: false, spine: 24 },
  /** An NES cardboard box (127 × 178 × 25). */
  nes: { ratio: 0.71, depth: 0.14, lying: false, spine: 25 },
  /** A Japanese cardboard cartridge box: Famicom Disk System, SG-1000, Epoch, Casio (110 × 160 × 20). */
  jpbox: { ratio: 0.69, depth: 0.125, lying: false, spine: 20 },
  /** A Super Nintendo box, wide, its spine along the top (190 × 137 × 37). */
  snes: { ratio: 1.39, depth: 0.27, lying: true, spine: 37 },
  /** A Nintendo 64 box, wide, its spine along the top (178 × 127 × 32). */
  n64: { ratio: 1.4, depth: 0.25, lying: true, spine: 32 },
  /** An Atari or Coleco-era cartridge box (140 × 192 × 33). */
  cartbox: { ratio: 0.73, depth: 0.17, lying: false, spine: 33 },
  /** A TurboGrafx-16 HuCard case (133 × 184 × 17). */
  tg16: { ratio: 0.72, depth: 0.09, lying: false, spine: 17 },
  /** A PC Engine HuCard case, Japanese (124 × 141 × 8). */
  hucard: { ratio: 0.88, depth: 0.055, lying: false, spine: 8 },
  /** A Neo Geo AES box, tall and deep (185 × 290 × 49). */
  aes: { ratio: 0.64, depth: 0.17, lying: false, spine: 49 },
  /** A CD jewel case (142 × 125, its spine card 7). */
  jewel: { ratio: 1.14, depth: 0.06, lying: false, spine: 7 },
  /** A thick jewel case: Dreamcast, PC-FX (142 × 125 × 15). */
  thickjewel: { ratio: 1.14, depth: 0.12, lying: false, spine: 15 },
  /** A Mega CD case, square-ish and slim (148 × 148 × 12). */
  megacd: { ratio: 1, depth: 0.08, lying: false, spine: 12 },
  /** A Saturn case, tall and slim (142 × 198 × 20). */
  saturn: { ratio: 0.72, depth: 0.1, lying: false, spine: 20 },
  /** A DVD keep case: GameCube, Wii, PC (135 × 190 × 14). */
  dvd: { ratio: 0.71, depth: 0.074, lying: false, spine: 14 },
  /** A Game Boy box (95 × 120 × 25). */
  gb: { ratio: 0.79, depth: 0.21, lying: false, spine: 25 },
  /** A Game Boy Advance box (118 × 127 × 25). */
  gba: { ratio: 0.93, depth: 0.2, lying: false, spine: 25 },
  /** A small handheld box: WonderSwan, Neo Geo Pocket, Lynx's later ones (105 × 135 × 27). */
  pocket: { ratio: 0.78, depth: 0.2, lying: false, spine: 27 },
  /** A Nintendo DS case (125 × 137 × 14). */
  ds: { ratio: 0.91, depth: 0.1, lying: false, spine: 14 },
  /** A PSP UMD case (105 × 180 × 14). */
  umd: { ratio: 0.58, depth: 0.078, lying: false, spine: 14 },
  /** An LCD game's box, wide: Game & Watch, Tiger (150 × 115 × 25). */
  lcd: { ratio: 1.3, depth: 0.22, lying: false, spine: 25 },
  /** A Virtual Boy box (150 × 200 × 45). */
  virtualboy: { ratio: 0.75, depth: 0.22, lying: false, spine: 45 },
  /** A home computer's big box: DOS, Amiga, ST, PC-98, X68000 (190 × 235 × 50). */
  bigbox: { ratio: 0.8, depth: 0.21, lying: false, spine: 50 },
  /** A cassette tape's case: Spectrum, CPC, C64 (70 × 110 × 17). */
  tape: { ratio: 0.64, depth: 0.155, lying: false, spine: 17 },
  /** An arcade game's flyer, folded in a sleeve (210 × 297 × 12). */
  flyer: { ratio: 0.71, depth: 0.04, lying: false, spine: 12 }
} satisfies Record<string, CaseShape>;

type Kind = keyof typeof KINDS;

/** Every Batocera system (scripts/batocera-systems.tsv) by its case. */
const BY_KIND: Record<Kind, readonly string[]> = {
  clamshell: ['megadrive', 'megadrive-msu', 'mastersystem', 'sega32x', 'gamegear', 'pico'],
  nes: ['nes'],
  jpbox: [
    'fds',
    'sg1000',
    'sc3000',
    'segaai',
    'scv',
    'cassettevision',
    'pv1000',
    'pv2000',
    'multivision',
    'loopy',
    'beena',
    'sv8000',
    'tvgames',
    'zc210',
    'ctvboy',
    'rx78',
    'supracan',
    'msx1',
    'msx2',
    'msx2+',
    'msxturbor'
  ],
  snes: ['snes', 'snes-msu1', 'sgb', 'sgb-msu1', 'satellaview', 'sufami'],
  n64: ['n64', 'n64dd'],
  cartbox: [
    'atari2600',
    'atari5200',
    'atari7800',
    'xegs',
    'intellivision',
    'colecovision',
    'adam',
    'odyssey2',
    'videopacplus',
    'vectrex',
    'channelf',
    'astrocade',
    'arcadia',
    'apfm1000',
    'advision',
    'vc4000',
    'crvision',
    'jaguar',
    'gx4000',
    'ti99',
    'tutor',
    'socrates',
    'vsmile'
  ],
  tg16: ['pcengine'],
  hucard: ['supergrafx'],
  aes: ['neogeo'],
  jewel: [
    'psx',
    '3do',
    'cdi',
    'neogeocd',
    'pcenginecd',
    'amigacd32',
    'amigacdtv',
    'jaguarcd',
    'vis',
    'vgmplay'
  ],
  thickjewel: ['dreamcast', 'pcfx'],
  megacd: ['megacd'],
  saturn: ['saturn'],
  dvd: [
    'gamecube',
    'wii',
    'commanderx16',
    'vircon32',
    // Engines and ports: today's PC games, in a keep case.
    'abuse',
    'bennugd',
    'bstone',
    'cannonball',
    'cavestory',
    'cdogs',
    'cgenius',
    'corsixth',
    'devilutionx',
    'doom3',
    'dxx-rebirth',
    'easyrpg',
    'ecwolf',
    'eduke32',
    'etlegacy',
    'fallout1-ce',
    'fallout2-ce',
    'flash',
    'fury',
    'gzdoom',
    'halflife',
    'hcl',
    'hurrican',
    'jazz2',
    'lutro',
    'mrboom',
    'openbor',
    'openjazz',
    'ports',
    'prboom',
    'pygame',
    'quake',
    'quake2',
    'quake3',
    'raze',
    'reminiscence',
    'rott',
    'rtcw',
    'sdlpop',
    'solarus',
    'sonic-mania',
    'sonic3-air',
    'sonicretro',
    'superbroswar',
    'thextech',
    'traider1',
    'traider2',
    'tyrian',
    'xrick',
    // Virtual consoles, sold (when sold) as downloads.
    'pico8',
    'tic80',
    'lowresnx',
    'uzebox',
    // Batocera's tools, never shown: a plain case all the same.
    'imageviewer',
    'library',
    'moonlight',
    'recordings',
    'odcommander'
  ],
  gb: [
    'gb',
    'gbc',
    'gb2players',
    'gbc2players',
    'megaduck',
    'gamepock',
    'supervision',
    'gmaster',
    'gamate',
    'pokemini',
    'arduboy',
    'gamecom'
  ],
  gba: ['gba', 'gp32'],
  pocket: ['wswan', 'wswanc', 'ngp', 'ngpc', 'lynx'],
  ds: ['nds'],
  umd: ['psp'],
  lcd: ['gameandwatch', 'lcdgames'],
  virtualboy: ['virtualboy'],
  bigbox: [
    'dos',
    'amiga500',
    'amiga1200',
    'atarist',
    'macintosh',
    'apple2',
    'apple2gs',
    'archimedes',
    'pc88',
    'pc98',
    'x1',
    'x68000',
    'fm7',
    'fmtowns',
    'mz2500',
    'c128',
    'scummvm',
    'pcw',
    'pdp1'
  ],
  tape: [
    'zxspectrum',
    'zx81',
    'amstradcpc',
    'c64',
    'c20',
    'cplus4',
    'pet',
    'bbcmicro',
    'electron',
    'atom',
    'oricatmos',
    'dragon64',
    'coco',
    'mc10',
    'trs80',
    'laser310',
    'cgenie',
    'samcoupe',
    'enterprise',
    'tvc',
    'camplynx',
    'thomson',
    'spectravideo',
    'atari800',
    'pc60',
    'pc80',
    'mz700',
    'mz800',
    'mz80k',
    'mz2000',
    'bk'
  ],
  flyer: [
    'mame',
    'fbneo',
    'naomi',
    'naomi2',
    'atomiswave',
    'model3',
    'namco22',
    'systemsp',
    'triforce',
    'daphne',
    'dice',
    'singe'
  ]
};

const BY_SYSTEM = new Map<string, CaseShape>(
  (Object.entries(BY_KIND) as [Kind, readonly string[]][]).flatMap(([kind, ids]) =>
    ids.map((id) => [id, KINDS[kind]] as const)
  )
);

/** The systems with a case of their own. */
export const CASED_SYSTEMS: ReadonlySet<string> = new Set(BY_SYSTEM.keys());

/** A system's case; one Batocera adds later, a keep case until it is given its own. */
export function caseShape(system: string): CaseShape {
  return BY_SYSTEM.get(system) ?? KINDS.dvd;
}

/**
 * How many times as long as wide a case's spine is: standing, its height over its depth; lying
 * along the top, its width over its depth. As a spine picture of it would be.
 */
export function spineShape(shape: CaseShape): number {
  return (shape.lying ? shape.ratio : 1) / shape.depth;
}

/**
 * Systems whose games' cases differ by region: how tall they stand (mm), and how many times as
 * long as wide their spine pictures are; PAL's, and everywhere else's.
 */
const REGIONAL: Record<string, { pal: RegionalCase; other: RegionalCase }> = {
  // A PAL box (190 mm, its spine 7.8 times as long as wide); a US or Japanese thick jewel case
  // (125 mm), its spine card 17.4 times.
  dreamcast: { pal: { mm: 190, spine: 7.8 }, other: { mm: 125, spine: 17.4 } }
};

interface RegionalCase {
  mm: number;
  spine: number;
}

/**
 * Systems whose shelf rows are drawn a little bigger than their case's spine alone makes them:
 * a PlayStation's spine pictures mix PAL spines with US and Japanese spine cards twice as
 * long, and at a jewel case's thickness those read too small.
 */
const SPINE_BOOST: Readonly<Record<string, number>> = { psx: 1.15 };

/** How much bigger a system's shelf rows are drawn than its case's spine makes them (1: not). */
export function spineBoost(system: string): number {
  return SPINE_BOOST[system] ?? 1;
}

/** Cyber's region codes that are PAL Europe (and Australia, sold the same boxes). */
const PAL_REGIONS: ReadonlySet<string> = new Set([
  'eu',
  'uk',
  'fr',
  'de',
  'es',
  'it',
  'nl',
  'se',
  'pt',
  'au',
  'dk',
  'fi',
  'no',
  'be',
  'ch',
  'at',
  'gr',
  'pl',
  'ru'
]);

/** Every region a game's name gives is PAL's (none given: not PAL). */
function isPal(regions: readonly string[]): boolean {
  return regions.length > 0 && regions.every((r) => PAL_REGIONS.has(r));
}

/** Whether a system's cases differ by region (its shelf rows then as thick as each one's). */
export function regionalCases(system: string): boolean {
  return system in REGIONAL;
}

/**
 * How many times as long as wide a game's spine is, by its regions (Cyber's codes, its name's):
 * PAL's when every region it names is; `null` where the system's cases do not differ by region.
 */
export function regionalSpine(system: string, regions: readonly string[]): number | null {
  const cases = REGIONAL[system];
  return cases ? (isPal(regions) ? cases.pal : cases.other).spine : null;
}

/** The stubbiest spine of a system whose cases differ by region: what its shelf is sized to. */
export function stubbiestSpine(system: string): number | null {
  const cases = REGIONAL[system];
  return cases ? Math.min(cases.pal.spine, cases.other.spine) : null;
}

/**
 * How big a game's case is drawn against its system's tallest, as real ones stand: a US or
 * Japanese Dreamcast's jewel case two thirds of a PAL box. 1 where cases do not differ by region.
 */
export function caseScale(system: string, regions: readonly string[]): number {
  const cases = REGIONAL[system];
  if (!cases) return 1;
  return (isPal(regions) ? cases.pal : cases.other).mm / Math.max(cases.pal.mm, cases.other.mm);
}
