import path from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/** Path of the app produced by `pnpm package` for the current macOS architecture. */
export function packagedAppPath(): string {
  const platform = process.platform === 'darwin' ? 'darwin' : process.platform;
  const bundle = process.platform === 'darwin' ? 'MosBot.app/Contents/MacOS/MosBot' : 'MosBot';
  return path.resolve('out', `MosBot-${platform}-${process.arch}`, ...bundle.split('/'));
}

export interface LaunchedApp {
  readonly application: ElectronApplication;
  readonly page: Page;
}

/**
 * Launches the packaged build (never a mock shell). Tests that call this must be
 * preceded by `pnpm package`; the M0a suite only exercises the offline design
 * slice and no Dashboard connection.
 */
/** A child environment without the harness' ELECTRON_RUN_AS_NODE switch. */
export function appEnvironment(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key === 'ELECTRON_RUN_AS_NODE' || value === undefined) {
      continue;
    }
    env[key] = value;
  }
  env['NODE_ENV'] = 'production';
  return env;
}

/**
 * Chromium switches needed only inside the development sandbox that runs these
 * tests: it denies the OS calls Electron's own sandbox and GPU cache need. A
 * normal desktop launch (pnpm dev / installed app) uses none of these.
 */
export function sandboxedArgs(userDataDir = '.tmp/userdata-e2e'): string[] {
  return ['--no-sandbox', '--disable-gpu', `--user-data-dir=${path.resolve(userDataDir)}`];
}

export async function launchApp(options: { userDataDir?: string } = {}): Promise<LaunchedApp> {
  const application = await electron.launch({
    executablePath: packagedAppPath(),
    args: sandboxedArgs(options.userDataDir),
    env: appEnvironment(),
  });
  const page = await application.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { application, page };
}

export async function resizeWindow(
  application: ElectronApplication,
  width: number,
  height: number,
): Promise<void> {
  await application.evaluate(
    ({ BrowserWindow }, size) => {
      const window = BrowserWindow.getAllWindows()[0];
      window?.setSize(size.width, size.height);
    },
    { width, height },
  );
}
