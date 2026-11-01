import type {
  Action,
  Browse,
  Forma,
  Game,
  GameStart,
  InputEvent,
  MusicStatus,
  ViewInfo
} from '@ramraiders/forma-sdk';
import { FormaError } from '@ramraiders/forma-sdk';

import { CATEGORIES, InfoStore, group } from './data/catalog.js';
import {
  DEFAULT_PREFS,
  MARGINS_SETTING,
  type Prefs,
  applyMargins,
  applyPrefs,
  loadMargins,
  loadPrefs,
  savePrefs
} from './data/prefs.js';
import { type Move, moveGrid, moveList } from './logic/nav.js';
import { LazyList } from './logic/pager.js';
import { el } from './ui/dom.js';
import { type Card, GridView } from './ui/grid.js';
import { GamesView } from './ui/games.js';
import { HomeView, type Tile } from './ui/home.js';
import { Menu } from './ui/menu.js';
import { loader } from './ui/loader.js';
import { NetworkScreen } from './ui/network.js';
import { Page } from './ui/page.js';
import { optionsScreen, systemSettingsScreen } from './ui/settings.js';
import {
  interfaceScreen,
  musicScreen,
  netplayScreen,
  nowPlaying,
  retroAchievementsScreen
} from './ui/screens.js';
import { Switcher } from './ui/switcher.js';
import { SystemView } from './ui/system.js';

/** One level of the path, and where the selection was, so going back returns to it. */
interface Level {
  path: string[];
  index: number;
}

const PAGE = 100;
/** A screen that loads faster than this never shows the loader: no flash on quick moves. */
const LOADER_DELAY_MS = 150;
/** Forma's systems view: Cyber shows it as categories, then systems, then that system's games. */
const CYBER_VIEW = 'systems';
/** Image widths asked for: what a card and the detail panel show at 1080p. */
const CARD_WIDTH = 480;
const DETAIL_WIDTH = 960;
const MOVES: Partial<Record<Action, Move>> = {
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  pageUp: 'pageUp',
  pageDown: 'pageDown'
};

export class App {
  readonly #title = el('h1', {});
  readonly #trail = el('nav', { class: 'trail', 'aria-label': 'Breadcrumb' });
  readonly #main = el('main', {});
  readonly #hints = el('footer', { class: 'hints' });
  readonly #toast = el('div', { class: 'toast', role: 'status', hidden: '' });
  readonly #playing = el('div', { class: 'overlay playing', hidden: '' });
  readonly #grid = new GridView();
  readonly #games = new GamesView((game) => {
    const kind = game.media.image ? 'image' : game.media.thumbnail ? 'thumbnail' : null;
    return kind ? this.forma.library.mediaUrl(game.id, kind, DETAIL_WIDTH) : null;
  });
  readonly #switcher = new Switcher();
  readonly #menu = new Menu();
  readonly #network: NetworkScreen;
  /** Music, RetroAchievements, Netplay, options…: settings pages from the system menu. */
  readonly #settings: Page;
  #settingsKind: string | null = null;
  /** Cyber's look and order (Interface). */
  #prefs: Prefs = { ...DEFAULT_PREFS };
  /** Screen margins for a TV's overscan, in percent per side (Forma's own setting). */
  #margins = 0;
  #lastMusic: MusicStatus | null = null;
  /** What plays, in the header, when something does. */
  readonly #nowPlaying = el('div', { class: 'now-playing', hidden: '' });
  readonly #backdrop = el('div', { class: 'backdrop', 'aria-hidden': 'true' });
  readonly #homeView = new HomeView();
  readonly #systemView: SystemView;
  /** Which screen the current level is: Cyber's own two, or Forma's views as they come. */
  #mode: 'home' | 'systems' | 'browse' = 'browse';
  #groups: Tile[] = [];
  /** A power action waiting for its second press, and until when. */
  #confirming: { id: string; until: number } | null = null;

  #views: ViewInfo[] = [];
  #view = 'systems';
  #home: string | null = null;
  #stack: Level[] = [{ path: [], index: 0 }];
  #page: Browse | null = null;
  #cards: Card[] = [];
  #list: LazyList<Game> | null = null;
  #toastTimer: ReturnType<typeof setTimeout> | undefined;
  #reloadTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly forma: Forma,
    root: HTMLElement,
    /** Each system's info.json; tests pass their own. */
    private readonly infos = new InfoStore()
  ) {
    this.#systemView = new SystemView(infos, (svg) => (this.#backdrop.innerHTML = svg));
    this.#network = new NetworkScreen(
      forma,
      (message) => this.#notify(message),
      () => this.#renderChrome()
    );
    this.#settings = new Page(
      (message) => this.#notify(message),
      () => this.#renderChrome()
    );
    root.replaceChildren(
      this.#backdrop,
      el('header', {}, this.#title, this.#trail, this.#nowPlaying),
      this.#main,
      this.#hints,
      this.#switcher.root,
      this.#menu.root,
      this.#network.root,
      this.#settings.root,
      this.#playing,
      this.#toast
    );
  }

  async start(): Promise<void> {
    this.forma.input.on((e) => this.#onInput(e));
    this.forma.events.on('library:changed', () => this.#reloadSoon());
    this.forma.events.on('views:changed', () => void this.#loadViews());
    this.forma.events.on('game:start', (game) => this.#showLaunch(game));
    this.forma.events.on('music:changed', (status) => {
      this.#showNowPlaying(status);
      if (this.#settings.open && this.#settingsKind === 'music') void this.#settings.refresh();
    });
    void this.forma.music
      .status()
      .then((status) => this.#showNowPlaying(status))
      .catch(() => {});
    this.forma.events.on('game:end', ({ error }) => {
      this.#playing.hidden = true;
      if (error) this.#notify(`The game could not run: ${error}`);
    });

    this.#prefs = await loadPrefs(this.forma);
    this.#applyPrefs();
    this.#margins = await loadMargins(this.forma);
    applyMargins(this.#margins);
    await this.#loadViews();
    const boot = await this.forma.nav.defaultView();
    for (const note of boot.notes) this.#notify(note);
    await this.#open(boot.id ?? 'systems');
  }

  async #loadViews(): Promise<void> {
    this.#views = await this.forma.nav.views();
    this.#home = (await this.forma.nav.defaultView()).id;
  }

  async #open(view: string): Promise<void> {
    this.#view = view;
    this.#stack = [{ path: [], index: 0 }];
    await this.#load();
  }

  get #level(): Level {
    return this.#stack[this.#stack.length - 1]!;
  }

  /** Loads the current level and shows it, keeping the remembered selection. */
  async #load(): Promise<void> {
    if (this.#view === CYBER_VIEW && this.#stack.length <= 2) return this.#loadCyber();
    this.#mode = 'browse';
    this.#systemView.hide();
    // A system's games keep its board behind them; other views have none.
    if (this.#view !== CYBER_VIEW) this.#backdrop.replaceChildren();
    const index = this.#level.index;
    // Cyber's category is its own level, not part of Forma's path.
    const path = this.#view === CYBER_VIEW ? this.#level.path.slice(1) : this.#level.path;
    const loading = this.#loading('Loading games…');
    try {
      const first = await this.forma.nav.browse(this.#view, path, { offset: 0, limit: PAGE });
      this.#page = first;
      const listing = first.listing;
      if (listing.kind === 'games') {
        const list = new LazyList<Game>(
          async (offset, limit) => {
            const page = await this.forma.nav.browse(this.#view, path, { offset, limit });
            return page.listing.kind === 'games' ? page.listing : { items: [], total: 0 };
          },
          PAGE,
          () => this.#games.render()
        );
        await list.start(index);
        this.#list = list;
        this.#level.index = Math.min(index, Math.max(0, list.total - 1));
        this.#main.replaceChildren(this.#games.root);
        this.#games.show(list, this.#level.index);
      } else {
        this.#list = null;
        this.#cards = await this.#allCards(first);
        this.#level.index = Math.min(index, Math.max(0, this.#cards.length - 1));
        this.#main.replaceChildren(this.#grid.root);
        this.#grid.show(this.#cards, this.#level.index);
      }
      this.#renderChrome();
    } catch (error) {
      this.#notify(FormaError.from(error).message);
    } finally {
      loading();
    }
  }

  /** Categories (home), or one category's systems. */
  async #loadCyber(): Promise<void> {
    const loading = this.#loading(
      this.#stack.length === 1 ? 'Reading the library…' : 'Powering up…'
    );
    try {
      this.#list = null;
      this.#page = null;
      const systems = await this.forma.library.systems();
      const infos = await this.infos.all(systems.filter((s) => s.gameCount > 0).map((s) => s.name));
      this.#groups = group(systems, infos, this.#prefs.systemsSort);
      const level = this.#level;
      if (this.#stack.length === 1) {
        this.#mode = 'home';
        this.#systemView.hide();
        this.#backdrop.replaceChildren();
        level.index = Math.min(level.index, Math.max(0, this.#groups.length - 1));
        this.#main.replaceChildren(this.#homeView.root);
        this.#homeView.show(this.#groups, level.index);
      } else {
        const tile = this.#groups.find((g) => g.category.id === level.path[0]);
        if (!tile) {
          // The category emptied (a library change): back home.
          this.#stack = [this.#stack[0]!];
          return this.#loadCyber();
        }
        this.#mode = 'systems';
        level.index = Math.min(level.index, Math.max(0, tile.systems.length - 1));
        this.#main.replaceChildren(this.#systemView.root);
        this.#systemView.show(tile.systems, level.index);
      }
      this.#renderChrome();
    } catch (error) {
      this.#notify(FormaError.from(error).message);
    } finally {
      loading();
    }
  }

  /**
   * Shows the loader in place of the screen if loading takes long enough to notice. Returns what
   * ends it: the screen that replaces it, or nothing (on an error, the loader just goes).
   */
  #loading(label: string): () => void {
    const timer = setTimeout(() => this.#main.replaceChildren(loader(label)), LOADER_DELAY_MS);
    return () => {
      clearTimeout(timer);
      this.#main.querySelector(':scope > .loader')?.remove();
    };
  }

  /** The look on the page, and the settings the views follow. */
  #applyPrefs(): void {
    applyPrefs(this.#prefs);
    this.#games.previews = this.#prefs.previews;
    this.#systemView.rotateFacts = this.#prefs.rotateFacts;
    if (this.#lastMusic) this.#showNowPlaying(this.#lastMusic);
  }

  async #changePrefs(update: Partial<Prefs>): Promise<void> {
    const resort =
      update.systemsSort !== undefined && update.systemsSort !== this.#prefs.systemsSort;
    this.#prefs = { ...this.#prefs, ...update };
    this.#applyPrefs();
    await savePrefs(this.forma, this.#prefs);
    // A new order shows at once, behind the page.
    if (resort && this.#mode !== 'browse') await this.#load();
  }

  #showNowPlaying(status: MusicStatus): void {
    this.#lastMusic = status;
    const playing = this.#prefs.nowPlaying && status.state !== 'stopped' && status.source !== null;
    this.#nowPlaying.hidden = !playing;
    if (!playing) return;
    this.#nowPlaying.classList.toggle('paused', status.state === 'paused');
    this.#nowPlaying.replaceChildren(
      el('span', { class: 'note', 'aria-hidden': 'true' }, status.state === 'paused' ? '❚❚' : '♪'),
      el('span', { class: 'title' }, nowPlaying(status)),
      status.artist ? el('span', { class: 'artist' }, status.artist) : ''
    );
  }

  /** While the emulator starts: the game's art, its name and system, and the loader. */
  #showLaunch({ gameId, system, name }: GameStart): void {
    const art = el('img', {
      class: 'launch-art',
      src: this.forma.library.mediaUrl(gameId, 'image', DETAIL_WIDTH),
      alt: ''
    });
    art.addEventListener('error', () => art.remove());
    const known = this.#groups.flatMap((g) => g.systems).find((s) => s.summary.name === system);
    const systemName = known ? known.summary.fullname || system : system;
    this.#playing.replaceChildren(
      el('div', { class: 'launch' }, art, loader(`Starting ${name}`, systemName))
    );
    this.#playing.hidden = false;
  }

  /** Breadcrumbs in Cyber's view: the category, then the system. */
  #cyberTrail(): string[] {
    const [category, system] = this.#level.path;
    const tile = this.#groups.find((g) => g.category.id === category);
    const name = tile?.systems.find((s) => s.summary.name === system)?.summary;
    return [
      ...(tile
        ? [tile.category.label]
        : category
          ? [CATEGORIES.find((c) => c.id === category)?.label ?? category]
          : []),
      ...(name ? [name.fullname || name.name] : [])
    ];
  }

  /** Groups come a page at a time too; a grid shows them all, so fetch the rest. */
  async #allCards(first: Browse): Promise<Card[]> {
    const listing = first.listing;
    if (listing.kind === 'branches') {
      return listing.items.map((b) => ({
        key: b.id,
        label: b.name,
        count: b.gameCount,
        image: null
      }));
    }
    if (listing.kind !== 'groups') return [];
    const groups = [...listing.items];
    while (groups.length < listing.total) {
      const next = await this.forma.nav.browse(this.#view, first.path, {
        offset: groups.length,
        limit: PAGE
      });
      if (next.listing.kind !== 'groups' || next.listing.items.length === 0) break;
      groups.push(...next.listing.items);
    }
    return groups.map((g) => ({
      key: g.key,
      label: g.label,
      count: g.gameCount,
      image:
        g.imageGame === null ? null : this.forma.library.mediaUrl(g.imageGame, 'image', CARD_WIDTH)
    }));
  }

  #renderChrome(): void {
    const view = this.#views.find((v) => v.id === this.#view);
    // Breadcrumbs, for show: where you are, from the top (Categories, in Cyber's own view).
    this.#title.textContent = this.#view === CYBER_VIEW ? 'Categories' : (view?.name ?? this.#view);
    const crumbs =
      this.#view === CYBER_VIEW
        ? this.#cyberTrail()
        : (this.#page?.trail ?? []).map((c) => c.label);
    this.#title.classList.toggle('current', crumbs.length === 0);
    this.#trail.replaceChildren(
      ...crumbs.map((c, i) =>
        el('span', { class: i === crumbs.length - 1 ? 'crumb current' : 'crumb' }, c)
      )
    );
    const games = this.#mode === 'browse' && this.#page?.listing.kind === 'games';
    const hints: [string, string][] = this.#settings.open
      ? this.#settings.hints()
      : this.#network.open
        ? this.#network.hints()
        : this.#menu.open
          ? [
              ['A', 'Choose'],
              ['B', 'Close']
            ]
          : this.#switcher.open
            ? [
                ['A', 'Show'],
                ['Y', 'Make home view'],
                ['B', 'Close']
              ]
            : [
                ['A', games ? 'Play' : this.#mode === 'systems' ? 'Games' : 'Open'],
                ...(games ? [['Y', 'Favourite'] as [string, string]] : []),
                ...(this.#mode === 'systems' ? [['Y', 'Next fact'] as [string, string]] : []),
                ...(this.#stack.length > 1 ? [['B', 'Back'] as [string, string]] : []),
                ['Select', 'Views'],
                ['Start', 'Menu']
              ];
    this.#hints.replaceChildren(
      ...hints.map(([button, label]) => el('span', { class: 'hint' }, el('kbd', {}, button), label))
    );
  }

  #onInput(e: InputEvent): void {
    if (!e.pressed || !this.#playing.hidden) return;
    if (this.#settings.open) {
      this.#settings.input(e);
      return this.#renderChrome();
    }
    if (this.#network.open) {
      this.#network.input(e);
      return this.#renderChrome();
    }
    if (this.#menu.open) return this.#onMenuInput(e);
    if (this.#switcher.open) return this.#onSwitcherInput(e);

    const move = MOVES[e.action];
    if (move) return this.#move(move, e.repeat);
    if (e.repeat) return;
    switch (e.action) {
      case 'confirm':
        return void this.#confirm();
      case 'back':
        return void this.#back();
      case 'north':
        if (this.#mode === 'systems') return this.#systemView.nextFact();
        return void this.#toggleFavorite();
      case 'select':
        this.#switcher.show(this.#views, this.#view, this.#home);
        return this.#renderChrome();
      case 'start':
        this.#openMenu();
        return this.#renderChrome();
      default:
    }
  }

  #move(move: Move, repeat: boolean): void {
    const level = this.#level;
    if (this.#mode === 'home') {
      level.index = moveGrid(level.index, this.#groups.length, this.#homeView.columns(), move);
      return this.#homeView.select(level.index);
    }
    if (this.#mode === 'systems') {
      level.index = moveList(level.index, this.#systemView.count, move, 5, repeat);
      return this.#systemView.select(level.index);
    }
    if (this.#list) {
      level.index = moveList(level.index, this.#list.total, move, this.#games.pageSize(), repeat);
      this.#games.select(level.index);
    } else {
      level.index = moveGrid(level.index, this.#cards.length, this.#grid.columns(), move);
      this.#grid.select(level.index);
    }
  }

  async #confirm(): Promise<void> {
    if (this.#mode === 'home') {
      const tile = this.#groups[this.#level.index];
      if (!tile) return;
      this.#stack.push({ path: [tile.category.id], index: 0 });
      return this.#load();
    }
    if (this.#mode === 'systems') {
      const system = this.#systemView.selected;
      if (!system) return;
      this.#stack.push({ path: [...this.#level.path, system.summary.name], index: 0 });
      return this.#load();
    }
    if (this.#list) {
      const game = this.#games.selected;
      if (!game) return;
      try {
        await this.forma.launch.game(game.id);
      } catch (error) {
        this.#notify(FormaError.from(error).message);
      }
      return;
    }
    const card = this.#cards[this.#level.index];
    if (!card) return;
    this.#stack.push({ path: [...this.#level.path, card.key], index: 0 });
    await this.#load();
  }

  async #back(): Promise<void> {
    if (this.#stack.length === 1) return;
    this.#stack.pop();
    await this.#load();
  }

  async #toggleFavorite(): Promise<void> {
    const game = this.#games.selected;
    if (!this.#list || !game) return;
    try {
      await this.forma.library.setFavorite(game.id, !game.favorite);
      this.#games.refreshSelected({ ...game, favorite: !game.favorite });
      this.#notify(
        game.favorite ? `Removed ${game.name} from favourites` : `Added ${game.name} to favourites`
      );
    } catch (error) {
      this.#notify(FormaError.from(error).message);
    }
  }

  /** The system and game the menu's options entries are for: what is selected now. */
  #optionsTarget(): {
    system: { name: string; fullname: string } | null;
    game: { id: number; name: string } | null;
  } {
    if (this.#mode === 'systems') {
      const s = this.#systemView.selected?.summary;
      return { system: s ? { name: s.name, fullname: s.fullname } : null, game: null };
    }
    const game = this.#list ? this.#games.selected : null;
    if (!game) return { system: null, game: null };
    const s = this.#groups.flatMap((g) => g.systems).find((x) => x.summary.name === game.system);
    return {
      system: { name: game.system, fullname: s?.summary.fullname ?? game.system },
      game: { id: game.id, name: game.name }
    };
  }

  #openMenu(): void {
    this.#confirming = null;
    const { system, game } = this.#optionsTarget();
    this.#menu.show('Forma', [
      ...(game
        ? [
            {
              id: 'game-options',
              label: `${game.name} options…`,
              description: 'Emulator, core and options for this game only'
            }
          ]
        : []),
      ...(system
        ? [
            {
              id: 'system-options',
              label: `${system.fullname} options…`,
              description: 'Emulator, core and options for its games'
            }
          ]
        : []),
      { id: 'views', label: 'Views…', description: 'Organise the library another way' },
      { id: 'interface', label: 'Interface…', description: 'Theme, look and sorting' },
      { id: 'music', label: 'Music…', description: 'Folders, playlists and web radios' },
      {
        id: 'ra',
        label: 'RetroAchievements…',
        description: 'Your account and how achievements work'
      },
      { id: 'netplay', label: 'Netplay…', description: 'Playing online with others' },
      { id: 'network', label: 'Network…', description: 'Wi-Fi and Ethernet' },
      {
        id: 'game-settings',
        label: 'Game settings…',
        description: 'Emulator options for every game: ratio, shaders, decorations…'
      },
      {
        id: 'system-settings',
        label: 'System settings…',
        description: 'Display, audio, language, region and storage'
      },
      {
        id: 'emulationstation',
        label: 'Switch to EmulationStation',
        description: 'For scraping and updates; Forma returns at the next boot'
      },
      { id: 'restart', label: 'Restart', description: 'Press A twice' },
      { id: 'shutdown', label: 'Shut down', description: 'Press A twice' }
    ]);
  }

  #onMenuInput(e: InputEvent): void {
    const m = this.#menu;
    if (e.action === 'up' || e.action === 'down') {
      this.#confirming = null;
      return m.select(moveList(m.selected, m.count, e.action, 5, e.repeat));
    }
    if (e.repeat) return;
    if (e.action === 'back' || e.action === 'start') {
      m.close();
      return this.#renderChrome();
    }
    if (e.action !== 'confirm' || !m.item) return;
    const id = m.item.id;
    if (id === 'views') {
      m.close();
      this.#switcher.show(this.#views, this.#view, this.#home);
      return this.#renderChrome();
    }
    if (id === 'network') {
      m.close();
      this.#network.show();
      return this.#renderChrome();
    }
    if (
      id === 'game-options' ||
      id === 'system-options' ||
      id === 'game-settings' ||
      id === 'system-settings'
    ) {
      m.close();
      this.#settingsKind = id;
      const { system, game } = this.#optionsTarget();
      const [title, build] =
        id === 'system-settings'
          ? ['System settings', systemSettingsScreen(this.forma, this.#settings)]
          : id === 'game-settings'
            ? ['Game settings', optionsScreen(this.forma, this.#settings, { level: 'global' })]
            : id === 'system-options' && system
              ? [
                  `${system.fullname} options`,
                  optionsScreen(this.forma, this.#settings, {
                    level: 'system',
                    system: system.name
                  })
                ]
              : game
                ? [
                    `${game.name} options`,
                    optionsScreen(this.forma, this.#settings, { level: 'game', game: game.id })
                  ]
                : [null, null];
      if (title && build) void this.#settings.show(title, build);
      return this.#renderChrome();
    }
    if (id === 'music' || id === 'ra' || id === 'netplay' || id === 'interface') {
      m.close();
      this.#settingsKind = id;
      const [title, build] =
        id === 'interface'
          ? [
              'Interface',
              interfaceScreen(
                this.forma,
                this.#settings,
                () => this.#prefs,
                (update) => this.#changePrefs(update),
                {
                  get: () => this.#margins,
                  set: async (value) => {
                    this.#margins = value;
                    applyMargins(value);
                    await this.forma.settings.setSystem(MARGINS_SETTING, value);
                  }
                }
              )
            ]
          : id === 'music'
            ? ['Music', musicScreen(this.forma, this.#settings)]
            : id === 'ra'
              ? ['RetroAchievements', retroAchievementsScreen(this.forma, this.#settings)]
              : ['Netplay', netplayScreen(this.forma, this.#settings)];
      void this.#settings.show(title, build);
      return this.#renderChrome();
    }
    // Power actions need a second press within three seconds: a stray A must not shut down.
    const powerful = id === 'restart' || id === 'shutdown';
    const now = Date.now();
    if (powerful && (this.#confirming?.id !== id || now > this.#confirming.until)) {
      this.#confirming = { id, until: now + 3000 };
      this.#notify(`Press A again to ${id === 'restart' ? 'restart' : 'shut down'}`);
      return;
    }
    this.#confirming = null;
    const action =
      id === 'restart'
        ? this.forma.system.restart()
        : id === 'shutdown'
          ? this.forma.system.shutdown()
          : this.forma.system.quit();
    action.catch((error: unknown) => this.#notify(FormaError.from(error).message));
  }

  #onSwitcherInput(e: InputEvent): void {
    const s = this.#switcher;
    if (e.action === 'up' || e.action === 'down') {
      return s.select(moveList(s.selected, s.count, e.action, 5, e.repeat));
    }
    if (e.repeat) return;
    const view = s.view;
    if (e.action === 'confirm' && view) {
      s.close();
      void this.#open(view.id);
    } else if (e.action === 'north' && view) {
      void this.forma.nav.setDefaultView(view.id).then(() => {
        this.#home = view.id;
        this.#notify(`Forma will open on “${view.name}”`);
        s.show(this.#views, this.#view, this.#home);
        s.select(this.#views.indexOf(view));
      });
    } else if (e.action === 'back' || e.action === 'select') {
      s.close();
    }
    this.#renderChrome();
  }

  /** Library changes arrive in bursts (a scraper run); reload once they settle. */
  #reloadSoon(): void {
    clearTimeout(this.#reloadTimer);
    this.#reloadTimer = setTimeout(() => void this.#load(), 300);
  }

  #notify(message: string): void {
    this.#toast.textContent = message;
    this.#toast.hidden = false;
    clearTimeout(this.#toastTimer);
    this.#toastTimer = setTimeout(() => (this.#toast.hidden = true), 4000);
  }
}
