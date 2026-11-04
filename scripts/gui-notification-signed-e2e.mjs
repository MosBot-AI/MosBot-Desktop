#!/usr/bin/env node
/**
 * End-to-end notification check with the signed binary and a copy of the signed
 * app's userData: trigger a real approval, minimise the window, capture the banner,
 * then click it with a synthetic pointer event and verify the approval card opens.
 *
 * Run: node scripts/gui-notification-signed-e2e.mjs
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const APP = path.resolve('out/MosBot-signed.app/Contents/MacOS/MosBot');
const USER_DATA = path.resolve('.tmp/userdata-signed-e2e');
const OUT_DIR = path.resolve('docs/evidence/tmp');
const SHOTS = path.resolve('.tmp/shots');

function stampName() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `mosbot-probe-gui-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(SHOTS, { recursive: true });
  rmSync(USER_DATA, { recursive: true, force: true });
  cpSync(path.resolve('.tmp/userdata-signed'), USER_DATA, { recursive: true });
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    MOSBOT_DIAG: '1',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const application = await electron.launch({
    executablePath: APP,
    env,
    args: ['--no-sandbox', `--user-data-dir=${USER_DATA}`],
  });
  const page = await application.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(
    () => (document.querySelector('#sidebar-connection')?.textContent ?? '').includes('research'),
    undefined,
    { timeout: 30_000 },
  );
  const profileName = stampName();
  const created = await page.evaluate(
    async (name) =>
      window.mosbot?.dashboard.createBot({
        name,
        description: 'MosBot signed notification probe; safe to delete',
        shape: 'circle',
        color: '#c08a4e',
      }) ?? null,
    profileName,
  );
  if (created === null || created.ok !== true) {
    throw new Error(`createBot failed: ${JSON.stringify(created)}`);
  }
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(
    () => (document.querySelector('#sidebar-connection')?.textContent ?? '').includes('research'),
    undefined,
    { timeout: 30_000 },
  );
  await page.getByRole('button', { name: '搜索' }).click();
  await page.getByRole('combobox').fill(profileName);
  await page
    .getByRole('option', { name: new RegExp(profileName) })
    .first()
    .click();
  await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 30_000 });
  const composer = page.locator('textarea').first();
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const enabled = await page.evaluate(() => {
      const area = document.querySelector('textarea');
      return area !== null && area.disabled === false;
    });
    if (enabled) {
      break;
    }
    await page.waitForTimeout(1_000);
  }
  const send = async (text) => {
    await composer.fill(text);
    await composer.press('Enter');
  };
  await send(
    '请用 shell 工具运行命令：touch mosbot-signed-e2e.txt（只创建这个探针文件）。完成后只回复 done。',
  );
  await page.waitForFunction(
    () => (document.querySelector('[role="log"]')?.textContent ?? '').includes('done'),
    undefined,
    { timeout: 120_000 },
  );
  const card = page.getByRole('group', { name: '需要你确认' }).first();
  const prompts = [
    '请用 shell 工具运行命令：chmod 777 mosbot-signed-e2e.txt（只改这个探针文件的权限）。完成后只回复 done。',
    '请用 shell 工具运行命令：chmod 666 mosbot-signed-e2e.txt（只改这个探针文件的权限）。完成后只回复 done。',
  ];
  for (const prompt of prompts) {
    await send(prompt);
    try {
      await card.waitFor({ state: 'visible', timeout: 90_000 });
      break;
    } catch {
      // retry
    }
  }
  if ((await page.getByRole('group', { name: '需要你确认' }).count()) === 0) {
    throw new Error('approval never became pending');
  }
  await application.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.minimize();
  });
  // Wait for the pending watcher to request the notification.
  let entry = null;
  const notifyDeadline = Date.now() + 120_000;
  while (Date.now() < notifyDeadline) {
    const entries = await application.evaluate(() => globalThis.__mosbotNotify?.entries ?? []);
    entry = entries.find((candidate) => candidate.shown === true) ?? null;
    if (entry !== null) {
      break;
    }
    await page.waitForTimeout(500);
  }
  if (entry === null) {
    throw new Error('no notification requested');
  }
  await page.waitForTimeout(1_300);
  const bannerShot = path.join(SHOTS, 'signed-banner-e2e.png');
  execFileSync('screencapture', ['-x', bannerShot]);
  // Real pointer click near the notification banner (top-right, points).
  execFileSync('swift', [path.resolve('.tmp/click.swift'), '2375', '65']);
  await page.waitForTimeout(2_500);
  const restored = await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    return window === undefined
      ? null
      : { visible: window.isVisible(), minimized: window.isMinimized() };
  });
  const cardVisible = await page.getByRole('group', { name: '需要你确认' }).count();
  const afterShot = path.join(SHOTS, 'signed-after-click-e2e.png');
  execFileSync('screencapture', ['-x', afterShot]);
  if (cardVisible > 0) {
    await card
      .getByRole('button', { name: '拒绝' })
      .click()
      .catch(() => undefined);
  }
  const report = {
    kind: 'real service · signed app notification banner + real click',
    generatedAt: new Date().toISOString(),
    profile: profileName,
    notification: entry,
    windowAfterClick: restored,
    cardVisible,
    screenshots: [bannerShot, afterShot],
  };
  const reportPath = path.join(
    OUT_DIR,
    `notification-signed-e2e-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ notification: entry, windowAfterClick: restored, cardVisible }));
  await application.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
