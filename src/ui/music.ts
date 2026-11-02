import type { MusicStatus } from '@ramraiders/forma-sdk';

/** What plays, in a few words: the track's title, else the source's name. */
export function nowPlaying(status: MusicStatus): string {
  if (status.state === 'stopped' || !status.source) return 'Nothing playing';
  return status.title ?? status.source.name;
}
