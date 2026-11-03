import type { MusicSong, MusicStatus } from '@ramraiders/forma-sdk';

import { el } from './dom.js';

/** What plays, in a few words: the track's title, else the source's name. */
export function nowPlaying(status: MusicStatus): string {
  if (status.state === 'stopped' || !status.source) return 'Nothing playing';
  return status.title ?? status.source.name;
}

/** How long the card takes to leave: its exit animation (`song-out` in style.css). */
const LEAVE_MS = 500;

/**
 * Cyber's own look for the song that just started (Forma says when, and for how long): a card
 * that sweeps in from the right, a spinning disc and a bouncing equaliser, a bar that drains
 * for the time it shows, then sweeps out.
 */
export class SongCard {
  readonly root = el('div', { class: 'song-card', role: 'status', hidden: '' });
  #timers: ReturnType<typeof setTimeout>[] = [];

  show(song: MusicSong): void {
    this.#clear();
    this.root.style.setProperty('--seconds', `${song.seconds}s`);
    this.root.replaceChildren(
      el('div', { class: 'disc', 'aria-hidden': 'true' }, el('span', { class: 'hole' })),
      el(
        'div',
        { class: 'words' },
        el('span', { class: 'kicker' }, 'Now playing'),
        el('span', { class: 'title' }, song.title),
        song.artist ? el('span', { class: 'artist' }, song.artist) : ''
      ),
      el(
        'div',
        { class: 'eq', 'aria-hidden': 'true' },
        ...Array.from({ length: 5 }, () => el('i', {}))
      ),
      el('div', { class: 'time', 'aria-hidden': 'true' }, el('span', {}))
    );
    this.root.classList.remove('out');
    // A fresh start of the entrance, also when one song replaces another on screen.
    this.root.hidden = true;
    void this.root.offsetWidth;
    this.root.hidden = false;
    this.#timers.push(
      setTimeout(() => {
        this.root.classList.add('out');
        this.#timers.push(setTimeout(() => this.hide(), LEAVE_MS));
      }, song.seconds * 1000)
    );
  }

  hide(): void {
    this.#clear();
    this.root.hidden = true;
    this.root.classList.remove('out');
  }

  #clear(): void {
    for (const t of this.#timers) clearTimeout(t);
    this.#timers = [];
  }
}
