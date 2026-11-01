// @vitest-environment jsdom
/**
 * The whole theme, driven like a gamepad would, against the SDK's mock (the real engine's
 * output for the fixture library). jsdom has no layout, so this checks behaviour and wiring,
 * not looks.
 */
import { connect, type InputEvent } from '@ramraiders/forma-sdk';
import { mockBackend } from '@ramraiders/forma-sdk/mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app.js';
import { InfoStore } from './data/catalog.js';

beforeEach(() => {
  // jsdom implements neither.
  Element.prototype.scrollIntoView = vi.fn();
  document.body.innerHTML = '<div id="app"></div>';
  document.body.style.transform = '';
});

/** Cyber's own data for the NES, as public/systems/nes/info.json would give it. */
const infos = new InfoStore((url) =>
  url === './systems/nes/info.json'
    ? Promise.resolve({
        name: 'Nintendo Entertainment System',
        description: 'An 8-bit console.',
        specs: { maker: 'Nintendo', cpu: 'Ricoh 2A03' },
        chips: [{ role: 'CPU', part: 'Ricoh 2A03' }],
        curiosities: ['First fact.', 'Second fact.']
      })
    : Promise.reject(new Error('404'))
);

async function start(permissions: string[] = [], slow: Record<string, number> = {}) {
  const backend = mockBackend({ playMs: 50, permissions });
  // Commands answered late, as on a slow box.
  const invoke = backend.invoke.bind(backend);
  backend.invoke = async <T>(command: string, args?: Record<string, unknown>) => {
    const delay = slow[command];
    if (delay) await new Promise((r) => setTimeout(r, delay));
    return invoke<T>(command, args);
  };
  let send: (e: InputEvent) => void = () => {};
  const listen = backend.listen.bind(backend);
  backend.listen = <T>(event: string, handler: (p: T) => void) => {
    if (event === 'input') send = handler as (e: InputEvent) => void;
    return listen(event, handler);
  };
  const forma = await connect({ backend, keyboard: false });
  const root = document.querySelector<HTMLElement>('#app')!;
  await new App(forma, root, infos).start();

  const press = async (action: InputEvent['action'], repeat = false) => {
    send({ action, button: null, gamepad: 0, pressed: true, repeat });
    // Let the SDK calls the press started settle.
    await vi.waitFor(() => Promise.resolve());
    await new Promise((r) => setTimeout(r, 0));
  };
  const text = (selector: string) =>
    [...root.querySelectorAll(selector)].map((n) => n.textContent?.trim() ?? '');
  /** Start, down to the entry called `label`, A. */
  const openMenu = async (label: string) => {
    await press('start');
    for (let i = 0; i < 20 && text('.switcher li.selected .name')[0] !== label; i++) {
      await press('down');
    }
    expect(text('.switcher li.selected .name')).toEqual([label]);
    await press('confirm');
  };
  return { root, press, text, forma, openMenu };
}

describe('the default theme', () => {
  it('opens on the categories, with the systems and games in each', async () => {
    const { text } = await start();
    expect(text('h1')).toEqual(['Categories']);
    expect(text('h1.current')).toEqual(['Categories']);
    expect(text('.tile h2')).toEqual(['Consoles']);
    expect(text('.tile.selected .tag')).toEqual(['5 systems', '9 games']);
    expect(text('.hint')).toEqual(['AOpen', 'SelectViews', 'StartMenu']);
  });

  it('goes category → system → games, and back to where it was', async () => {
    const { press, text, root } = await start();
    await press('confirm');
    expect(text('.trail .crumb')).toEqual(['Consoles']);
    // Biggest libraries first.
    expect(text('.system-list .name')).toEqual([
      'Nintendo Entertainment System',
      'Mega Drive',
      'Super Famicom',
      'Homebrew',
      'PlayStation'
    ]);
    // The system's own page: Cyber's info, its specs, a curiosity, and its board behind.
    await vi.waitFor(() =>
      expect(text('.system-panel .description')).toEqual(['An 8-bit console.'])
    );
    expect(text('.system-panel dd')).toEqual(['Ricoh 2A03']);
    expect(text('.system-panel .fact p')).toEqual(['First fact.']);
    await press('north');
    expect(text('.system-panel .fact p')).toEqual(['Second fact.']);
    expect(root.querySelector('.backdrop .circuit text.part')?.textContent).toBe('Ricoh 2A03');
    expect(text('.hint')).toContain('AGames');

    // A system without info.json still shows, from Forma's data.
    await press('down');
    expect(text('.system-panel .name')).toEqual(['Mega Drive']);
    await press('up');

    await press('confirm');
    expect(text('.trail .crumb')).toEqual(['Consoles', 'Nintendo Entertainment System']);
    // Breadcrumbs: the step you are on is the lit one.
    expect(text('.trail .crumb.current')).toEqual(['Nintendo Entertainment System']);
    expect(text('h1.current')).toEqual([]);
    await vi.waitFor(() => expect(text('.row')).toContain('★ Super Mario Bros.'));
    expect(text('.row.selected')).toEqual(['Homebrew Demo']);
    await press('down');
    expect(text('.row.selected')).toEqual(['★ Super Mario Bros.']);
    await vi.waitFor(() => expect(text('.detail h2')).toEqual(['★ Super Mario Bros.']));
    expect(text('.detail .facts')[0]).toContain('1985');
    expect(text('.hint')).toContain('YFavourite');
    // The system's board stays behind its games.
    expect(root.querySelector('.backdrop .circuit')).not.toBeNull();

    await press('back');
    expect(text('.system-list li.selected .name')).toEqual(['Nintendo Entertainment System']);
    await press('back');
    expect(text('.tile.selected h2')).toEqual(['Consoles']);
    expect(root.querySelector('.backdrop .circuit')).toBeNull();
  });

  it('shows the loader while a slow screen loads, never on a quick one', async () => {
    const { press, text, root } = await start([], { nav_browse: 400 });
    await press('confirm');
    // Systems come from the catalogue already at hand: no loader.
    expect(root.querySelector('main .loader')).toBeNull();
    await press('confirm');
    await vi.waitFor(() => expect(text('main .loader-label')).toEqual(['Loading games…']));
    await vi.waitFor(() => expect(text('.row.selected')).toEqual(['Homebrew Demo']));
    expect(root.querySelector('main .loader')).toBeNull();
  });

  it('toggles a favourite in place', async () => {
    const { press, text } = await start();
    await press('confirm');
    await press('confirm');
    await vi.waitFor(() => expect(text('.row.selected')).toEqual(['Homebrew Demo']));
    await press('north');
    expect(text('.row.selected')).toEqual(['★ Homebrew Demo']);
    expect(text('.toast')).toEqual(['Added Homebrew Demo to favourites']);
  });

  it('launches a game, covers the screen while it runs, and comes back', async () => {
    const { press, root, text } = await start();
    await press('confirm');
    await press('confirm');
    await vi.waitFor(() => expect(text('.row.selected')).toEqual(['Homebrew Demo']));
    await press('confirm');
    const playing = root.querySelector<HTMLElement>('.playing')!;
    await vi.waitFor(() => expect(playing.hidden).toBe(false));
    expect(text('.launch .loader-label')).toEqual(['Starting Homebrew Demo']);
    expect(text('.launch .loader-detail')).toEqual(['Nintendo Entertainment System']);
    expect(root.querySelector('.launch .loader-chip')).not.toBeNull();
    await vi.waitFor(() => expect(playing.hidden).toBe(true));
  });

  it('switches view and sets the home view from the switcher', async () => {
    const { press, text, forma } = await start();
    await press('select');
    expect(text('.switcher li.selected .name')).toEqual(['Systems']);
    await press('down');
    await press('north');
    await vi.waitFor(async () =>
      expect((await forma.nav.defaultView()).id).toBe('manufacturer-system')
    );
    await press('confirm');
    await vi.waitFor(() => expect(text('h1')).toEqual(['By manufacturer']));
    expect(text('.card .label')).toEqual(['Nintendo', 'Sega', 'Sony', 'Unknown']);
  });

  it('opens a menu view into its branches', async () => {
    const { press, text } = await start();
    await press('select');
    for (let i = 0; i < 5; i++) await press('down');
    expect(text('.switcher li.selected .name')).toEqual(['Home']);
    await press('confirm');
    await vi.waitFor(() =>
      expect(text('.card .label')).toEqual([
        'Favourites',
        'Recently played',
        'Systems',
        'Manufacturers',
        'Genres'
      ])
    );
    await press('confirm');
    await vi.waitFor(() => expect(text('.row')).toEqual(['★ Super Mario Bros.']));
  });

  it('opens a system menu on Start, and power actions need a second press', async () => {
    const { press, text } = await start();
    await press('start');
    expect(text('.switcher li .name')).toEqual([
      'Views…',
      'Interface…',
      'Music…',
      'RetroAchievements…',
      'Netplay…',
      'Network…',
      'Game settings…',
      'System settings…',
      'Switch to EmulationStation',
      'Restart',
      'Shut down'
    ]);
    for (let i = 0; i < 9; i++) await press('down');
    await press('confirm');
    expect(text('.toast')).toEqual(['Press A again to restart']);
    await press('confirm');
    // The mock grants no permission, as a theme without `system.power` would get.
    await vi.waitFor(() => expect(text('.toast')[0]).toContain('system.power'));
    await press('back');
    // Closed: the normal hints are back.
    expect(text('.hint')).toContain('StartMenu');
  });

  it('joins a Wi-Fi network with a password typed on the on-screen keyboard', async () => {
    const { press, text, openMenu } = await start(['system.network']);
    await openMenu('Network…');
    const rows = () => text('.network > .panel li .name');
    await vi.waitFor(() => expect(rows()).toContain('▮▮▯▯  Office 5G'));
    expect(rows()[0]).toBe('Ethernet');
    expect(rows()[1]).toBe('Wi-Fi: on');
    expect(text('.network > .panel li .description')[0]).toBe('192.168.1.113 · automatic');

    // Down to Office 5G (Ethernet, Wi-Fi, Home, Cafe Guest, Office 5G).
    for (let i = 0; i < 4; i++) await press('down');
    await press('confirm');
    expect(text('.keyboard h2')).toEqual(['Password for Office 5G']);
    // A gamepad types the key under the cursor (row 2 starts at q); a keyboard types directly.
    await press('confirm');
    for (const key of 'uiet-place') {
      window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    }
    expect(text('.keyboard .field')).toEqual(['•••••••••••']);
    await press('north');
    expect(text('.keyboard .field')).toEqual(['quiet-place']);
    await press('start');
    // A cable is plugged in, so Wi-Fi is saved for later, as on Batocera.
    await vi.waitFor(() =>
      expect(text('.toast')[0]).toBe(
        'Office 5G is saved. The cable stays in use; unplug it to use Wi-Fi'
      )
    );
    await vi.waitFor(() =>
      expect(text('.network > .panel li .description')[1]).toBe(
        'Office 5G is saved; the cable is in use'
      )
    );
  });

  it('sets a static Ethernet address, and refuses an 802.1X network up front', async () => {
    const { press, text, forma, openMenu } = await start(['system.network']);
    await openMenu('Network…');
    await vi.waitFor(() => expect(text('.network > .panel li .name')).toContain('▮▮▯▯  Campus'));
    for (let i = 0; i < 5; i++) await press('down');
    await press('confirm');
    expect(text('.toast')[0]).toContain('802.1X');
    expect(text('.keyboard h2')).toEqual([]);

    for (let i = 0; i < 5; i++) await press('up');
    await press('confirm');
    expect(text('.network h2')).toContain('Ethernet');
    await press('down');
    await press('confirm');
    // The draft starts from the current address; change it with the keypad.
    expect(text('.network > .panel li .name')).toEqual([
      '○ Automatic (DHCP)',
      '● Manual',
      'Address',
      'Netmask',
      'Gateway',
      'DNS server',
      'Save'
    ]);
    await press('down');
    await press('confirm');
    expect(text('.keyboard h2')).toEqual(['Address']);
    await press('back');
    await press('back');
    await press('back');
    for (const key of '50') window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    await press('start');
    expect(text('.network > .panel li .description')[2]).toBe('192.168.1.50');
    for (let i = 0; i < 4; i++) await press('down');
    // Saving waits for connman to restart before reading the status again.
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const saving = press('confirm');
    await vi.advanceTimersByTimeAsync(5000);
    await saving;
    vi.useRealTimers();
    await vi.waitFor(() => expect(text('.toast')[0]).toBe('Ethernet uses 192.168.1.50'));
    const status = await forma.network.status();
    expect(status.ethernet?.config).toMatchObject({ method: 'manual', address: '192.168.1.50' });
  });

  it('keeps the selection on Wi-Fi after turning it off, so A turns it back on', async () => {
    const { press, text, openMenu } = await start(['system.network']);
    await openMenu('Network…');
    await vi.waitFor(() => expect(text('.network > .panel li .name')).toContain('Wi-Fi: on'));
    await press('down');
    await press('confirm');
    await vi.waitFor(() =>
      expect(text('.network > .panel li.selected .name')).toEqual(['Wi-Fi: off'])
    );
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const turningOn = press('confirm');
    await vi.advanceTimersByTimeAsync(5000);
    await turningOn;
    vi.useRealTimers();
    await vi.waitFor(() =>
      expect(text('.network > .panel li.selected .name')).toEqual(['Wi-Fi: on'])
    );
  });

  it('music: picks a playlist, shows it playing, and adds a web radio', async () => {
    const { press, text, openMenu } = await start(['music.manage']);
    await openMenu('Music…');
    const rows = () => text('.page > .panel li .name');
    await vi.waitFor(() => expect(rows()).toContain('Chiptune'));
    expect(rows()[0]).toBe('Nothing playing');
    expect(text('.page li.heading')).toEqual(['Folders and playlists', 'Web radios']);

    // Down to Chiptune: Nothing playing, Volume, Shuffle, Music, Chiptune.
    for (let i = 0; i < 4; i++) await press('down');
    expect(text('.page li.selected .name')).toEqual(['Chiptune']);
    await press('confirm');
    await vi.waitFor(() => expect(rows()[0]).toBe('Track 1'));
    expect(text('.now-playing .title')).toEqual(['Track 1']);
    // Rows were added above it (Pause, Next…): the selection stayed on Chiptune.
    expect(text('.page li.selected .name')).toEqual(['Chiptune']);
    expect(rows()).toContain('Pause');

    // Add a radio through the keyboard: name, then address.
    for (let i = 0; i < 20 && text('.page li.selected .name')[0] !== 'Add a web radio…'; i++) {
      await press('down');
    }
    expect(text('.page li.selected .name')).toEqual(['Add a web radio…']);
    await press('confirm');
    for (const key of 'Lofi') window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    await press('start');
    for (const key of 'lofi.example/live') {
      window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    }
    await press('start');
    await vi.waitFor(() => expect(text('.toast')[0]).toBe('Lofi added'));
    expect(rows()).toContain('Lofi');
  });

  it('RetroAchievements: signs in, and flips a switch', async () => {
    const { press, text, openMenu } = await start(['settings.batocera', 'settings.system']);
    await openMenu('RetroAchievements…');
    const rows = () => text('.page > .panel li .name');
    await vi.waitFor(() => expect(rows()[0]).toBe('Sign in…'));
    await press('confirm');
    expect(text('.keyboard h2')).toEqual(['RetroAchievements username']);
    // Clear what is there (the fixture's user; B on an empty field would cancel), then type.
    const filled = text('.keyboard .field')[0]!.length;
    for (let i = 0; i < filled; i++) await press('back');
    for (const key of 'mike') window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    await press('start');
    expect(text('.keyboard h2')).toEqual(['Password for mike']);
    for (const key of 'secret!') window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    await press('start');
    await vi.waitFor(() => expect(text('.toast')[0]).toBe('Signed in as mike'));
    expect(rows()[0]).toBe('Signed in as mike');

    await press('down');
    const before = text('.page li.selected .name')[0];
    await press('right');
    await vi.waitFor(() => expect(text('.page li.selected .name')[0]).not.toBe(before));
  });

  it('netplay: cycles the relay server and shows the custom one only when chosen', async () => {
    const { press, text, openMenu } = await start(['settings.batocera']);
    await openMenu('Netplay…');
    const rows = () => text('.page > .panel li .name');
    await vi.waitFor(() => expect(rows()).toContain('Relay server'));
    expect(rows()).not.toContain('Custom server');
    while (text('.page li.selected .name')[0] !== 'Relay server') await press('down');
    // Back from the first choice wraps to the last: Custom server.
    await press('left');
    await vi.waitFor(() => expect(rows()).toContain('Custom server'));
    expect(text('.page li.selected .description')).toEqual(['Custom server']);
  });

  it('interface: the theme in use, a bigger text size, and systems by name', async () => {
    const { press, text, openMenu } = await start(['settings.system']);
    await openMenu('Interface…');
    const rows = () => text('.page > .panel li .name');
    await vi.waitFor(() =>
      expect(text('.page li.heading')).toEqual(['Theme', 'Screen', 'Look', 'Sorting'])
    );

    // Overscan: everything shrinks evenly into what the TV shows.
    while (!text('.page li.selected .name')[0]!.startsWith('Screen margins')) await press('down');
    await press('right');
    await vi.waitFor(() => expect(text('.page li.selected .name')).toEqual(['Screen margins: 1%']));
    expect(document.body.style.transform).toBe('scale(0.98)');
    expect(text('.page li .description')[0]).toBe('In use');
    expect(rows()).toContain('Start on: Categories');

    while (!text('.page li.selected .name')[0]!.startsWith('Text size')) await press('down');
    await press('right');
    await vi.waitFor(() => expect(text('.page li.selected .name')).toEqual(['Text size: Large']));
    expect(document.documentElement.dataset.textSize).toBe('large');

    while (!text('.page li.selected .name')[0]!.startsWith('Systems')) await press('down');
    await press('right');
    await vi.waitFor(() => expect(text('.page li.selected .name')).toEqual(['Systems: By name']));
    await press('back');
    await press('confirm');
    await vi.waitFor(() =>
      expect(text('.system-list .name')).toEqual([
        'Homebrew',
        'Mega Drive',
        'Nintendo Entertainment System',
        'PlayStation',
        'Super Famicom'
      ])
    );
  });

  it('game settings: global options, a choice cycled, a page of its own and back', async () => {
    const { press, text, openMenu } = await start(['settings.emulators']);
    await openMenu('Game settings…');
    const rows = () => text('.page > .panel li[role=option] .name');
    const selected = () => text('.page li.selected .name')[0];
    await vi.waitFor(() => expect(rows()).toContain('Game aspect ratio'));
    expect(text('.page h2')).toEqual(['Game settings']);
    expect(rows()).toContain('Game rendering & shaders…');
    while (selected() !== 'Game aspect ratio') await press('down');
    expect(text('.page li.selected .description')).toEqual(['Default']);
    await press('right');
    await vi.waitFor(() => expect(text('.page li.selected .description')).toEqual(['4/3']));
    // Its own page: B comes back to the row it was opened from.
    while (selected() !== 'Game rendering & shaders…') await press('down');
    await press('confirm');
    await vi.waitFor(() => expect(text('.page h2')).toEqual(['Game rendering & shaders']));
    expect(rows()).toEqual(['Shader set', 'Integer scaling (pixel perfect)']);
    await press('back');
    await vi.waitFor(() => expect(text('.page h2')).toEqual(['Game settings']));
    expect(selected()).toBe('Game rendering & shaders…');
  });

  it("a system's options follow its core, and a game inherits them", async () => {
    const { press, text, openMenu } = await start(['settings.emulators']);
    const rows = () => text('.page > .panel li[role=option] .name');
    await press('confirm');
    await vi.waitFor(() =>
      expect(text('.system-list .name')[0]).toBe('Nintendo Entertainment System')
    );
    await openMenu('Nintendo Entertainment System options…');
    await vi.waitFor(() => expect(rows().slice(0, 2)).toEqual(['Emulator', 'Core']));
    expect(text('.page .heading')).toContain('Advanced options');
    expect(rows()).toContain('Palette');
    while (text('.page li.selected .name')[0] !== 'Core') await press('down');
    // Default (fceumm) → the first core in the list, then the next: nestopia, whose options
    // have no palette.
    await press('right');
    await press('right');
    await vi.waitFor(() => expect(text('.page li.selected .description')).toEqual(['nestopia']));
    expect(rows()).not.toContain('Palette');
    await press('back');

    // A game of the NES: its core is the system's.
    await press('confirm');
    await vi.waitFor(() => expect(text('.games .row').length).toBeGreaterThan(0));
    await press('start');
    expect(text('.switcher li.selected .name')[0]).toMatch(/ options…$/);
    await press('confirm');
    await vi.waitFor(() => expect(rows()).toContain('Core'));
    const core = rows().indexOf('Core');
    expect(text('.page > .panel li[role=option] .description')[core]).toBe(
      'Default · nestopia (system)'
    );
  });

  it('system settings: information, a long list picked from, and when it applies', async () => {
    const { press, text, openMenu } = await start(['system.settings']);
    await openMenu('System settings…');
    const rows = () => text('.page > .panel li[role=option] .name');
    const selected = () => text('.page li.selected .name')[0];
    await vi.waitFor(() => expect(rows()).toContain('Time zone'));
    expect(text('.page .heading')).toEqual([
      'Display',
      'Audio',
      'Language & region',
      'System',
      'Storage'
    ]);
    await press('confirm');
    await vi.waitFor(() => expect(text('.page h2')).toEqual(['About this box']));
    expect(rows()[0]).toBe('Batocera');
    await press('back');
    // 36 languages: a list to pick from, starting on the one in use.
    while (selected() !== 'Language') await press('down');
    await press('confirm');
    await vi.waitFor(() => expect(text('.page h2')).toEqual(['Language']));
    expect(selected()).toBe('✓ English (US)');
    await press('down');
    await press('confirm');
    await vi.waitFor(() => expect(text('.page h2')).toEqual(['System settings']));
    await vi.waitFor(() =>
      expect(text('.page li.selected .description')).toEqual([
        'English (UK) · after Forma restarts'
      ])
    );
  });

  it('turns Batocera labels into sentence case, keeping acronyms', async () => {
    const { sentence } = await import('./ui/settings.js');
    expect(sentence('GAME ASPECT RATIO')).toBe('Game aspect ratio');
    expect(sentence('ENABLE AI TRANSLATION SERVICE')).toBe('Enable AI translation service');
    expect(sentence('STRETCH BEZELS (4K & ULTRAWIDE)')).toBe('Stretch bezels (4K & ultrawide)');
    expect(sentence('Already fine')).toBe('Already fine');
  });
});
