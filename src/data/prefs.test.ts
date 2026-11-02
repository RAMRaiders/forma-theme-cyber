import { describe, expect, it } from 'vitest';

import { applyMargins, margins, prefUpdate } from './prefs.js';

describe('prefs', () => {
  it('takes a setting from Forma’s menu only with the right type', () => {
    expect(prefUpdate('board', 'dim')).toEqual({ board: 'dim' });
    expect(prefUpdate('motion', false)).toEqual({ motion: false });
    expect(prefUpdate('motion', 'off')).toBeNull();
    expect(prefUpdate('perf', {})).toBeNull();
  });

  it('keeps screen margins to 0–10% and shrinks the page into them', () => {
    expect(margins(3.4)).toBe(3);
    expect(margins(40)).toBe(10);
    expect(margins('5')).toBe(0);
    const body = { style: { transform: '' } } as HTMLElement;
    applyMargins(margins(1), body);
    expect(body.style.transform).toBe('scale(0.98)');
    applyMargins(0, body);
    expect(body.style.transform).toBe('');
  });
});
