// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { awake, isResting, rest } from './rest.js';

describe('rest', () => {
  afterEach(() => rest(false, true));

  it('holds timed steps while resting, and runs each once on waking', () => {
    const step = vi.fn();
    const tick = awake(step);
    tick();
    expect(step).toHaveBeenCalledTimes(1);
    rest(true);
    expect(isResting()).toBe(true);
    expect(document.documentElement.classList.contains('resting')).toBe(true);
    tick();
    tick();
    expect(step).toHaveBeenCalledTimes(1);
    rest(false);
    expect(step).toHaveBeenCalledTimes(2);
  });

  it('drops what came due when the screen is drawn afresh', () => {
    const step = vi.fn();
    rest(true);
    awake(step)();
    rest(false, true);
    expect(step).not.toHaveBeenCalled();
  });
});
