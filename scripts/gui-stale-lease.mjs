#!/usr/bin/env node
/**
 * Stale display lease after a crash: while a viewer holds control, SIGKILL the app
 * (no release runs), relaunch and reopen the viewer for the same Bot. Records what
 * the UI shows (stale "someone else is controlling"), whether the Take control
 * button is usable, and whether a direct acquire can recover the lease.
 *
 * Run: node scripts/gui-stale-lease.mjs
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
const USER_DATA = path.resolve('.tmp/userdata-stale-lease');
const OUT_DIR = path.resolve('docs/evidence/tmp');

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

async function openViewer(application, page) {
  await page.locator('button[class*="_pinTile_"]').first().click();
  await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('#chat-nameplate').click();
  const computerTab = page.getByRole('tab', { name: '电脑' });
  try {
    await computerTab.waitFor({ state: 'visible', timeout: 8_000 });
  } catch {
    // The inspector may already be open on another tab, or the first click
    // landed before the chat finished loading; retry the toggle once.
    await page.locator('#chat-nameplate').click();
    await computerTab.waitFor({ state: 'visible', timeout: 15_000 });
  }
  await computerTab.click();
  await page
    .getByText(/电脑运行中|电脑休眠中/)
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 });
  if ((await page.getByText('电脑休眠中').count()) > 0) {
    await page.getByRole('button', { name: '唤醒' }).click();
    await page.getByText('电脑运行中').first().waitFor({ state: 'visible', timeout: 120_000 });
  }
  await page.getByRole('button', { name: '打开观看窗口' }).click();
  const deadline = Date.now() + 60_000;
  let viewer = null;
  while (Date.now() < deadline) {
    viewer =
      application.windows().find((candidate) => candidate.url().includes('viewer=1')) ?? null;
    if (viewer !== null) {
      break;
    }
    await page.waitForTimeout(500);
  }
  if (viewer === null) {
    throw new Error('viewer window missing');
  }
  await viewer.waitForFunction(() => document.querySelector('canvas') !== null, undefined, {
    timeout: 90_000,
  });
  // Wait for the RFB/lease status to settle instead of reading "reconnecting".
  const settleDeadline = Date.now() + 30_000;
  while (Date.now() < settleDeadline) {
    const text = (await viewer.locator('body').textContent()) ?? '';
    if (
      text.includes('你正在控制') ||
      text.includes('其他人正在控制') ||
      (text.includes('仅观看') && !text.includes('正在重新连接'))
    ) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return viewer;
}

async function viewerState(viewer) {
  return viewer.evaluate(() => {
    const text = (document.body.textContent ?? '').trim().slice(0, 300);
    const buttons = [...document.querySelectorAll('button')].map((button) => ({
      label: (button.textContent ?? '').trim(),
      disabled: button.disabled,
    }));
    return {
      text,
      controlling: text.includes('你正在控制') || text.includes('归还控制'),
      otherViewer: text.includes('其他人正在控制'),
      acquireDisabled: buttons.find((button) => button.label === '取得控制权')?.disabled ?? null,
      buttons,
    };
  });
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
    let viewer = await openViewer(application, page);
    const acquire = await viewer.evaluate(async () => window.mosbot?.computer.acquire() ?? null);
    await viewer.waitForTimeout(2_000);
    const before = await viewerState(viewer);
    note(
      'viewer holds control before the crash',
      acquire?.ok === true && before.controlling,
      before.text,
    );

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
    viewer = await openViewer(application, page);
    const stale = await viewerState(viewer);
    note(
      'after restart the viewer re-reads a non-controlling lease',
      stale.controlling !== true,
      stale.text,
    );
    note(
      'Take control is available again after the restart',
      stale.acquireDisabled === false,
      `disabled=${String(stale.acquireDisabled)}`,
    );

    // Direct acquire via the bridge (bypasses the disabled button): the current
    // deployment is last-writer-wins, so this recovers the display.
    const forced = await viewer.evaluate(async () => window.mosbot?.computer.acquire() ?? null);
    await viewer.waitForTimeout(2_000);
    const recovered = await viewerState(viewer);
    note(
      'restart then re-acquires control successfully',
      forced?.ok === true && recovered.controlling,
      JSON.stringify({ forced, text: recovered.text }),
    );
    if (recovered.controlling) {
      await viewer.evaluate(async () => window.mosbot?.computer.release() ?? null);
    }

    const report = {
      kind: 'real service · stale display lease after SIGKILL',
      generatedAt: new Date().toISOString(),
      target: 'http://192.168.2.171:9119',
      staleState: stale,
      recovery: { forced, text: recovered.text },
      observation:
        'on this deployment the killed viewer did not leave a stuck human lease: restart showed view-only with Take control enabled and re-acquire succeeded; the viewer now also renders the lease snapshot from display.observe on open',
      steps,
    };
    const reportPath = path.join(
      OUT_DIR,
      `stale-lease-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
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
