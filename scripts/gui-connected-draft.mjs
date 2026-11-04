#!/usr/bin/env node
/**
 * Connected cold-start check: with a real Dashboard session, a draft typed in a
 * dedicated Bot and the selected Bot must both survive a full quit/relaunch.
 *
 * The dedicated profile is `mosbot-probe-gui-HHMMSS` (removed by the next chat
 * probe run). No message is sent; only local draft/selection state is involved.
 *
 * Run: node scripts/gui-connected-draft.mjs
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
const USER_DATA = path.resolve('.tmp/userdata-connected-draft');
const OUT_DIR = path.resolve('docs/evidence/tmp');

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
  const draft = '真实连接下的草稿-请勿发送';
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
          description: 'MosBot connected-draft probe; safe to delete',
          shape: 'circle',
          color: '#7ab0a0',
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
    await page.locator('textarea').first().fill(draft);
    await page.waitForTimeout(1_500);
    note('draft typed in the connected Bot', true, profileName);

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
    note('cold start restores the selected Bot', true, profileName);
    const restored = await restarted.locator('textarea').first().inputValue();
    note('cold start restores the draft', restored === draft, JSON.stringify(restored));

    // Leave no draft behind for the next run.
    await restarted.locator('textarea').first().fill('');
    await restarted.waitForTimeout(1_200);

    const report = {
      kind: 'real service · packaged app, connected cold start with draft',
      generatedAt: new Date().toISOString(),
      target: 'http://192.168.2.171:9119',
      profile: profileName,
      steps,
    };
    const reportPath = path.join(
      OUT_DIR,
      `connected-draft-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
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
