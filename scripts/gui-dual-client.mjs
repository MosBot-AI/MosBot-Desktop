#!/usr/bin/env node
/**
 * Two-client (same account) chat + approval walkthrough against the test Dashboard.
 *
 * Two packaged app instances (separate userData copies of the probe session) open
 * the same Bot Chat. Client A sends a prompt; both must observe the message and the
 * streamed reply. Then A triggers a dangerous-command approval; A denies it and B
 * must fold the shared request into a "handled in another window" receipt via the
 * session.resume reconciliation (the gateway does not push a resolution event).
 *
 * The dedicated profile is named `mosbot-probe-dual-HHMMSS`; the next chat probe run
 * deletes profiles with that prefix. No remote screen content is captured.
 *
 * Run: node scripts/gui-dual-client.mjs
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

function stampName() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `mosbot-probe-dual-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function appEnvironment() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined) {
      env[key] = value;
    }
  }
  env.NODE_ENV = 'production';
  env.MOSBOT_DIAG = '1';
  return env;
}

async function launchApp(suffix) {
  const userData = path.resolve(`.tmp/userdata-dual-chat-${suffix}`);
  rmSync(userData, { recursive: true, force: true });
  cpSync(PROBE_DIR, userData, { recursive: true });
  const application = await electron.launch({
    executablePath: APP,
    env: appEnvironment(),
    args: ['--no-sandbox', `--user-data-dir=${userData}`],
  });
  const page = await application.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await waitConnected(page);
  return { application, page };
}

async function waitConnected(page) {
  await page.waitForFunction(
    () => (document.querySelector('#sidebar-connection')?.textContent ?? '').includes('research'),
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForFunction(
    () =>
      document.querySelectorAll('button[class*="_pinTile_"], button[class*="_row_"]').length >= 5,
    undefined,
    { timeout: 30_000 },
  );
}

async function selectProfile(page, name, label) {
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await waitConnected(page);
  await page.getByRole('button', { name: '搜索' }).click();
  await page.getByRole('combobox').fill(name);
  const option = page.getByRole('option', { name: new RegExp(name) }).first();
  await option.waitFor({ state: 'visible', timeout: 20_000 });
  await option.click();
  await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 30_000 });
  // Make sure the live session is opened for the selected profile (the app helper
  // opens it too, but the store may still be finishing the roster switch).
  const opened = await page.evaluate(
    async (profile) => window.mosbot?.dashboard.openChat(profile) ?? null,
    name,
  );
  console.log('openChat', name, JSON.stringify(opened).slice(0, 200));
  if (opened !== null && opened.ok === true) {
    const live = await page.evaluate(
      async ({ profile, stored }) =>
        window.mosbot?.dashboard.chatOpen(profile, stored ?? null) ?? null,
      { profile: name, stored: opened.data.storedSessionId },
    );
    console.log('chatOpen', name, JSON.stringify(live).slice(0, 240));
  }
  const deadline = Date.now() + 120_000;
  let reopenedAt = 0;
  while (Date.now() < deadline) {
    const enabled = await page.evaluate(() => {
      const area = document.querySelector('textarea');
      return area !== null && area.disabled === false;
    });
    if (enabled) {
      return;
    }
    const diag = await page.evaluate(() => {
      const state = window.__mosbotDiag?.state?.() ?? null;
      if (state === null) {
        return null;
      }
      const live = state.live;
      return {
        liveProfile: live?.profile,
        connection: live?.connection,
        phase: live?.phase,
        session: live?.runtimeSessionId,
        selected: state.selectedBotId,
        remoteSelected: state.remote?.selectedProfile,
        remoteStatus: state.remote?.status,
        chats: Object.keys(state.remote?.chats ?? {}),
        modelReady: state.remote?.modelReady,
      };
    });
    console.log('diag', name, JSON.stringify(diag));
    // The app's own effect can reset the live session while it finishes switching
    // the roster; re-open with the current canonical id so the cached-open path
    // re-emits connection/session to this renderer.
    if (Date.now() - reopenedAt > 4_000) {
      reopenedAt = Date.now();
      const chat = await page.evaluate(
        async (profile) => window.mosbot?.dashboard.openChat(profile) ?? null,
        name,
      );
      if (chat !== null && chat.ok === true) {
        await page.evaluate(
          async ({ profile, stored }) =>
            window.mosbot?.dashboard.chatOpen(profile, stored ?? null) ?? null,
          { profile: name, stored: chat.data.storedSessionId },
        );
      }
    }
    await page.waitForTimeout(1_000);
  }
  const diagnostic = await page.evaluate(() => ({
    nameplate: document.querySelector('#chat-nameplate')?.textContent ?? null,
    statuses: [...document.querySelectorAll('[role="status"]')]
      .map((element) => (element.textContent ?? '').trim().slice(0, 160))
      .filter((text) => text !== ''),
    modelBanner: document.querySelector('[class*="_modelBanner"]')?.textContent ?? null,
  }));
  throw new Error(`composer for ${name} (${label}) stayed disabled: ${JSON.stringify(diagnostic)}`);
}

async function transcript(page) {
  return (await page.locator('[role="log"]').textContent()) ?? '';
}

async function waitForText(page, text, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await transcript(page)).includes(text)) {
      return true;
    }
    await page.waitForTimeout(500);
  }
  return false;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const steps = [];
  const note = (name, ok, detail) => {
    steps.push({ name, ok: ok === true, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : ` · ${detail}`}`);
  };
  const profileName = stampName();
  let a = null;
  let b = null;
  let exitCode = 1;

  try {
    a = await launchApp('a');
    const created = await a.page.evaluate(
      async (name) =>
        window.mosbot?.dashboard.createBot({
          name,
          description: 'MosBot dual-client probe; safe to delete',
          shape: 'circle',
          color: '#6b8f4e',
        }) ?? null,
      profileName,
    );
    if (created === null || created.ok !== true) {
      throw new Error(`createBot failed: ${JSON.stringify(created)}`);
    }
    note('dedicated profile created (API)', true, profileName);

    // A fresh profile may not have a model route yet; copy the default Bot's
    // provider/model into it (dedicated object only) so both clients can answer.
    const readiness = await a.page.evaluate(
      async (name) => window.mosbot?.dashboard.checkModelReady(name) ?? null,
      profileName,
    );
    if (readiness === null || readiness.ok !== true || readiness.data.ready !== true) {
      const roster = await a.page.evaluate(async () => window.mosbot?.dashboard.listBots() ?? null);
      const bots = roster !== null && roster.ok === true ? roster.data : [];
      const source =
        bots.find((bot) => bot.isDefault) ??
        bots.find((bot) => bot.provider !== '' && bot.model !== '');
      if (source !== undefined) {
        const written = await a.page.evaluate(
          async ({ name, provider, model }) =>
            window.mosbot?.dashboard.setProfileModel(name, provider, model) ?? null,
          { name: profileName, provider: source.provider, model: source.model },
        );
        note(
          'model route copied from the default Bot',
          written !== null && written.ok === true,
          `${source.provider}/${source.model}`,
        );
      }
    } else {
      note('new profile already has a ready model', true);
    }

    b = await launchApp('b');
    await selectProfile(a.page, profileName, 'A');
    await selectProfile(b.page, profileName, 'B');
    note('both clients opened the same Bot Chat', true);

    await a.page.locator('textarea').first().fill('请只回复 dual-ok，不要解释。');
    await a.page.locator('textarea').first().press('Enter');
    const sawReplyA = await waitForText(a.page, 'dual-ok', 120_000);
    const sawReplyB = await waitForText(b.page, 'dual-ok', 120_000);
    note('client A saw its own reply', sawReplyA);
    note('client B observed the same reply (cross-client chat)', sawReplyB, profileName);

    // Create the probe file (safe), then request a dangerous chmod.
    const composerA = a.page.locator('textarea').first();
    await composerA.fill(
      '请用 shell 工具运行命令：touch mosbot-dual-file.txt （只创建这个探针文件）。完成后只回复 done。',
    );
    await composerA.press('Enter');
    await waitForText(a.page, 'done', 120_000);

    await composerA.fill(
      '请用 shell 工具运行命令：chmod 777 mosbot-dual-file.txt （只改这个探针文件的权限）。完成后只回复 done。',
    );
    await composerA.press('Enter');
    const cardA = a.page.getByRole('group', { name: '需要你确认' }).first();
    const cardB = b.page.getByRole('group', { name: '需要你确认' }).first();
    let cardASeen = false;
    let cardBSeen = false;
    try {
      await cardA.waitFor({ state: 'visible', timeout: 120_000 });
      cardASeen = true;
    } catch {
      // fall through with diagnostics below
    }
    try {
      await cardB.waitFor({ state: 'visible', timeout: 15_000 });
      cardBSeen = true;
    } catch {
      // The gateway may only attach requests to the client that submitted the turn.
    }
    note('approval card on client A', cardASeen);
    note(
      'approval card on client B (shared request)',
      cardBSeen,
      cardBSeen ? undefined : 'not delivered',
    );

    if (cardASeen) {
      await cardA.getByRole('button', { name: '拒绝' }).click();
      const receiptA = await waitForText(a.page, '已拒绝', 20_000);
      note('client A shows its denial receipt', receiptA, await transcript(a.page));
      if (cardBSeen) {
        const receiptB = await waitForText(b.page, '已由另一端处理', 30_000);
        note(
          'client B folds the shared request into a handled-elsewhere receipt',
          receiptB,
          await transcript(b.page),
        );
      }
    }

    const report = {
      kind: 'real service · two clients, shared Bot Chat and approval',
      generatedAt: new Date().toISOString(),
      target: 'http://192.168.2.171:9119',
      profile: profileName,
      cleanup: 'the next chat probe run deletes mosbot-probe-dual-* profiles',
      steps,
    };
    const reportPath = path.join(
      OUT_DIR,
      `dual-client-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`report: ${reportPath}`);
    exitCode = steps.every((step) => step.ok) ? 0 : 1;
  } finally {
    await b?.application.close().catch(() => undefined);
    await a?.application.close().catch(() => undefined);
  }
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
