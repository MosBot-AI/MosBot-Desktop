#!/usr/bin/env node
/**
 * Captures the M0a evidence screenshots from the packaged Electron app into
 * docs/evidence/screens/m0a/. Run `pnpm package` first (`pnpm screenshot` does
 * both). Uses only the offline design-slice fixtures: no Dashboard connection and
 * no real chat content.
 */
import path from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { _electron as electron } from 'playwright';

const OUT_DIR = path.resolve('docs/evidence/screens/m0a');
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
  // Local state persists between runs; capture from a clean profile.
  rmSync(path.resolve('.tmp/userdata-shots'), { recursive: true, force: true });
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined) env[key] = value;
  }
  env.NODE_ENV = 'production';
  // Same development-sandbox accommodations as tests/e2e/harness.ts.
  const application = await electron.launch({
    executablePath: APP,
    env,
    args: [
      '--no-sandbox',
      '--disable-gpu',
      `--user-data-dir=${path.resolve('.tmp/userdata-shots')}`,
    ],
  });
  const page = await application.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  const size = async (width, height) => {
    await application.evaluate(
      ({ BrowserWindow }, dims) => {
        BrowserWindow.getAllWindows()[0]?.setSize(dims.width, dims.height);
      },
      { width, height },
    );
    await page.waitForTimeout(250);
  };
  const shot = async (name) => {
    // Park the pointer outside the window so hover states do not leak into evidence.
    await page.mouse.move(1, 1);
    await page.waitForTimeout(220);
    await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
    console.log(`captured ${name}.png`);
  };

  await size(1000, 760);
  await shot('01-light-default');

  await page.locator('#chat-nameplate').click();
  await shot('02-inspector-details');
  await page.getByRole('tab', { name: '电脑' }).click();
  await page.getByRole('button', { name: '唤醒电脑' }).click();
  await page.waitForTimeout(1_500);
  await shot('03-inspector-computer-preview');
  await page.getByRole('button', { name: '关闭详情' }).click();

  await page.keyboard.press('Meta+k');
  await page.locator('#search-input').fill('设计');
  await shot('04-search');
  await page.locator('#search-input').press('Escape');

  await page.getByRole('button', { name: '新建 Bot' }).click();
  await page.locator('#create-name').fill('写作助理');
  await page.locator('#create-bot-dialog').getByText('圆形', { exact: true }).click();
  await shot('05-create-bot');
  await page.locator('#create-bot-dialog').getByRole('button', { name: '取消' }).click();

  await page.getByRole('button', { name: '外观与语言' }).click();
  await page.getByRole('button', { name: '深色' }).click();
  await page.getByRole('button', { name: '外观与语言' }).click();
  await shot('06-dark');

  await page.getByRole('button', { name: '外观与语言' }).click();
  await page.getByRole('button', { name: 'English' }).click();
  await page.getByRole('button', { name: 'Light' }).click();
  await page.keyboard.press('Escape');
  await shot('07-english');
  await page.getByRole('button', { name: 'Appearance and language' }).click();
  await page.getByRole('button', { name: '简体中文' }).click();
  await page.getByRole('button', { name: '浅色' }).click();
  await page.keyboard.press('Escape');

  await size(720, 500);
  await page.locator('#chat-nameplate').click();
  await shot('08-narrow-overlay');
  await page.keyboard.press('Escape');

  await size(1000, 760);
  await page.keyboard.press('Meta+k');
  await page.locator('#search-input').fill('语音');
  await page.locator('#search-input').press('Enter');
  await shot('09-empty-chat');

  await page.locator('#chat-nameplate').click();
  await page.getByRole('tab', { name: '资料库' }).click();
  await shot('10-library');
  await page.getByRole('button', { name: '关闭详情' }).click();

  // Hover preview: the card appears after 260 ms and the face blends to `listening`.
  await page.locator('button[title^="设计评审 · "]').hover();
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(OUT_DIR, '11-hover-preview.png') });
  console.log('captured 11-hover-preview.png');
  await page.mouse.move(1, 1);

  await page.getByRole('button', { name: '外观与语言' }).click();
  await page.getByRole('button', { name: '连接 Dashboard…' }).click();
  await shot('12-connection');
  await page.keyboard.press('Escape');

  await application.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
  // Never leave a window behind if a step fails.
  process.exit(1);
});
