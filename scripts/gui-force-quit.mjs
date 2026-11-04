#!/usr/bin/env node
/**
 * Force-quit during an in-flight prompt: after relaunch there must be exactly one
 * user message and no automatic resend of the prompt.
 *
 * Run: node scripts/gui-force-quit.mjs
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
const USER_DATA = path.resolve('.tmp/userdata-force-quit');
const OUT_DIR = path.resolve('docs/evidence/tmp');
const PROMPT = '请只回复 force-ok，不要解释。';

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
          description: 'MosBot force-quit probe; safe to delete',
          shape: 'circle',
          color: '#d67a4e',
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

    await page.locator('textarea').first().fill(PROMPT);
    await page.locator('textarea').first().press('Enter');
    await page.waitForFunction(
      (prompt) => (document.querySelector('[role="log"]')?.textContent ?? '').includes(prompt),
      PROMPT,
      { timeout: 30_000 },
    );
    note('prompt sent and visible before the crash', true);

    // Hard kill: no graceful chat.close(), simulating a crash/force quit.
    application.process().kill('SIGKILL');
    await new Promise((resolve) => setTimeout(resolve, 1_500));

    application = await electron.launch({
      executablePath: APP,
      env: appEnvironment(),
      args: ['--no-sandbox', `--user-data-dir=${USER_DATA}`],
    });
    page = await application.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await waitConnected(page);
    try {
      await page.waitForFunction(
        (name) => (document.querySelector('#chat-nameplate')?.textContent ?? '').includes(name),
        profileName,
        { timeout: 60_000 },
      );
    } catch (error) {
      const diagnostic = await page.evaluate(() => ({
        title: document.title,
        nameplate: document.querySelector('#chat-nameplate')?.textContent ?? null,
        connection: document.querySelector('#sidebar-connection')?.textContent ?? null,
        body: (document.body.textContent ?? '').slice(0, 300),
      }));
      console.log('relaunch diagnostic:', JSON.stringify(diagnostic));
      throw error;
    }
    await page.waitForTimeout(8_000); // give any accidental resend time to appear
    const text = (await page.locator('[role="log"]').textContent()) ?? '';
    const occurrences = text.split(PROMPT).length - 1;
    note('relaunch restores the Bot Chat', true);
    note(
      'the in-flight prompt is not resent automatically',
      occurrences === 1,
      `prompt occurrences after relaunch: ${occurrences}`,
    );

    const report = {
      kind: 'real service · packaged app, SIGKILL during an in-flight prompt',
      generatedAt: new Date().toISOString(),
      target: 'http://192.168.2.171:9119',
      profile: profileName,
      promptOccurrences: occurrences,
      steps,
    };
    const reportPath = path.join(
      OUT_DIR,
      `force-quit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
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
