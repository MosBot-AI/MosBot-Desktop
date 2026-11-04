#!/usr/bin/env node
/**
 * Cross-client Kanban refresh: another client creates a task on a dedicated board
 * and the first client sees it after Refresh.
 *
 * The probe creates a dedicated board kept alive (MOSBOT_PROBE_KEEP_BOARD=1) so no
 * real board is touched; a second app instance adds a task, client A refreshes the
 * workbench and must show it. Cleanup runs the probe again without the keep flag,
 * which removes stale probe boards.
 *
 * Run: node scripts/gui-workbench-refresh.mjs
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

function appEnvironment(extra = {}) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined) {
      env[key] = value;
    }
  }
  env.NODE_ENV = 'production';
  env.MOSBOT_TEST_BACKGROUND = process.env['MOSBOT_TEST_FOREGROUND'] === '1' ? '0' : '1';
  return { ...env, ...extra };
}

async function launchInstance(suffix, extraEnv = {}) {
  const userData = path.resolve(`.tmp/userdata-workbench-${suffix}`);
  rmSync(userData, { recursive: true, force: true });
  cpSync(PROBE_DIR, userData, { recursive: true });
  const application = await electron.launch({
    executablePath: APP,
    env: appEnvironment(extraEnv),
    args: ['--no-sandbox', `--user-data-dir=${userData}`],
  });
  const page = await application.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(
    () => (document.querySelector('#sidebar-connection')?.textContent ?? '').includes('research'),
    undefined,
    { timeout: 30_000 },
  );
  return { application, page };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const steps = [];
  const note = (name, ok, detail) => {
    steps.push({ name, ok: ok === true, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : ` · ${detail}`}`);
  };
  const taskTitle = `另一客户端任务-${Date.now().toString().slice(-6)}`;
  let a = null;
  let b = null;
  let exitCode = 1;

  try {
    a = await launchInstance('a', { MOSBOT_PROBE_KEEP_BOARD: '1' });
    const probe = await a.page.evaluate(() => window.mosbot?.dashboard.probeKanbanWrite() ?? null);
    if (probe === null || probe.ok !== true) {
      throw new Error(`kanban probe failed: ${JSON.stringify(probe)}`);
    }
    const slugRow = probe.data.rows.find((row) => row.id === 'board_kept');
    const slug = /slug=(mosbot-probe-board-\d{12,14})/.exec(slugRow?.detail ?? '')?.[1] ?? null;
    if (slug === null) {
      throw new Error(`no kept board slug in probe report: ${JSON.stringify(probe.data.rows)}`);
    }
    note('dedicated board created and kept', true, slug);

    await a.page.locator('#sidebar-connection').click();
    await a.page.getByRole('button', { name: 'Hermes 工作台' }).click();
    await a.page.getByRole('region', { name: 'Hermes 工作台' }).waitFor({ timeout: 20_000 });
    await a.page.getByRole('button', { name: 'Kanban', exact: true }).click();
    const boardSelect = a.page.getByLabel('Board');
    await boardSelect.waitFor({ state: 'visible', timeout: 20_000 });
    await boardSelect.selectOption(slug);
    await a.page.getByRole('button', { name: '刷新' }).click();
    note('workbench opened on the dedicated board', true);

    b = await launchInstance('b');
    const created = await b.page.evaluate(
      async ({ board, title }) => window.mosbot?.dashboard.kanbanCreateTask(board, title) ?? null,
      { board: slug, title: taskTitle },
    );
    note(
      'another client created a task',
      created !== null && created.ok === true,
      JSON.stringify(created).slice(0, 160),
    );

    await a.page.getByRole('button', { name: '刷新' }).click();
    const visible = await a.page
      .getByText(taskTitle, { exact: false })
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    note('client A sees the other client task after Refresh', visible, taskTitle);

    const report = {
      kind: 'real service · cross-client Kanban refresh (dedicated probe board)',
      generatedAt: new Date().toISOString(),
      target: 'http://192.168.2.171:9119',
      board: slug,
      taskTitle,
      steps,
    };
    const reportPath = path.join(
      OUT_DIR,
      `workbench-refresh-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`report: ${reportPath}`);
    exitCode = steps.every((step) => step.ok) ? 0 : 1;
  } finally {
    await b?.application.close().catch(() => undefined);
    await a?.application.close().catch(() => undefined);
    // Cleanup: a normal probe run removes stale probe boards (including the kept one).
    const cleanup = await launchInstance('cleanup').catch(() => null);
    if (cleanup !== null) {
      await cleanup.page
        .evaluate(() => window.mosbot?.dashboard.probeKanbanWrite() ?? null)
        .catch(() => null);
      await cleanup.application.close().catch(() => undefined);
    }
  }
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
