#!/usr/bin/env node
/**
 * M6 group send verification with a dedicated test room:
 * create a hosted room from two local profiles, send one user message, verify it
 * appears in the room log, then disband the room.
 *
 * Run: node scripts/gui-group-send.mjs
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
const USER_DATA = path.resolve('.tmp/userdata-group-send');
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
  const name = `mosbot-probe-group-${stamp}`;
  const text = `mosbot probe message ${stamp}`;
  const roomId = await page.evaluate(
    async ({ name }) => {
      const bots = await window.mosbot?.dashboard.listBots();
      const profiles = bots?.ok ? bots.data.slice(0, 2).map((bot) => bot.profileName) : [];
      if (profiles.length < 2) {
        throw new Error('not enough local profiles for a test group');
      }
      const created = await window.mosbot?.dashboard.chatGroupCreate(name, [
        { memberId: 'probe-a', profile: profiles[0], handle: 'probe-a', displayName: 'Probe A' },
        { memberId: 'probe-b', profile: profiles[1], handle: 'probe-b', displayName: 'Probe B' },
      ]);
      if (created === null || !created.ok) {
        throw new Error(`group create failed: ${JSON.stringify(created)}`);
      }
      return created.data.roomId;
    },
    { name },
  );

  let sent = false;
  let logVerified = false;
  let disbanded = false;
  let threadId = null;
  try {
    threadId = await page.evaluate(() => crypto.randomUUID());
    const result = await page.evaluate(
      async ({ roomId, threadId, text }) =>
        window.mosbot?.dashboard.chatGroupSend(
          roomId,
          threadId,
          text,
          `probe-${crypto.randomUUID()}`,
        ),
      { roomId, threadId, text },
    );
    sent = result?.ok === true;
    if (sent) {
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        const pageResult = await page.evaluate(
          async ({ roomId, text }) => {
            const log = await window.mosbot?.dashboard.chatGroupLog(roomId, 0, 100);
            if (log === null || !log.ok) {
              return { ok: false };
            }
            return {
              ok: true,
              found: log.data.events.some(
                (event) =>
                  typeof event.payload === 'object' &&
                  event.payload !== null &&
                  event.payload.text === text,
              ),
            };
          },
          { roomId, text },
        );
        if (pageResult.ok && pageResult.found) {
          logVerified = true;
          break;
        }
        await page.waitForTimeout(1000);
      }
    }
  } finally {
    disbanded = await page.evaluate(async (roomId) => {
      const result = await window.mosbot?.dashboard.chatGroupDisband(roomId);
      return result?.ok === true;
    }, roomId);
    await application.close();
  }

  const report = {
    kind: 'real service · dedicated group send',
    generatedAt: new Date().toISOString(),
    name,
    roomId,
    threadId,
    sent,
    logVerified,
    disbanded,
  };
  const reportPath = path.join(OUT_DIR, `group-send-${stamp}.json`);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
  if (!sent || !logVerified || !disbanded) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
