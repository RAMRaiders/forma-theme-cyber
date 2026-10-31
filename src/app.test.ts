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

async function start(permissions: string[] = []) {
  const backend = mockBackend({ playMs: 50, permissions });
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
  return { root, press, text, forma };
}

describe('the default theme', () => {
  it('opens on the categories, with the systems and games in each', async () => {
    const { text } = await start();
    expect(text('h1')).toEqual(['Systems']);
    expect(text('.tile h2')).toEqual(['Consoles']);
    expect(text('.tile.selected .count')).toEqual(['5 systems · 9 games']);
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
    expect(playing.textContent).toBe('Starting Homebrew Demo…');
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
      'Network…',
      'Switch to EmulationStation',
      'Restart',
      'Shut down'
    ]);
    await press('down');
    await press('down');
    await press('down');
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
    const { press, text } = await start(['system.network']);
    await press('start');
    await press('down');
    await press('confirm');
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
    const { press, text, forma } = await start(['system.network']);
    await press('start');
    await press('down');
    await press('confirm');
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
    const { press, text } = await start(['system.network']);
    await press('start');
    await press('down');
    await press('confirm');
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
});
