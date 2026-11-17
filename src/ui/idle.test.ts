// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IDLE_MS, poke } from './idle.js';

describe('idle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('settles a while after the last button, and wakes at the next', () => {
    const root = document.createElement('div');
    poke(root);
    vi.advanceTimersByTime(IDLE_MS - 1);
    expect(root.classList.contains('idle')).toBe(false);
    // A button just before: the wait starts over.
    poke(root);
    vi.advanceTimersByTime(IDLE_MS - 1);
    expect(root.classList.contains('idle')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(root.classList.contains('idle')).toBe(true);
    poke(root);
    expect(root.classList.contains('idle')).toBe(false);
  });
});
