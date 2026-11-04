#!/usr/bin/env node
/**
 * Trigger a real approval from a hidden test instance so the already-running signed
 * app (same account, launched from Finder) raises a system notification while it is
 * unfocused; capture the screen repeatedly to catch the banner.
 *
 * Run: node scripts/gui-notification-signed.mjs
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const APP = path.resolve(
  'out',
  `MosBot-${process.platform === 'darwin' ? 'darwin' : process.platform}-${process.arch}`,
  'MosBot.app',
  'Contents',
  'MacOS',
  'MosBot',
);
const USER_DATA = path.resolve('.tmp/userdata-notify-signed');
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
  cpSync(path.resolve('.tmp/userdata-probe'), USER_DATA, { recursive: true });
  const env = { ...process.env, NODE_ENV: 'production', MOSBOT_TEST_BACKGROUND: '1' };
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
        description: 'MosBot signed-notification probe; safe to delete',
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
  await page.waitForFunction(
    () =>
      document.querySelectorAll('button[class*="_pinTile_"], button[class*="_row_"]').length >= 5,
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
  const composerDeadline = Date.now() + 90_000;
  while (Date.now() < composerDeadline) {
    const enabled = await page.evaluate(() => {
      const area = document.querySelector('textarea');
      return area !== null && area.disabled === false;
    });
    if (enabled) {
      break;
    }
    await page.waitForTimeout(1_000);
  }
  const composer = page.locator('textarea').first();
  await composer.fill(
    '请用 shell 工具运行命令：touch mosbot-signed-notify.txt（只创建这个探针文件）。完成后只回复 done。',
  );
  await composer.press('Enter');
  await page.waitForFunction(
    () => (document.querySelector('[role="log"]')?.textContent ?? '').includes('done'),
    undefined,
    { timeout: 120_000 },
  );
  // Move focus away from the signed app so its main window is unfocused.
  execFileSync('open', ['-a', 'Finder']);
  await page.waitForTimeout(1_200);
  const card = page.getByRole('group', { name: '需要你确认' }).first();
  const attempts = [
    '请用 shell 工具运行命令：chmod 777 mosbot-signed-notify.txt（只改这个探针文件的权限）。完成后只回复 done。',
    '请用 shell 工具运行命令：chmod 666 mosbot-signed-notify.txt（只改这个探针文件的权限）。完成后只回复 done。',
    '请用 shell 工具运行命令：chmod 777 mosbot-signed-notify.txt（只改这个探针文件的权限）。完成后只回复 done。',
  ];
  let pendingSeen = false;
  for (const prompt of attempts) {
    await composer.fill(prompt);
    await composer.press('Enter');
    try {
      await card.waitFor({ state: 'visible', timeout: 90_000 });
      pendingSeen = true;
      break;
    } catch {
      // model refused; retry
    }
  }
  if (!pendingSeen) {
    throw new Error('approval never became pending');
  }

  const prefBefore = execFileSync('defaults', ['read', 'com.apple.ncprefs'], {
    encoding: 'utf8',
  }).includes('com.mosbot.desktop');
  let prefAfter = prefBefore;
  const shots = [];
  for (let index = 0; index < 20; index += 1) {
    const shot = path.join(SHOTS, `notify-signed-${index.toString().padStart(2, '0')}.png`);
    execFileSync('screencapture', ['-x', shot]);
    shots.push(shot);
    if (!prefAfter) {
      prefAfter = execFileSync('defaults', ['read', 'com.apple.ncprefs'], {
        encoding: 'utf8',
      }).includes('com.mosbot.desktop');
    }
    await page.waitForTimeout(700);
  }
  // Clean the pending approval from the test instance.
  if ((await page.getByRole('group', { name: '需要你确认' }).count()) > 0) {
    await card
      .getByRole('button', { name: '拒绝' })
      .click()
      .catch(() => undefined);
  }
  await application.close();

  const report = {
    kind: 'real service · signature-app notification banner trigger',
    generatedAt: new Date().toISOString(),
    profile: profileName,
    notificationPrefBefore: prefBefore,
    notificationPrefAfter: prefAfter,
    shots,
  };
  const reportPath = path.join(
    OUT_DIR,
    `notification-signed-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify({
      notificationPrefBefore: prefBefore,
      notificationPrefAfter: prefAfter,
      shots: shots.length,
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
