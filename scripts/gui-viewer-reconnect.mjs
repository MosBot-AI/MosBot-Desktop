#!/usr/bin/env node
/**
 * Viewer reconnect walkthrough (simulated drops, no real network changes).
 *
 * With MOSBOT_DIAG=1 the viewer exposes a test-only `dropSocket()` that closes the
 * RFB session; the normal disconnect path must re-observe and rebuild it. The
 * renderer's offline/online events are then dispatched to verify the "network
 * gone" copy and the automatic reconnect when it returns.
 *
 * Run: node scripts/gui-viewer-reconnect.mjs
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
const USER_DATA = path.resolve('.tmp/userdata-viewer-reconnect');
const OUT_DIR = path.resolve('docs/evidence/tmp');

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

async function openViewer(application, page) {
  await page.locator('button[class*="_pinTile_"]').first().click();
  await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('#chat-nameplate').click();
  const computerTab = page.getByRole('tab', { name: '电脑' });
  try {
    await computerTab.waitFor({ state: 'visible', timeout: 8_000 });
  } catch {
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
  const settleDeadline = Date.now() + 30_000;
  while (Date.now() < settleDeadline) {
    const text = await viewerText(viewer);
    if (text.includes('仅观看') || text.includes('其他人正在控制') || text.includes('你正在控制')) {
      break;
    }
    await viewer.waitForTimeout(400);
  }
  return viewer;
}

async function viewerText(viewer) {
  return (await viewer.locator('body').textContent()) ?? '';
}

async function waitForText(viewer, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let text = '';
  while (Date.now() < deadline) {
    text = await viewerText(viewer);
    if (predicate(text)) {
      return text;
    }
    await viewer.waitForTimeout(300);
  }
  return text;
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
    const page = await application.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await waitConnected(page);
    const viewer = await openViewer(application, page);
    let initial = await viewerText(viewer);
    if (initial.includes('其他人正在控制')) {
      // Clear a leftover human lease on the test Bot: take it over, then hand it
      // back so this walkthrough starts from a clean view-only state.
      await viewer.evaluate(async () => window.mosbot?.computer.acquire() ?? null);
      await viewer.waitForTimeout(1_500);
      await viewer.evaluate(async () => window.mosbot?.computer.release() ?? null);
      await viewer.waitForTimeout(1_500);
      initial = await viewerText(viewer);
    }
    note(
      'viewer connected with a real canvas',
      initial.includes('仅观看') || initial.includes('你正在控制'),
      initial,
    );

    // 1) Simulate the RFB socket dropping (eviction/network loss path).
    await viewer.evaluate(() => window.__mosbotViewerDiag?.dropSocket());
    console.log(
      'immediately after drop:',
      JSON.stringify((await viewerText(viewer)).trim().slice(0, 160)),
    );
    // The disconnect/connecting state only lasts until the 1.2s retry, so assert the
    // end state (rebuilt session + canvas) rather than the transient copy.
    const rebuilt = await waitForText(
      viewer,
      (text) => text.includes('仅观看') || text.includes('你正在控制'),
      30_000,
    );
    const canvasBack = await viewer.evaluate(() => document.querySelector('canvas') !== null);
    note(
      'the viewer rebuilds after a forced socket drop',
      (rebuilt.includes('仅观看') || rebuilt.includes('你正在控制')) && canvasBack,
      rebuilt,
    );

    // 2) Renderer offline/online events: copy + automatic reconnect.
    await viewer.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
    });
    const offline = await waitForText(viewer, (text) => text.includes('网络已断开'), 10_000);
    note('offline event shows the network message', offline.includes('网络已断开'), offline);
    await viewer.evaluate(() => {
      window.dispatchEvent(new Event('online'));
    });
    const online = await waitForText(
      viewer,
      (text) =>
        !text.includes('网络已断开') && (text.includes('仅观看') || text.includes('你正在控制')),
      30_000,
    );
    const canvasOnline = await viewer.evaluate(() => document.querySelector('canvas') !== null);
    note(
      'online event reconnects the viewer',
      !online.includes('网络已断开') && canvasOnline,
      online,
    );

    const report = {
      kind: 'real service · viewer socket drop and offline/online events (no real network change)',
      generatedAt: new Date().toISOString(),
      target: 'http://192.168.2.171:9119',
      note: 'simulated with a test-only dropSocket hook and DOM events; real OS network loss still unverified',
      steps,
    };
    const reportPath = path.join(
      OUT_DIR,
      `viewer-reconnect-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
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
