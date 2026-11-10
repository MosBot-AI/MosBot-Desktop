#!/usr/bin/env node
/**
 * Capture a review screenshot of the M6 group view using a dedicated probe room.
 * The sidebar is excluded from the clip; the room is disbanded afterwards.
 *
 * Run: node scripts/gui-group-screenshot.mjs
 */
import { cpSync, mkdirSync, rmSync } from 'node:fs';
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
const USER_DATA = path.resolve('.tmp/userdata-group-screenshot');
const OUT = path.resolve('docs/evidence/assets/m6-group-view.png');

async function main() {
  rmSync(USER_DATA, { recursive: true, force: true });
  cpSync(path.resolve('.tmp/userdata-probe'), USER_DATA, { recursive: true });
  mkdirSync(path.dirname(OUT), { recursive: true });
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
  const name = `mosbot-probe-screenshot-${stamp}`;
  let roomId = null;
  try {
    await page.getByRole('button', { name: '新建群聊' }).click();
    await page.getByLabel('群名称').fill(name);
    const probeIndexes = await page.evaluate(() => {
      const bots = window.__mosbotDiag?.state?.()?.remote?.bots ?? [];
      return bots
        .map((bot, index) => ({ display: bot.displayName, index }))
        .filter((entry) => /mosbot|probe|qa|accept/i.test(entry.display))
        .slice(0, 2)
        .map((entry) => entry.index);
    });
    if (probeIndexes.length === 2) {
      for (const index of probeIndexes) {
        await page.getByRole('checkbox').nth(index).check();
      }
    } else {
      await page.getByRole('checkbox').nth(0).check();
      await page.getByRole('checkbox').nth(1).check();
    }
    await page.getByRole('button', { name: '创建', exact: true }).click();
    await page.waitForFunction(
      (expected) =>
        (window.__mosbotDiag?.state?.()?.remote?.groups ?? []).some(
          (group) => group.name === expected,
        ),
      name,
      { timeout: 30_000 },
    );
    roomId = await page.evaluate(
      () => window.__mosbotDiag?.state?.()?.remote?.selectedGroupId ?? null,
    );
    await page.waitForFunction(
      (expected) => (document.querySelector('h2')?.textContent ?? '') === expected,
      name,
      { timeout: 30_000 },
    );
    await page.getByRole('textbox').fill('大家好，请每位成员用一句话打个招呼，然后结束。');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('ol li').length > 0, undefined, {
      timeout: 45_000,
    });
    await page
      .waitForFunction(
        () =>
          (window.__mosbotDiag?.state?.()?.remote?.groupEvents ?? []).some(
            (event) => event.kind === 'message.member',
          ),
        undefined,
        { timeout: 60_000 },
      )
      .catch(() => undefined);
    const size = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    await page.screenshot({
      path: OUT,
      clip: { x: 288, y: 0, width: Math.max(1, size.width - 288), height: size.height },
    });
  } finally {
    if (roomId !== null) {
      await page.evaluate(async (id) => {
        await window.mosbot?.dashboard.chatGroupDisband(id);
      }, roomId);
    }
    await application.close();
  }
  console.log(JSON.stringify({ kind: 'group view screenshot', path: OUT, roomId }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
