#!/usr/bin/env node
/**
 * Stale board-response isolation: with a test-only delay on the dedicated probe
 * board, switching away from it before its response arrives must never repaint the
 * board the person switched to.
 *
 * Run: node scripts/gui-workbench-stale.mjs
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
  const userData = path.resolve(`.tmp/userdata-workbench-stale-${suffix}`);
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
  const taskTitle = `迟到的任务-${Date.now().toString().slice(-6)}`;
  let a = null;
  let b = null;
  let exitCode = 1;

  try {
    // Create two dedicated boards first (kept), then launch the slow-response
    // client with the exact slow board configured.
    const bootstrap = await launchInstance('bootstrap', { MOSBOT_PROBE_KEEP_BOARD: '1' });
    const slugs = [];
    for (let index = 0; index < 2; index += 1) {
      const probe = await bootstrap.page.evaluate(
        () => window.mosbot?.dashboard.probeKanbanWrite() ?? null,
      );
      const row =
        probe?.ok === true ? probe.data.rows.find((item) => item.id === 'board_kept') : null;
      const created = /slug=(mosbot-probe-board-\d{12,14})/.exec(row?.detail ?? '')?.[1] ?? null;
      if (created === null) {
        throw new Error(`kanban probe ${index + 1} failed: ${JSON.stringify(probe)}`);
      }
      slugs.push(created);
    }
    await bootstrap.application.close();
    const [slug] = slugs;
    if (slug === undefined) {
      throw new Error('no kept board slug');
    }
    note('two dedicated boards created', true, slugs.join(', '));

    a = await launchInstance('a', {
      MOSBOT_TEST_KANBAN_SLOW_BOARD: slug,
      MOSBOT_TEST_KANBAN_DELAY_MS: '2500',
    });
    b = await launchInstance('b');
    const created = await b.page.evaluate(
      async ({ board, title }) => window.mosbot?.dashboard.kanbanCreateTask(board, title) ?? null,
      { board: slug, title: taskTitle },
    );
    note(
      'dedicated board has a task from the other client',
      created !== null && created.ok === true,
      JSON.stringify(created).slice(0, 120),
    );

    await a.page.locator('#sidebar-connection').click();
    await a.page.getByRole('button', { name: 'Hermes 工作台' }).click();
    await a.page.getByRole('region', { name: 'Hermes 工作台' }).waitFor({ timeout: 20_000 });
    await a.page.getByRole('button', { name: 'Kanban', exact: true }).click();
    const select = a.page.getByLabel('Board');
    await select.waitFor({ state: 'visible', timeout: 20_000 });
    const fast = slugs[1];
    if (fast === undefined) {
      throw new Error('missing second probe board');
    }

    // Select the slow probe board, immediately switch to the fast real board; the
    // late probe-board response must not paint over the real board.
    await select.selectOption(slug);
    await select.selectOption(fast);
    await a.page.waitForTimeout(3_500);
    const text = (await a.page.locator('body').textContent()) ?? '';
    note(
      'late response from the previous board is discarded',
      !text.includes(taskTitle),
      `selector=${await select.inputValue()}`,
    );
    note('the fast board is still selected', (await select.inputValue()) === fast);

    // Switching back to the probe board shows its task once its response arrives.
    await select.selectOption(slug);
    const visible = await a.page
      .getByText(taskTitle, { exact: false })
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    note('switching back loads the probe board task', visible);

    const report = {
      kind: 'real service · stale Kanban board response isolation (injected delay)',
      generatedAt: new Date().toISOString(),
      target: 'http://192.168.2.171:9119',
      slowBoard: slug,
      fastBoard: fast,
      taskTitle,
      steps,
    };
    const reportPath = path.join(
      OUT_DIR,
      `workbench-stale-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`report: ${reportPath}`);
    exitCode = steps.every((step) => step.ok) ? 0 : 1;
  } finally {
    await b?.application.close().catch(() => undefined);
    await a?.application.close().catch(() => undefined);
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
