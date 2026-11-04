"""Best sellers for every Batocera system with physical media: sales lists where Cyber has them
(info.json), else the games most LaunchBox users rated that have a real cartridge/disc picture."""
import json, sys, zipfile, re, unicodedata, glob, os
import xml.etree.ElementTree as ET
zpath, sysdir, out = sys.argv[1:4]
PLAT = {
 # consoles
 '3do': '3DO Interactive Multiplayer', 'advision': 'Entex Adventure Vision', 'amigacd32': 'Commodore Amiga CD32',
 'amigacdtv': 'Commodore CDTV', 'apfm1000': 'APF Imagination Machine', 'arcadia': 'Emerson Arcadia 2001',
 'astrocade': 'Bally Astrocade', 'atari2600': 'Atari 2600', 'atari5200': 'Atari 5200', 'atari7800': 'Atari 7800',
 'cdi': 'Philips CD-i', 'channelf': 'Fairchild Channel F', 'colecovision': 'ColecoVision', 'crvision': 'VTech CreatiVision',
 'dreamcast': 'Sega Dreamcast', 'fds': 'Nintendo Famicom Disk System', 'gamecube': 'Nintendo GameCube',
 'gx4000': 'Amstrad GX4000', 'intellivision': 'Mattel Intellivision', 'jaguar': 'Atari Jaguar', 'jaguarcd': 'Atari Jaguar CD',
 'loopy': 'Casio Loopy', 'mastersystem': 'Sega Master System', 'megacd': 'Sega CD', 'megadrive': 'Sega Genesis',
 'multivision': 'Othello Multivision', 'n64': 'Nintendo 64', 'n64dd': 'Nintendo 64DD', 'neogeo': 'SNK Neo Geo AES',
 'neogeocd': 'SNK Neo Geo CD', 'nes': 'Nintendo Entertainment System', 'odyssey2': 'Magnavox Odyssey 2',
 'pcengine': 'NEC TurboGrafx-16', 'pcenginecd': 'NEC TurboGrafx-CD', 'pcfx': 'NEC PC-FX', 'pico': 'Sega Pico',
 'psx': 'Sony Playstation', 'pv1000': 'Casio PV-1000', 'satellaview': 'Nintendo Satellaview', 'saturn': 'Sega Saturn',
 'scv': 'Epoch Super Cassette Vision', 'sega32x': 'Sega 32X', 'sg1000': 'Sega SG-1000', 'sgb': 'Nintendo Game Boy',
 'snes': 'Super Nintendo Entertainment System', 'socrates': 'VTech Socrates', 'supergrafx': 'PC Engine SuperGrafx',
 'supracan': 'Funtech Super Acan', 'sv8000': 'Bandai Super Vision 8000', 'vc4000': 'Interton VC 4000',
 'vectrex': 'GCE Vectrex', 'videopacplus': 'Philips Videopac+', 'virtualboy': 'Nintendo Virtual Boy',
 'vsmile': 'VTech V.Smile', 'wii': 'Nintendo Wii',
 # handhelds
 'gameandwatch': 'Nintendo Game & Watch', 'gamecom': 'Tiger Game.com', 'gamegear': 'Sega Game Gear',
 'gamepock': 'Epoch Game Pocket Computer', 'gb': 'Nintendo Game Boy', 'gb2players': 'Nintendo Game Boy',
 'gba': 'Nintendo Game Boy Advance', 'gbc': 'Nintendo Game Boy Color', 'gbc2players': 'Nintendo Game Boy Color',
 'gmaster': 'Hartung Game Master', 'gp32': 'GamePark GP32', 'lynx': 'Atari Lynx', 'megaduck': 'Mega Duck',
 'nds': 'Nintendo DS', 'ngp': 'SNK Neo Geo Pocket', 'ngpc': 'SNK Neo Geo Pocket Color', 'pokemini': 'Nintendo Pokemon Mini',
 'psp': 'Sony PSP', 'supervision': 'Watara Supervision', 'wswan': 'WonderSwan', 'wswanc': 'WonderSwan Color',
 # computers
 'adam': 'Coleco ADAM', 'amiga500': 'Commodore Amiga', 'amiga1200': 'Commodore Amiga', 'amstradcpc': 'Amstrad CPC',
 'apple2': 'Apple II', 'apple2gs': 'Apple IIGS', 'archimedes': 'Acorn Archimedes', 'atari800': 'Atari 800',
 'atarist': 'Atari ST', 'atom': 'Acorn Atom', 'bbcmicro': 'BBC Microcomputer System', 'bk': 'Elektronika BK',
 'c128': 'Commodore 128', 'c20': 'Commodore VIC-20', 'c64': 'Commodore 64', 'camplynx': 'Camputers Lynx',
 'cgenie': 'EACA EG2000 Colour Genie', 'coco': 'TRS-80 Color Computer', 'cplus4': 'Commodore Plus 4', 'dos': 'MS-DOS',
 'dragon64': 'Dragon 32/64', 'electron': 'Acorn Electron', 'enterprise': 'Enterprise', 'fm7': 'Fujitsu FM-7',
 'fmtowns': 'Fujitsu FM Towns Marty', 'macintosh': 'Apple Mac OS', 'msx1': 'Microsoft MSX', 'msx2': 'Microsoft MSX2',
 'msx2+': 'Microsoft MSX2+', 'mz2500': 'Sharp MZ-2500', 'oricatmos': 'Oric Atmos', 'pc88': 'NEC PC-8801',
 'pc98': 'NEC PC-9801', 'pet': 'Commodore PET', 'samcoupe': 'SAM Coupé', 'sc3000': 'Sega SC-3000',
 'spectravideo': 'Spectravideo', 'ti99': 'Texas Instruments TI 99/4A', 'trs80': 'Tandy TRS-80', 'tutor': 'Tomy Tutor',
 'x1': 'Sharp X1', 'x68000': 'Sharp X68000', 'xegs': 'Atari XEGS', 'zx81': 'Sinclair ZX-81', 'zxspectrum': 'Sinclair ZX Spectrum',
 # Batocera's PC build only
 'ps2': 'Sony Playstation 2', 'ps3': 'Sony Playstation 3', 'ps4': 'Sony Playstation 4', 'psvita': 'Sony Playstation Vita',
 'switch': 'Nintendo Switch', 'wiiu': 'Nintendo Wii U', '3ds': 'Nintendo 3DS', 'xbox': 'Microsoft Xbox',
 'xbox360': 'Microsoft Xbox 360',
}
# Sales lists for systems Cyber has none for yet, where the figures are well known.
SALES = {
 'ps2': ['Grand Theft Auto: San Andreas', 'Gran Turismo 3: A-Spec', 'Grand Theft Auto: Vice City'],
 'switch': ['Mario Kart 8 Deluxe', 'Animal Crossing: New Horizons', 'Super Smash Bros. Ultimate'],
 '3ds': ['Mario Kart 7', 'Pokémon X|Pokémon Y|Pokémon X & Y|Pokémon X and Y', 'Pokémon Sun|Pokémon Moon|Pokémon Sun & Moon|Pokémon Sun and Moon'],
 'wiiu': ['Mario Kart 8', 'Super Mario 3D World', 'New Super Mario Bros. U|New Super Mario Bros. U + New Super Luigi U'],
 'xbox360': ['Kinect Adventures!|Kinect Adventures', 'Grand Theft Auto V', 'Call of Duty: Modern Warfare 3'],
}
REAL = ('Cart - Front', 'Disc', 'Cart - 3D')
# Classics picked by hand where the ratings say little (alphabetical runs, homebrew on top).
CLASSICS = {
 'apple2': ['Karateka', 'Lode Runner', 'Choplifter'],
 'c64': ['Impossible Mission', 'Boulder Dash', 'Ghostbusters'],
 'n64dd': ['F-Zero X Expansion Kit', 'Mario Artist: Paint Studio', 'SimCity 64'],
 'xbox': ['Halo 2', 'Halo: Combat Evolved', 'JSRF: Jet Set Radio Future'],
 'electron': ['Elite', 'Chuckie Egg', 'Repton'],
 'c20': ['Gridrunner', 'Omega Race', 'Jelly Monsters'],
 'coco': ['Dungeons of Daggorath', 'Downland', 'Polaris'],
 'amstradcpc': ['Gryzor', 'Rick Dangerous', 'Bomb Jack', 'Chase H.Q.', 'Renegade', 'Head over Heels', 'Batman'],
 'apple2gs': ['Dungeon Master', 'Zany Golf', 'Arkanoid II: Revenge of Doh', 'Pirates!', 'The Immortal'],
 'archimedes': ['Zarch', 'Chocks Away', 'Lander', 'Lemmings', 'Cannon Fodder', 'Elite'],
 'dragon64': ['Chuckie Egg', 'Cuthbert Goes Walkabout', 'Manic Miner', 'Dungeons of Daggorath'],
 'fmtowns': ['After Burner', 'Indiana Jones and the Fate of Atlantis', 'Lemmings', 'Prince of Persia'],
 'intellivision': ['Astrosmash', 'BurgerTime', 'Night Stalker', 'Advanced Dungeons & Dragons Cartridge'],
 'macintosh': ['Myst', 'Marathon', 'Doom II', 'Fallout 2'],
 'neogeo': ['Metal Slug', 'Metal Slug X', "The King of Fighters '98", 'Samurai Shodown', 'Garou: Mark of the Wolves'],
 'neogeocd': ['Metal Slug', 'Metal Slug 2', "The King of Fighters '96", 'Samurai Shodown'],
 'odyssey2': ['K.C. Munchkin!', 'Quest for the Rings!', 'Pick Axe Pete!', 'Attack of the Timelord!'],
 'trs80': ['Adventureland', 'Dancing Demon', 'Android Nim', 'Pirate Adventure'],
 'zx81': ['3D Monster Maze', 'Mazogs', 'Flight Simulation', 'Football Manager'],
 'sg1000': ["Girl's Garden", 'Bank Panic', 'Bomb Jack', 'Congo Bongo', 'Flicky'],
 'atom': ['Atomic Chuckie Egg', 'Hoppa', 'Jet Set Miner', 'Galaxian'],
 'cplus4': ['Kikstart', 'Auf Wiedersehen Monty', 'Commando', 'Monty on the Run'],
}
# Sales lists for systems Cyber has none for yet, where the figures are well known.
SALES = {
 'ps2': ['Grand Theft Auto: San Andreas', 'Gran Turismo 3: A-Spec', 'Grand Theft Auto: Vice City'],
 'switch': ['Mario Kart 8 Deluxe', 'Animal Crossing: New Horizons', 'Super Smash Bros. Ultimate'],
 '3ds': ['Mario Kart 7', 'Pokémon X|Pokémon Y|Pokémon X & Y|Pokémon X and Y', 'Pokémon Sun|Pokémon Moon|Pokémon Sun & Moon|Pokémon Sun and Moon'],
 'wiiu': ['Mario Kart 8', 'Super Mario 3D World', 'New Super Mario Bros. U|New Super Mario Bros. U + New Super Luigi U'],
 'xbox360': ['Kinect Adventures!|Kinect Adventures', 'Grand Theft Auto V', 'Call of Duty: Modern Warfare 3'],
}
REAL = ('Cart - Front', 'Disc', 'Cart - 3D')
def norm(t):
    t = unicodedata.normalize('NFD', t); t = ''.join(c for c in t if not unicodedata.combining(c)).lower()
    t = re.sub(r'\([^)]*\)|\[[^\]]*\]', ' ', t).replace('&', ' and ')
    t = re.sub(r'[^a-z0-9]+', ' ', t); t = re.sub(r'\b(the|version|disney s)\b', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()
lists = {}
for s in PLAT:
    f = os.path.join(sysdir, s, 'info.json')
    l = json.load(open(f)).get('bestsellers') if os.path.exists(f) else None
    if l and json.load(open(f)).get('bestsellersBy') != 'classics': lists[s] = ('sales', l[:3])
    elif s in SALES: lists[s] = ('sales', SALES[s])
    elif s in CLASSICS: lists[s] = ('classics', CLASSICS[s])
plats = set(PLAT.values())
games = {}; images = {}
with zipfile.ZipFile(zpath).open('Metadata.xml') as fh:
    for ev, el in ET.iterparse(fh):
        if el.tag == 'Game':
            p = el.findtext('Platform') or ''
            if p in plats:
                games[el.findtext('DatabaseID')] = (p, el.findtext('Name') or '', int(el.findtext('CommunityRatingCount') or 0), el.findtext('ReleaseType') or '')
            el.clear()
        elif el.tag == 'GameImage':
            t = el.findtext('Type') or ''
            if t in REAL or t == 'Fanart - Cart - Front':
                images.setdefault(el.findtext('DatabaseID'), []).append((t, el.findtext('Region') or '', el.findtext('FileName')))
            el.clear()
by_plat = {}
for gid, g in games.items(): by_plat.setdefault(g[0], []).append((gid,) + g)
res = {}
for s, plat in PLAT.items():
    pool = by_plat.get(plat, [])
    cands = [g for g in pool if any(i[0] in REAL for i in images.get(g[0], [])) and g[3] != 'Unreleased'
             and not re.search(r'\b(demo|sampler|bios|system menu|collection|compilation|pack|levels|expansion|kit|history in the making|in 1|dawn & dusk)\b', g[2], re.I)]
    cands.sort(key=lambda g: -g[3])
    if s in lists and lists[s][0] == 'sales':
        by, titles = lists[s]; chosen = []
        for t in titles:
            al = [norm(a) for a in t.split('|')]
            m = [g for g in pool if norm(g[2]) in al]
            m.sort(key=lambda g: -len([i for i in images.get(g[0], []) if i[0] in REAL]))
            chosen.append((t, m[0][0] if m else None))
    else:
        by = 'classics'; chosen = []; seen = set()
        for t in (lists[s][1] if s in lists else []):
            al = [norm(a) for a in t.split('|')]
            m = [g for g in pool if norm(g[2]) in al and any(i[0] in REAL for i in images.get(g[0], []))]
            if m and len(chosen) < 3: chosen.append((m[0][2], m[0][0])); seen.add(norm(m[0][2]))
        for g in cands:
            if len(chosen) == 3: break
            if norm(g[2]) in seen or g[3] < 1: continue
            seen.add(norm(g[2])); chosen.append((g[2], g[0]))
    if not chosen: continue
    res[s] = {'by': by, 'items': [{'title': t, 'images': images.get(gid, []) if gid else []} for t, gid in chosen]}
json.dump(res, open(out, 'w'), indent=1)
for s in sorted(res):
    r = res[s]; print(f"{s:13} {r['by'][:5]} " + ' ; '.join(f"{i['title'][:28]}{'' if any(x[0] in REAL for x in i['images']) else ' [NO PIC]'}" for i in r['items']))
print('systems:', len(res), 'missing:', sorted(set(PLAT) - set(res)))
