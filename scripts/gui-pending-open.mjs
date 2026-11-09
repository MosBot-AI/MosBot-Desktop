#!/usr/bin/env node
/**
 * Regression for the notification-click path: create a Bot on the server that the
 * renderer roster does not know about (as another client would), then send the same
 * `pendingEvent {type:"open"}` IPC that the main-process notification click sends.
 * The renderer must refresh `profiles.list`, select the new Bot and open its chat.
 *
 * Run: node scripts/gui-pending-open.mjs
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
const USER_DATA = path.resolve('.tmp/userdata-pending-open');
const OUT_DIR = path.resolve('docs/evidence/tmp');
const SHOTS = path.resolve('.tmp/shots');

function stampName() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `mosbot-probe-open-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(SHOTS, { recursive: true });
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

  const profileName = stampName();
  const created = await page.evaluate(
    async (name) =>
      window.mosbot?.dashboard.createBot({
        name,
        description: 'MosBot pending-open probe; safe to delete',
        shape: 'circle',
        color: '#c08a4e',
      }) ?? null,
    profileName,
  );
  if (created === null || created.ok !== true) {
    throw new Error(`createBot failed: ${JSON.stringify(created)}`);
  }
  const before = await page.evaluate(() => {
    const state = window.__mosbotDiag?.state?.() ?? null;
    return {
      nameplate: document.querySelector('#chat-nameplate')?.textContent ?? null,
      roster: state?.remote?.bots?.map((bot) => bot.profileName) ?? [],
      selectedProfile: state?.remote?.selectedProfile ?? null,
    };
  });
  if (before.roster.includes(profileName)) {
    throw new Error('the new profile unexpectedly appeared in the renderer roster');
  }

  // This is exactly what the main-process notification click sends.
  await application.evaluate(({ BrowserWindow }, profile) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('mosbot:dashboard:pendingEvent', {
      type: 'open',
      profile,
    });
  }, profileName);
  await page.waitForFunction(
    (name) => (document.querySelector('#chat-nameplate')?.textContent ?? '').includes(name),
    profileName,
    { timeout: 30_000 },
  );
  const after = await page.evaluate(() => {
    const state = window.__mosbotDiag?.state?.() ?? null;
    return {
      nameplate: document.querySelector('#chat-nameplate')?.textContent ?? null,
      roster: state?.remote?.bots?.map((bot) => bot.profileName) ?? [],
      selectedProfile: state?.remote?.selectedProfile ?? null,
    };
  });
  if (after.selectedProfile !== profileName || !after.roster.includes(profileName)) {
    throw new Error(`renderer did not open the pending Bot: ${JSON.stringify(after)}`);
  }
  const shot = path.join(SHOTS, 'pending-open-after-click.png');
  await page.screenshot({ path: shot, fullPage: false });
  await application.close();

  const report = {
    kind: 'real service · pending notification click regression',
    generatedAt: new Date().toISOString(),
    profile: profileName,
    before,
    after,
    shot,
  };
  const reportPath = path.join(
    OUT_DIR,
    `pending-open-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
