import { connect } from '@ramraiders/forma-sdk';

import { App } from './app.js';
import { startPerfOverlay } from './ui/perf.js';

const root = document.querySelector<HTMLElement>('#app')!;

// Forma's own cover shows while Cyber starts, until the first screen is drawn.
try {
  const forma = await connect({ deferReady: true });
  if (location.hash === '#perf') {
    // Saved as a theme setting too, for reading off a device remotely.
    startPerfOverlay((stats) => void forma.settings.set('perf', stats));
    // Perf mode only: parts of the look left out (the theme setting `perfOff`, a list of
    // words), to measure what each one costs a Pi.
    const off = await forma.settings.get('perfOff').catch(() => null);
    if (typeof off === 'string') document.documentElement.dataset.perfOff = off;
  }
  if (import.meta.env.DEV) await presetSettings(forma);
  await new App(forma, root).start();
  await forma.ready();
  if (import.meta.env.DEV) replayKeys();
} catch (error) {
  root.textContent = `Could not connect to Forma: ${String(error)}`;
}

/**
 * Development only (stripped from builds): `?set=gamesView:collector` sets those of Cyber's
 * settings before start-up, so a headless browser can see any look.
 */
async function presetSettings(forma: Awaited<ReturnType<typeof connect>>): Promise<void> {
  const pairs = new URLSearchParams(location.search).get('set')?.split(',') ?? [];
  for (const pair of pairs) {
    const [key, value] = pair.split(':');
    if (key && value !== undefined) await forma.settings.set(key, value).catch(() => {});
  }
}

/**
 * Development only (stripped from builds): `?keys=Enter,ArrowDown` presses those keys after
 * start-up, so a headless browser can screenshot any screen.
 */
function replayKeys(): void {
  const keys = new URLSearchParams(location.search).get('keys')?.split(',') ?? [];
  keys.forEach((key, i) =>
    setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { key })), 300 * (i + 1))
  );
}
