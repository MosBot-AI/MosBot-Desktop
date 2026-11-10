#!/usr/bin/env node
/**
 * Read-only group roster check (M6): after a real Bot Chat connection is live, the
 * renderer must fetch `groups.list` and render one roster row per hosted room with
 * its member count. No group messaging is exercised yet.
 *
 * Run: node scripts/gui-groups-roster.mjs
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const APP = path.resolve(
  'out',
  `MosBot-${process.platform}-${process.arch}`,
  'MosBot.app',
  'Contents',
  'MacOS',
  'MosBot',
);
const USER_DATA = path.resolve('.tmp/userdata-groups-roster');
const OUT_DIR = path.resolve('docs/evidence/tmp');

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  rmSync(USER_DATA, { recursive: true, force: true });
  cpSync(path.resolve('.tmp/userdata-probe'), USER_DATA, { recursive: true });
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    MOSBOT_TEST_BACKGROUND: '1',
    MOSBOT_DIAG: '1',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const application = await electron.launch({
    executablePath: APP,
    env,
    args: ['--no-sandbox', `--user-data-dir=${USER_DATA}`],
  });
  const page = await application.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(
    () => (document.querySelector('#sidebar-connection')?.textContent ?? '').includes('research'),
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForFunction(
    () => (window.__mosbotDiag?.state?.()?.remote?.groups ?? []).length > 0,
    undefined,
    { timeout: 30_000 },
  );
  const result = await page.evaluate(() => {
    const state = window.__mosbotDiag?.state?.() ?? null;
    const rows = [...document.querySelectorAll('button')]
      .map((button) => button.getAttribute('aria-label') ?? '')
      .filter((label) => label.includes('位成员'));
    return {
      groups: (state?.remote?.groups ?? []).map((group) => ({
        name: group.name,
        memberCount: group.memberCount,
      })),
      rows,
    };
  });
  if (result.groups.length === 0 || result.rows.length !== result.groups.length) {
    throw new Error(`group roster did not render: ${JSON.stringify(result)}`);
  }
  await page
    .getByRole('button', { name: /位成员/ })
    .first()
    .click();
  await page.waitForFunction(
    () => {
      const state = window.__mosbotDiag?.state?.() ?? null;
      return state?.remote?.groupDetail != null || state?.remote?.groupError != null;
    },
    undefined,
    { timeout: 30_000 },
  );
  const groupView = await page.evaluate(() => {
    const state = window.__mosbotDiag?.state?.() ?? null;
    return {
      heading: document.querySelector('h2')?.textContent ?? null,
      events: document.querySelectorAll('ol li').length,
      detail: state?.remote?.groupDetail ?? null,
      error: state?.remote?.groupError ?? null,
      readOnly: (document.body.textContent ?? '').includes('只读'),
    };
  });
  if (groupView.heading === null || !groupView.readOnly) {
    throw new Error(`group view did not render: ${JSON.stringify(groupView)}`);
  }
  await application.close();

  const report = {
    kind: 'real service · read-only group roster',
    generatedAt: new Date().toISOString(),
    ...result,
    groupView,
  };
  const reportPath = path.join(
    OUT_DIR,
    `groups-roster-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
