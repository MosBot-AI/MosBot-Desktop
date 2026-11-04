const path = require('node:path');
const { VitePlugin } = require('@electron-forge/plugin-vite');
const { MakerZIP } = require('@electron-forge/maker-zip');

/**
 * Electron Forge configuration. Main and preload are bundled by Vite; the
 * renderer is a bundled local page. Packaging and signing are added in M5.
 */
module.exports = {
  packagerConfig: {
    name: 'MosBot',
    appBundleId: 'com.mosbot.desktop',
    appCategoryType: 'public.app-category.productivity',
    asar: true,
    ignore: [
      /^\/\.git($|\/)/,
      /^\/docs($|\/)/,
      /^\/tests($|\/)/,
      /^\/scripts($|\/)/,
      /^\/src($|\/)/,
      /^\/(tsconfig|vite|forge|eslint|prettier|vitest|playwright)/,
      /^\/pnpm-lock\.yaml$/,
      /^\/out($|\/)/,
      /^\/\.tmp($|\/)/,
      /^\/test-results($|\/)/,
      /^\/node_modules\/(\.pnpm|@electron-forge|@electron|electron|electron-squirrel-startup|vite|rolldown|rollup|typescript|@types|vitest|@vitest|playwright|@playwright|eslint|@eslint|prettier|@vitejs|@typescript-eslint|jsdom|happy-dom)(\/|$)/,
      /^\/node_modules\/\.bin(\/|$)/,
    ],
  },
  rebuildConfig: {},
  makers: [new MakerZIP({}, ['darwin'])],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: path.resolve(__dirname, 'src/main/main.ts'),
          config: path.resolve(__dirname, 'vite.main.config.mts'),
          target: 'main',
        },
        {
          entry: path.resolve(__dirname, 'src/preload/preload.ts'),
          config: path.resolve(__dirname, 'vite.preload.config.mts'),
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: path.resolve(__dirname, 'vite.renderer.config.mts'),
        },
      ],
    }),
  ],
};
