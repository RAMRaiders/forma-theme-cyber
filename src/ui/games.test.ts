// @vitest-environment jsdom
import type { Game } from '@ramraiders/forma-sdk';
import { describe, expect, it } from 'vitest';

import { LazyList } from '../logic/pager.js';
import { GamesView } from './games.js';

const game = (id: number, name: string, media: Record<string, string>, favorite = false) =>
  ({ id, name, system: 'nes', favorite, media }) as unknown as Game;

describe('the game list', () => {
  it('shows each game by its logo, its name kept for screen readers, never a mark', async () => {
    const games = [game(1, 'After Burner', { wheel: 'logo.png' }, true), game(2, 'Doom', {})];
    const view = new GamesView({
      media: (g, kind, width) =>
        (g.media as Record<string, string>)[kind]
          ? `forma://media/${g.id}/${kind}?w=${width}`
          : null
    });
    document.body.replaceChildren(view.root);
    const list = new LazyList<Game>((o, l) =>
      Promise.resolve({ items: games.slice(o, o + l), total: games.length })
    );
    await list.start(0);
    view.show(list, 0);
    const [burner, doom] = [...view.root.querySelectorAll<HTMLElement>('.row')];
    expect(burner!.classList.contains('has-logo')).toBe(true);
    expect(burner!.querySelector('img')!.getAttribute('src')).toBe('forma://media/1/wheel?w=360');
    expect(burner!.textContent).toBe('After Burner');
    expect(doom!.classList.contains('has-logo')).toBe(false);
    expect(doom!.textContent).toBe('Doom');
    // A logo that will not load: the name shows.
    burner!.querySelector('img')!.dispatchEvent(new Event('error'));
    expect(burner!.classList.contains('has-logo')).toBe(false);
    expect(burner!.querySelector('img')).toBeNull();
  });
});
