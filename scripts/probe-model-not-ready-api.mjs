#!/usr/bin/env node
/**
 * Test-server configuration probe: decrypt the probe userData's saved session in the
 * Electron main process, then create a dedicated profile with candidate model
 * providers and ask `/api/model/info` whether it is ready. Used to construct the
 * "model not configured" UI state on the authorised test server; deletes candidates
 * that come back ready, keeps the first not-ready one for a GUI walkthrough.
 *
 * Run: node scripts/probe-model-not-ready-api.mjs
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
const USER_DATA = path.resolve('.tmp/userdata-model-api');
const OUT_DIR = path.resolve('docs/evidence/tmp');

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  rmSync(USER_DATA, { recursive: true, force: true });
  cpSync(path.resolve('.tmp/userdata-probe'), USER_DATA, { recursive: true });
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    MOSBOT_TEST_BACKGROUND: '1',
    MOSBOT_PROBE_USER_DATA: USER_DATA,
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

  const report = await application.evaluate(async ({ safeStorage }) => {
    const fs = process.getBuiltinModule('node:fs');
    const path = process.getBuiltinModule('node:path');
    const filePath = path.join(
      process.env['MOSBOT_PROBE_USER_DATA'] ?? '',
      'dashboard-credentials.json',
    );
    const file = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const target = Object.keys(file.sessions ?? {})[0];
    if (target === undefined) {
      return {
        error: 'no saved session',
        filePath,
        sessionKeys: Object.keys(file.sessions ?? {}),
      };
    }
    const stored = JSON.parse(
      safeStorage.decryptString(Buffer.from(file.sessions[target], 'base64')),
    );
    const origin = new URL(target).origin;
    const headers = { 'content-type': 'application/json' };
    const refreshed = await fetch(`${origin}/auth/native/refresh`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ refresh_token: stored.refreshToken, provider: stored.provider }),
    });
    if (!refreshed.ok) {
      return { error: `refresh ${refreshed.status}` };
    }
    const tokens = await refreshed.json();
    const auth = { authorization: `Bearer ${tokens.access_token}`, ...headers };
    const candidates = [
      [null, null],
      ['ollama', 'llama3'],
      ['ollama', 'qwen2.5'],
      ['custom', 'probe-model'],
      ['openai', 'gpt-4o-mini'],
      ['anthropic', 'claude-3-5-sonnet-latest'],
    ];
    const rows = [];
    const pad = (value) => String(value).padStart(2, '0');
    for (const [provider, model] of candidates) {
      const name = `mosbot-probe-gui-${pad(new Date().getHours())}${pad(new Date().getMinutes())}${pad(new Date().getSeconds())}`;
      const created = await fetch(`${origin}/api/profiles`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          name,
          description: 'MosBot model-probe; safe to delete',
          no_skills: true,
          ...(provider === null ? {} : { provider, model }),
        }),
      });
      const createdBody = await created.json().catch(() => ({}));
      if (!created.ok) {
        rows.push({
          provider,
          model,
          step: 'create',
          status: created.status,
          detail: JSON.stringify(createdBody).slice(0, 200),
        });
        continue;
      }
      const rosterResponse = await fetch(`${origin}/api/profiles?include_sessions=true`, {
        headers: auth,
      });
      const roster = await rosterResponse.json().catch(() => ({}));
      const rosterRow = Array.isArray(roster.profiles)
        ? roster.profiles.find((entry) => entry.name === name)
        : undefined;
      const info = await fetch(`${origin}/api/model/info?profile=${encodeURIComponent(name)}`, {
        headers: auth,
      });
      const infoBody = await info.json().catch(() => ({}));
      rows.push({
        provider,
        model,
        step: 'ready',
        status: info.status,
        rosterModel: rosterRow?.model,
        rosterProvider: rosterRow?.provider,
        detail: JSON.stringify(infoBody).slice(0, 220),
      });
      if (info.ok && infoBody.ready === false) {
        return { rows, kept: { name, provider, model } };
      }
      await fetch(`${origin}/api/profiles/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: auth,
      });
    }
    return { rows, kept: null };
  });

  console.log(JSON.stringify(report, null, 2));
  const reportPath = path.join(
    OUT_DIR,
    `model-not-ready-api-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await application.close();
  process.exit(report.kept ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
