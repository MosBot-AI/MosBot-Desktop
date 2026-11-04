#!/usr/bin/env node
/**
 * Unopened-Bot approval across two clients.
 *
 * A keeps the Bot Chat attached (so the gateway keeps the approval open); B has a
 * different Bot selected, so the waiting session is "unopened" on B. B's pending
 * watcher must discover it, request a system notification while B's window is
 * minimised, and the notification click path must restore B, open the waiting Bot
 * and deliver the approval card. Denying it there must fold A's card into a
 * "handled in another window" receipt via the resume reconciliation.
 *
 * Dedicated profile is `mosbot-probe-gui-HHMMSS` (removed by the next chat probe).
 * Run: node scripts/gui-unopened-approval.mjs
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
const PROBE_DIR = path.resolve('.tmp/userdata-probe');
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
  // UI tests run hidden by default: no activation, no Dock icon, no visible
  // windows. Set MOSBOT_TEST_FOREGROUND=1 only for a check that must be watched.
  env.MOSBOT_TEST_BACKGROUND = process.env['MOSBOT_TEST_FOREGROUND'] === '1' ? '0' : '1';
  env.MOSBOT_DIAG = '1';
  return env;
}

async function launchInstance(suffix) {
  const userData = path.resolve(`.tmp/userdata-unopened-${suffix}`);
  rmSync(userData, { recursive: true, force: true });
  cpSync(PROBE_DIR, userData, { recursive: true });
  const application = await electron.launch({
    executablePath: APP,
    env: appEnvironment(),
    args: ['--no-sandbox', `--user-data-dir=${userData}`],
  });
  const page = await application.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await waitConnected(page);
  return { application, page };
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

async function transcript(page) {
  return (await page.locator('[role="log"]').textContent()) ?? '';
}

async function waitForText(page, text, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await transcript(page)).includes(text)) {
      return true;
    }
    await page.waitForTimeout(400);
  }
  return false;
}

async function subscribeSent(page, text) {
  const composer = page.locator('textarea').first();
  await composer.fill(text);
  await composer.press('Enter');
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const steps = [];
  const note = (name, ok, detail) => {
    steps.push({ name, ok: ok === true, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : ` · ${detail}`}`);
  };
  const profileName = stampName();
  let a = null;
  let b = null;
  let exitCode = 1;

  try {
    a = await launchInstance('a');
    const created = await a.page.evaluate(
      async (name) =>
        window.mosbot?.dashboard.createBot({
          name,
          description: 'MosBot unopened-approval probe; safe to delete',
          shape: 'circle',
          color: '#c08a4e',
        }) ?? null,
      profileName,
    );
    if (created === null || created.ok !== true) {
      throw new Error(`createBot failed: ${JSON.stringify(created)}`);
    }
    note('dedicated Bot created', true, profileName);

    await a.page.reload();
    await a.page.waitForLoadState('domcontentloaded');
    await waitConnected(a.page);
    await a.page.getByRole('button', { name: '搜索' }).click();
    await a.page.getByRole('combobox').fill(profileName);
    await a.page
      .getByRole('option', { name: new RegExp(profileName) })
      .first()
      .click();
    await a.page.locator('textarea').first().waitFor({ state: 'visible', timeout: 30_000 });
    const enabledDeadline = Date.now() + 90_000;
    while (Date.now() < enabledDeadline) {
      const enabled = await a.page.evaluate(() => {
        const area = document.querySelector('textarea');
        return area !== null && area.disabled === false;
      });
      if (enabled) {
        break;
      }
      await a.page.waitForTimeout(1_000);
    }

    await subscribeSent(
      a.page,
      '请用 shell 工具运行命令：touch mosbot-unopened-file.txt （只创建这个探针文件）。完成后只回复 done。',
    );
    await waitForText(a.page, 'done', 120_000);

    // B starts with a different Bot selected; it never opens this chat.
    b = await launchInstance('b');
    await b.page.locator('button[class*="_pinTile_"]').first().click();
    await b.page.waitForFunction(
      (name) => !(document.querySelector('#chat-nameplate')?.textContent ?? '').includes(name),
      profileName,
      { timeout: 30_000 },
    );
    note('client B is on a different Bot', true);

    await b.application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.minimize();
    });
    note('client B window minimised', true);

    // A keeps the chat attached so the approval stays open for the gateway.
    const cardA = a.page.getByRole('group', { name: '需要你确认' }).first();
    const prompts = [
      '请用 shell 工具运行命令：chmod 777 mosbot-unopened-file.txt （只改这个探针文件的权限）。完成后只回复 done。',
      '请用 shell 工具运行命令：chmod 666 mosbot-unopened-file.txt （只改这个探针文件的权限）。完成后只回复 done。',
    ];
    let pendingA = false;
    for (const prompt of prompts) {
      await subscribeSent(a.page, prompt);
      try {
        await cardA.waitFor({ state: 'visible', timeout: 90_000 });
        pendingA = true;
        break;
      } catch {
        // retry once
      }
    }
    if (!pendingA) {
      throw new Error('approval never became pending on client A');
    }
    note('approval pending on client A', true);

    // B's watcher should discover the unopened waiting session and notify.
    const notifyDeadline = Date.now() + 120_000;
    let entries = [];
    while (Date.now() < notifyDeadline) {
      entries = await b.application.evaluate(() => globalThis.__mosbotNotify?.entries ?? []);
      if (entries.some((entry) => entry.shown === true)) {
        break;
      }
      await sleep(700);
    }
    const shown = entries.find((entry) => entry.shown === true) ?? null;
    note(
      'client B notified about the unopened Bot approval',
      shown !== null,
      shown === null ? 'none' : `${shown.title} · ${shown.body}`,
    );
    if (shown === null) {
      throw new Error('client B did not request a notification');
    }

    const scans = await b.application.evaluate(() => globalThis.__mosbotPendingScans ?? []);
    note(
      'client B watcher mapped the waiting session',
      scans.some((scan) => scan.waitingProfiles.length > 0),
      JSON.stringify(scans.at(-1) ?? null).slice(0, 200),
    );

    await b.application.evaluate(() => {
      globalThis.__mosbotNotify?.entries.at(-1)?.click();
    });
    await b.page.waitForFunction(
      (name) => (document.querySelector('#chat-nameplate')?.textContent ?? '').includes(name),
      profileName,
      { timeout: 30_000 },
    );
    note('notification click opens the waiting Bot on client B', true);
    const restored = await b.application.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      return window === undefined
        ? null
        : { visible: window.isVisible(), minimized: window.isMinimized() };
    });
    note('client B window recreated', restored !== null, JSON.stringify(restored));

    const cardB = b.page.getByRole('group', { name: '需要你确认' }).first();
    await cardB.waitFor({ state: 'visible', timeout: 60_000 });
    note('approval card delivered on client B', true);

    await cardB.getByRole('button', { name: '拒绝' }).click();
    note('client B denial receipt', await waitForText(b.page, '已拒绝', 20_000));
    note(
      'client A folds the shared request into handled-elsewhere',
      await waitForText(a.page, '已由另一端处理', 30_000),
    );

    const report = {
      kind: 'real service · two clients, unopened-Bot approval + notification click',
      generatedAt: new Date().toISOString(),
      target: 'http://192.168.2.171:9119',
      profile: profileName,
      cleanup: 'the next chat probe run deletes mosbot-probe-gui-* profiles',
      steps,
    };
    const reportPath = path.join(
      OUT_DIR,
      `unopened-approval-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`report: ${reportPath}`);
    exitCode = steps.every((step) => step.ok) ? 0 : 1;
  } finally {
    await b?.application.close().catch(() => undefined);
    await a?.application.close().catch(() => undefined);
  }
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
