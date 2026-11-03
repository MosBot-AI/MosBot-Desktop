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
const MODE = process.env.MOSBOT_PROBE_MODE ?? 'auto';
const PREFLIGHT_ONLY = MODE === 'preflight';
const RESTORE_ONLY = MODE === 'restore';
const FORCE_LOGIN = MODE === 'login';
const WS_ONLY = MODE === 'ws';
const WORKBENCH_ONLY = MODE === 'workbench';
const ROSTER_ONLY = MODE === 'roster';
const CHAT_ONLY = MODE === 'chat';
const NEWBOT_ONLY = MODE === 'newbot';
const KANBAN_ONLY = MODE === 'kanban';
const WRITES_ONLY = MODE === 'writes';
const RUN_WS_PROBE = WS_ONLY || MODE === 'all';
const RUN_WORKBENCH_PROBE = WORKBENCH_ONLY || MODE === 'all';
const RUN_NEWBOT_PROBE = NEWBOT_ONLY || WRITES_ONLY;
const RUN_KANBAN_PROBE = KANBAN_ONLY || WRITES_ONLY;
const RUN_AUTH_PROBE =
  !WS_ONLY &&
  !WORKBENCH_ONLY &&
  !NEWBOT_ONLY &&
  !KANBAN_ONLY &&
  !WRITES_ONLY &&
  !ROSTER_ONLY &&
  !CHAT_ONLY;
const SIGN_OUT = process.env.MOSBOT_PROBE_SIGN_OUT === '1';
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

  // Silent restore first: a refresh token saved by safeStorage means nobody has to
  // sign in again on the next run.
  let session = null;
  if (!FORCE_LOGIN) {
    const restored = await page.evaluate(
      (address) => window.mosbot.dashboard.restore(address),
      URL_FROM_ENV,
    );
    if (restored.ok && restored.data.connected) {
      console.log(
        `\n已恢复上次登录：${restored.data.displayName || '(no display name)'} · provider ${restored.data.provider}`,
      );
      session = restored.data;
    } else if (!restored.ok) {
      console.log(`\n未能恢复登录（${restored.error.code}），需要重新登录。`);
    } else {
      console.log('\n没有可恢复的登录，需要登录一次。');
    }
  }

  if (session === null) {
    if (RESTORE_ONLY) {
      console.error('\n没有已保存的登录，且当前模式为 restore；请先用 login 模式登录一次。');
      await application.close();
      process.exitCode = 3;
      return;
    }
    const provider = PROVIDER !== '' ? PROVIDER : providers.length === 1 ? providers[0].name : '';
    if (provider === '') {
      console.error('\n多个登录提供方可用，请用 MOSBOT_AUTH_PROVIDER 指定一个后再运行。');
      await application.close();
      process.exitCode = 2;
      return;
    }

    console.log(
      '\n即将打开系统浏览器完成登录（密码由 Dashboard 自己的登录页处理）；登录后应用会自动继续，凭据会加密保存，下次无需再输入。',
    );
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
    session = login.data;
    console.log(
      `\n已登录并保存凭据：${session.displayName || '(no display name)'} · provider ${session.provider} · user ${session.userId ?? ''}`,
    );
  }

  if (ROSTER_ONLY) {
    const bots = await page.evaluate(() => window.mosbot.dashboard.listBots());
    if (!bots.ok) {
      console.error(`\nRoster failed: [${bots.error.code}] ${bots.error.message}`);
      await application.close();
      process.exitCode = 9;
      return;
    }
    const mask = (value) => (value.length <= 4 ? `${value.slice(0, 2)}…` : `${value.slice(0, 4)}…`);
    const preferred = bots.data.find((bot) => bot.isDefault) ?? bots.data[0];
    const chat =
      preferred === undefined
        ? null
        : await page.evaluate(
            (profileName) => window.mosbot.dashboard.openChat(profileName),
            preferred.profileName,
          );
    let older = null;
    if (chat !== null && chat.ok && chat.data.storedSessionId !== null && chat.data.hasMore) {
      older = await page.evaluate(
        ({ profileName, storedId, offset }) =>
          window.mosbot.dashboard.loadOlderChat(profileName, storedId, offset),
        {
          profileName: chat.data.profileName,
          storedId: chat.data.storedSessionId,
          offset: chat.data.nextOffset,
        },
      );
    }
    const rows = [
      {
        id: 'roster',
        title: '真实名单 profiles.list',
        status: bots.data.length > 0 ? 'pass' : 'fail',
        detail: `bots=${bots.data.length} · default=${preferred === undefined ? 'absent' : mask(preferred.displayName)} · canonical=${bots.data.filter((bot) => bot.canonicalSessionId !== null).length} · default_model=${preferred?.model ?? '—'}`,
      },
      {
        id: 'roster_history_page',
        title: '历史分页（更早一页）',
        status: older !== null && older.ok ? 'pass' : 'unverified',
        detail:
          older !== null && older.ok
            ? `older=${older.data.messages.length} · hasMore=${older.data.hasMore} · nextOffset=${older.data.nextOffset}`
            : older === null
              ? 'latest page has no more history'
              : older.error.message,
      },
      {
        id: 'roster_chat',
        title: 'Bot Chat 历史（只读）',
        status: chat !== null && chat.ok ? 'pass' : 'fail',
        detail:
          chat !== null && chat.ok
            ? `stored=${chat.data.storedSessionId === null ? '(none)' : mask(chat.data.storedSessionId)} · messages=${chat.data.messages.length} · hasMore=${chat.data.hasMore}`
            : chat === null
              ? 'no profile'
              : chat.error.message,
      },
    ];
    printRows('M1 · 真实名单与历史（只读）', rows);
    mkdirSync(OUT_DIR, { recursive: true });
    const reportPath = path.join(
      OUT_DIR,
      `dashboard-roster-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
    writeFileSync(
      reportPath,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          target: URL_FROM_ENV,
          roster: bots.data.map((bot) => ({
            profileName: bot.profileName,
            displayName: bot.displayName,
            isDefault: bot.isDefault,
            model: bot.model,
            provider: bot.provider,
            canonicalSessionId: bot.canonicalSessionId,
            messageCount: bot.messageCount,
          })),
          chat:
            chat !== null && chat.ok
              ? {
                  storedSessionId: chat.data.storedSessionId,
                  messageCount: chat.data.messages.length,
                  hasMore: chat.data.hasMore,
                  nextOffset: chat.data.nextOffset,
                }
              : null,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`\n名单报告已写入 ${reportPath}`);
    await application.close();
    return;
  }

  let authenticated = null;
  if (RUN_AUTH_PROBE) {
    authenticated = await page.evaluate(() => window.mosbot.dashboard.probe());
    if (!authenticated.ok) {
      console.error(
        `\nAuthenticated probe failed: [${authenticated.error.code}] ${authenticated.error.message}`,
      );
      await application.close();
      process.exitCode = 4;
      return;
    }
    printRows('第 1 步 · 已登录探针', authenticated.data.rows);
  }

  let webSocket = null;
  if (RUN_WS_PROBE) {
    webSocket = await page.evaluate(() => window.mosbot.dashboard.probeWebSocket());
    if (!webSocket.ok) {
      console.error(
        `\nWebSocket probe failed: [${webSocket.error.code}] ${webSocket.error.message}`,
      );
      await application.close();
      process.exitCode = 5;
      return;
    }
    printRows('第 2 步 · WS 与名单', webSocket.data.rows);
  }

  let workbench = null;
  if (RUN_WORKBENCH_PROBE) {
    workbench = await page.evaluate(() => window.mosbot.dashboard.probeWorkbench());
    if (!workbench.ok) {
      console.error(
        `\nWorkbench probe failed: [${workbench.error.code}] ${workbench.error.message}`,
      );
      await application.close();
      process.exitCode = 6;
      return;
    }
    printRows('第 4 步 · 工作台只读', workbench.data.rows);
  }

  if (CHAT_ONLY) {
    const report = await page.evaluate(() => window.mosbot.dashboard.probeChat());
    if (!report.ok) {
      console.error(`\nChat probe failed: [${report.error.code}] ${report.error.message}`);
      await application.close();
      process.exitCode = 10;
      return;
    }
    printRows('M1 · 真实发送 / 流式 / 停止（专用 profile，自动清理）', report.data.rows);
    mkdirSync(OUT_DIR, { recursive: true });
    const reportPath = path.join(
      OUT_DIR,
      `dashboard-chat-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
    writeFileSync(
      reportPath,
      `${JSON.stringify({ generatedAt: new Date().toISOString(), target: URL_FROM_ENV, rows: report.data.rows }, null, 2)}\n`,
    );
    console.log(`\n聊天报告已写入 ${reportPath}`);
    await application.close();
    return;
  }

  let newBot = null;
  if (RUN_NEWBOT_PROBE) {
    newBot = await page.evaluate(() => window.mosbot.dashboard.probeNewBot());
    if (!newBot.ok) {
      console.error(`\nNew-Bot probe failed: [${newBot.error.code}] ${newBot.error.message}`);
      await application.close();
      process.exitCode = 7;
      return;
    }
    printRows('第 3 步 · 新建 Bot（专用对象，自动清理）', newBot.data.rows);
  }

  let kanban = null;
  if (RUN_KANBAN_PROBE) {
    kanban = await page.evaluate(() => window.mosbot.dashboard.probeKanbanWrite());
    if (!kanban.ok) {
      console.error(`\nKanban probe failed: [${kanban.error.code}] ${kanban.error.message}`);
      await application.close();
      process.exitCode = 8;
      return;
    }
    printRows('第 4 步 · Kanban 写入（专用对象，自动清理）', kanban.data.rows);
  }

  // Keep the session by default so later runs restore silently; explicit
  // sign-out is a separate, deliberate check.
  let signOut = null;
  if (SIGN_OUT) {
    signOut = await page.evaluate(() => window.mosbot.dashboard.signOut());
    if (signOut.ok) {
      printRows('第 1 步 · 注销', signOut.data.rows);
    }
  } else {
    console.log('\n已保留登录凭据（如需验证注销，设置 MOSBOT_PROBE_SIGN_OUT=1）。');
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
        provider: session.provider,
        session: {
          userId: session.userId,
          displayName: session.displayName,
          expiresAt: session.expiresAt,
        },
        preflight: preflight.data.report,
        authenticated: authenticated === null ? null : authenticated.data,
        webSocket: webSocket === null ? null : webSocket.data,
        workbench: workbench === null ? null : workbench.data,
        newBot: newBot === null ? null : newBot.data,
        kanban: kanban === null ? null : kanban.data,
        signOut: signOut !== null && signOut.ok ? signOut.data : null,
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
