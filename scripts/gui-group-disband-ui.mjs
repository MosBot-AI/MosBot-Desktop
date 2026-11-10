#!/usr/bin/env node
/**
 * UI disband check: create a group from the sidebar dialog, disband it from the
 * group view with confirmation, and verify it disappears from the roster.
 *
 * Run: node scripts/gui-group-disband-ui.mjs
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
const USER_DATA = path.resolve('.tmp/userdata-group-disband');
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

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = `mosbot-probe-disband-${stamp}`;
  let roomId = null;
  let created = false;
  let confirmed = false;
  let removed = false;
  try {
    await page.getByRole('button', { name: '新建群聊' }).click();
    await page.getByLabel('群名称').fill(name);
    await page.getByRole('checkbox').nth(0).check();
    await page.getByRole('checkbox').nth(1).check();
    await page.getByRole('button', { name: '创建', exact: true }).click();
    await page.waitForFunction(
      (expected) => (document.querySelector('h2')?.textContent ?? '') === expected,
      name,
      { timeout: 30_000 },
    );
    created = true;
    roomId = await page.evaluate(
      () => window.__mosbotDiag?.state?.()?.remote?.selectedGroupId ?? null,
    );
    if (roomId === null) {
      throw new Error('new room was not selected');
    }
    await page.getByRole('button', { name: '解散群聊', exact: true }).click();
    await page.getByRole('button', { name: '确认解散', exact: true }).click();
    confirmed = true;
    await page.waitForFunction(
      () => window.__mosbotDiag?.state?.()?.remote?.selectedGroupId === null,
      undefined,
      { timeout: 30_000 },
    );
    await page.waitForFunction(
      (expected) => {
        const groups = window.__mosbotDiag?.state?.()?.remote?.groups ?? [];
        return !groups.some((group) => group.name === expected);
      },
      name,
      { timeout: 30_000 },
    );
    removed = true;
  } finally {
    if (roomId !== null) {
      await page.evaluate(async (id) => {
        await window.mosbot?.dashboard.chatGroupDisband(id);
      }, roomId);
    }
    await application.close();
  }

  const report = {
    kind: 'real service · UI group disband',
    generatedAt: new Date().toISOString(),
    name,
    roomId,
    created,
    confirmed,
    removed,
  };
  const reportPath = path.join(OUT_DIR, `group-disband-ui-${stamp}.json`);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
  if (!created || !confirmed || !removed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
