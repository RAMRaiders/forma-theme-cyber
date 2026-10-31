import type { Action, Browse, Game, InputEvent, Forma, ViewInfo } from '@ramraiders/forma-sdk';
import { FormaError } from '@ramraiders/forma-sdk';

import { type Move, moveGrid, moveList } from './logic/nav.js';
import { LazyList } from './logic/pager.js';
import { el } from './ui/dom.js';
import { type Card, GridView } from './ui/grid.js';
import { GamesView } from './ui/games.js';
import { Menu } from './ui/menu.js';
import { NetworkScreen } from './ui/network.js';
import { Switcher } from './ui/switcher.js';

/** One level of the path, and where the selection was, so going back returns to it. */
interface Level {
  path: string[];
  index: number;
}

const PAGE = 100;
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
    root: HTMLElement
  ) {
    this.#network = new NetworkScreen(
      forma,
      (message) => this.#notify(message),
      () => this.#renderChrome()
    );
    root.replaceChildren(
      el('header', {}, this.#title, this.#trail),
      this.#main,
      this.#hints,
      this.#switcher.root,
      this.#menu.root,
      this.#network.root,
      this.#playing,
      this.#toast
    );
  }

  async start(): Promise<void> {
    this.forma.input.on((e) => this.#onInput(e));
    this.forma.events.on('library:changed', () => this.#reloadSoon());
    this.forma.events.on('views:changed', () => void this.#loadViews());
    this.forma.events.on('game:start', ({ name }) => {
      this.#playing.replaceChildren(el('p', {}, `Starting ${name}…`));
      this.#playing.hidden = false;
    });
    this.forma.events.on('game:end', ({ error }) => {
      this.#playing.hidden = true;
      if (error) this.#notify(`The game could not run: ${error}`);
    });

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
    const { path, index } = this.#level;
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
    }
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
    this.#title.textContent = view?.name ?? this.#view;
    this.#trail.replaceChildren(
      ...(this.#page?.trail ?? []).map((c) => el('span', { class: 'crumb' }, c.label))
    );
    const games = this.#page?.listing.kind === 'games';
    const hints: [string, string][] = this.#network.open
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
              ['A', games ? 'Play' : 'Open'],
              ...(games ? [['Y', 'Favourite'] as [string, string]] : []),
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
    if (this.#list) {
      level.index = moveList(level.index, this.#list.total, move, this.#games.pageSize(), repeat);
      this.#games.select(level.index);
    } else {
      level.index = moveGrid(level.index, this.#cards.length, this.#grid.columns(), move);
      this.#grid.select(level.index);
    }
  }

  async #confirm(): Promise<void> {
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

  #openMenu(): void {
    this.#confirming = null;
    this.#menu.show('Forma', [
      { id: 'views', label: 'Views…', description: 'Organise the library another way' },
      { id: 'network', label: 'Network…', description: 'Wi-Fi and Ethernet' },
      {
        id: 'emulationstation',
        label: 'Switch to EmulationStation',
        description: 'For system settings, scraping and updates; Forma returns at the next boot'
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
