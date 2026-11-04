#!/usr/bin/env node
/**
 * Real-service GUI walkthrough for the remote computer viewer.
 *
 * Drives the packaged app with the probe session: opens the details/computer
 * tab, wakes the remote display if needed, opens the independent noVNC viewer
 * window, checks that the RFB canvas really renders, takes control, returns it
 * and closes the window. Only DOM facts (state text, canvas size, buttons) are
 * recorded — never remote screen pixels.
 *
 * Run: node scripts/gui-computer-walkthrough.mjs
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
const USER_DATA = path.resolve('.tmp/userdata-computer-gui');
const OUT_DIR = path.resolve('docs/evidence/tmp');

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
    await page.locator('button[class*="_pinTile_"]').first().click();
    await page.locator('#chat-nameplate').click();
    await page.getByRole('tab', { name: '电脑' }).click();
    note('computer tab opened on the real connection', true);

    await page
      .getByText(/电脑运行中|电脑休眠中/)
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 });
    const asleep = await page.getByText('电脑休眠中').count();
    if (asleep > 0) {
      const wake = page.getByRole('button', { name: '唤醒' });
      await wake.click();
      await page.getByText('电脑运行中').first().waitFor({ state: 'visible', timeout: 120_000 });
      note('remote display woken through the app', true);
    } else {
      note('remote display already running', true);
    }

    // Capture console/load errors for the viewer window from the main process side.
    await application.evaluate(({ app }) => {
      globalThis.__viewerLogs = [];
      app.on('browser-window-created', (_event, window) => {
        window.webContents.on('console-message', (...args) => {
          globalThis.__viewerLogs.push(String(args[2] ?? args[0] ?? ''));
        });
        window.webContents.on('did-fail-load', (_event, code, description, url) => {
          globalThis.__viewerLogs.push(`did-fail-load ${code} ${description} ${url}`);
        });
      });
    });

    const openViewer = page.getByRole('button', { name: '打开观看窗口' });
    await openViewer.waitFor({ state: 'visible', timeout: 60_000 });
    await openViewer.click();

    let viewerPage = null;
    const viewerDeadline = Date.now() + 60_000;
    while (Date.now() < viewerDeadline) {
      const windows = application.windows();
      viewerPage = windows.find((candidate) => candidate.url().includes('viewer=1')) ?? null;
      if (viewerPage !== null) {
        break;
      }
      await page.waitForTimeout(500);
    }
    if (viewerPage === null) {
      throw new Error('viewer window did not open');
    }
    await viewerPage.waitForLoadState('domcontentloaded');
    let viewerLogs = [];
    viewerPage.on('console', (message) => {
      viewerLogs.push(`${message.type()}: ${message.text()}`);
    });
    note('independent viewer window opened', true);

    const viewerState = async () =>
      viewerPage.evaluate(() => {
        const text = document.body.textContent ?? '';
        const canvas = document.querySelector('canvas');
        return {
          viewOnly: text.includes('仅观看') || text.includes('取得控制权'),
          controlling: text.includes('你正在控制') || text.includes('归还控制'),
          otherViewer: text.includes('其他人正在控制'),
          canvas: canvas === null ? null : { width: canvas.width, height: canvas.height },
          text: text.slice(0, 300),
        };
      });

    // RFB needs a moment to connect and paint the first frame.
    const connectDeadline = Date.now() + 90_000;
    let state = await viewerState();
    while (Date.now() < connectDeadline) {
      state = await viewerState();
      const canvasReady = state.canvas !== null && state.canvas.width > 0;
      const connectedText = state.viewOnly || state.controlling || state.otherViewer;
      if (canvasReady && connectedText) {
        break;
      }
      await viewerPage.waitForTimeout(1_000);
    }
    viewerLogs = viewerLogs.concat(await application.evaluate(() => globalThis.__viewerLogs ?? []));
    console.log('viewer state before control:', JSON.stringify(state));
    console.log('viewer logs:', JSON.stringify(viewerLogs.slice(-8)));
    note(
      'RFB canvas rendered in the viewer',
      state.canvas !== null && state.canvas.width > 0 && state.canvas.height > 0,
      JSON.stringify(state.canvas),
    );

    if (state.text.includes('正在连接画面') || state.text.includes('画面连接已断开')) {
      throw new Error(`viewer never connected: ${JSON.stringify(state)}`);
    }
    if (state.otherViewer) {
      note('another viewer currently controls the computer', false, state.text.slice(0, 160));
    } else if (state.controlling) {
      await viewerPage.getByRole('button', { name: '归还控制' }).click();
      await viewerPage.getByRole('button', { name: '取得控制权' }).waitFor({ timeout: 30_000 });
      note('existing control returned to view-only', true);
    } else {
      const acquireResult = await viewerPage.evaluate(
        async () => window.mosbot?.computer.acquire() ?? null,
      );
      console.log('acquire result:', JSON.stringify(acquireResult));
      await viewerPage.waitForTimeout(3_000);
      const afterAcquire = await viewerPage.evaluate(() => ({
        text: (document.body.textContent ?? '').slice(0, 300),
        hasRelease: [...document.querySelectorAll('button')].some((button) =>
          button.textContent?.includes('归还控制'),
        ),
        hasAcquire: [...document.querySelectorAll('button')].some((button) =>
          button.textContent?.includes('取得控制权'),
        ),
      }));
      console.log('after acquire:', JSON.stringify(afterAcquire));
      if (afterAcquire.hasRelease !== true) {
        throw new Error(`acquire did not hold the lease: ${JSON.stringify(afterAcquire)}`);
      }
      note('control acquired (lease held)', true);
      await viewerPage.getByRole('button', { name: '归还控制' }).click();
      await viewerPage.getByRole('button', { name: '取得控制权' }).waitFor({ timeout: 30_000 });
      note('control returned to view-only', true);
    }

    await viewerPage.getByRole('button', { name: '关闭' }).click();
    const closeDeadline = Date.now() + 30_000;
    while (Date.now() < closeDeadline && application.windows().length > 1) {
      await page.waitForTimeout(500);
    }
    note('viewer window closed', application.windows().length === 1);

    const report = {
      kind: 'real service · packaged app GUI (remote computer viewer)',
      generatedAt: new Date().toISOString(),
      target: 'http://192.168.2.171:9119',
      note: 'no remote screen pixels were captured',
      steps,
    };
    const reportPath = path.join(
      OUT_DIR,
      `computer-gui-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
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
