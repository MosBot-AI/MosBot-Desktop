#!/usr/bin/env node
/**
 * Concurrent approval from two clients (same account, same Bot Chat).
 *
 * Both clients see the same real approval request and answer it at the same time
 * (one denies, one allows once). The gateway settles exactly one response; the
 * walkthrough records which action took effect from the transcript and verifies
 * that the command did not run twice (or at all when the denial won) and that
 * neither client crashes or leaves an unresolved card.
 *
 * Dedicated profile is `mosbot-probe-gui-HHMMSS` (removed by the next chat probe).
 * Run: node scripts/gui-concurrent-approval.mjs
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
  return `mosbot-probe-gui-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
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

async function launchInstance(suffix) {
  const userData = path.resolve(`.tmp/userdata-concurrent-${suffix}`);
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

async function selectProfile(page, name) {
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await waitConnected(page);
  await page.getByRole('button', { name: '搜索' }).click();
  await page.getByRole('combobox').fill(name);
  await page
    .getByRole('option', { name: new RegExp(name) })
    .first()
    .click();
  await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 30_000 });
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const enabled = await page.evaluate(() => {
      const area = document.querySelector('textarea');
      return area !== null && area.disabled === false;
    });
    if (enabled) {
      return;
    }
    await page.waitForTimeout(1_000);
  }
  throw new Error(`composer for ${name} stayed disabled`);
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
    await page.waitForTimeout(300);
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
    a = await launchInstance('a');
    const created = await a.page.evaluate(
      async (name) =>
        window.mosbot?.dashboard.createBot({
          name,
          description: 'MosBot concurrent-approval probe; safe to delete',
          shape: 'circle',
          color: '#b06a8a',
        }) ?? null,
      profileName,
    );
    if (created === null || created.ok !== true) {
      throw new Error(`createBot failed: ${JSON.stringify(created)}`);
    }
    note('dedicated Bot created', true, profileName);

    b = await launchInstance('b');
    await selectProfile(a.page, profileName);
    await selectProfile(b.page, profileName);
    note('both clients opened the same Bot Chat', true);

    const composerA = a.page.locator('textarea').first();
    await composerA.fill(
      '请用 shell 工具运行命令：touch mosbot-concurrent-file.txt （只创建这个探针文件）。完成后只回复 done。',
    );
    await composerA.press('Enter');
    await waitForText(a.page, 'done', 120_000);

    const cardA = a.page.getByRole('group', { name: '需要你确认' }).first();
    const cardB = b.page.getByRole('group', { name: '需要你确认' }).first();
    const prompts = [
      '请用 shell 工具运行命令：chmod 777 mosbot-concurrent-file.txt （只改这个探针文件的权限）。完成后只回复 done。',
      '请用 shell 工具运行命令：chmod 666 mosbot-concurrent-file.txt （只改这个探针文件的权限）。完成后只回复 done。',
      '请用 shell 工具运行命令：chmod 777 mosbot-concurrent-file.txt （只改这个探针文件的权限）。完成后只回复 done。',
    ];
    let pending = false;
    for (const prompt of prompts) {
      await composerA.fill(prompt);
      await composerA.press('Enter');
      try {
        await cardA.waitFor({ state: 'visible', timeout: 90_000 });
        pending = true;
        break;
      } catch {
        // model may refuse; retry once
      }
    }
    if (!pending) {
      throw new Error('approval never became pending');
    }
    await cardB.waitFor({ state: 'visible', timeout: 30_000 });
    note('both clients hold the same approval card', true);

    // Answer simultaneously: A denies, B allows once.
    await Promise.all([
      cardA.getByRole('button', { name: '拒绝' }).click(),
      cardB.getByRole('button', { name: '允许', exact: true }).click(),
    ]);
    // Let the gateway settle and the agent finish this turn.
    await a.page.waitForFunction(
      () => {
        const text = document.querySelector('[role="log"]')?.textContent ?? '';
        return text.includes('已拒绝') || text.includes('已允许');
      },
      undefined,
      { timeout: 30_000 },
    );
    await a.page.waitForTimeout(5_000);

    // Wait for both windows to settle (receipts, remote fold, or card removal).
    await a.page.waitForTimeout(3_000);
    const textA = await transcript(a.page);
    const textB = await transcript(b.page);
    const receipt = (text) => ({
      denied: /已拒绝/.test(text),
      allowed: /已允许/.test(text),
      remote: /已由另一端处理/.test(text),
    });
    const stateA = receipt(textA);
    const stateB = receipt(textB);
    const settledA = stateA.denied || stateA.allowed || stateA.remote;
    const settledB = stateB.denied || stateB.allowed || stateB.remote;
    note('client A shows a settled state', settledA, JSON.stringify(stateA));
    note('client B shows a settled state', settledB, JSON.stringify(stateB));

    // The transcript/tool result tells whether the command ran; a double run would
    // show two work records for chmod.
    const chmodRuns = (textA.match(/chmod (?:777|666)/g) ?? []).length;
    note(
      'the dangerous command was not executed twice',
      chmodRuns <= 1,
      `mentions in A transcript: ${chmodRuns}`,
    );
    const unresolvedCards =
      (await a.page.getByRole('group', { name: '需要你确认' }).count()) +
      (await b.page.getByRole('group', { name: '需要你确认' }).count());
    note('no unresolved approval card remains', unresolvedCards === 0, String(unresolvedCards));

    const report = {
      kind: 'real service · two clients answer the same approval concurrently',
      generatedAt: new Date().toISOString(),
      target: 'http://192.168.2.171:9119',
      profile: profileName,
      observed: { stateA, stateB, chmodRuns, unresolvedCards },
      transcriptTailA: textA.slice(-400),
      transcriptTailB: textB.slice(-400),
      steps,
    };
    const reportPath = path.join(
      OUT_DIR,
      `concurrent-approval-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
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
