#!/usr/bin/env node
/**
 * Stale sessions-list isolation on a profile switch: with a test-only delay on the
 * empty dedicated profile, switching away from it must never repaint the sessions
 * list of the profile the person switched to.
 *
 * Run: node scripts/gui-sessions-stale.mjs
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

function stampName(offsetMs = 0) {
  const date = new Date(Date.now() + offsetMs);
  const pad = (value) => String(value).padStart(2, '0');
  return `mosbot-probe-gui-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function appEnvironment(extra = {}) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined) {
      env[key] = value;
    }
  }
  env.NODE_ENV = 'production';
  env.MOSBOT_TEST_BACKGROUND = process.env['MOSBOT_TEST_FOREGROUND'] === '1' ? '0' : '1';
  return { ...env, ...extra };
}

async function launchInstance(suffix, extraEnv = {}) {
  const userData = path.resolve(`.tmp/userdata-sessions-stale-${suffix}`);
  rmSync(userData, { recursive: true, force: true });
  cpSync(PROBE_DIR, userData, { recursive: true });
  const application = await electron.launch({
    executablePath: APP,
    env: appEnvironment(extraEnv),
    args: ['--no-sandbox', `--user-data-dir=${userData}`],
  });
  const page = await application.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(
    () => (document.querySelector('#sidebar-connection')?.textContent ?? '').includes('research'),
    undefined,
    { timeout: 30_000 },
  );
  return { application, page };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const steps = [];
  const note = (name, ok, detail) => {
    steps.push({ name, ok: ok === true, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : ` · ${detail}`}`);
  };
  const emptyProfile = stampName();
  let a = null;
  let exitCode = 1;

  try {
    // Bootstrap: one dedicated (empty) profile; the fast profile is an existing
    // Bot that already has a session, so the test reads only.
    const bootstrap = await launchInstance('bootstrap');
    const created = await bootstrap.page.evaluate(
      async (profileName) =>
        window.mosbot?.dashboard.createBot({
          name: profileName,
          description: 'MosBot sessions-stale probe; safe to delete',
          shape: 'circle',
          color: '#6a9ad6',
        }) ?? null,
      emptyProfile,
    );
    if (created === null || created.ok !== true) {
      throw new Error(`createBot ${emptyProfile} failed: ${JSON.stringify(created)}`);
    }
    const roster = await bootstrap.page.evaluate(
      async () => window.mosbot?.dashboard.listBots() ?? null,
    );
    const fastBot =
      roster !== null && roster.ok === true
        ? roster.data.find(
            (bot) => bot.profileName !== emptyProfile && bot.canonicalSessionId !== null,
          )
        : undefined;
    if (fastBot === undefined) {
      throw new Error('no existing Bot with a canonical session for the switch test');
    }
    const chattyProfile = fastBot.profileName;
    note('dedicated empty profile and fast profile chosen', true, chattyProfile);
    await bootstrap.application.close();

    a = await launchInstance('a', {
      MOSBOT_TEST_SESSIONS_SLOW_PROFILE: emptyProfile,
      MOSBOT_TEST_SESSIONS_DELAY_MS: '2500',
    });
    await a.page.locator('#sidebar-connection').click();
    await a.page.getByRole('button', { name: 'Hermes 工作台' }).click();
    await a.page.getByRole('region', { name: 'Hermes 工作台' }).waitFor({ timeout: 20_000 });
    await a.page.getByRole('button', { name: 'Sessions', exact: true }).click();
    const profileSelect = a.page.getByLabel('Profile');
    await profileSelect.waitFor({ state: 'visible', timeout: 20_000 });
    // Baseline: the fast profile really has visible sessions in this list.
    await profileSelect.selectOption(chattyProfile);
    await a.page.waitForTimeout(2_000);
    const baselineItems = await a.page.locator('button[class*="_listItem_"]').count();
    note('fast profile has visible sessions', baselineItems > 0, `items=${baselineItems}`);

    // Select the slow empty profile, immediately switch to the chatty profile.
    await profileSelect.selectOption(emptyProfile);
    await profileSelect.selectOption(chattyProfile);
    await a.page.waitForTimeout(3_500);
    const items = await a.page.locator('button[class*="_listItem_"]').count();
    const text = (await a.page.locator('body').textContent()) ?? '';
    note(
      'late sessions from the previous profile are discarded',
      items > 0 && !text.includes('还没有会话'),
      `items=${items}`,
    );
    note(
      'the chatty profile is still selected',
      (await profileSelect.inputValue()) === chattyProfile,
    );

    // Switching back to the empty profile shows its (empty) list once loaded.
    await profileSelect.selectOption(emptyProfile);
    await a.page.waitForTimeout(3_500);
    const empty = await a.page
      .getByText('还没有会话。', { exact: false })
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    note('switching back loads the empty profile sessions', empty);

    const report = {
      kind: 'real service · stale sessions list after a profile switch (injected delay)',
      generatedAt: new Date().toISOString(),
      target: 'http://192.168.2.171:9119',
      slowProfile: emptyProfile,
      fastProfile: chattyProfile,
      steps,
    };
    const reportPath = path.join(
      OUT_DIR,
      `sessions-stale-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`report: ${reportPath}`);
    exitCode = steps.every((step) => step.ok) ? 0 : 1;
  } finally {
    await a?.application.close().catch(() => undefined);
  }
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
