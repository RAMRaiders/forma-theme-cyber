import { defineConfig } from 'vite';

export default defineConfig({
  // Forma serves themes from `forma://theme/<id>/`, so asset URLs must be relative.
  base: './',
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022' }
});
