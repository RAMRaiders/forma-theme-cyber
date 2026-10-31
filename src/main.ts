import { connect } from '@ramraiders/forma-sdk';

import { App } from './app.js';
import { startPerfOverlay } from './ui/perf.js';

const root = document.querySelector<HTMLElement>('#app')!;

try {
  const forma = await connect();
  if (location.hash === '#perf') {
    // Saved as a theme setting too, for reading off a device remotely.
    startPerfOverlay((stats) => void forma.settings.set('perf', stats));
  }
  await new App(forma, root).start();
} catch (error) {
  root.textContent = `Could not connect to Forma: ${String(error)}`;
}
