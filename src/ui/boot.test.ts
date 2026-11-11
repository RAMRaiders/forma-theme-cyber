// @vitest-environment jsdom
import type { Game } from '@ramraiders/forma-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { scrapedMark } from './boot.js';

const game = (wheel?: string) =>
  ({ id: 7, name: 'Sirius', media: wheel ? { wheel } : {} }) as unknown as Game;
const logo = (g: Game) => (g.media as Record<string, string>).wheel ?? null;

describe('scrapedMark', () => {
  const decode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode');
  afterEach(() => {
    vi.useRealTimers();
    if (decode) Object.defineProperty(HTMLImageElement.prototype, 'decode', decode);
    else delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
  });

  it("lights the logo the scrape brought, asking Forma again while the list's copy has none", async () => {
    vi.useFakeTimers();
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: () => Promise.resolve()
    });
    // Forma saves the logo a moment after the scrape says it is done.
    const fresh = vi
      .fn<(id: number) => Promise<Game | null>>()
      .mockResolvedValueOnce(game())
      .mockResolvedValue(game('wheel.png'));
    const mark = scrapedMark(game(), logo, fresh);
    await vi.advanceTimersByTimeAsync(1000);
    const el = await mark;
    expect(el.tagName).toBe('IMG');
    expect(el.getAttribute('src')).toBe('wheel.png');
    expect(fresh).toHaveBeenCalledWith(7);
  });

  it('settles for the name when no logo comes', async () => {
    vi.useFakeTimers();
    const mark = scrapedMark(game(), logo, () => Promise.resolve(game()));
    await vi.advanceTimersByTimeAsync(7000);
    expect((await mark).textContent).toBe('Sirius');
  });
});
