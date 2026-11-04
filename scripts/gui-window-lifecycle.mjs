#!/usr/bin/env node
/**
 * Window-lifecycle walkthrough: an approval pending while the MAIN WINDOW is closed.
 *
 * 1. open a dedicated Bot, trigger a real approval, verify the inline card;
 * 2. close the main window (the app stays alive on macOS);
 * 3. the pending watcher should request a system notification (diagnostics hook),
 *    because no window is focused/visible;
 * 4. reopen via the Dock activation path (app 'activate'), select the waiting Bot
 *    and verify the approval card is delivered again, then deny it.
 *
 * The dedicated profile is `mosbot-probe-gui-HHMMSS` and is removed by the next
 * chat probe run.
 *
 * Run: node scripts/gui-window-lifecycle.mjs
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
const USER_DATA = path.resolve('.tmp/userdata-lifecycle-gui');
const OUT_DIR = path.resolve('docs/evidence/tmp');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function stampName() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `mosbot-probe-gui-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function appEnvironment() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined) {
      env[key] = value;
    }
  }
  env.NODE_ENV = 'production';
  env.MOSBOT_DIAG = '1';
  return env;
}

async function waitConnected(page) {
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
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  rmSync(USER_DATA, { recursive: true, force: true });
  cpSync(path.resolve('.tmp/userdata-probe'), USER_DATA, { recursive: true });

  const steps = [];
  const note = (name, ok, detail) => {
    steps.push({ name, ok: ok === true, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : ` · ${detail}`}`);
  };
  const profileName = stampName();
  let application = null;
  let exitCode = 1;

  try {
    application = await electron.launch({
      executablePath: APP,
      env: appEnvironment(),
      args: ['--no-sandbox', `--user-data-dir=${USER_DATA}`],
    });
    let page = await application.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await waitConnected(page);

    const created = await page.evaluate(
      async (name) =>
        window.mosbot?.dashboard.createBot({
          name,
          description: 'MosBot window-lifecycle probe; safe to delete',
          shape: 'circle',
          color: '#8aa0d6',
        }) ?? null,
      profileName,
    );
    if (created === null || created.ok !== true) {
      throw new Error(`createBot failed: ${JSON.stringify(created)}`);
    }
    note('dedicated Bot created', true, profileName);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await waitConnected(page);
    await page.getByRole('button', { name: '搜索' }).click();
    await page.getByRole('combobox').fill(profileName);
    await page
      .getByRole('option', { name: new RegExp(profileName) })
      .first()
      .click();
    await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 30_000 });
    const enabledDeadline = Date.now() + 90_000;
    while (Date.now() < enabledDeadline) {
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
      '请用 shell 工具运行命令：touch mosbot-lifecycle-file.txt （只创建这个探针文件）。完成后只回复 done。',
    );
    await composer.press('Enter');
    await page.waitForFunction(
      () => (document.querySelector('[role="log"]')?.textContent ?? '').includes('done'),
      undefined,
      { timeout: 120_000 },
    );

    const card = page.getByRole('group', { name: '需要你确认' }).first();
    const prompts = [
      '请用 shell 工具运行命令：chmod 777 mosbot-lifecycle-file.txt （只改这个探针文件的权限）。完成后只回复 done。',
      '请用 shell 工具运行命令：chmod 666 mosbot-lifecycle-file.txt （只改这个探针文件的权限）。完成后只回复 done。',
    ];
    let pending = false;
    for (const prompt of prompts) {
      await composer.fill(prompt);
      await composer.press('Enter');
      try {
        await card.waitFor({ state: 'visible', timeout: 90_000 });
        pending = true;
        break;
      } catch {
        // model may refuse; retry once
      }
    }
    if (!pending) {
      throw new Error('approval never became pending');
    }
    note('approval pending with the window open', true);

    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.close();
    });
    const closedDeadline = Date.now() + 15_000;
    while (Date.now() < closedDeadline && application.windows().length > 0) {
      await sleep(300);
    }
    note('main window closed, app still running', application.windows().length === 0);

    // The pending watcher should notify while there is no window.
    const notifyDeadline = Date.now() + 60_000;
    let entries = [];
    while (Date.now() < notifyDeadline) {
      entries = await application.evaluate(() => globalThis.__mosbotNotify?.entries ?? []);
      if (entries.some((entry) => entry.shown === true)) {
        break;
      }
      await sleep(500);
    }
    const shown = entries.find((entry) => entry.shown === true) ?? null;
    note(
      'notification requested while the window is closed',
      shown !== null,
      JSON.stringify(shown?.body ?? null),
    );

    // Dock reopen: the app's activate handler recreates the main window.
    const windowPromise = application.waitForEvent('window', { timeout: 30_000 });
    await application.evaluate(({ app }) => {
      app.emit('activate');
    });
    const reopened = await windowPromise;
    await reopened.waitForLoadState('domcontentloaded');
    await waitConnected(reopened);
    note('Dock reopen recreated the main window', true);

    const reopenedCard = reopened.getByRole('group', { name: '需要你确认' }).first();
    let cardBack = false;
    try {
      await reopenedCard.waitFor({ state: 'visible', timeout: 60_000 });
      cardBack = true;
    } catch {
      // fall back to selecting the Bot explicitly
      await reopened.getByRole('button', { name: '搜索' }).click();
      await reopened.getByRole('combobox').fill(profileName);
      await reopened
        .getByRole('option', { name: new RegExp(profileName) })
        .first()
        .click();
      try {
        await reopenedCard.waitFor({ state: 'visible', timeout: 60_000 });
        cardBack = true;
      } catch {
        // recorded below
      }
    }
    note('approval card is delivered after reopening', cardBack);
    if (cardBack) {
      await reopenedCard.getByRole('button', { name: '拒绝' }).click();
      const receiptDeadline = Date.now() + 20_000;
      let receipt = false;
      while (Date.now() < receiptDeadline) {
        if (((await reopened.locator('[role="log"]').textContent()) ?? '').includes('已拒绝')) {
          receipt = true;
          break;
        }
        await reopened.waitForTimeout(500);
      }
      note('denial receipt after the reopen', receipt);
    }

    // Phase 2: quit with another approval pending and restart.
    await reopened
      .locator('textarea')
      .first()
      .fill(
        '请用 shell 工具运行命令：chmod 666 mosbot-lifecycle-file.txt （只改这个探针文件的权限）。完成后只回复 done。',
      );
    await reopened.locator('textarea').first().press('Enter');
    const quitCard = reopened.getByRole('group', { name: '需要你确认' }).first();
    let pendingBeforeQuit = false;
    try {
      await quitCard.waitFor({ state: 'visible', timeout: 90_000 });
      pendingBeforeQuit = true;
    } catch {
      // model may refuse; recorded below
    }
    note('second approval pending before quit', pendingBeforeQuit);
    if (pendingBeforeQuit) {
      const closed = application.waitForEvent('close', { timeout: 30_000 });
      await application.evaluate(({ app }) => {
        app.quit();
      });
      await closed.catch(() => undefined);
      application = await electron.launch({
        executablePath: APP,
        env: appEnvironment(),
        args: ['--no-sandbox', `--user-data-dir=${USER_DATA}`],
      });
      const restarted = await application.firstWindow();
      await restarted.waitForLoadState('domcontentloaded');
      await waitConnected(restarted);
      await restarted.waitForFunction(
        (name) => (document.querySelector('#chat-nameplate')?.textContent ?? '').includes(name),
        profileName,
        { timeout: 60_000 },
      );
      note('restart restores the Bot Chat', true);
      const restartedCard = restarted.getByRole('group', { name: '需要你确认' }).first();
      let cardAfterRestart = true;
      try {
        await restartedCard.waitFor({ state: 'visible', timeout: 15_000 });
      } catch {
        cardAfterRestart = false;
      }
      // The gateway keeps the request open across a full client restart and the
      // resumed chat re-delivers it; denying here must produce a receipt.
      note(
        'approval survives a full quit and is re-delivered after restart',
        cardAfterRestart,
        cardAfterRestart ? 'card pending after restart' : 'card was not re-delivered',
      );
      if (cardAfterRestart) {
        await restartedCard.getByRole('button', { name: '拒绝' }).click();
        const restartReceiptDeadline = Date.now() + 20_000;
        let restartReceipt = false;
        while (Date.now() < restartReceiptDeadline) {
          if (((await restarted.locator('[role="log"]').textContent()) ?? '').includes('已拒绝')) {
            restartReceipt = true;
            break;
          }
          await restarted.waitForTimeout(500);
        }
        note('denial receipt after restart', restartReceipt);
      }
    }

    const report = {
      kind: 'real service · packaged app, approval across main-window close/reopen and quit/restart',
      generatedAt: new Date().toISOString(),
      target: 'http://192.168.2.171:9119',
      profile: profileName,
      steps,
    };
    const reportPath = path.join(
      OUT_DIR,
      `window-lifecycle-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`report: ${reportPath}`);
    exitCode = steps.every((step) => step.ok) ? 0 : 1;
  } finally {
    await application?.close().catch(() => undefined);
  }
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
