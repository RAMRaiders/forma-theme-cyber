import { afterEach, describe, expect, it, vi } from 'vitest';

import { preload, ready, resetPreload } from './preload.js';

describe('preloading pictures', () => {
  afterEach(() => resetPreload());

  it('fetches each once, one after another, the urgent ones first', async () => {
    const asked: string[] = [];
    const real = globalThis.Image;
    class FakeImage {
      complete = true;
      naturalWidth = 10;
      decoding = '';
      #src = '';
      set src(url: string) {
        this.#src = url;
        asked.push(url);
      }
      get src(): string {
        return this.#src;
      }
      decode(): Promise<void> {
        return Promise.resolve();
      }
    }
    vi.stubGlobal('Image', FakeImage);
    preload(['a.webp', 'b.webp', null, 'a.webp']);
    preload(['c.webp', 'b.webp'], true);
    await vi.waitFor(() => expect(asked).toHaveLength(3));
    // a started at once; c, asked for urgently, went ahead of b.
    expect(asked).toEqual(['a.webp', 'c.webp', 'b.webp']);
    expect(ready('b.webp')).toBe(true);
    expect(ready('d.webp')).toBe(false);
    vi.stubGlobal('Image', real);
  });
});
