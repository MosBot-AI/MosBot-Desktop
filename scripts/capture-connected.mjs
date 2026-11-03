#!/usr/bin/env node
/**
 * Captures the connected first-connection surface using the probe profile's
 * encrypted session (created by `pnpm test:integration`). No password is typed.
 * Writes docs/evidence/screens/m1/13-connection-connected.png.
 */
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { _electron as electron } from 'playwright';

const URL_FROM_ENV = process.env.MOSBOT_DASHBOARD_URL ?? 'http://192.168.2.171:9119';
const OUT_DIR = path.resolve('docs/evidence/screens/m1');
const APP = path.resolve(
  'out',
  `MosBot-${process.platform}-${process.arch}`,
  'MosBot.app',
  'Contents',
  'MacOS',
  'MosBot',
);

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined) {
      env[key] = value;
    }
  }
  env.NODE_ENV = 'production';

  const application = await electron.launch({
    executablePath: APP,
    env,
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--user-data-dir=' + path.resolve('.tmp/userdata-probe'),
    ],
  });
  const page = await application.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  await page.evaluate((address) => window.mosbot.dashboard.saveAddress(address), URL_FROM_ENV);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  // Startup restore runs from the encrypted vault; wait until the footer shows it.
  await page.waitForFunction(
    () => (document.querySelector('#sidebar-connection')?.textContent ?? '').includes('research'),
    undefined,
    { timeout: 20_000 },
  );
  await page.screenshot({ path: path.join(OUT_DIR, '12-connected-footer.png') });

  await page.getByRole('button', { name: '外观与语言' }).click();
  await page.getByRole('button', { name: /已连接：/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT_DIR, '13-connection-connected.png') });
  console.log('captured 12-connected-footer.png and 13-connection-connected.png');
  await application.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
