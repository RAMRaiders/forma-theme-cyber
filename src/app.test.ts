// @vitest-environment jsdom
/**
 * The whole theme, driven like a gamepad would, against the SDK's mock (the real engine's
 * output for the fixture library). jsdom has no layout, so this checks behaviour and wiring,
 * not looks.
 */
import { connect, type Browse, type InputEvent } from '@ramraiders/forma-sdk';
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
        curiosities: ['First fact.', 'Second fact.'],
        story: ['It began.', 'It sold.', 'It lasted.']
      })
    : Promise.reject(new Error('404'))
);

async function start(
  permissions: string[] = [],
  slow: Record<string, number> = {},
  store: InfoStore = infos
) {
  const backend = mockBackend({ playMs: 50, permissions: [...permissions, 'settings.system'] });
  // Systems oldest first (Forma's order, as its Select menu sets it): the NES leads.
  await backend.invoke('settings_set', {
    key: 'library.systemsOrder',
    value: 'year',
    scope: 'system'
  });
  // Commands answered late, as on a slow box.
  const invoke = backend.invoke.bind(backend);
  backend.invoke = async <T>(command: string, args?: Record<string, unknown>) => {
    const delay = slow[command];
    if (delay) await new Promise((r) => setTimeout(r, delay));
    return invoke<T>(command, args);
  };
  let send: (e: InputEvent) => void = () => {};
  // Every listener, to send what Forma would (the mock sends only some events itself).
  const handlers = new Map<string, ((p: unknown) => void)[]>();
  const listen = backend.listen.bind(backend);
  backend.listen = <T>(event: string, handler: (p: T) => void) => {
    if (event === 'input') send = handler as (e: InputEvent) => void;
    handlers.set(event, [...(handlers.get(event) ?? []), handler as (p: unknown) => void]);
    return listen(event, handler);
  };
  const fire = (event: string, payload: unknown) => {
    for (const h of handlers.get(event) ?? []) h(payload);
  };
  const forma = await connect({ backend, keyboard: false });
  const root = document.querySelector<HTMLElement>('#app')!;
  await new App(forma, root, store).start();

  const press = async (action: InputEvent['action'], repeat = false) => {
    send({ action, button: null, gamepad: 0, pressed: true, repeat });
    // Let the SDK calls the press started settle.
    await vi.waitFor(() => Promise.resolve());
    await new Promise((r) => setTimeout(r, 0));
  };
  const text = (selector: string) =>
    [...root.querySelectorAll(selector)].map((n) => n.textContent?.trim() ?? '');
  return { fire, root, press, text, forma, backend };
}

describe('the default theme', () => {
  it('opens on the categories, with the systems and games in each', async () => {
    const { text } = await start();
    expect(text('h1')).toEqual(['Categories']);
    expect(text('h1.current')).toEqual(['Categories']);
    expect(text('.tile h2')).toEqual(['Consoles', 'All games', 'Magazines']);
    expect(text('.tile.selected .tag')).toEqual(['5 systems', '9 games']);
    expect(text('.hint')).toEqual(['AOpen', 'StartMenu']);
  });

  it('names a system in the breadcrumb, even one with a logo', async () => {
    const withLogo = new InfoStore((url) =>
      url === './systems/art.json'
        ? Promise.resolve({ nes: { logo: 'logo.webp', logoDark: true, picture: null } })
        : Promise.reject(new Error('404'))
    );
    const { press, root, text } = await start([], {}, withLogo);
    await press('confirm');
    await press('confirm');
    await vi.waitFor(() =>
      expect(text('.trail .crumb')).toEqual(['Consoles', 'Nintendo Entertainment System'])
    );
    expect(root.querySelector('.trail .crumb-logo')).toBeNull();
  });

  it('goes category → system → games, and back to where it was', async () => {
    const { press, text, root } = await start();
    await press('confirm');
    expect(text('.trail .crumb')).toEqual(['Consoles']);
    // In the order Forma lists them: oldest first here.
    expect(text('.system-list .name')).toEqual([
      'Nintendo Entertainment System',
      'Mega Drive',
      'Super Famicom',
      'PlayStation',
      'Homebrew'
    ]);
    // The system's own page: Cyber's info, its maker, a curiosity, and its board behind.
    await vi.waitFor(() =>
      expect(text('.system-panel > :not(.leaving) .description')).toEqual(['An 8-bit console.'])
    );
    // The description first; the story's chapters take turns with it.
    expect(text('.system-panel > :not(.leaving) .reading .description')).toEqual([
      'An 8-bit console.'
    ]);
    // Beside the console: its maker.
    expect(text('.system-panel > :not(.leaving) .maker')).toEqual(['Nintendo']);
    // Left of the console, its hardware.
    expect(text('.system-panel > :not(.leaving) .hardware dt')).toEqual(['CPU']);
    expect(text('.system-panel > :not(.leaving) .hardware dd')).toEqual(['Ricoh 2A03']);
    // Not how many of its games are here: the strip of systems says.
    expect(root.querySelector('.system-panel .owned')).toBeNull();
    // Its page just shows: the system is switched on as its games open, not as it comes.
    expect(document.querySelector('.boot')).toBeNull();
    expect(text('.system-panel > :not(.leaving) > .fact:not(.leaving) p')).toEqual(['First fact.']);
    await press('north');
    expect(text('.system-panel > :not(.leaving) > .fact:not(.leaving) p')).toEqual([
      'Second fact.'
    ]);
    // Neon, the default look: nothing behind but the dark.
    expect(root.querySelector('.backdrop .circuit')).toBeNull();
    expect(text('.hint')).toContain('AGames');

    // A system without info.json still shows, from Forma's data.
    await press('down');
    // The strip moves at once; the page changes under it when the selection rests.
    expect(text('.system-list li.selected .name')).toEqual(['Mega Drive']);
    expect(text('.system-panel > :not(.leaving) .name')).toEqual(['Nintendo Entertainment System']);
    await vi.waitFor(() =>
      expect(text('.system-panel > :not(.leaving) .name')).toEqual(['Mega Drive'])
    );
    expect(root.querySelector('.systems.browsing')).not.toBeNull(); // still over the new page
    await press('up');

    await press('confirm'); // A opens it at once, the strip or not
    // Switched on as its games open: its logo or name, lit, over the whole screen a moment.
    expect(document.querySelector('body > .boot.whole')).not.toBeNull();
    expect(text('.trail .crumb')).toEqual(['Consoles', 'Nintendo Entertainment System']);
    // Breadcrumbs: the step you are on is the lit one.
    expect(text('.trail .crumb.current')).toEqual(['Nintendo Entertainment System']);
    expect(text('h1.current')).toEqual([]);
    expect(root.querySelector<HTMLElement>('h1')!.hidden).toBe(true); // the root goes unsaid
    // Names only: a favourite is marked on its stage, not in the list.
    await vi.waitFor(() => expect(text('.row')).toContain('Super Mario Bros.'));
    expect(text('.row.selected')).toEqual(['Homebrew Demo']);
    await press('down');
    expect(text('.row.selected')).toEqual(['Super Mario Bros.']);
    await vi.waitFor(() => expect(text('.detail h2')).toEqual(['Super Mario Bros.']));
    expect(text('.detail .tag.favourite')).toEqual(['★ Favourite']);
    expect(text('.detail .facts')[0]).toContain('1985');
    expect(text('.hint')).toContain('YFavourite');
    // In the default look nothing is behind its games either.
    expect(root.querySelector('.backdrop .circuit')).toBeNull();

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
    expect(text('.detail .tag.favourite')).toEqual([]);
    await press('north');
    expect(text('.row.selected')).toEqual(['Homebrew Demo']);
    expect(text('.detail .tag.favourite')).toEqual(['★ Favourite']);
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
    await vi.waitFor(() => expect(text('.launch .loader-label')).toEqual(['Starting game']));
    expect(text('.launch .launch-title')).toEqual(['Homebrew Demo']);
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

  it('shows a game Forma’s menu chose, in its system, as if browsed to', async () => {
    const { press, text, backend } = await start();
    const [hit] = await backend.invoke<{ id: number; name: string; system: string }[]>(
      'library_search',
      { query: 'sonic' }
    );
    await backend.invoke('shell_open_game', { id: hit!.id });
    await vi.waitFor(() => expect(text('.row.selected')).toEqual([hit!.name]));
    // Back climbs out the usual way: its system, among the others.
    await press('back');
    await vi.waitFor(() => expect(text('.system-list li.selected .name')).toEqual(['Mega Drive']));
  });

  it('shows the Collector’s shelf when its list is narrowed down, and when Back undoes it', async () => {
    const { press, text, backend, root, fire } = await start();
    const [hit] = await backend.invoke<{ id: number; name: string }[]>('library_search', {
      query: 'sonic'
    });
    await backend.invoke('shell_open_game', { id: hit!.id });
    await vi.waitFor(() => expect(text('.row.selected')).toEqual([hit!.name]));
    fire('settings:changed', { scope: 'theme', key: 'gamesView', value: 'collector' });
    await vi.waitFor(() => expect(root.querySelector('.collector')).not.toBeNull());
    const shelf = () => root.querySelector('.collector.browsing') !== null;
    await vi.waitFor(() => expect(shelf()).toBe(false), { timeout: 3000 });
    await backend.invoke('nav_set_filter', { filter: { games: [hit!.id] } });
    await vi.waitFor(() => expect(text('.crumb.current')).toEqual(['Filtered']));
    expect(shelf()).toBe(true);
    await vi.waitFor(() => expect(shelf()).toBe(false), { timeout: 3000 });
    await press('back');
    await vi.waitFor(() => expect(text('.crumb.current')).not.toEqual(['Filtered']));
    expect(shelf()).toBe(true);
  });

  it('shows only the games Forma’s menu narrowed the list to; Back, every game again', async () => {
    const { press, text, backend, root } = await start();
    const [hit] = await backend.invoke<{ id: number; name: string }[]>('library_search', {
      query: 'sonic'
    });
    await backend.invoke('shell_open_game', { id: hit!.id });
    await vi.waitFor(() => expect(text('.row.selected')).toEqual([hit!.name]));
    const every = text('.row .name').length;
    expect(every).toBeGreaterThan(1);
    // Select > Versions and duplicates: only them.
    await backend.invoke('nav_set_filter', { filter: { games: [hit!.id] } });
    await vi.waitFor(() => expect(text('.row .name')).toEqual([hit!.name]));
    expect(text('.crumb.current')).toEqual(['Filtered']);
    // Back: the whole list again, on the same game, shown so the change is seen; Back once more
    // climbs out.
    root.querySelector('.games')?.classList.add('resting');
    await press('back');
    await vi.waitFor(() => expect(text('.row .name')).toHaveLength(every));
    expect(root.querySelector('.games')?.classList.contains('resting')).toBe(false);
    expect(text('.row.selected')).toEqual([hit!.name]);
    await press('back');
    await vi.waitFor(() => expect(text('.system-list li.selected .name')).toEqual(['Mega Drive']));
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
        'Last played',
        'Favourites',
        'Collections',
        'Recommended'
      ])
    );
    expect(text('.shortcut-favorites .tag')).toEqual(['1 game']);
    await toShortcut(press, text, 'Favourites');
    await press('confirm');
    await vi.waitFor(() => expect(text('.row')).toEqual(['Super Mario Bros.']));
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
    await vi.waitFor(() => expect(text('.categories .tile h2').at(-2)).toBe('All games'));
    const tiles = text('.categories .tile h2').length;
    for (let i = 1; i < tiles - 1; i++) await press('right');
    expect(text('.tile.selected h2')).toEqual(['All games']);
    await press('confirm');
    await vi.waitFor(() => expect(text('.games .row').length).toBeGreaterThan(1));
    const names = text('.games .row');
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

  it('has a Magazines tile after All games, opening Forma’s reader', async () => {
    const { press, text, backend } = await start();
    const opened: unknown[] = [];
    backend.listen('magazines:open', (e) => opened.push(e));
    await vi.waitFor(() => expect(text('.categories .tile h2').at(-1)).toBe('Magazines'));
    expect(text('.tile-magazines .tag')[0]).toMatch(/ magazines?$|^None yet$/);
    const tiles = text('.categories .tile h2').length;
    for (let i = 1; i < tiles; i++) await press('right');
    expect(text('.tile.selected h2')).toEqual(['Magazines']);
    await press('confirm');
    await vi.waitFor(() => expect(opened).toEqual([{ id: null }]));
  });

  it('has a Last played shortcut: the games played, the latest first', async () => {
    const { press, text } = await start();
    await vi.waitFor(() => expect(text('.shortcut-recent .tag')[0]).toMatch(/ games?$|^None yet$/));
    await toShortcut(press, text, 'Last played');
    await press('confirm');
    await vi.waitFor(() => expect(text('.crumb')).toEqual(['Last played']));
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

  it('leaves the systems screen alone while the library changes', async () => {
    const { press, text, fire } = await start();
    await press('confirm');
    await vi.waitFor(() =>
      expect(text('.system-list .name')[0]).toBe('Nintendo Entertainment System')
    );
    const strip = document.querySelector('.systems')!;
    expect(strip.classList.contains('browsing')).toBe(false); // none on arriving
    const page = document.querySelector('.stage-page');
    fire('library:changed', null);
    await new Promise((done) => setTimeout(done, 450));
    expect(strip.classList.contains('browsing')).toBe(false);
    expect(document.querySelector('.stage-page')).toBe(page);
  });

  it('follows its settings as Forma’s menu changes them', async () => {
    const { press, text, backend, fire } = await start(['settings.system']);
    await backend.invoke('shell_set_theme_setting', { key: 'textSize', value: 'large' });
    expect(document.documentElement.dataset.textSize).toBe('large');
    await backend.invoke('shell_set_theme_setting', { key: 'board', value: 42 });
    expect(document.documentElement.dataset.board).toBe('on');

    // Systems as Forma lists them; then in the order its Select menu sets.
    await press('confirm');
    await vi.waitFor(() =>
      expect(text('.system-list .name')[0]).toEqual('Nintendo Entertainment System')
    );
    await backend.invoke('settings_set', {
      key: 'library.systemsOrder',
      value: 'name',
      scope: 'system'
    });
    fire('settings:changed', { scope: 'system', key: 'library.systemsOrder', value: 'name' });
    const byName = (await backend.invoke<{ fullname: string }[]>('library_systems')).map(
      (s) => s.fullname
    );
    expect(byName[0]).toBe('Homebrew');
    await vi.waitFor(() => expect(text('.system-list .name')).toEqual(byName));
  });

  it('switches a game list to the Collector view in place, its box turned left and right', async () => {
    const { press, root, fire, text, backend } = await start();
    await press('confirm');
    await press('confirm');
    await vi.waitFor(() => expect(root.querySelector('.games')).not.toBeNull());
    fire('settings:changed', { scope: 'theme', key: 'gamesView', value: 'collector' });
    await vi.waitFor(() => expect(root.querySelector('.collector')).not.toBeNull());
    expect(root.querySelector('.games')).toBeNull();
    expect(text('.spine-row[aria-selected="true"] .title')).toHaveLength(1);
    expect(text('.hint')).toContain('◀ ▶Turn');
    const box = root.querySelector<HTMLElement>('.cbox')!;
    await press('right');
    expect(box.dataset.pose).toBe('spine');
    await press('left');
    expect(box.dataset.pose).toBe('front');
    // Up and down still move along the shelf.
    await press('down');
    expect(text('.spine-row[aria-selected="true"] .title')).toHaveLength(1);
    // A plays it there and then, the shelf still showing.
    expect(root.querySelector('.collector.browsing')).not.toBeNull();
    const invoke = vi.spyOn(backend, 'invoke');
    await press('confirm');
    expect(invoke.mock.calls.map(([command]) => command)).toContain('launch_game');
  });

  it('stays on the game selected when a reload moves it, as a rename by a scraper does', async () => {
    const { press, root, fire, text, backend } = await start();
    await press('confirm');
    await press('confirm');
    await vi.waitFor(() => expect(root.querySelector('.games')).not.toBeNull());
    fire('settings:changed', { scope: 'theme', key: 'gamesView', value: 'collector' });
    await vi.waitFor(() => expect(text('.spine-row[aria-selected="true"] .title')).toHaveLength(1));
    const picked = text('.spine-row[aria-selected="true"] .title');
    const invoke = backend.invoke.bind(backend);
    vi.spyOn(backend, 'invoke').mockImplementation(async (command, args) => {
      const answer = await invoke(command, args);
      if (command !== 'nav_browse') return answer;
      const browse = answer as Browse;
      if (browse.listing.kind !== 'games') return answer;
      const items = [...browse.listing.items].reverse();
      return { ...browse, listing: { ...browse.listing, items } };
    });
    const rows = () => [...root.querySelectorAll<HTMLElement>('.spine-row')];
    const at = () => rows().findIndex((r) => r.getAttribute('aria-selected') === 'true');
    expect(at()).toBe(0);
    fire('library:changed', null);
    await vi.waitFor(() => expect(at()).toBe(rows().length - 1));
    expect(text('.spine-row[aria-selected="true"] .title')).toEqual(picked);
  });

  it('draws a game again when its pictures are replaced, from new addresses', async () => {
    const { press, root, fire, backend } = await start();
    const invoke = backend.invoke.bind(backend);
    vi.spyOn(backend, 'invoke').mockImplementation(async (command, args) => {
      const answer = await invoke(command, args);
      if (command !== 'nav_browse') return answer;
      const browse = answer as Browse;
      if (browse.listing.kind !== 'games') return answer;
      const media = { boxside: 'side.png', fanart: 'fan.png', thumbnail: 'box.png' };
      const items = browse.listing.items.map((game) => ({ ...game, media }));
      return { ...browse, listing: { ...browse.listing, items } };
    });
    const asked = vi.spyOn(backend, 'mediaUrl');
    await press('confirm');
    await press('confirm');
    await vi.waitFor(() => expect(root.querySelector('.games')).not.toBeNull());
    fire('settings:changed', { scope: 'theme', key: 'gamesView', value: 'collector' });
    await vi.waitFor(() =>
      expect(root.querySelector('.spine-row[aria-selected="true"]')).not.toBeNull()
    );
    await vi.waitFor(() => expect(asked.mock.calls.some((c) => c[1] !== 'boxside')).toBe(true));
    const game = asked.mock.calls.filter((c) => c[1] !== 'boxside').at(-1)![0];
    asked.mockClear();
    fire('media:changed', { game });
    const again = asked.mock.calls.filter((c) => c[0] === game);
    expect(again.map((c) => c[1])).toContain('boxside');
    expect(again.some((c) => c[1] !== 'boxside')).toBe(true);
    expect(again.every((c) => c[3] === 1)).toBe(true);
  });

  it('opens a list where it was left, systems and games alike', async () => {
    const { press, root, text } = await start();
    await press('confirm');
    await vi.waitFor(() => expect(text('.system-list li.selected .name')).toHaveLength(1));
    await press('down');
    expect(text('.system-list li.selected .name')).toEqual(['Mega Drive']);
    await press('back');
    await vi.waitFor(() => expect(root.querySelector('.systems')).toBeNull());
    await press('confirm');
    await vi.waitFor(() => expect(text('.system-list li.selected .name')).toEqual(['Mega Drive']));

    await press('up');
    await press('confirm');
    await vi.waitFor(() => expect(text('.row.selected')).toEqual(['Homebrew Demo']));
    await press('down');
    expect(text('.row.selected')).toEqual(['Super Mario Bros.']);
    await press('back');
    await vi.waitFor(() => expect(root.querySelector('.systems')).not.toBeNull());
    expect(text('.system-list li.selected .name')).toEqual(['Nintendo Entertainment System']);
    await press('confirm');
    await vi.waitFor(() => expect(text('.row.selected')).toEqual(['Super Mario Bros.']));
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
