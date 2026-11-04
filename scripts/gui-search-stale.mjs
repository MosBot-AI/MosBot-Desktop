#!/usr/bin/env node
/**
 * Stale search-response isolation: a slow query's results must not overwrite the
 * results of the query typed after it.
 *
 * Run: node scripts/gui-search-stale.mjs
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
const SLOW_QUERY = 'zz-no-such-session-zz';

function appEnvironment() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined) {
      env[key] = value;
    }
  }
  env.NODE_ENV = 'production';
  env.MOSBOT_TEST_BACKGROUND = process.env['MOSBOT_TEST_FOREGROUND'] === '1' ? '0' : '1';
  env.MOSBOT_TEST_SEARCH_SLOW_QUERY = SLOW_QUERY;
  env.MOSBOT_TEST_SEARCH_DELAY_MS = '2500';
  return env;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const userData = path.resolve('.tmp/userdata-search-stale');
  rmSync(userData, { recursive: true, force: true });
  cpSync(PROBE_DIR, userData, { recursive: true });

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
      args: ['--no-sandbox', `--user-data-dir=${userData}`],
    });
    const page = await application.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(
      () => (document.querySelector('#sidebar-connection')?.textContent ?? '').includes('research'),
      undefined,
      { timeout: 30_000 },
    );
    await page.locator('#sidebar-connection').click();
    await page.getByRole('button', { name: 'Hermes 工作台' }).click();
    await page.getByRole('region', { name: 'Hermes 工作台' }).waitFor({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Sessions', exact: true }).click();
    const search = page.locator('input[type="search"]').first();
    await search.waitFor({ state: 'visible', timeout: 20_000 });
    await page.waitForTimeout(1_500);
    const firstItem = page.locator('button[class*="_listItem_"]').first();
    await firstItem.waitFor({ state: 'visible', timeout: 20_000 });
    const fastQuery = ((await firstItem.textContent()) ?? '').trim().slice(0, 12);
    if (fastQuery === '') {
      throw new Error('no session title to search for');
    }
    const firstItemClass = (await firstItem.getAttribute('class')) ?? '';
    note('session list and a searchable title are available', true);

    // Slow no-match query, then immediately the matching query.
    await search.fill(SLOW_QUERY);
    await search.fill(fastQuery);
    await page.waitForTimeout(3_500);
    const items = await page.locator('button[class*="_listItem_"]').count();
    const text = (await page.locator('body').textContent()) ?? '';
    note(
      'late results from the previous query are discarded',
      items > 0 && !text.includes('还没有会话'),
      `items=${items} · firstItemClass=${firstItemClass !== '' ? 'present' : 'missing'}`,
    );
    note('the current query is still in the field', (await search.inputValue()) === fastQuery);

    const report = {
      kind: 'real service · stale search response after query change (injected delay)',
      generatedAt: new Date().toISOString(),
      target: 'http://192.168.2.171:9119',
      steps,
    };
    const reportPath = path.join(
      OUT_DIR,
      `search-stale-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
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
