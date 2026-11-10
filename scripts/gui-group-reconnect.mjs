#!/usr/bin/env node
/**
 * Group view reconnect check: drop the gateway socket while a read-only group
 * view is open, observe the chat manager reconnect, and verify the group detail
 * and log polling recover without losing the selected room.
 *
 * Run: node scripts/gui-group-reconnect.mjs
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
const USER_DATA = path.resolve('.tmp/userdata-group-reconnect');
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
  await page
    .getByRole('button', { name: /位成员/ })
    .first()
    .click();
  await page.waitForFunction(
    () => (window.__mosbotDiag?.state?.()?.remote?.groupDetail ?? null) !== null,
    undefined,
    { timeout: 30_000 },
  );
  const before = await page.evaluate(() => {
    const state = window.__mosbotDiag?.state?.();
    return {
      roomId: state?.remote?.selectedGroupId ?? null,
      events: state?.remote?.groupEvents?.length ?? 0,
      latestSeq: state?.remote?.groupDetail?.latestSeq ?? null,
    };
  });

  await application.evaluate(() => {
    globalThis.__mosbotChatDiag?.dropSocket();
  });

  let sawReconnect = false;
  let recoveredState = null;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const current = await page.evaluate(() => {
      const state = window.__mosbotDiag?.state?.();
      return {
        connection: state?.live?.connection ?? null,
        roomId: state?.remote?.selectedGroupId ?? null,
        detail: state?.remote?.groupDetail !== null,
        events: state?.remote?.groupEvents?.length ?? 0,
        error: state?.remote?.groupError ?? null,
      };
    });
    if (current.connection === 'reconnecting' || current.connection === 'disconnected') {
      sawReconnect = true;
    }
    if (current.connection === 'connected' && current.detail && current.error === null) {
      recoveredState = current;
      break;
    }
    await page.waitForTimeout(250);
  }
  const after =
    recoveredState ??
    (await page.evaluate(() => {
      const state = window.__mosbotDiag?.state?.();
      return {
        connection: state?.live?.connection ?? null,
        roomId: state?.remote?.selectedGroupId ?? null,
        detail: state?.remote?.groupDetail !== null,
        events: state?.remote?.groupEvents?.length ?? 0,
        error: state?.remote?.groupError ?? null,
      };
    }));
  await application.close();

  const recovered =
    after.connection === 'connected' &&
    after.roomId === before.roomId &&
    after.detail &&
    after.error === null;
  const report = {
    kind: 'real service · group view reconnect',
    generatedAt: new Date().toISOString(),
    before,
    sawReconnect,
    after,
    recovered,
  };
  const reportPath = path.join(
    OUT_DIR,
    `group-reconnect-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
  if (!recovered) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
