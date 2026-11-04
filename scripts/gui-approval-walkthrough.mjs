#!/usr/bin/env node
/**
 * Real-service GUI approval walkthrough (dedicated, disposable profile).
 *
 * Drives the packaged app against the test Dashboard with the probe profile's
 * encrypted session (no password typed):
 *   1. create a disposable Bot through the real create dialog;
 *   2. create a probe file, then ask for `chmod 777` on it (dangerous pattern)
 *      and wait for the inline approval card;
 *   3. switch to another Bot while the request stays pending, wait for the
 *      background "needs you" chip, click it and verify the approval card is
 *      re-delivered in the canonical session;
 *   4. deny, verify the receipt and that the chip clears.
 *
 * The profile is named `mosbot-probe-gui-HHMMSS`; the next chat probe run removes
 * every profile with that prefix before doing anything else.
 *
 * Run: node scripts/gui-approval-walkthrough.mjs
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
const USER_DATA = path.resolve('.tmp/userdata-approval-gui');
const OUT_DIR = path.resolve('docs/evidence/tmp');
const SCREEN_DIR = path.resolve('docs/evidence/screens/m5');

function stampName() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `mosbot-probe-gui-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(SCREEN_DIR, { recursive: true });
  rmSync(USER_DATA, { recursive: true, force: true });
  cpSync(path.resolve('.tmp/userdata-probe'), USER_DATA, { recursive: true });

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
    args: ['--no-sandbox', `--user-data-dir=${USER_DATA}`],
  });
  const steps = [];
  const note = (name, ok, detail) => {
    steps.push({ name, ok: ok === true, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : ` · ${detail}`}`);
  };
  const profileName = stampName();
  let exitCode = 1;

  try {
    const page = await application.firstWindow();
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
    note('probe session restored and real roster rendered', true);

    await page.getByRole('button', { name: '新建 Bot' }).click();
    const createDialog = page.getByRole('dialog', { name: '新建 Bot' });
    await createDialog.waitFor({ state: 'visible', timeout: 15_000 });
    await createDialog.getByPlaceholder('给这个 Bot 起个名字').fill(profileName);
    await createDialog.getByRole('button', { name: '创建' }).click();
    await createDialog.waitFor({ state: 'hidden', timeout: 90_000 });
    await page.waitForFunction(
      (name) => (document.querySelector('#chat-nameplate')?.textContent ?? '').includes(name),
      profileName,
      { timeout: 30_000 },
    );
    note('disposable Bot created through the real dialog', true, profileName);

    const composer = page.locator('textarea').first();
    await page.waitForFunction(
      () => {
        const area = document.querySelector('textarea');
        return area !== null && area.disabled === false;
      },
      undefined,
      { timeout: 90_000 },
    );

    // Create the probe file first (safe command), then request a dangerous chmod.
    await composer.fill(
      '请用 shell 工具运行命令：touch mosbot-approval-gui.txt （只创建这个探针文件）。完成后只回复 done。',
    );
    await composer.press('Enter');
    await page.waitForFunction(
      () => (document.querySelector('[role="log"]')?.textContent ?? '').includes('done'),
      undefined,
      { timeout: 120_000 },
    );
    note('probe file created in the dedicated workspace', true);

    const card = page.getByRole('group', { name: '需要你确认' }).first();
    const attempts = [
      '请用 shell 工具运行命令：chmod 777 mosbot-approval-gui.txt （只改这个探针文件的权限）。完成后只回复 done。',
      '请用 shell 工具运行命令：chmod 666 mosbot-approval-gui.txt （只改这个探针文件的权限）。完成后只回复 done。',
      '请用 shell 工具运行命令：chmod 777 mosbot-approval-gui.txt （只改这个探针文件的权限）。完成后只回复 done。',
    ];
    let sawCard = false;
    for (const [index, prompt] of attempts.entries()) {
      await composer.fill(prompt);
      await composer.press('Enter');
      try {
        await card.waitFor({ state: 'visible', timeout: 90_000 });
        sawCard = true;
        break;
      } catch {
        const snapshot = await page.evaluate(() => ({
          transcript: (document.querySelector('[role="log"]')?.textContent ?? '').slice(-700),
          statuses: [...document.querySelectorAll('[role="status"]')]
            .map((element) => (element.textContent ?? '').trim().slice(0, 200))
            .filter((text) => text !== ''),
        }));
        console.log(`attempt ${index + 1} no approval:`, JSON.stringify(snapshot));
      }
    }
    if (!sawCard) {
      throw new Error('no inline approval card after both dangerous-command prompts');
    }
    const cardText = ((await card.textContent()) ?? '').trim();
    note('inline approval card appeared', /chmod/.test(cardText), cardText.slice(0, 100));
    await card.screenshot({ path: path.join(SCREEN_DIR, 'approval-inline-real.png') });

    // Switch away; the request stays pending for a chat that is not open.
    await page.locator('button[class*="_pinTile_"]').first().click();
    note('switched away with the approval pending', true);

    const attention = page.locator('button[class*="_attention_"]').first();
    await attention.waitFor({ state: 'visible', timeout: 120_000 });
    const attentionText = ((await attention.textContent()) ?? '').trim();
    note('background watcher surfaced the pending approval', true, attentionText);

    await attention.click();
    await page.waitForFunction(
      (name) => (document.querySelector('#chat-nameplate')?.textContent ?? '').includes(name),
      profileName,
      { timeout: 30_000 },
    );
    note('attention chip jumps back to the waiting Bot', true);
    const reopened = page.getByRole('group', { name: '需要你确认' }).first();
    await reopened.waitFor({ state: 'visible', timeout: 60_000 });
    note('approval card re-delivered in the canonical session', true);
    await reopened.screenshot({ path: path.join(SCREEN_DIR, 'approval-reopened-real.png') });

    let receipt = false;
    for (let attempt = 0; attempt < 3 && !receipt; attempt += 1) {
      const deny = page
        .getByRole('group', { name: '需要你确认' })
        .first()
        .getByRole('button', { name: '拒绝' });
      if ((await deny.count()) > 0) {
        await deny.click().catch(() => undefined);
      }
      try {
        await page.waitForFunction(
          () => (document.body.textContent ?? '').includes('已拒绝'),
          undefined,
          { timeout: 8_000 },
        );
        receipt = true;
      } catch {
        const snapshot = await page.evaluate(() => ({
          transcript: (document.querySelector('[role="log"]')?.textContent ?? '').slice(-500),
          cards: document.querySelectorAll('[role="group"][aria-label="需要你确认"]').length,
          receipts: [...document.querySelectorAll('[role="status"]')]
            .map((element) => (element.textContent ?? '').trim())
            .filter((text) => text !== ''),
        }));
        console.log(`deny attempt ${attempt + 1}:`, JSON.stringify(snapshot));
      }
    }
    if (!receipt) {
      throw new Error('denial receipt did not render');
    }
    note('denial receipt rendered', true);
    await page.waitForFunction(
      () => document.querySelector('button[class*="_attention_"]') === null,
      undefined,
      { timeout: 30_000 },
    );
    note('attention chip cleared after answering', true);

    const report = {
      kind: 'real service · packaged app GUI (dedicated probe profile)',
      generatedAt: new Date().toISOString(),
      target: 'http://192.168.2.171:9119',
      profile: profileName,
      cleanup: 'the next chat probe run deletes mosbot-probe-gui-* profiles',
      steps,
    };
    const reportPath = path.join(
      OUT_DIR,
      `approval-gui-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`report: ${reportPath}`);
    exitCode = steps.every((step) => step.ok) ? 0 : 1;
  } finally {
    await application.close().catch(() => undefined);
  }
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
