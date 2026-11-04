#!/usr/bin/env node
/**
 * Clean-install verification for the packaged ZIP.
 *
 * Extracts `out/make/zip/darwin/arm64/*.zip` into a temporary directory (as a
 * person would after downloading it), launches it with a brand-new userData
 * directory and checks the offline first-run surfaces: window title, fixture
 * roster, the connection dialog, bundle identity and that no credentials exist
 * before signing in. Records size, SHA-256 and code-signing status so an
 * unsigned build is never reported as signed.
 *
 * Run: `pnpm test:install` (or `node scripts/verify-install.mjs` after `pnpm make`).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const OUT_DIR = path.resolve('docs/evidence/tmp');
const ZIP_DIR = path.resolve('out/make/zip/darwin/arm64');

function command(name, args, options = {}) {
  return execFileSync(name, args, { encoding: 'utf8', ...options });
}

function findZip() {
  if (!existsSync(ZIP_DIR)) {
    throw new Error(`No packaged ZIP at ${ZIP_DIR}; run "pnpm make" first.`);
  }
  const archives = readdirSync(ZIP_DIR)
    .filter((name) => name.endsWith('.zip'))
    .sort();
  const latest = archives[archives.length - 1];
  if (latest === undefined) {
    throw new Error(`No packaged ZIP at ${ZIP_DIR}; run "pnpm make" first.`);
  }
  return path.join(ZIP_DIR, latest);
}

function sha256(file) {
  return command('shasum', ['-a', '256', file]).split(/\s+/)[0] ?? 'unknown';
}

function signingInfo(appPath) {
  const result = spawnSync('codesign', ['-dv', '--verbose=2', appPath], { encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  const adhoc = /Signature=adhoc|flags=0x[0-9a-f]*\(adhoc/.test(output);
  const developerId = output.includes('Authority=Developer ID Application');
  const kind = developerId ? 'developer-id' : adhoc ? 'adhoc' : 'unsigned';
  const assessment = spawnSync('spctl', ['--assess', '--type', 'execute', appPath], {
    encoding: 'utf8',
  });
  return {
    signed: developerId,
    kind,
    details: output.slice(0, 800),
    gatekeeper: `${assessment.stdout ?? ''}${assessment.stderr ?? ''}`.trim().slice(0, 400),
    gatekeeperAccepted: assessment.status === 0,
  };
}

function plistValue(appPath, key) {
  try {
    return command('defaults', ['read', path.join(appPath, 'Contents', 'Info.plist'), key]).trim();
  } catch {
    return 'unknown';
  }
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${label} timed out after ${ms} ms`));
      }, ms);
      timer.unref?.();
    }),
  ]);
}

function packageVersion() {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  return typeof pkg.version === 'string' ? pkg.version : 'unknown';
}

async function launch(appPath, userDataDir) {
  const trySandboxed = process.env['MOSBOT_TRY_SANDBOX'] === '1';
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined) {
      env[key] = value;
    }
  }
  env.NODE_ENV = 'production';
  const base = [`--user-data-dir=${userDataDir}`];
  if (!trySandboxed) {
    // This developer shell denies Chromium's own sandbox; starting sandboxed
    // hangs the launch. Set MOSBOT_TRY_SANDBOX=1 in an environment that allows it.
    const application = await electron.launch({
      executablePath: appPath,
      env,
      args: ['--no-sandbox', ...base],
    });
    const page = await withTimeout(application.firstWindow(), 30_000, 'first window');
    await page.waitForLoadState('domcontentloaded');
    return { application, page, isolated: false };
  }
  try {
    const application = await electron.launch({ executablePath: appPath, env, args: base });
    try {
      // A sandboxed launch can spawn and then die; never wait the full default
      // timeout before falling back (this shell cannot start Chromium's sandbox).
      const page = await withTimeout(application.firstWindow(), 8_000, 'first window');
      await page.waitForLoadState('domcontentloaded');
      return { application, page, isolated: true };
    } catch (error) {
      await application.close().catch(() => undefined);
      throw error;
    }
  } catch {
    // This shell cannot initialise Chromium's OS sandbox; the packaged app is
    // retried with --no-sandbox and the compromise is recorded in the report.
    const application = await electron.launch({
      executablePath: appPath,
      env,
      args: ['--no-sandbox', ...base],
    });
    const page = await withTimeout(application.firstWindow(), 30_000, 'first window');
    await page.waitForLoadState('domcontentloaded');
    return { application, page, isolated: false };
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const zipPath = findZip();
  const extraction = mkdtempSync(path.join(tmpdir(), 'mosbot-install-'));
  const userData = mkdtempSync(path.join(tmpdir(), 'mosbot-install-user-'));
  const startedAt = Date.now();
  let exitCode = 1;

  try {
    const extractStartedAt = Date.now();
    command('ditto', ['-x', '-k', zipPath, extraction]);
    const extractMs = Date.now() - extractStartedAt;
    const appPath = path.join(extraction, 'MosBot.app');
    if (!existsSync(appPath)) {
      throw new Error('MosBot.app is missing from the extracted ZIP');
    }
    const executable = path.join(appPath, 'Contents', 'MacOS', 'MosBot');
    const signature = signingInfo(appPath);

    const launchStartedAt = Date.now();
    const launched = await launch(executable, userData);
    const launchToDomMs = Date.now() - launchStartedAt;
    const { application, page } = launched;
    try {
      const title = await page.title();
      const appVersion = await application.evaluate(({ app }) => app.getVersion());
      const footer = page.locator('#sidebar-connection');
      const footerVisible = await footer.isVisible();
      const pinned = await page.locator('button[title^="设计评审"]').first().isVisible();
      const credentialsPath = path.join(userData, 'dashboard-credentials.json');
      const credentialsBeforeSignIn = existsSync(credentialsPath);

      await footer.click();
      const menu = page.getByRole('dialog', { name: '外观与语言' });
      await menu.getByRole('button', { name: '连接 Dashboard…' }).click();
      const dialog = page.getByRole('dialog', { name: '连接 Dashboard' });
      const connectionDialog = await dialog.isVisible();
      await page.keyboard.press('Escape');

      const checks = [
        { name: 'window title', passed: title === 'MosBot', actual: title },
        {
          name: 'app version matches package.json',
          passed: appVersion === packageVersion(),
          actual: appVersion,
        },
        {
          name: 'bundle id',
          passed: plistValue(appPath, 'CFBundleIdentifier') === 'com.mosbot.desktop',
          actual: plistValue(appPath, 'CFBundleIdentifier'),
        },
        { name: 'fixture roster visible', passed: pinned, actual: pinned },
        { name: 'sidebar footer visible', passed: footerVisible, actual: footerVisible },
        {
          name: 'connection dialog opens offline',
          passed: connectionDialog,
          actual: connectionDialog,
        },
        {
          name: 'no credentials before sign-in',
          passed: credentialsBeforeSignIn === false,
          actual: credentialsBeforeSignIn,
        },
      ];
      // Honest release status: an ad-hoc signature is not a Developer ID build
      // and Gatekeeper rejects it, so it is reported as a pending requirement.
      const releaseSigned = signature.kind === 'developer-id' && signature.gatekeeperAccepted;
      checks.push({
        name: 'Developer ID signed and Gatekeeper accepted',
        passed: releaseSigned,
        actual: `${signature.kind}${signature.gatekeeperAccepted ? ' · accepted' : ' · rejected by spctl'}`,
      });

      const passed = checks
        .filter((entry) => entry.name !== 'Developer ID signed and Gatekeeper accepted')
        .every((entry) => entry.passed);
      const report = {
        kind: 'packaged ZIP · clean extraction and fresh userData (no Dashboard connection)',
        generatedAt: new Date().toISOString(),
        zip: {
          path: zipPath,
          bytes: statSync(zipPath).size,
          sha256: sha256(zipPath),
        },
        bundle: {
          path: appPath,
          version: appVersion,
          bundleId: plistValue(appPath, 'CFBundleIdentifier'),
          signing: signature,
        },
        launch: {
          isolatedRendererSandbox: launched.isolated,
          extractMs,
          launchToDomMs,
          totalMs: Date.now() - startedAt,
        },
        checks,
        passed,
      };
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const reportPath = path.join(OUT_DIR, `install-verify-${stamp}.json`);
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

      console.log('\nMosBot clean-install verification');
      console.log(`zip: ${zipPath} (${Math.round(report.zip.bytes / 1_048_576)} MB)`);
      console.log(`sha256: ${report.zip.sha256}`);
      console.log(`version: ${appVersion} · bundle: ${report.bundle.bundleId}`);
      console.log(
        `signing: ${signature.kind}${signature.gatekeeperAccepted ? ' · Gatekeeper accepted' : ' · Gatekeeper rejected'} (${signature.signed ? 'Developer ID' : 'not a release signature'})`,
      );
      for (const entry of checks) {
        console.log(
          `  ${entry.passed ? 'PASS' : 'FAIL'}  ${entry.name} · actual=${String(entry.actual)}`,
        );
      }
      console.log(`\nreport: ${reportPath}`);
      exitCode = passed ? 0 : 1;
    } finally {
      await application.close().catch(() => undefined);
    }
  } finally {
    rmSync(extraction, { recursive: true, force: true });
    rmSync(userData, { recursive: true, force: true });
  }

  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
