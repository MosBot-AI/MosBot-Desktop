#!/usr/bin/env node
/**
 * Two-client remote-computer lease contention check.
 *
 * Runs two packaged app instances (separate userData copies of the probe session,
 * same account) against the test Dashboard. Both open the viewer for the same
 * profile; client A takes control, then client B attempts to take it while A still
 * holds it. The result is recorded either way:
 *   - B is refused and A keeps control  -> the deployment enforces a non-preemptive
 *     lease (M0c satisfied by the server);
 *   - B succeeds and A drops to watch   -> the documented takeover race is real
 *     (M0c backend patch still required).
 *
 * No remote screen pixels are captured; only state text and IPC results.
 *
 * Run: node scripts/gui-computer-dual.mjs
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

async function launchInstance(suffix) {
  const userData = path.resolve(`.tmp/userdata-computer-dual-${suffix}`);
  rmSync(userData, { recursive: true, force: true });
  cpSync(PROBE_DIR, userData, { recursive: true });
  const application = await electron.launch({
    executablePath: APP,
    env: appEnvironment(),
    args: ['--no-sandbox', `--user-data-dir=${userData}`],
  });
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
  await page
    .getByText(/电脑运行中|电脑休眠中/)
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 });
  if ((await page.getByText('电脑休眠中').count()) > 0) {
    await page.getByRole('button', { name: '唤醒' }).click();
    await page.getByText('电脑运行中').first().waitFor({ state: 'visible', timeout: 120_000 });
  }
  await page.getByRole('button', { name: '打开观看窗口' }).click();
  let viewer = null;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    viewer =
      application.windows().find((candidate) => candidate.url().includes('viewer=1')) ?? null;
    if (viewer !== null) {
      break;
    }
    await page.waitForTimeout(500);
  }
  if (viewer === null) {
    throw new Error(`viewer window missing for ${suffix}`);
  }
  const canvasDeadline = Date.now() + 90_000;
  let canvas = null;
  while (Date.now() < canvasDeadline) {
    canvas = await viewer.evaluate(() => {
      const element = document.querySelector('canvas');
      return element === null ? null : { width: element.width, height: element.height };
    });
    if (canvas !== null && canvas.width > 0) {
      break;
    }
    await page.waitForTimeout(500);
  }
  return { application, page, viewer, canvas };
}

async function viewerState(instance) {
  return instance.viewer.evaluate(() => {
    const text = (document.body.textContent ?? '').trim().slice(0, 300);
    return {
      text,
      controlling: text.includes('你正在控制') || text.includes('归还控制'),
      otherViewer: text.includes('其他人正在控制'),
      viewOnly: text.includes('仅观看'),
    };
  });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const steps = [];
  const note = (name, ok, detail) => {
    steps.push({ name, ok: ok === true, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : ` · ${detail}`}`);
  };
  let a = null;
  let b = null;
  let exitCode = 1;
  try {
    a = await launchInstance('a');
    note('client A viewer connected', a.canvas !== null, JSON.stringify(a.canvas));
    b = await launchInstance('b');
    note('client B viewer connected', b.canvas !== null, JSON.stringify(b.canvas));

    const acquireA = await a.viewer.evaluate(async () => window.mosbot?.computer.acquire() ?? null);
    await a.viewer.waitForTimeout(2_000);
    const stateA = await viewerState(a);
    note('client A holds control', acquireA?.ok === true && stateA.controlling, stateA.text);
    const stateB1 = await viewerState(b);
    note('client B sees the other viewer', stateB1.otherViewer, stateB1.text);

    // Attempt a preemptive takeover from B while A still holds the lease.
    const acquireB = await b.viewer.evaluate(async () => window.mosbot?.computer.acquire() ?? null);
    await b.viewer.waitForTimeout(3_000);
    const stateB2 = await viewerState(b);
    const stateA2 = await viewerState(a);
    const takeover = acquireB?.ok === true && stateB2.controlling && stateA2.controlling !== true;
    const refused = acquireB?.ok !== true && stateA2.controlling;
    if (takeover) {
      note(
        'preemptive takeover is possible (M0c gap confirmed)',
        true,
        `B acquire ok, A dropped to watch · A="${stateA2.text.slice(0, 60)}"`,
      );
    } else if (refused) {
      note(
        'preemptive takeover refused, A keeps control (non-preemptive)',
        true,
        `B acquire=${JSON.stringify(acquireB)} · A="${stateA2.text.slice(0, 60)}"`,
      );
    } else {
      note('unexpected lease outcome', false, JSON.stringify({ acquireB, stateA2, stateB2 }));
    }

    // Always leave the display in watch mode.
    if (stateB2.controlling) {
      await b.viewer.evaluate(async () => window.mosbot?.computer.release() ?? null);
    }
    if (stateA2.controlling) {
      await a.viewer.evaluate(async () => window.mosbot?.computer.release() ?? null);
    }
    const afterReleaseA = await viewerState(a);
    note('display back to watch mode', afterReleaseA.viewOnly, afterReleaseA.text);

    const report = {
      kind: 'real service · two packaged apps, remote computer lease contention',
      generatedAt: new Date().toISOString(),
      target: 'http://192.168.2.171:9119',
      note: 'no remote screen pixels captured; lease state only',
      outcome: takeover ? 'takeover-allowed' : refused ? 'takeover-refused' : 'unexpected',
      steps,
    };
    const reportPath = path.join(
      OUT_DIR,
      `computer-dual-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
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
