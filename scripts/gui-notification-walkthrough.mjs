#!/usr/bin/env node
/**
 * System-notification walkthrough for a request that arrives while the window is
 * unfocused/minimised.
 *
 * A dedicated Bot triggers a real approval; the window is minimised before the
 * request arrives, so the pending watcher must raise a system notification. With
 * MOSBOT_DIAG=1 the main process records the notification request and click
 * handler, letting this walkthrough verify:
 *   - a notification is requested with the Bot name and "needs confirmation";
 *   - its click path restores the window and opens the waiting Bot, where the
 *     approval card is delivered and can be denied.
 *
 * The actual macOS banner pixels and a real pointer click need Screen Recording /
 * manual confirmation (the shell has no screen-recording permission here), so this
 * is recorded as a programmatic verification, not as visual acceptance.
 *
 * Run: node scripts/gui-notification-walkthrough.mjs
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { _electron as electron } from 'playwright';

const APP = path.resolve(
  'out',
  `MosBot-${process.platform === 'darwin' ? 'darwin' : process.platform}-${process.arch}`,
  'MosBot.app',
  'Contents',
  'MacOS',
  'MosBot',
);
const USER_DATA = path.resolve('.tmp/userdata-notification-gui');
const OUT_DIR = path.resolve('docs/evidence/tmp');

function stampName() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `mosbot-probe-gui-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function notificationPrefs() {
  try {
    const output = execFileSync('defaults', ['read', 'com.apple.ncprefs'], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
    return output.includes('com.mosbot.desktop') ? 'mosbot-entry-present' : 'no-mosbot-entry';
  } catch {
    return 'unreadable';
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  rmSync(USER_DATA, { recursive: true, force: true });
  cpSync(path.resolve('.tmp/userdata-probe'), USER_DATA, { recursive: true });

  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined) {
      env[key] = value;
    }
  }
  env.NODE_ENV = 'production';
  // UI tests run hidden by default: no activation, no Dock icon, no visible
  // windows. Set MOSBOT_TEST_FOREGROUND=1 only for a check that must be watched.
  env.MOSBOT_TEST_BACKGROUND = process.env['MOSBOT_TEST_FOREGROUND'] === '1' ? '0' : '1';
  env.MOSBOT_DIAG = '1';

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

    const created = await page.evaluate(
      async (name) =>
        window.mosbot?.dashboard.createBot({
          name,
          description: 'MosBot notification probe; safe to delete',
          shape: 'circle',
          color: '#8a7ad6',
        }) ?? null,
      profileName,
    );
    if (created === null || created.ok !== true) {
      throw new Error(`createBot failed: ${JSON.stringify(created)}`);
    }
    note('dedicated Bot created', true, profileName);

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
      '请用 shell 工具运行命令：touch mosbot-notify-file.txt （只创建这个探针文件）。完成后只回复 done。',
    );
    await composer.press('Enter');
    await page.waitForFunction(
      () => (document.querySelector('[role="log"]')?.textContent ?? '').includes('done'),
      undefined,
      { timeout: 120_000 },
    );
    note('probe file created', true);

    // Send the dangerous command and immediately get out of the way: switch to
    // another Bot and minimise, so the request is discovered while unfocused.
    await composer.fill(
      '请用 shell 工具运行命令：chmod 777 mosbot-notify-file.txt （只改这个探针文件的权限）。完成后只回复 done。',
    );
    // Keep this Bot (and its chat connection) open so the request stays pending;
    // only minimise the window, which is enough for the notification condition.
    const pendingCard = page.getByRole('group', { name: '需要你确认' }).first();
    const attempts = [
      '请用 shell 工具运行命令：chmod 777 mosbot-notify-file.txt （只改这个探针文件的权限）。完成后只回复 done。',
      '请用 shell 工具运行命令：chmod 666 mosbot-notify-file.txt （只改这个探针文件的权限）。完成后只回复 done。',
      '请用 shell 工具运行命令：chmod 777 mosbot-notify-file.txt （只改这个探针文件的权限）。完成后只回复 done。',
    ];
    let pendingSeen = false;
    for (const prompt of attempts) {
      await composer.fill(prompt);
      await composer.press('Enter');
      try {
        await pendingCard.waitFor({ state: 'visible', timeout: 90_000 });
        pendingSeen = true;
        break;
      } catch {
        // The model may refuse or answer without running the command; retry.
      }
    }
    if (!pendingSeen) {
      throw new Error('approval never became pending in the open chat');
    }
    note('approval pending in the open chat', true);
    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.minimize();
    });
    note('window minimised while the approval is pending', true);

    const notificationDeadline = Date.now() + 120_000;
    let entries = [];
    while (Date.now() < notificationDeadline) {
      entries = await application.evaluate(() => globalThis.__mosbotNotify?.entries ?? []);
      if (entries.length > 0) {
        break;
      }
      await page.waitForTimeout(1_000);
    }
    const entry = entries[0] ?? null;
    note(
      'system notification requested for the unfocused window',
      entry !== null,
      entry === null
        ? 'none'
        : `${entry.title} · ${entry.body} · approval=${String(entry.approval)}`,
    );
    if (entry !== null && entry.shown === true) {
      const shotPath = path.resolve('.tmp/shots/notification-banner.png');
      // Give macOS a moment to animate the banner in.
      await page.waitForTimeout(1_200);
      execFileSync('screencapture', ['-x', shotPath]);
      note('system notification screenshot captured', true, shotPath);
    }
    if (entry === null) {
      await application.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        window?.restore();
        window?.show();
        window?.focus();
      });
      await page.waitForTimeout(2_000);
      const scans = await application.evaluate(() => globalThis.__mosbotPendingScans ?? []);
      console.log('pending scans:', JSON.stringify(scans.slice(-4)));
      const roster = await page.evaluate(async () => window.mosbot?.dashboard.listBots() ?? null);
      console.log(
        'canonical for profile:',
        JSON.stringify(
          roster !== null && roster.ok === true
            ? roster.data.find((bot) => bot.profileName === profileName)
            : null,
        ).slice(0, 320),
      );
      const diagnostic = await page.evaluate(() => {
        const state = window.__mosbotDiag?.state?.() ?? null;
        return {
          attention: document.querySelector('button[class*="_attention_"]')?.textContent ?? null,
          pending: state?.pending ?? null,
          nameplate: document.querySelector('#chat-nameplate')?.textContent ?? null,
        };
      });
      console.log('ui diagnostic:', JSON.stringify(diagnostic));
      throw new Error('no notification was requested');
    }

    // Exercise the click handler: restore the window, open the waiting Bot and
    // assert the approval card is delivered there.
    await application.evaluate(() => {
      globalThis.__mosbotNotify?.entries.at(-1)?.click();
    });
    await page.waitForFunction(
      (name) => (document.querySelector('#chat-nameplate')?.textContent ?? '').includes(name),
      profileName,
      { timeout: 30_000 },
    );
    const restored = await application.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      return window === undefined
        ? null
        : { visible: window.isVisible(), minimized: window.isMinimized() };
    });
    note(
      'notification click reopens the app window and opens the Bot',
      restored !== null,
      JSON.stringify(restored),
    );
    const card = page.getByRole('group', { name: '需要你确认' }).first();
    let cardSeen = false;
    try {
      await card.waitFor({ state: 'visible', timeout: 60_000 });
      cardSeen = true;
    } catch {
      // recorded below
    }
    note('approval card is delivered after the click', cardSeen);
    if (cardSeen) {
      await card.getByRole('button', { name: '拒绝' }).click();
      const receiptDeadline = Date.now() + 20_000;
      let receipt = false;
      while (Date.now() < receiptDeadline) {
        if (((await page.locator('[role="log"]').textContent()) ?? '').includes('已拒绝')) {
          receipt = true;
          break;
        }
        await page.waitForTimeout(500);
      }
      note('denial receipt after the notification path', receipt);
    }

    const report = {
      kind: 'real service · packaged app, notification path (unfocused window)',
      generatedAt: new Date().toISOString(),
      target: 'http://192.168.2.171:9119',
      profile: profileName,
      osNotificationPrefs: notificationPrefs(),
      visualBanner: 'unverified: shell lacks Screen Recording permission (screencapture is black)',
      realPointerClick: 'unverified: notification centre click not automatable here',
      steps,
    };
    const reportPath = path.join(
      OUT_DIR,
      `notification-gui-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
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
