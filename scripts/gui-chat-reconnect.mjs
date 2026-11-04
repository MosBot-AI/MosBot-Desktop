#!/usr/bin/env node
/**
 * Chat reconnection walkthrough (simulated socket drop, hidden windows).
 *
 * With MOSBOT_DIAG=1 the chat manager exposes a test-only dropSocket(); closing the
 * gateway socket must trigger the normal reconnect/replay path: the transcript
 * keeps its history, the connection returns to connected, and a new prompt after
 * the reconnect still gets a real reply.
 *
 * Run: node scripts/gui-chat-reconnect.mjs
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
const USER_DATA = path.resolve('.tmp/userdata-chat-reconnect');
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
  env.MOSBOT_TEST_BACKGROUND = process.env['MOSBOT_TEST_FOREGROUND'] === '1' ? '0' : '1';
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
    const page = await application.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await waitConnected(page);

    const created = await page.evaluate(
      async (name) =>
        window.mosbot?.dashboard.createBot({
          name,
          description: 'MosBot chat-reconnect probe; safe to delete',
          shape: 'circle',
          color: '#5a9ad6',
        }) ?? null,
      profileName,
    );
    if (created === null || created.ok !== true) {
      throw new Error(`createBot failed: ${JSON.stringify(created)}`);
    }
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

    const firstPrompt = '请只回复 reconnect-ok，不要解释。';
    await page.locator('textarea').first().fill(firstPrompt);
    await page.locator('textarea').first().press('Enter');
    const firstReply = await waitForText(page, 'reconnect-ok', 120_000);
    note('first real reply before the drop', firstReply);
    const before = await transcript(page);
    const beforeCount = await page.locator('[role="log"] > *').count();

    // Simulate the gateway socket dropping; the manager should reconnect+replay.
    await application.evaluate(() => globalThis.__mosbotChatDiag?.dropSocket());
    const connectionStates = new Set();
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const state = await application.evaluate(() => globalThis.__mosbotChatDiag?.state() ?? null);
      if (state !== null) {
        connectionStates.add(state.connection);
        if (state.connection === 'connected') {
          break;
        }
      }
      await sleep(500);
    }
    note(
      'chat reconnects after the socket drop',
      connectionStates.has('connected'),
      [...connectionStates].join(' → '),
    );
    await page.waitForTimeout(3_000);
    const after = await transcript(page);
    const afterCount = await page.locator('[role="log"] > *').count();
    note(
      'existing transcript survives the reconnect',
      after.includes('reconnect-ok'),
      `before=${before.length} after=${after.length} messages=${beforeCount}→${afterCount}`,
    );

    const secondPrompt = '请只回复 reconnect-again，不要解释。';
    await page.locator('textarea').first().fill(secondPrompt);
    await page.locator('textarea').first().press('Enter');
    const secondReply = await waitForText(page, 'reconnect-again', 120_000);
    note('a new prompt gets a real reply after the reconnect', secondReply);
    const finalCount = await page.locator('[role="log"] > *').count();
    note(
      'the reconnect replay did not duplicate the message list',
      afterCount <= beforeCount,
      `messages after reconnect=${afterCount}, after second reply=${finalCount}`,
    );

    const report = {
      kind: 'real service · chat socket drop and reconnect (simulated, hidden window)',
      generatedAt: new Date().toISOString(),
      target: 'http://192.168.2.171:9119',
      profile: profileName,
      note: 'socket closed with a test-only hook; no real network change',
      connectionStates: [...connectionStates],
      steps,
    };
    const reportPath = path.join(
      OUT_DIR,
      `chat-reconnect-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
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
