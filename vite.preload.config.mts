import { defineConfig } from 'vite';

// Electron Forge's Vite plugin injects the entry, output name and format.
export default defineConfig({
  build: {
    sourcemap: true,
    minify: false,
  },
});
