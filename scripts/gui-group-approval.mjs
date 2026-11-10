#!/usr/bin/env node
/**
 * Group approval probe with a dedicated test room: create a room, ask a member
 * to run a command that should request approval, wait for a pending approval,
 * deny it, and verify the pending action clears. Always disbands the room.
 *
 * Run: node scripts/gui-group-approval.mjs
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
const USER_DATA = path.resolve('.tmp/userdata-group-approval');
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
  const name = `mosbot-probe-approval-${stamp}`;
  const prompt =
    'Please use the shell tool to run exactly: chmod 777 mosbot-group-approval.txt ' +
    '(only this probe file), then reply done.';
  const created = await page.evaluate(
    async ({ name }) => {
      const bots = await window.mosbot?.dashboard.listBots();
      const profiles = bots?.ok ? bots.data.slice(0, 2).map((bot) => bot.profileName) : [];
      if (profiles.length < 2) {
        throw new Error('not enough local profiles');
      }
      const result = await window.mosbot?.dashboard.chatGroupCreate(name, [
        { memberId: 'approval-a', profile: profiles[0], handle: 'approval-a' },
        { memberId: 'approval-b', profile: profiles[1], handle: 'approval-b' },
      ]);
      if (result === null || !result.ok) {
        throw new Error(`group create failed: ${JSON.stringify(result)}`);
      }
      return result.data;
    },
    { name },
  );

  let sent = false;
  let approvalSeen = false;
  let approvalAction = null;
  let approved = false;
  let pendingCleared = false;
  let disbanded = false;
  try {
    sent = await page.evaluate(
      async ({ roomId, prompt }) => {
        const result = await window.mosbot?.dashboard.chatGroupSend(
          roomId,
          crypto.randomUUID(),
          prompt,
          `approval-${crypto.randomUUID()}`,
        );
        return result?.ok === true;
      },
      { roomId: created.roomId, prompt },
    );
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const state = await page.evaluate(async (roomId) => {
        const result = await window.mosbot?.dashboard.chatGroupState(roomId);
        return result?.ok ? result.data : null;
      }, created.roomId);
      if (state !== null && (state.pendingActions ?? []).length > 0) {
        approvalSeen = true;
        approvalAction = state.pendingActions[0];
        break;
      }
      await page.waitForTimeout(2_000);
    }
    if (approvalSeen && approvalAction !== null) {
      approved = await page.evaluate(
        async ({ roomId, action }) => {
          const result = await window.mosbot?.dashboard.chatGroupApprove(roomId, action, 'deny');
          return result?.ok === true;
        },
        { roomId: created.roomId, action: approvalAction },
      );
      await page.waitForTimeout(3_000);
      const after = await page.evaluate(async (roomId) => {
        const result = await window.mosbot?.dashboard.chatGroupState(roomId);
        return result?.ok ? result.data : null;
      }, created.roomId);
      pendingCleared = after !== null && (after.pendingActions ?? []).length === 0;
    }
  } finally {
    disbanded = await page.evaluate(async (roomId) => {
      const result = await window.mosbot?.dashboard.chatGroupDisband(roomId);
      return result?.ok === true;
    }, created.roomId);
    await application.close();
  }

  const report = {
    kind: 'real service · group approval probe',
    generatedAt: new Date().toISOString(),
    name,
    roomId: created.roomId,
    sent,
    approvalSeen,
    approvalAction,
    approved,
    pendingCleared,
    disbanded,
  };
  const reportPath = path.join(OUT_DIR, `group-approval-${stamp}.json`);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
  if (!sent || !disbanded) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
