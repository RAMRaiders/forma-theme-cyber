import type {
  Action,
  Browse,
  Forma,
  Game,
  GameStart,
  InputEvent,
  NavGame,
  SettingsChanged,
  ViewInfo
} from '@ramraiders/forma-sdk';
import { span } from './ui/perf.js';
import { FormaError } from '@ramraiders/forma-sdk';

import {
  ALL_GAMES,
  CATEGORIES,
  InfoStore,
  MAGAZINES,
  type MakerLogo,
  allGames,
  group,
  makerLogos
} from './data/catalog.js';
import {
  DEFAULT_PREFS,
  MARGINS_SETTING,
  type Prefs,
  SYSTEMS_ORDER_SETTING,
  applyMargins,
  applyPrefs,
  loadMargins,
  loadPrefs,
  margins,
  prefUpdate
} from './data/prefs.js';
import { type Move, moveGrid, moveHome, moveList } from './logic/nav.js';
import { LazyList } from './logic/pager.js';
import { el } from './ui/dom.js';
import { type Card, GridView } from './ui/grid.js';
import { COLLECTOR_PICTURES, CollectorView } from './ui/collector.js';
import { launchScreen } from './ui/launch.js';
import { GamesView } from './ui/games.js';
import { HomeView, type Shortcut, type Tile } from './ui/home.js';
import { loader } from './ui/loader.js';
import { SongCard } from './ui/music.js';
import { preload } from './ui/preload.js';
import { STAGE_PICTURES, accentOf } from './ui/stage.js';
import { SystemView } from './ui/system.js';

/** One level of the path, and where the selection was, so going back returns to it. */
interface Level {
  path: string[];
  index: number;
  /** The game to come back to, wherever it now sorts: for the next load only. */
  game?: number | undefined;
}

const PAGE = 100;
/** How long the selection rests before Forma's menu hears of it. */
const CONTEXT_DELAY_MS = 120;
/** A screen that loads faster than this never shows the loader: no flash on quick moves. */
const LOADER_DELAY_MS = 150;
/**
 * Forma's systems view: Cyber shows it as categories, then systems, then that system's games.
 * It is the one view Cyber shows (its theme.json says so): Forma offers no other.
 */
const CYBER_VIEW = 'systems';
/** How long one circuit board takes to give way to the next. */
const BOARD_FADE_MS = 400;
/** A shortcut's level: its path starts with this, then the Forma view it opens. */
const SHORTCUT = '@';
/** The buttons under the categories: all but magazines open Forma's views. */
const SHORTCUTS: Shortcut[] = [
  { id: 'recent', label: 'Last played', tagline: 'The games you played last' },
  { id: 'favorites', label: 'Favourites', tagline: 'The games you starred' },
  { id: 'collections', label: 'Collections', tagline: 'Your own lists of games' },
  { id: 'recommended', label: 'Recommended', tagline: 'Picked from what you play' }
];
/** Forma's view each working shortcut opens. */
const SHORTCUT_VIEWS: Record<string, { view: string; label: string }> = {
  // Forma's: the last 50 games played, the latest first.
  recent: { view: 'recent', label: 'Last played' },
  favorites: { view: 'favorites', label: 'Favourites' },
  // Forma's: a branch per collection, made from Start → Collections.
  collections: { view: 'collections', label: 'Collections' },
  // Forma's: games not played yet, most like what is played.
  recommended: { view: 'recommended', label: 'Recommended' },
  // The All games tile, after the categories.
  all: { view: 'all', label: ALL_GAMES.label }
};
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

/** Moved this far through a list, Forma is asked again for the pictures around the selection. */
const PREPARE_AGAIN = 100;

/** One step of the breadcrumb: a name, or a system's logo (`label`: its name, for screen readers). */
type Crumb = string | { label: string; logo: string; dark: boolean };

export class App {
  readonly #title = el('h1', {});
  readonly #trail = el('nav', { class: 'trail', 'aria-label': 'Breadcrumb' });
  readonly #main = el('main', {});
  readonly #hints = el('footer', { class: 'hints' });
  readonly #toast = el('div', { class: 'toast', role: 'status', hidden: '' });
  readonly #playing = el('div', { class: 'overlay playing', hidden: '' });
  readonly #grid = new GridView();
  readonly #games = new GamesView({
    // Only kinds the game has: the media map holds a URL per kind it has. Newer Formas know
    // more kinds than this SDK's types (box back, cartridge…), hence the cast.
    media: (game, kind, width) =>
      (game.media as Partial<Record<string, string>>)[kind]
        ? this.forma.library.mediaUrl(game.id, kind, width)
        : null,
    achievements: async (game) => {
      const { data } = await this.forma.ra.game(game.id);
      return { earned: data.earned, total: data.achievementCount };
    },
    accent: accentOf,
    play: (game) => this.forma.video.play(game.id),
    stopVideo: () => void this.forma.video.stop().catch(() => {}),
    prepare: (items) => void this.forma.library.prepareMedia(items as never).catch(() => {})
  });
  /** The Collector view of a game list: Select → View on a list. */
  readonly #collector = new CollectorView({
    media: (game, kind, width) =>
      (game.media as Partial<Record<string, string>>)[kind]
        ? this.forma.library.mediaUrl(game.id, kind, width)
        : null,
    achievements: async (game) => {
      const { data } = await this.forma.ra.game(game.id);
      return { earned: data.earned, total: data.achievementCount };
    },
    play: (game, area) => this.forma.video.play(game.id, { area }),
    stopVideo: () => void this.forma.video.stop().catch(() => {}),
    // The game companies' logos first, then the hardware makers'.
    company: (name) =>
      makerLogos(name, this.#companies)[0] ?? this.forma.library.companyLogoUrl(name),
    accent: accentOf,
    system: (name) => {
      const system = this.#groups.flatMap((g) => g.systems).find((s) => s.summary.name === name);
      if (!system) return null;
      return {
        name: system.summary.fullname || name,
        logo: system.logoSmall,
        dark: system.logoDark
      };
    },
    prepare: (items) => void this.forma.library.prepareMedia(items as never).catch(() => {})
  });

  /** The game list's view, as the setting says. */
  get #gameView(): GamesView | CollectorView {
    return this.#prefs.gamesView === 'collector' ? this.#collector : this.#games;
  }

  /** The game list on screen, for Forma to make its pictures ahead. */
  #listPlace: { view: string; path: string[] } | null = null;
  #preparedAround = 0;

  /**
   * Has Forma make the pictures of the games around `around` in the list on screen, in the
   * background: so they show at once, not as full-size originals decoded on the spot.
   */
  #prepareList(around: number): void {
    const place = this.#listPlace;
    if (!place) return;
    this.#preparedAround = around;
    const pictures = (
      this.#prefs.gamesView === 'collector' ? COLLECTOR_PICTURES : STAGE_PICTURES
    ).map(([kind, width]) => ({ kind, width }));
    void this.forma.library
      .prepareList(place.view, place.path, around, pictures as never)
      .catch(() => {});
  }

  /** Cyber's look and order: its settings, which Forma's menu shows (Start → Interface). */
  #prefs: Prefs = { ...DEFAULT_PREFS };
  /** What plays, in the header, when something does. */
  /** The song that just started, Cyber's way (its theme.json says it draws it). */
  readonly #song = new SongCard();
  readonly #backdrop = el('div', { class: 'backdrop', 'aria-hidden': 'true' });
  readonly #homeView = new HomeView();
  readonly #systemView: SystemView;
  /** Which screen the current level is: Cyber's own two, or Forma's views as they come. */
  #mode: 'home' | 'systems' | 'browse' = 'browse';
  #groups: Tile[] = [];
  /** Logos for the Collector's developers and publishers: game companies', then makers'. */
  #companies: MakerLogo[] = [];
  #shortcuts: Shortcut[] = SHORTCUTS;

  #views: ViewInfo[] = [];
  #view = 'systems';
  #stack: Level[] = [{ path: [], index: 0 }];
  /** Where each list was left, so it opens there again until Forma restarts. */
  readonly #places = new Map<string, Pick<Level, 'index' | 'game'>>();
  #page: Browse | null = null;
  #cards: Card[] = [];
  #list: LazyList<Game> | null = null;
  #toastTimer: ReturnType<typeof setTimeout> | undefined;
  #contextTimer: ReturnType<typeof setTimeout> | undefined;
  #reloadTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly forma: Forma,
    root: HTMLElement,
    /** Each system's info.json; tests pass their own. */
    private readonly infos = new InfoStore()
  ) {
    this.#systemView = new SystemView(infos, (svg) => this.#showBoard(svg));
    root.replaceChildren(
      this.#backdrop,
      el('header', {}, this.#title, this.#trail),
      this.#main,
      this.#hints,
      this.#song.root,
      this.#playing,
      this.#toast
    );
  }

  /**
   * A new board behind the screen: it fades in over the last, which then goes, so moving from
   * system to system the circuit changes smoothly rather than at a cut.
   */
  #showBoard(svg: string): void {
    const layer = el('div', { class: 'board' });
    layer.innerHTML = svg;
    const before = [...this.#backdrop.children];
    this.#backdrop.append(layer);
    for (const old of before) {
      old.classList.add('fading');
      setTimeout(() => old.remove(), BOARD_FADE_MS);
    }
  }

  async start(): Promise<void> {
    void Promise.all([this.infos.companies(), this.infos.makers()]).then(([games, makers]) => {
      this.#companies = [...games, ...makers];
    });
    this.forma.input.on((e) => this.#onInput(e));
    this.forma.events.on('library:changed', () => {
      this.#reloadSoon();
    });
    // The scraper on the selected game: Cyber shows it at work, then what it brought.
    this.forma.events.on('scraper:progress', (status) => {
      if (this.#list) this.#gameView.scrapeProgress(status);
    });
    // A scrape replaced a game's pictures, often under the same names: nothing else says so.
    this.forma.events.on('media:changed', ({ game }) => {
      if (this.#list) this.#gameView.mediaChanged(game);
    });
    // Views change with collections too: the shortcuts' counts follow.
    this.forma.events.on('views:changed', () => {
      void this.#loadViews();
      this.#reloadSoon();
    });
    // Forma's views list would only ever offer Cyber's one view: back to its top.
    this.forma.events.on('nav:open', () => void this.#open(CYBER_VIEW));
    // A game chosen in Forma's menu (its versions, sibling games): shown as if browsed to.
    this.forma.events.on('nav:game', (chosen) => void this.#openGame(chosen));
    // Forma's menu changed one of Cyber's settings, or the screen margins.
    this.forma.events.on('settings:changed', (change) => void this.#settingChanged(change));
    this.forma.events.on('game:start', (game) => this.#showLaunch(game));
    // Forma says when a song starts and for how long; Cyber shows it, unless a game is up.
    this.forma.events.on('music:song', (song) => {
      if (this.#playing.hidden) this.#song.show(song);
    });
    this.forma.events.on('game:end', ({ error }) => {
      this.#playing.hidden = true;
      if (this.#list) this.#gameView.resume();
      if (error) this.#notify(`The game could not run: ${error}`);
    });

    this.#prefs = await loadPrefs(this.forma);
    this.#applyPrefs();
    applyMargins(await loadMargins(this.forma));
    await this.#loadViews();
    const boot = await this.forma.nav.defaultView();
    for (const note of boot.notes) this.#notify(note);
    // Cyber shows the library one way, whatever view Forma was set to open on.
    await this.#open(CYBER_VIEW);
  }

  async #loadViews(): Promise<void> {
    this.#views = await this.forma.nav.views();
  }

  async #open(view: string): Promise<void> {
    this.#view = view;
    this.#stack = [{ path: [], index: 0 }];
    await this.#load();
  }

  /**
   * A game in its system's list, selected, its details up: home, its category, its system, as
   * if browsed to, so back climbs out the usual way.
   */
  async #openGame({ game, system }: NavGame): Promise<void> {
    const at = this.#groups.findIndex((g) => g.systems.some((s) => s.summary.name === system));
    const group = this.#groups[at];
    if (!group) return this.#notify('That game is not in Cyber’s lists');
    this.#view = CYBER_VIEW;
    this.#stack = [
      { path: [], index: at },
      {
        path: [group.category.id],
        index: group.systems.findIndex((s) => s.summary.name === system)
      },
      { path: [group.category.id, system], index: 0, game }
    ];
    await this.#load();
  }

  get #level(): Level {
    return this.#stack[this.#stack.length - 1]!;
  }

  /**
   * The Forma view and path the current level browses. Cyber's category is its own level, not
   * part of Forma's path; a shortcut's level browses the view it opens.
   */
  #target(): { view: string; path: string[]; shortcut: string | null } {
    const [first, ...rest] = this.#level.path;
    if (this.#view === CYBER_VIEW && first?.startsWith(SHORTCUT)) {
      const id = first.slice(SHORTCUT.length);
      return { view: SHORTCUT_VIEWS[id]?.view ?? id, path: rest, shortcut: id };
    }
    return {
      view: this.#view,
      path: this.#view === CYBER_VIEW ? rest : this.#level.path,
      shortcut: null
    };
  }

  /** Loads the current level and shows it, keeping the remembered selection. */
  async #load(reload = false): Promise<void> {
    // Whatever shows next, the game list's video (and its sound) stops. A reload stays on the
    // same list: the Collector's case goes on turning, and the list tells it what changed.
    this.#games.leave();
    if (!reload) this.#collector.leave();
    const target = this.#target();
    if (this.#view === CYBER_VIEW && this.#stack.length <= 2 && !target.shortcut) {
      return this.#loadCyber();
    }
    this.#mode = 'browse';
    this.#systemView.hide();
    // A system's games keep its board behind them; other views have none.
    if (this.#view !== CYBER_VIEW || target.shortcut) this.#backdrop.replaceChildren();
    const remembered = this.#level.index;
    // A reload keeps to the game selected, wherever it now sorts: a scrape can rename it.
    const follow = reload && this.#list ? this.#gameView.selected?.id : this.#level.game;
    // The same list, filtered or every game again since: shown, so the change is seen.
    const wasFiltered = reload && this.#list ? this.#page?.filtered === true : null;
    this.#level.game = undefined;
    const { view, path } = target;
    const loading = this.#loading('Loading games…');
    try {
      const first = await this.forma.nav.browse(view, path, { offset: 0, limit: PAGE });
      this.#page = first;
      const listing = first.listing;
      if (listing.kind === 'games') {
        const list = new LazyList<Game>(
          async (offset, limit) => {
            const page = await this.forma.nav.browse(view, path, { offset, limit });
            return page.listing.kind === 'games' ? page.listing : { items: [], total: 0 };
          },
          PAGE,
          () => this.#gameView.render()
        );
        await list.start(remembered);
        const moved =
          follow === undefined || list.get(remembered)?.id === follow
            ? -1
            : await list.findIndex((g) => g.id === follow, remembered);
        const index = moved >= 0 ? moved : remembered;
        this.#list = list;
        this.#level.index = Math.min(index, Math.max(0, list.total - 1));
        this.#main.replaceChildren(this.#gameView.root);
        this.#gameView.show(list, this.#level.index);
        if (wasFiltered !== null && wasFiltered !== first.filtered) this.#gameView.reveal();
        this.#listPlace = { view, path };
        this.#prepareList(this.#level.index);
      } else {
        this.#list = null;
        this.#cards = await this.#allCards(first);
        this.#level.index = Math.min(remembered, Math.max(0, this.#cards.length - 1));
        this.#main.replaceChildren(this.#grid.root);
        this.#grid.show(this.#cards, this.#level.index);
      }
      this.#renderChrome();
      this.#tellForma();
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
      const [infos, arts] = await Promise.all([
        this.infos.all(systems.filter((s) => s.gameCount > 0).map((s) => s.name)),
        this.infos.art()
      ]);
      this.#groups = group(systems, infos, arts);
      // Every system's logo and picture, decoded in the background, ready for the rail.
      preload(this.#groups.flatMap((g) => g.systems.flatMap((s) => [s.logoSmall, s.photo])));
      const level = this.#level;
      if (this.#stack.length === 1) {
        this.#mode = 'home';
        this.#systemView.hide();
        this.#backdrop.replaceChildren();
        this.#shortcuts = await this.#countShortcuts();
        // Every game, as one more tile after the categories, then Forma's magazine reader.
        const tiles = this.#groups.length
          ? [...this.#groups, allGames(this.#groups, systems), await this.#magazinesTile()]
          : [];
        const count = tiles.length + this.#shortcuts.length;
        level.index = Math.min(level.index, Math.max(0, count - 1));
        this.#main.replaceChildren(this.#homeView.root);
        this.#homeView.show(tiles, this.#shortcuts, level.index);
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
      this.#tellForma();
    } catch (error) {
      this.#notify(FormaError.from(error).message);
    } finally {
      loading();
    }
  }

  /** The magazines tile: how many there are, opening Forma's reader. */
  async #magazinesTile(): Promise<Tile> {
    const n = await this.forma.magazines
      .list()
      .then((all) => all.length)
      .catch(() => 0);
    return {
      category: MAGAZINES,
      systems: [],
      counts: [n ? `${n.toLocaleString('en')} ${n === 1 ? 'magazine' : 'magazines'}` : 'None yet']
    };
  }

  /** The shortcuts, with how many games the working ones hold. */
  async #countShortcuts(): Promise<Shortcut[]> {
    return Promise.all(
      SHORTCUTS.map(async (s) => {
        const opens = SHORTCUT_VIEWS[s.id];
        if (s.soon || !opens) return s;
        try {
          const page = await this.forma.nav.browse(opens.view, [], { offset: 0, limit: 1 });
          if (page.listing.kind === 'branches') {
            const n = page.listing.items.length;
            return { ...s, count: `${n} ${n === 1 ? 'list' : 'lists'}` };
          }
          const total = 'total' in page.listing ? page.listing.total : 0;
          if ((s.id === 'collections' || s.id === 'recent') && total === 0) {
            return { ...s, count: 'None yet' };
          }
          return { ...s, count: `${total.toLocaleString('en')} ${total === 1 ? 'game' : 'games'}` };
        } catch {
          return s;
        }
      })
    );
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
    // Another view for the list on screen: it takes over where the last was.
    const view = this.#gameView;
    if (this.#list && this.#mode === 'browse' && !this.#main.contains(view.root)) {
      this.#games.leave();
      this.#collector.leave();
      this.#main.replaceChildren(view.root);
      view.show(this.#list, this.#level.index);
      this.#prepareList(this.#level.index);
      this.#renderChrome();
    }
    this.#games.previews = this.#prefs.previews;
    this.#collector.previews = this.#prefs.previews;
    this.#systemView.rotateFacts = this.#prefs.rotateFacts;
    if (this.#systemView.look !== this.#prefs.systemsLook) {
      this.#systemView.look = this.#prefs.systemsLook;
      if (this.#mode === 'systems') this.#systemView.refreshLook();
    }
  }

  async #settingChanged({ scope, key, value }: SettingsChanged): Promise<void> {
    if (scope === 'system') {
      if (key === MARGINS_SETTING) applyMargins(margins(value));
      // A new order for the systems shows at once, behind Forma's menu.
      if (key === SYSTEMS_ORDER_SETTING && this.#mode !== 'browse') await this.#load();
      return;
    }
    const update = prefUpdate(key, value);
    if (!update) return;
    this.#prefs = { ...this.#prefs, ...update };
    this.#applyPrefs();
  }

  /** While the emulator starts: the game by its pictures, or by its system if it has none. */
  #showLaunch({ gameId, system, name }: GameStart): void {
    this.#song.hide();
    this.#playing.replaceChildren();
    this.#playing.hidden = false;
    const known = this.#groups.flatMap((g) => g.systems).find((s) => s.summary.name === system);
    const shown = {
      name: known ? known.summary.fullname || system : system,
      logo: known?.logo ?? null,
      dark: known?.logoDark ?? false,
      photo: known?.photo ?? null
    };
    // Which pictures it has decides the layout, so nothing is drawn until that is known.
    void this.forma.library
      .game(gameId)
      .catch(() => null)
      .then((game) => {
        if (this.#playing.hidden) return;
        const has = (game?.media ?? {}) as Partial<Record<string, string>>;
        const url = (kind: string, width: number) =>
          has[kind] ? this.forma.library.mediaUrl(gameId, kind as 'image', width) : null;
        const screen = launchScreen(name, shown, {
          box: url('thumbnail', DETAIL_WIDTH),
          shot: url('image', DETAIL_WIDTH),
          backdrop: url('fanart', 1280),
          soft: url('image', 320),
          logo: url('wheel', DETAIL_WIDTH) ?? url('marquee', DETAIL_WIDTH)
        });
        this.#playing.replaceChildren(screen);
        // The boot sequence in the game's own colour, once that is known.
        const probe = url('thumbnail', 64) ?? url('fanart', 64);
        if (probe) {
          void accentOf(probe)
            .then((colour) => {
              if (colour) screen.style.setProperty('--launch-accent', colour);
            })
            .catch(() => {});
        }
      });
  }

  /** Breadcrumbs in Cyber's view: the category, then the system. */
  #cyberTrail(): Crumb[] {
    const [category, system] = this.#level.path;
    if (category?.startsWith(SHORTCUT)) {
      const id = category.slice(SHORTCUT.length);
      return [SHORTCUT_VIEWS[id]?.label ?? id, ...(this.#page?.trail ?? []).map((c) => c.label)];
    }
    const tile = this.#groups.find((g) => g.category.id === category);
    const found = tile?.systems.find((s) => s.summary.name === system);
    const name = found ? found.summary.fullname || found.summary.name : null;
    return [
      ...(tile
        ? [tile.category.label]
        : category
          ? [CATEGORIES.find((c) => c.id === category)?.label ?? category]
          : []),
      // The system as its logo, where Cyber has one; else its name.
      ...(found && name
        ? [found.logoSmall ? { label: name, logo: found.logoSmall, dark: found.logoDark } : name]
        : [])
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
      const next = await this.forma.nav.browse(this.#target().view, first.path, {
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
    // Which screen, for styles outside the screen's own element (the backdrop).
    // Only when it changes: set on every move, the Pi's WebKit restyled the whole page.
    if (document.documentElement.dataset.screen !== this.#mode) {
      document.documentElement.dataset.screen = this.#mode;
    }
    const view = this.#views.find((v) => v.id === this.#view);
    // Breadcrumbs, for show: where you are. Categories is the root: named only when you are on it.
    this.#title.textContent = this.#view === CYBER_VIEW ? 'Categories' : (view?.name ?? this.#view);
    const trail =
      this.#view === CYBER_VIEW
        ? this.#cyberTrail()
        : (this.#page?.trail ?? []).map((c) => c.label);
    const crumbs = this.#filtered() ? [...trail, 'Filtered'] : trail;
    this.#title.classList.toggle('current', crumbs.length === 0);
    this.#title.hidden = this.#view === CYBER_VIEW && crumbs.length > 0;
    this.#trail.replaceChildren(
      ...crumbs.map((c, i) => {
        const cls = i === crumbs.length - 1 ? 'crumb current' : 'crumb';
        if (typeof c === 'string') return el('span', { class: cls }, c);
        const logo = el('img', {
          class: `crumb-logo${c.dark ? ' dark' : ''}`,
          src: c.logo,
          alt: c.label
        });
        const crumb = el('span', { class: `${cls} has-logo` }, logo);
        // No logo after all: the name, as any other crumb.
        logo.addEventListener('error', () => crumb.replaceChildren(c.label), { once: true });
        return crumb;
      })
    );
    const games = this.#mode === 'browse' && this.#page?.listing.kind === 'games';
    // Select and Start are Forma's own: its views list and its menu, over any theme.
    const hints: [string, string][] = [
      ['A', games ? 'Play' : this.#mode === 'systems' ? 'Games' : 'Open'],
      ...(games && this.#prefs.gamesView === 'collector'
        ? [['◀ ▶', 'Turn'] as [string, string]]
        : []),
      ...(games ? [['Y', 'Favourite'] as [string, string]] : []),
      ...(this.#mode === 'systems' ? [['Y', 'Next fact'] as [string, string]] : []),
      ...(this.#filtered()
        ? [['B', 'All games'] as [string, string]]
        : this.#stack.length > 1
          ? [['B', 'Back'] as [string, string]]
          : []),
      ['Start', 'Menu']
    ];
    this.#hints.replaceChildren(
      ...hints.map(([button, label]) => el('span', { class: 'hint' }, el('kbd', {}, button), label))
    );
  }

  #onInput(e: InputEvent): void {
    const done = span(`input ${e.action}`);
    try {
      this.#handleInput(e);
    } finally {
      done();
    }
  }

  #handleInput(e: InputEvent): void {
    if (!e.pressed || !this.#playing.hidden) return;

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
      default:
    }
  }

  #move(move: Move, repeat: boolean): void {
    const level = this.#level;
    if (this.#mode === 'home') {
      const home = this.#homeView;
      level.index = moveHome(level.index, home.categories, home.columns(), home.shortcuts, move);
      home.select(level.index);
      this.#renderChrome();
    } else if (this.#mode === 'systems') {
      // The systems run down a column: up and down step through them, as left and right do;
      // the shoulders jump five.
      const step = move === 'left' ? 'up' : move === 'right' ? 'down' : move;
      level.index = moveList(level.index, this.#systemView.count, step, 5, repeat);
      this.#systemView.select(level.index);
    } else if (
      this.#list &&
      this.#gameView === this.#collector &&
      (move === 'left' || move === 'right')
    ) {
      // The Collector's box turns, left and right.
      if (!repeat) this.#collector.turn(move === 'right' ? 1 : -1);
      return;
    } else if (this.#list) {
      const view = this.#gameView;
      level.index = moveList(level.index, this.#list.total, move, view.pageSize(), repeat);
      view.select(level.index);
      if (Math.abs(level.index - this.#preparedAround) > PREPARE_AGAIN) {
        this.#prepareList(level.index);
      }
    } else {
      level.index = moveGrid(level.index, this.#cards.length, this.#grid.columns(), move);
      this.#grid.select(level.index);
    }
    this.#tellForma();
  }

  /**
   * Forma's menu offers options for the selected system and game: tell it which they are, once
   * the selection rests (a held direction sends one call, not one per step).
   */
  #tellForma(): void {
    clearTimeout(this.#contextTimer);
    this.#contextTimer = setTimeout(() => {
      const { system, game } = this.#optionsTarget();
      // Which list the selection moves in: Forma's Select menu offers options for it.
      const list =
        this.#mode === 'home'
          ? 'categories'
          : this.#mode === 'systems'
            ? 'systems'
            : this.#page?.listing.kind === 'games'
              ? 'games'
              : null;
      this.forma.shell.setContext({ view: this.#view, system, game, list }).catch(() => {});
    }, CONTEXT_DELAY_MS);
  }

  async #confirm(): Promise<void> {
    if (this.#mode === 'home') {
      const shortcut = this.#homeView.shortcut;
      if (shortcut) {
        const s = this.#shortcuts.find((x) => x.id === shortcut);
        if (!s || s.soon) return this.#notify(`${s?.label ?? 'This'} is coming in a later version`);
        return this.#enter([`${SHORTCUT}${shortcut}`]);
      }
      if (this.#level.index === this.#groups.length) {
        return this.#enter([`${SHORTCUT}all`]);
      }
      // Forma's own reader, over Cyber; back is back here.
      if (this.#level.index === this.#groups.length + 1) {
        return void this.forma.magazines
          .open()
          .catch((error: unknown) => this.#notify(FormaError.from(error).message));
      }
      const tile = this.#groups[this.#level.index];
      if (!tile) return;
      return this.#enter([tile.category.id]);
    }
    if (this.#mode === 'systems') {
      const system = this.#systemView.selected;
      if (!system) return;
      return this.#enter([...this.#level.path, system.summary.name]);
    }
    if (this.#list) {
      const game = this.#gameView.selected;
      if (!game) return;
      this.#gameView.leave();
      try {
        await this.forma.launch.game(game.id);
      } catch (error) {
        this.#gameView.resume();
        this.#notify(FormaError.from(error).message);
      }
      return;
    }
    const card = this.#cards[this.#level.index];
    if (!card) return;
    await this.#enter([...this.#level.path, card.key]);
  }

  /** Into a list, where it was left if it was. */
  #enter(path: string[]): Promise<void> {
    this.#stack.push({ path, index: 0, ...this.#places.get(path.join('/')) });
    return this.#load();
  }

  async #back(): Promise<void> {
    // A list narrowed down in Forma's menu (a game's siblings, say): every game again,
    // the game selected kept (Forma's change reloads the list).
    if (this.#filtered()) {
      await this.forma.nav.setFilter(null).catch((error: unknown) => {
        this.#notify(FormaError.from(error).message);
      });
      return;
    }
    if (this.#stack.length === 1) return;
    const { path, index } = this.#level;
    this.#places.set(path.join('/'), {
      index,
      game: this.#list ? this.#gameView.selected?.id : undefined
    });
    this.#stack.pop();
    await this.#load();
  }

  /** The game list on screen narrowed down by Forma's filter. */
  #filtered(): boolean {
    return this.#mode === 'browse' && !!this.#list && this.#page?.filtered === true;
  }

  async #toggleFavorite(): Promise<void> {
    const game = this.#gameView.selected;
    if (!this.#list || !game) return;
    try {
      await this.forma.library.setFavorite(game.id, !game.favorite);
      this.#gameView.refreshSelected({ ...game, favorite: !game.favorite });
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
    const game = this.#list ? this.#gameView.selected : null;
    if (!game) return { system: null, game: null };
    const s = this.#groups.flatMap((g) => g.systems).find((x) => x.summary.name === game.system);
    return {
      system: { name: game.system, fullname: s?.summary.fullname ?? game.system },
      game: { id: game.id, name: game.name }
    };
  }

  /** Library changes arrive in bursts (a scraper run); reload once they settle. */
  #reloadSoon(): void {
    clearTimeout(this.#reloadTimer);
    this.#reloadTimer = setTimeout(() => void this.#load(true), 300);
  }

  #notify(message: string): void {
    this.#toast.textContent = message;
    this.#toast.hidden = false;
    clearTimeout(this.#toastTimer);
    this.#toastTimer = setTimeout(() => (this.#toast.hidden = true), 4000);
  }
}
