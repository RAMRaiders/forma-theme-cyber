/**
 * A long list loaded a page at a time, as the user scrolls towards it. Only what is near the
 * viewport is ever fetched, so a 20,000-game system opens as fast as a 20-game one.
 */
export interface PageResult<T> {
  items: T[];
  total: number;
}

export class LazyList<T> {
  #items: (T | undefined)[] = [];
  #total = 0;
  readonly #loading = new Map<number, Promise<void>>();

  constructor(
    private readonly fetch: (offset: number, limit: number) => Promise<PageResult<T>>,
    private readonly pageSize = 100,
    /** Called when a page lands, so the view can redraw the rows it fills. */
    private readonly onLoad: () => void = () => {}
  ) {}

  get total(): number {
    return this.#total;
  }

  /** Loads the page holding `index` (the first page by default) and learns the total. */
  async start(index = 0): Promise<void> {
    await this.#load(Math.floor(index / this.pageSize));
  }

  /** The item if loaded; otherwise `undefined`, and its page starts loading. */
  get(index: number): T | undefined {
    if (index < 0 || index >= this.#total) return undefined;
    const item = this.#items[index];
    if (item === undefined) void this.#load(Math.floor(index / this.pageSize));
    return item;
  }

  /** Replaces one loaded item, e.g. after toggling a favourite. */
  set(index: number, item: T): void {
    if (index >= 0 && index < this.#total) this.#items[index] = item;
  }

  #load(page: number): Promise<void> {
    const pending = this.#loading.get(page);
    if (pending) return pending;
    const offset = page * this.pageSize;
    const promise = this.fetch(offset, this.pageSize)
      .then(({ items, total }) => {
        this.#total = total;
        this.#items.length = total;
        items.forEach((item, i) => (this.#items[offset + i] = item));
        this.onLoad();
      })
      .finally(() => this.#loading.delete(page));
    this.#loading.set(page, promise);
    return promise;
  }
}
