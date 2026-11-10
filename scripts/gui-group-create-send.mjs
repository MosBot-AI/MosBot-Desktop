#!/usr/bin/env node
/**
 * End-to-end M6 group flow: create a group from the sidebar dialog, send one
 * message from the group composer, wait for the 3 s log poll to render it, then
 * disband the dedicated room. No existing user room is written.
 *
 * Run: node scripts/gui-group-create-send.mjs
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
const USER_DATA = path.resolve('.tmp/userdata-group-create-send');
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
  const name = `mosbot-probe-ui-${stamp}`;
  const text = `mosbot ui probe ${stamp}`;
  let roomId = null;
  let created = false;
  let sent = false;
  let rendered = false;
  let stopped = false;
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
      throw new Error('group view did not select the new room');
    }
    await page.getByRole('textbox').fill(text);
    await page.getByRole('button', { name: '发送', exact: true }).click();
    sent = true;
    await page.waitForFunction(
      (expected) => (document.body.textContent ?? '').includes(expected),
      text,
      { timeout: 45_000 },
    );
    rendered = true;
    await page.getByRole('button', { name: '停止', exact: true }).click();
    await page.waitForFunction(
      () => (document.body.textContent ?? '').includes('已停止'),
      undefined,
      { timeout: 30_000 },
    );
    stopped = true;
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
    kind: 'real service · group create → send → poll → disband',
    generatedAt: new Date().toISOString(),
    name,
    roomId,
    created,
    sent,
    rendered,
    stopped,
    disbanded,
  };
  const reportPath = path.join(OUT_DIR, `group-create-send-${stamp}.json`);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
  if (!created || !sent || !rendered || !stopped || !disbanded) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
