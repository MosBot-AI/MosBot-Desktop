#!/usr/bin/env node
/**
 * M0b integration probe against the real Dashboard.
 *
 * Run:  MOSBOT_DASHBOARD_URL=http://192.168.2.171:9119 npm run test:integration
 *
 * It packages the app, launches the real Electron window, runs the unauthenticated
 * REST probe, opens the system browser for RFC 8252 PKCE sign-in (the person logs
 * in there), then runs the authenticated probe and a local sign-out check.
 * Reports contain redacted fields only: no tokens, tickets or credentials.
 */
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { _electron as electron } from 'playwright';

const DEFAULT_URL = 'http://192.168.2.171:9119';
const URL_FROM_ENV = process.env.MOSBOT_DASHBOARD_URL ?? DEFAULT_URL;
const PROVIDER = process.env.MOSBOT_AUTH_PROVIDER ?? '';
const PREFLIGHT_ONLY = process.env.MOSBOT_PROBE_MODE === 'preflight';
const APP = path.resolve(
  'out',
  `MosBot-${process.platform}-${process.arch}`,
  'MosBot.app',
  'Contents',
  'MacOS',
  'MosBot',
);
const OUT_DIR = path.resolve('docs/evidence/tmp');
// Preflight output is redacted enough to live in the repository as evidence;
// authenticated reports may contain account display names, so they stay local.
const PREFLIGHT_DIR = path.resolve('docs/evidence/probes');

function appEnvironment() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined) {
      env[key] = value;
    }
  }
  env.NODE_ENV = 'production';
  return env;
}

function printRows(title, rows) {
  console.log(`\n## ${title}\n`);
  console.log('| 能力 | 状态 | 结果 |');
  console.log('| --- | --- | --- |');
  for (const row of rows) {
    const status =
      { pass: '✅ 通过', fail: '❌ 失败', unverified: '⏳ 待验证', 'not-supported': '⛔ 不支持' }[
        row.status
      ] ?? row.status;
    console.log(`| ${row.title} | ${status} | ${String(row.detail).replace(/\|/g, '\\|')} |`);
  }
}

async function main() {
  const application = await electron.launch({
    executablePath: APP,
    env: appEnvironment(),
    args: [
      '--no-sandbox',
      '--disable-gpu',
      `--user-data-dir=${path.resolve('.tmp/userdata-probe')}`,
    ],
  });
  const page = await application.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  console.log(`Dashboard: ${URL_FROM_ENV}`);

  const preflight = await page.evaluate(
    (address) => window.mosbot.dashboard.preflight(address),
    URL_FROM_ENV,
  );
  if (!preflight.ok) {
    console.error(`\nPreflight failed: [${preflight.error.code}] ${preflight.error.message}`);
    await application.close();
    process.exitCode = 2;
    return;
  }
  printRows('第 1 步 · 无凭据探活', preflight.data.report.rows);
  const providers = preflight.data.providers;
  console.log(`\n可用登录提供方: ${providers.map((item) => item.name).join(', ') || '(none)'}`);

  if (PREFLIGHT_ONLY) {
    mkdirSync(PREFLIGHT_DIR, { recursive: true });
    const reportPath = path.join(
      PREFLIGHT_DIR,
      `preflight-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
    writeFileSync(
      reportPath,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          target: URL_FROM_ENV,
          providers,
          preflight: preflight.data.report,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`\npreflight 报告已写入 ${reportPath}`);
    await application.close();
    return;
  }

  const provider = PROVIDER !== '' ? PROVIDER : providers.length === 1 ? providers[0].name : '';
  if (provider === '') {
    console.error('\n多个登录提供方可用，请用 MOSBOT_AUTH_PROVIDER 指定一个后再运行。');
    await application.close();
    process.exitCode = 2;
    return;
  }

  console.log('\n即将打开系统浏览器完成登录；登录后回到应用即可继续。');
  const login = await page.evaluate(
    ({ address, providerName }) => window.mosbot.dashboard.login(address, providerName),
    { address: URL_FROM_ENV, providerName: provider },
  );
  if (!login.ok) {
    console.error(`\nSign-in failed: [${login.error.code}] ${login.error.message}`);
    await application.close();
    process.exitCode = 3;
    return;
  }
  console.log(
    `\n已登录：${login.data.displayName || '(no display name)'} · provider ${login.data.provider} · user ${login.data.userId ?? ''}`,
  );

  const authenticated = await page.evaluate(() => window.mosbot.dashboard.probe());
  if (!authenticated.ok) {
    console.error(
      `\nAuthenticated probe failed: [${authenticated.error.code}] ${authenticated.error.message}`,
    );
    await application.close();
    process.exitCode = 4;
    return;
  }
  printRows('第 1 步 · 已登录探针', authenticated.data.rows);

  const signOut = await page.evaluate(() => window.mosbot.dashboard.signOut());
  if (signOut.ok) {
    printRows('第 1 步 · 注销', signOut.data.rows);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const reportPath = path.join(
    OUT_DIR,
    `dashboard-probe-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        target: URL_FROM_ENV,
        provider,
        preflight: preflight.data.report,
        authenticated: authenticated.data,
        signOut: signOut.ok ? signOut.data : null,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\n报告已写入 ${reportPath}（docs/evidence/tmp 被 Git 忽略）`);
  await application.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
  process.exit(1);
});
