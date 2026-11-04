const path = require('node:path');
const { VitePlugin } = require('@electron-forge/plugin-vite');
const { MakerZIP } = require('@electron-forge/maker-zip');

/**
 * Signing, hardened runtime and notarization are opt-in through the environment:
 * Without a Developer ID identity the build is ad-hoc signed (identity "-") so the
 * bundle is sealed and macOS can register notifications/permissions; with the
 * variables below `pnpm make` signs with that identity and notarizes:
 *   MOSBOT_MACOS_SIGN_IDENTITY  e.g. "Developer ID Application: Name (TEAMID)"
 *   MOSBOT_NOTARY_APPLE_ID      Apple ID for notarytool
 *   MOSBOT_NOTARY_PASSWORD      app-specific password
 *   MOSBOT_NOTARY_TEAM_ID       Apple team id
 */
const signingIdentity = process.env.MOSBOT_MACOS_SIGN_IDENTITY;
const notaryAppleId = process.env.MOSBOT_NOTARY_APPLE_ID;
const notaryPassword = process.env.MOSBOT_NOTARY_PASSWORD;
const notaryTeamId = process.env.MOSBOT_NOTARY_TEAM_ID;
const notarize =
  typeof notaryAppleId === 'string' &&
  notaryAppleId !== '' &&
  typeof notaryPassword === 'string' &&
  notaryPassword !== '' &&
  typeof notaryTeamId === 'string' &&
  notaryTeamId !== '';

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
    ...(typeof signingIdentity === 'string' && signingIdentity !== ''
      ? {
          osxSign: {
            identity: signingIdentity,
            hardenedRuntime: true,
            // @electron/osx-sign only honours per-file options; helpers keep their
            // own default entitlements and the app bundle gets the minimal set.
            optionsForFile: (filePath) => {
              if (filePath.includes('.app/')) {
                return {};
              }
              return {
                entitlements: path.resolve(__dirname, 'build/entitlements.mac.plist'),
              };
            },
          },
        }
      : {}),
    ...(notarize
      ? {
          osxNotarize: {
            appleId: notaryAppleId,
            appleIdPassword: notaryPassword,
            teamId: notaryTeamId,
          },
        }
      : {}),
  },
  rebuildConfig: {},
  makers: [new MakerZIP({}, ['darwin'])],
  hooks: {
    // @electron/osx-sign refuses the ad-hoc identity "-", so seal the local build
    // ourselves: an unsigned/linker-signed bundle does not register with macOS
    // notifications (ncprefs has no entry). Developer ID builds keep using
    // osxSign above and skip this.
    postPackage: async (_config, options) => {
      if (process.platform !== 'darwin') {
        return;
      }
      if (typeof signingIdentity === 'string' && signingIdentity !== '') {
        return;
      }
      // Opt-in for release builds: existing dev/test userData is encrypted under
      // the previous code identity, so signing every local package would break
      // their saved Dashboard session.
      if (process.env['MOSBOT_ADHOC_SIGN'] !== '1') {
        return;
      }
      const { readdirSync } = require('node:fs');
      const { execFileSync } = require('node:child_process');
      for (const outputPath of options.outputPaths) {
        for (const entry of readdirSync(outputPath)) {
          if (!entry.endsWith('.app')) {
            continue;
          }
          const appPath = path.join(outputPath, entry);
          execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
            stdio: 'inherit',
          });
        }
      }
    },
  },
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
