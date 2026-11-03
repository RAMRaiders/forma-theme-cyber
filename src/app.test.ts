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
  return { root, press, text, forma, backend };
}

describe('the default theme', () => {
  it('opens on the categories, with the systems and games in each', async () => {
    const { text } = await start();
    expect(text('h1')).toEqual(['Categories']);
    expect(text('h1.current')).toEqual(['Categories']);
    expect(text('.tile h2')).toEqual(['Consoles', 'All games']);
    expect(text('.tile.selected .tag')).toEqual(['5 systems', '9 games']);
    expect(text('.hint')).toEqual(['AOpen', 'StartMenu']);
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
      expect(text('.system-panel > :not(.leaving) .description')).toEqual(['An 8-bit console.'])
    );
    expect(text('.system-panel > :not(.leaving) dd')).toEqual(['Ricoh 2A03']);
    // The stage: its games as a readout, its place in the rail, a callout on the left.
    expect(text('.system-panel > :not(.leaving) .tally .count')).toEqual(['3']);
    expect(text('.system-panel > :not(.leaving) .specs-left dt')).toEqual(['CPU']);
    expect(text('.system-panel > :not(.leaving) > .fact:not(.leaving) p')).toEqual(['First fact.']);
    await press('north');
    expect(text('.system-panel > :not(.leaving) > .fact:not(.leaving) p')).toEqual([
      'Second fact.'
    ]);
    expect(root.querySelector('.backdrop .circuit text.part')?.textContent).toBe('Ricoh 2A03');
    expect(text('.hint')).toContain('AGames');

    // A system without info.json still shows, from Forma's data.
    await press('down');
    // The rail moves at once; the stage follows once the selection rests.
    expect(text('.system-list li.selected .name')).toEqual(['Mega Drive']);
    await vi.waitFor(() =>
      expect(text('.system-panel > :not(.leaving) .name')).toEqual(['Mega Drive'])
    );
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

  it('shows the library one way: any view Forma opens brings back the categories', async () => {
    const { press, text, backend } = await start();
    await press('confirm');
    await vi.waitFor(() => expect(text('.system-list .name').length).toBeGreaterThan(0));
    await backend.invoke('shell_open_view', { view: 'manufacturer-system' });
    await vi.waitFor(() => expect(text('h1')).toEqual(['Categories']));
    await vi.waitFor(() => expect(text('.categories .tile').length).toBeGreaterThan(0));
  });

  /** Down from the categories until a shortcut is selected, then right to `label`. */
  const toShortcut = async (
    press: (action: InputEvent['action']) => Promise<void>,
    text: (selector: string) => string[],
    label: string
  ) => {
    for (let i = 0; i < 20 && text('.shortcut.selected h2').length === 0; i++) await press('down');
    for (let i = 0; i < 5 && text('.shortcut.selected h2')[0] !== label; i++) await press('right');
    expect(text('.shortcut.selected h2')).toEqual([label]);
  };

  it('has shortcuts under the categories: favourites opens them', async () => {
    const { press, text } = await start();
    await vi.waitFor(() =>
      expect(text('.shortcut h2')).toEqual([
        'Favourites',
        'Magazines',
        'Collections',
        'Recommended'
      ])
    );
    expect(text('.shortcut-favorites .tag')).toEqual(['1 game']);
    await toShortcut(press, text, 'Favourites');
    await press('confirm');
    await vi.waitFor(() => expect(text('.row')).toEqual(['★ Super Mario Bros.']));
    expect(text('.crumb')).toEqual(['Favourites']);
    await press('back');
    await vi.waitFor(() => expect(text('.shortcut.selected h2')).toEqual(['Favourites']));
  });

  it('has a Collections shortcut: the lists, then a list’s games', async () => {
    const { press, text } = await start();
    await vi.waitFor(() => expect(text('.shortcut-collections .tag')).toEqual(['1 list']));
    await toShortcut(press, text, 'Collections');
    await press('confirm');
    await vi.waitFor(() => expect(text('.crumb')).toEqual(['Collections']));
    await vi.waitFor(() => expect(text('.grid .card .label')).toEqual(['Couch co-op']));
    expect(text('.grid .card .count')).toEqual(['2 games']);
    await press('confirm');
    await vi.waitFor(() => expect(text('.games .row')).toHaveLength(2));
    expect(text('.crumb')).toEqual(['Collections', 'Couch co-op']);
  });

  it('has an All games tile after the categories, listing every game A to Z', async () => {
    const { press, text } = await start();
    await vi.waitFor(() => expect(text('.categories .tile h2').at(-1)).toBe('All games'));
    const tiles = text('.categories .tile h2').length;
    for (let i = 1; i < tiles; i++) await press('right');
    expect(text('.tile.selected h2')).toEqual(['All games']);
    await press('confirm');
    await vi.waitFor(() => expect(text('.games .row').length).toBeGreaterThan(1));
    const names = text('.games .row').map((n) => n.replace(/^★ /, ''));
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(text('.crumb')).toEqual(['All games']);
  });

  it('draws each new song its own way, for the time Forma says, then sweeps it away', async () => {
    const { text, root, backend } = await start(['settings.system']);
    await backend.invoke('settings_set', { scope: 'system', key: 'music.songSeconds', value: 1 });
    const sources = await backend.invoke<{ id: string; kind: string }[]>('music_sources');
    await backend.invoke('music_play', { source: sources.find((s) => s.kind !== 'radio')!.id });
    const card = root.querySelector<HTMLElement>('.song-card')!;
    await vi.waitFor(() => expect(card.hidden).toBe(false));
    expect(text('.song-card .title')).toEqual(['Track 1']);
    expect(card.style.getPropertyValue('--seconds')).toBe('1s');
    await vi.waitFor(() => expect(card.classList.contains('out')).toBe(true), { timeout: 2000 });
    await vi.waitFor(() => expect(card.hidden).toBe(true), { timeout: 2000 });
  });

  it('shows what is coming later, and says so rather than opening it', async () => {
    const { press, text } = await start();
    await vi.waitFor(() => expect(text('.shortcut').length).toBe(4));
    expect(text('.shortcut.soon h2')).toEqual(['Magazines']);
    await toShortcut(press, text, 'Magazines');
    await press('confirm');
    expect(text('.toast')).toEqual(['Magazines is coming in a later version']);
    expect(text('.shortcut.selected h2')).toEqual(['Magazines']);
  });

  it('has a Recommended shortcut: games not played yet', async () => {
    const { press, text } = await start();
    await vi.waitFor(() => expect(text('.shortcut-recommended .tag')[0]).toMatch(/ games?$/));
    await toShortcut(press, text, 'Recommended');
    await press('confirm');
    await vi.waitFor(() => expect(text('.crumb')).toEqual(['Recommended']));
    await vi.waitFor(() => expect(text('.games .row').length).toBeGreaterThan(0));
  });

  it('leaves Start and Select to Forma, and shows its menu is there', async () => {
    const { press, text } = await start();
    await press('start');
    await press('select');
    expect(text('.switcher, .page, .keyboard')).toEqual([]);
    expect(text('.hint')).toEqual(['AOpen', 'StartMenu']);
  });

  it('tells Forma’s menu the system and game selected, once the selection rests', async () => {
    const { press, text, backend } = await start();
    const context = async () =>
      (await backend.invoke<{ context: Record<string, unknown> }>('shell_info')).context;
    await press('confirm');
    await vi.waitFor(() =>
      expect(text('.system-list .name')[0]).toBe('Nintendo Entertainment System')
    );
    await vi.waitFor(async () =>
      expect(await context()).toMatchObject({
        view: 'systems',
        system: { name: 'nes', fullname: 'Nintendo Entertainment System' },
        game: null
      })
    );
    await press('confirm');
    await vi.waitFor(() => expect(text('.games .row').length).toBeGreaterThan(0));
    await vi.waitFor(async () =>
      expect(await context()).toMatchObject({ system: { name: 'nes' }, game: { id: 1 } })
    );
  });

  it('follows its settings as Forma’s menu changes them', async () => {
    const { press, text, backend } = await start(['settings.system']);
    await backend.invoke('shell_set_theme_setting', { key: 'textSize', value: 'large' });
    expect(document.documentElement.dataset.textSize).toBe('large');
    await backend.invoke('shell_set_theme_setting', { key: 'board', value: 42 });
    expect(document.documentElement.dataset.board).toBe('on');

    await backend.invoke('shell_set_theme_setting', { key: 'systemsSort', value: 'name' });
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

  it('reads its settings one by one, over the single object it used to keep', async () => {
    const backend = mockBackend({ permissions: [] });
    await backend.invoke('settings_set', {
      key: 'interface',
      value: { textSize: 'small', board: 'dim' }
    });
    await backend.invoke('settings_set', { key: 'board', value: 'off' });
    const forma = await connect({ backend, keyboard: false });
    await new App(forma, document.querySelector<HTMLElement>('#app')!, infos).start();
    expect(document.documentElement.dataset.textSize).toBe('small');
    expect(document.documentElement.dataset.board).toBe('off');
  });
});
