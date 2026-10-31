import { connect } from '@ramraiders/forma-sdk';

import { App } from './app.js';
import { loader } from './ui/loader.js';
import { startPerfOverlay } from './ui/perf.js';

const root = document.querySelector<HTMLElement>('#app')!;
// Over everything until the first screen is drawn, then faded out.
const boot = document.createElement('div');
boot.className = 'boot';
boot.append(loader('Starting Forma'));
document.body.append(boot);

try {
  const forma = await connect();
  if (location.hash === '#perf') {
    // Saved as a theme setting too, for reading off a device remotely.
    startPerfOverlay((stats) => void forma.settings.set('perf', stats));
  }
  await new App(forma, root).start();
  boot.classList.add('done');
  boot.addEventListener('transitionend', () => boot.remove(), { once: true });
  // In case transitions are off (reduced motion): never leave it over the screen.
  setTimeout(() => boot.remove(), 1000);
  if (import.meta.env.DEV) replayKeys();
} catch (error) {
  boot.remove();
  root.textContent = `Could not connect to Forma: ${String(error)}`;
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
