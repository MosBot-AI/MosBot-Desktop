import { defineConfig } from 'vite';

// Electron Forge's Vite plugin injects the build target (entry, output name and
// CommonJS format). This file only adds project-specific behaviour.
export default defineConfig({
  build: {
    sourcemap: true,
    minify: false,
  },
});
