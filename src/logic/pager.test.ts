import { describe, expect, it, vi } from 'vitest';
import { LazyList } from './pager.js';

function source(total: number) {
  const calls: number[] = [];
  const fetch = vi.fn((offset: number, limit: number) => {
    calls.push(offset);
    const items = Array.from(
      { length: Math.max(0, Math.min(limit, total - offset)) },
      (_, i) => offset + i
    );
    return Promise.resolve({ items, total });
  });
  return { fetch, calls };
}

describe('LazyList', () => {
  it('loads the first page and learns the total', async () => {
    const { fetch, calls } = source(250);
    const list = new LazyList(fetch, 100);
    await list.start();
    expect(list.total).toBe(250);
    expect(list.get(99)).toBe(99);
    expect(calls).toEqual([0]);
  });

  it('loads a missing page once, however often it is asked for, then tells the view', async () => {
    const { fetch, calls } = source(250);
    const onLoad = vi.fn();
    const list = new LazyList(fetch, 100, onLoad);
    await list.start();
    expect(list.get(150)).toBeUndefined();
    expect(list.get(160)).toBeUndefined();
    await vi.waitFor(() => expect(list.get(150)).toBe(150));
    expect(calls).toEqual([0, 100]);
    expect(onLoad).toHaveBeenCalledTimes(2);
  });

  it('starts at the page holding a remembered position', async () => {
    const { fetch, calls } = source(1000);
    const list = new LazyList(fetch, 100);
    await list.start(512);
    expect(calls).toEqual([500]);
    expect(list.get(512)).toBe(512);
  });

  it('ignores out-of-range reads and can replace a loaded item', async () => {
    const { fetch } = source(3);
    const list = new LazyList(fetch, 100);
    await list.start();
    expect(list.get(-1)).toBeUndefined();
    expect(list.get(3)).toBeUndefined();
    list.set(1, 42);
    expect(list.get(1)).toBe(42);
  });

  it('can retry a page whose load failed', async () => {
    let fail = true;
    const list = new LazyList(
      () =>
        fail ? Promise.reject(new Error('offline')) : Promise.resolve({ items: [7], total: 1 }),
      100
    );
    await expect(list.start()).rejects.toThrow('offline');
    fail = false;
    await list.start();
    expect(list.get(0)).toBe(7);
  });

  it('finds an item by looking outward from a page, loading only what it must', async () => {
    const { fetch, calls } = source(350);
    const list = new LazyList<number>(fetch, 100);
    await list.start(150);
    expect(calls).toEqual([100]);
    expect(await list.findIndex((n) => n === 120, 150)).toBe(120);
    expect(calls).toEqual([100]);
    expect(await list.findIndex((n) => n === 230, 150)).toBe(230);
    // The nearest page each way, the one before it first.
    expect(calls).toEqual([100, 0, 200]);
    expect(await list.findIndex((n) => n === 999, 150)).toBe(-1);
    expect(calls).toEqual([100, 0, 200, 300]);
  });
});
