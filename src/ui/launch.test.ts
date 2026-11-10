// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { launchScreen, type LaunchArt, type LaunchSystem } from './launch.js';

const system: LaunchSystem = {
  name: 'Mega Drive',
  logo: 'logo.webp',
  dark: false,
  photo: 'photo.webp'
};
const none: LaunchArt = { box: null, shot: null, backdrop: null, soft: null, logo: null };
const src = (root: HTMLElement, sel: string) =>
  root.querySelector(sel)?.getAttribute('src') ?? null;

describe('the screen while a game starts', () => {
  it('shows a game with pictures by them', () => {
    const root = launchScreen('Pulseman', system, {
      ...none,
      box: 'box.webp',
      backdrop: 'fan.webp',
      logo: 'wheel.webp'
    });
    expect(root.classList.contains('has-art')).toBe(true);
    expect(src(root, '.launch-box')).toBe('box.webp');
    expect(src(root, '.launch-backdrop')).toBe('fan.webp');
    expect(src(root, '.launch-logo')).toBe('wheel.webp');
    expect(root.querySelector('.launch-title')).toBeNull();
    expect(root.querySelectorAll('.launch-cells span').length).toBeGreaterThan(0);
    expect(root.querySelector('.loader-chip')).toBeNull();
  });

  it('shows a game with no pictures by its system and name', () => {
    const root = launchScreen('Pulseman', system);
    expect(root.classList.contains('no-art')).toBe(true);
    expect(root.classList.contains('alone')).toBe(true);
    expect(src(root, '.launch-backdrop')).toBe('photo.webp');
    expect(src(root, '.launch-system')).toBe('logo.webp');
    expect(root.querySelector('.launch-title')?.textContent).toBe('Pulseman');
    expect(root.querySelector('.loader-chip')).not.toBeNull();
    expect(root.querySelector('.launch-cells')).toBeNull();
  });

  it('falls back to the name when the logo will not load', () => {
    const root = launchScreen('Pulseman', system, { ...none, logo: 'wheel.webp' });
    root.querySelector('.launch-logo')?.dispatchEvent(new Event('error'));
    expect(root.querySelector('.launch-title')?.textContent).toBe('Pulseman');
  });

  it('goes without a box that will not load', () => {
    const root = launchScreen('Pulseman', system, { ...none, box: 'box.webp' });
    root.querySelector('.launch-box')?.dispatchEvent(new Event('error'));
    expect(root.classList.contains('alone')).toBe(true);
    expect(root.querySelector('.launch-hero')).toBeNull();
  });

  it('names the system when it has no logo', () => {
    const root = launchScreen('Pulseman', { ...system, logo: null, photo: null });
    expect(root.querySelector('.launch-system-name')?.textContent).toBe('Mega Drive');
  });
});
