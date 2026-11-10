#!/usr/bin/env node
/**
 * UI group approval check: create a group from the sidebar dialog, ask a member
 * for an approval-triggering command, deny the approval banner in the group
 * view, then disband the dedicated room.
 *
 * Run: node scripts/gui-group-approval-ui.mjs
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
const USER_DATA = path.resolve('.tmp/userdata-group-approval-ui');
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
  const name = `mosbot-probe-approval-ui-${stamp}`;
  const prompt =
    'Please use the shell tool to run exactly: chmod 777 mosbot-group-approval-ui.txt ' +
    '(only this probe file), then reply done.';
  let roomId = null;
  let created = false;
  let approvalSeen = false;
  let denied = false;
  let cleared = false;
  let disbanded = false;
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
    await page.getByRole('textbox').fill(prompt);
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await page.waitForFunction(
      () => (document.body.textContent ?? '').includes('请求审批'),
      undefined,
      { timeout: 120_000 },
    );
    approvalSeen = true;
    await page.getByRole('button', { name: '拒绝', exact: true }).click();
    denied = true;
    await page.waitForFunction(
      () => !(document.body.textContent ?? '').includes('请求审批'),
      undefined,
      { timeout: 30_000 },
    );
    cleared = true;
  } finally {
    if (roomId !== null) {
      disbanded = await page.evaluate(async (id) => {
        const result = await window.mosbot?.dashboard.chatGroupDisband(id);
        return result?.ok === true;
      }, roomId);
    }
    await application.close();
  }

  const report = {
    kind: 'real service · UI group approval deny',
    generatedAt: new Date().toISOString(),
    name,
    roomId,
    created,
    approvalSeen,
    denied,
    cleared,
    disbanded,
  };
  const reportPath = path.join(OUT_DIR, `group-approval-ui-${stamp}.json`);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
  if (!created || !approvalSeen || !denied || !cleared || !disbanded) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
