#!/usr/bin/env node
/**
 * Stale message-panel isolation: a slow session's messages must not overwrite the
 * transcript of the session opened after it.
 *
 * Uses two existing sessions of the default profile (read-only); the first session
 * id is configured through the test-only MOSBOT_TEST_MESSAGES_SLOW_SESSION env.
 * Hidden windows.
 *
 * Run: node scripts/gui-messages-stale.mjs
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

async function launch(suffix, extraEnv = {}) {
  const userData = path.resolve(`.tmp/userdata-messages-stale-${suffix}`);
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
  let application = null;
  let exitCode = 1;

  try {
    // Discover two sessions with distinct first-message markers.
    const discovery = await launch('discovery');
    const sessions = await discovery.page.evaluate(async () => {
      const pageResult = await window.mosbot?.dashboard.workbenchSessions('default', 0, 30);
      if (!pageResult?.ok) {
        return [];
      }
      const rows = [];
      for (const session of pageResult.data.sessions) {
        const messages = await window.mosbot?.dashboard.workbenchMessages('default', session.id, 0);
        const marker = messages?.ok
          ? messages.data.messages
              .find((message) => message.text.trim() !== '')
              ?.text.trim()
              .slice(0, 30)
          : undefined;
        if (marker !== undefined) {
          rows.push({ id: session.id, title: session.title, marker });
        }
      }
      return rows;
    });
    await discovery.application.close();
    const chosen = [];
    for (const session of sessions) {
      if (chosen.every((entry) => entry.marker !== session.marker)) {
        chosen.push(session);
      }
      if (chosen.length === 2) {
        break;
      }
    }
    if (chosen.length < 2) {
      throw new Error('need two sessions with distinct message text');
    }
    const [slow, fast] = chosen;
    note('two distinct sessions found (read-only)', true);

    application = await launch('a', {
      MOSBOT_TEST_MESSAGES_SLOW_SESSION: slow.id,
      MOSBOT_TEST_MESSAGES_DELAY_MS: '2500',
    });
    const page = application.page;
    await page.locator('#sidebar-connection').click();
    await page.getByRole('button', { name: 'Hermes 工作台' }).click();
    await page.getByRole('region', { name: 'Hermes 工作台' }).waitFor({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Sessions', exact: true }).click();
    await page.getByLabel('Profile').selectOption('default');
    const items = page.locator('button[class*="_listItem_"]');
    await items.first().waitFor({ state: 'visible', timeout: 20_000 });
    await page.waitForTimeout(1_500);
    const titles = await items.evaluateAll((elements) =>
      elements.map((element) => (element.textContent ?? '').trim()),
    );
    const slowIndex = titles.indexOf(`${slow.title} · ${slow.marker}`);
    const indexOfSlow = titles.findIndex((title) => title.startsWith(slow.title));
    const indexOfFast = titles.findIndex((title) => title.startsWith(fast.title));
    note(
      'both sessions are visible in the list',
      slowIndex >= 0 || (indexOfSlow >= 0 && indexOfFast >= 0),
      JSON.stringify({ indexOfSlow, indexOfFast }),
    );
    if (indexOfSlow < 0 || indexOfFast < 0) {
      throw new Error('sessions not found in the workbench list');
    }
    await items.nth(indexOfSlow).click();
    await items.nth(indexOfFast).click();
    await page.waitForTimeout(3_500);

    const transcript = (await page.locator('div[class*="_transcript_"]').textContent()) ?? '';
    const showsFast = transcript.includes(fast.marker);
    const showsSlow = transcript.includes(slow.marker);
    note('the new session transcript is shown', showsFast, `len=${transcript.length}`);
    note(
      'late messages from the previous session are discarded',
      !showsSlow,
      `showsSlow=${String(showsSlow)}`,
    );

    const report = {
      kind: 'real service · stale message panel after a session switch (injected delay)',
      generatedAt: new Date().toISOString(),
      target: 'http://192.168.2.171:9119',
      steps,
    };
    const reportPath = path.join(
      OUT_DIR,
      `messages-stale-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`report: ${reportPath}`);
    exitCode = steps.every((step) => step.ok) ? 0 : 1;
  } finally {
    await application?.application.close().catch(() => undefined);
  }
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
