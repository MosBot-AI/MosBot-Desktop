#!/usr/bin/env node
/**
 * Stream-performance gate for MosBot Desktop.
 *
 * Launches the packaged app with the in-process frame replayer (`?bench=1`),
 * runs the local streaming scenarios from the integration spec (steady stream,
 * 5 s ×5 burst, 10,000-message history) and records frame→visible-text latency,
 * queue depth, DOM completeness, heap/RSS and long-task counts.
 *
 * The synthetic load only exercises the local pipeline; it starts no mock server
 * and talks to no Dashboard. Real-service interaction runs are recorded
 * separately in M5.
 *
 * Usage:
 *   pnpm bench:stream                     # packaged app, full 10-minute steady run
 *   pnpm bench:stream -- --seconds 30     # quick smoke run
 *   pnpm bench:stream -- --skip-history   # skip the long-history probe
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const platformDir = process.platform === 'darwin' ? 'darwin' : process.platform;
const appPath = path.resolve(
  'out',
  `MosBot-${platformDir}-${process.arch}`,
  'MosBot.app',
  'Contents',
  'MacOS',
  'MosBot',
);
const OUT_DIR = path.resolve('docs/evidence/tmp');
const HISTORY_READ_TIMEOUT_MS = 25_000;

/** @type {Record<string, number>} */
const options = {
  seconds: 600,
  rate: 100,
  batchMs: 24,
  burst: 5,
  burstFactor: 5,
  history: 10_000,
  historyBase: 200,
  markdownEvery: 40,
};

const argv = process.argv.slice(2);
let skipHistory = false;
for (let index = 0; index < argv.length; index += 1) {
  const token = argv[index];
  if (!token.startsWith('--')) {
    continue;
  }
  const key = token.slice(2);
  if (key === 'skip-history') {
    skipHistory = true;
    continue;
  }
  const value = argv[index + 1];
  if (value === undefined) {
    continue;
  }
  if (key in options) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      options[key] = Math.round(parsed);
      index += 1;
    }
  }
}
if (skipHistory) {
  options.history = 0;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function command(name, args) {
  try {
    return execFileSync(name, args, { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function packageVersion() {
  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

function machineInfo() {
  return {
    model: command('sysctl', ['-n', 'hw.model']),
    cpu: command('sysctl', ['-n', 'machdep.cpu.brand_string']),
    memoryBytes: Number(command('sysctl', ['-n', 'hw.memsize'])) || null,
    os: `${command('sw_vers', ['-productName'])} ${command('sw_vers', ['-productVersion'])} (${command('sw_vers', ['-buildVersion'])})`,
    power: command('pmset', ['-g', 'batt']).split('\n').slice(-2).join(' ').trim(),
    node: process.version,
    appVersion: packageVersion(),
    gitSha: command('git', ['rev-parse', 'HEAD']),
    electronApp: appPath,
    generatedAt: new Date().toISOString(),
  };
}

function describeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function format(value) {
  if (value === null || value === undefined) {
    return 'n/a';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function shrink(values) {
  if (values.length === 0) {
    return 'n/a';
  }
  return `${values[0]} → ${values[Math.floor(values.length / 2)]} → ${values[values.length - 1]}`;
}

function evaluateGate(result, historyTimedOut) {
  const checks = [];
  const check = (name, passed, actual, target) => {
    checks.push({ name, passed: passed === true, actual, target });
  };

  if (result === null) {
    check('bench result available', false, null, 'result');
    return checks;
  }

  check(
    'scenario matches requested options',
    result.scenario !== null &&
      result.scenario.seconds === options.seconds &&
      result.scenario.rate === options.rate &&
      result.scenario.burstSeconds === options.burst &&
      result.scenario.burstFactor === options.burstFactor &&
      result.scenario.historyCount === options.history,
    result.scenario,
    options,
  );
  check('window is visible', result.visibility === 'visible', result.visibility, 'visible');

  const steady = result.steady;
  check(
    'steady frame→visible p95',
    (steady?.visibleP95Ms ?? Infinity) <= 100,
    steady?.visibleP95Ms ?? null,
    '≤ 100 ms',
  );
  check(
    'steady generates the requested frame rate',
    (steady?.generatedPerSecond ?? 0) >= options.rate * 0.9,
    steady?.generatedPerSecond ?? null,
    `≥ ${Math.round(options.rate * 0.9)} frames/s`,
  );
  check(
    'steady leaves no unresolved batches',
    steady?.unresolvedBatches === 0,
    steady?.unresolvedBatches ?? null,
    0,
  );
  check(
    'steady DOM contains every frame',
    steady?.domTextComplete === true,
    steady?.domTokens ?? null,
    steady?.frames ?? null,
  );

  const burst = result.burst;
  if (options.burst > 0) {
    check(
      'burst frame→visible p95',
      (burst?.visibleP95Ms ?? Infinity) <= 100,
      burst?.visibleP95Ms ?? null,
      '≤ 100 ms',
    );
    check(
      'burst generates the burst frame rate',
      (burst?.generatedPerSecond ?? 0) >= options.rate * options.burstFactor * 0.85,
      burst?.generatedPerSecond ?? null,
      `≥ ${Math.round(options.rate * options.burstFactor * 0.85)} frames/s`,
    );
    check(
      'burst leaves no unresolved batches',
      burst?.unresolvedBatches === 0,
      burst?.unresolvedBatches ?? null,
      0,
    );
  }

  const correctness = result.correctness;
  check(
    'streamed text complete in store',
    correctness?.storeTextComplete === true,
    correctness?.storeTextComplete ?? null,
    true,
  );
  check(
    'streamed text complete in DOM',
    correctness?.domTextComplete === true,
    correctness?.domTextComplete ?? null,
    true,
  );
  check('no lost text', correctness?.noLostText === true, correctness?.noLostText ?? null, true);
  check(
    'no duplicated text',
    correctness?.noDuplicateText === true,
    correctness?.noDuplicateText ?? null,
    true,
  );
  check(
    'terminal status settles',
    correctness?.terminalSettled === true,
    correctness?.terminalSettled ?? null,
    true,
  );
  check(
    'terminal Markdown render measured',
    (result.terminalRenderMs ?? null) !== null,
    result.terminalRenderMs,
    'measured',
  );

  check(
    'send local feedback p95 (20 samples)',
    result.sendFeedback?.samples?.length === 20 && (result.sendFeedback?.p95Ms ?? Infinity) <= 100,
    result.sendFeedback,
    '≤ 100 ms',
  );
  check(
    'switch local feedback p95 (20 samples)',
    result.switchFeedback?.samples?.length === 20 &&
      (result.switchFeedback?.p95Ms ?? Infinity) <= 100,
    result.switchFeedback,
    '≤ 100 ms',
  );

  if (options.history > 0) {
    check(
      '10,000-message history renders',
      historyTimedOut === false && result.history?.rendered === true,
      historyTimedOut === false
        ? result.history
        : `renderer unresponsive for ${String(historyTimedOut)}s`,
      'rendered',
    );
  }

  check(
    'no harness errors',
    Array.isArray(result.errors) && result.errors.length === 0,
    result.errors,
    [],
  );
  return checks;
}

async function openWindow(isolated, userDataDir) {
  const args = [
    '--enable-precise-memory-info',
    `--user-data-dir=${userDataDir}`,
    ...(isolated ? [] : ['--no-sandbox']),
  ];
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined) {
      env[key] = value;
    }
  }
  env.NODE_ENV = 'production';
  env.MOSBOT_BENCH = '1';
  env.MOSBOT_BENCH_QUERY = new URLSearchParams({
    seconds: String(options.seconds),
    rate: String(options.rate),
    batchMs: String(options.batchMs),
    burst: String(options.burst),
    burstFactor: String(options.burstFactor),
    history: String(options.history),
    historyBase: String(options.historyBase),
    markdownEvery: String(options.markdownEvery),
  }).toString();

  const application = await electron.launch({ executablePath: appPath, env, args });
  try {
    const page = await application.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    return { application, page, isolated };
  } catch (error) {
    await application.close().catch(() => undefined);
    throw error;
  }
}

async function launch(userDataDir) {
  try {
    return await openWindow(true, userDataDir);
  } catch (error) {
    // This shell denies Chromium's OS sandbox (`sandbox initialization failed`),
    // so the packaged app cannot start sandboxed here. Retry with --no-sandbox and
    // record the compromise in the report.
    process.stderr.write(
      `sandboxed launch failed (${describeError(error)}); retrying with --no-sandbox\n`,
    );
    return await openWindow(false, userDataDir);
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'mosbot-bench-'));
  const launched = await launch(userDataDir);
  const application = launched.application;
  const page = launched.page;
  let exitCode = 1;

  try {
    const rssSamples = [];
    const rendererMetrics = [];
    let sampling = true;
    const sampleLoop = (async () => {
      while (sampling) {
        try {
          const usage = await application.evaluate(() => process.memoryUsage());
          rssSamples.push({
            atMs: Date.now(),
            rssMb: Math.round((usage.rss / 1_048_576) * 10) / 10,
            heapMb: Math.round((usage.heapUsed / 1_048_576) * 10) / 10,
          });
        } catch {
          // Keep sampling: a busy main process must not stop the curve.
        }
        try {
          const metrics = await Promise.race([
            page.evaluate(() => {
              const memory = performance.memory;
              return {
                jsHeapMb:
                  memory === undefined
                    ? null
                    : Math.round((memory.usedJSHeapSize / 1_048_576) * 10) / 10,
                domNodes: document.getElementsByTagName('*').length,
                visibility: document.visibilityState,
              };
            }),
            sleep(5_000).then(() => null),
          ]);
          if (metrics !== null) {
            rendererMetrics.push({ atMs: Date.now(), ...metrics });
          }
        } catch {
          // Keep sampling.
        }
        await sleep(2_000);
      }
    })();

    const startedAt = Date.now();
    const coreDeadline = startedAt + (options.seconds + options.burst) * 1_000 + 180_000;
    let status = 'timeout';
    while (Date.now() < coreDeadline) {
      try {
        status = await page.evaluate(() => window.__mosbotBench?.status ?? 'booting');
      } catch {
        status = 'unreadable';
      }
      if (status === 'core' || status === 'error' || status === 'complete') {
        break;
      }
      await sleep(500);
    }

    let result = await page.evaluate(() => window.__mosbotBench?.result ?? null);
    const benchError = await page.evaluate(() => window.__mosbotBench?.error ?? null);

    let historyTimedOut = false;
    if (status === 'core' && options.history > 0) {
      const historyStartedAt = Date.now();
      historyTimedOut = await Promise.race([
        page
          .evaluate(() => window.__mosbotBench?.runHistory?.())
          .then(() => false)
          .catch(() => false),
        sleep(HISTORY_READ_TIMEOUT_MS).then(() => true),
      ]);
      if (historyTimedOut === true) {
        historyTimedOut = Math.round((Date.now() - historyStartedAt) / 1000);
        // A blocked renderer cannot answer; keep the core measurements.
      } else {
        result = await Promise.race([
          page.evaluate(() => window.__mosbotBench?.result ?? null),
          sleep(5_000).then(() => result),
        ]);
      }
    } else if (status === 'complete') {
      result = await page.evaluate(() => window.__mosbotBench?.result ?? null);
    }

    sampling = false;
    await Promise.race([sampleLoop, sleep(3_000)]);

    const checks = evaluateGate(result, historyTimedOut);
    const passed =
      status !== 'error' && benchError === null && checks.every((entry) => entry.passed);
    const report = {
      kind: 'fixture · local pipeline replay (no mock server, no Dashboard)',
      status,
      benchError,
      historyTimedOut,
      isolatedRendererSandbox: launched.isolated,
      wallMs: Date.now() - startedAt,
      machine: machineInfo(),
      options,
      checks,
      passed,
      result,
      rssSamples,
      rendererMetrics,
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(OUT_DIR, `perf-stream-${stamp}.json`);
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

    const steady = result?.steady;
    const burst = result?.burst;
    console.log(`\nMosBot stream performance · ${report.kind}`);
    console.log(
      `steady: frames=${format(steady?.frames)} (${format(steady?.generatedPerSecond)}/s target ${format(steady?.targetRate)}/s) batches=${format(steady?.batches)} p50=${format(steady?.visibleP50Ms)} ms p95=${format(steady?.visibleP95Ms)} ms max=${format(steady?.visibleMaxMs)} ms fps=${format(steady?.fps)} queueMax=${format(steady?.queueMax)} longTasks=${format(steady?.longTasks)}`,
    );
    console.log(
      `burst : frames=${format(burst?.frames)} (${format(burst?.generatedPerSecond)}/s) p95=${format(burst?.visibleP95Ms)} ms max=${format(burst?.visibleMaxMs)} ms unresolved=${format(burst?.unresolvedBatches)}`,
    );
    console.log(
      `feedback: send p95=${format(result?.sendFeedback?.p95Ms)} ms (${format(result?.sendFeedback?.samples)}) switch p95=${format(result?.switchFeedback?.p95Ms)} ms (${format(result?.switchFeedback?.samples)}) terminal-render=${format(result?.terminalRenderMs)} ms`,
    );
    console.log(
      `history: ${format(result?.history?.messages)} messages rendered=${format(result?.history?.rendered)} in ${format(result?.history?.renderMs)} ms`,
    );
    console.log(
      `memory: main RSS MB ${shrink(rssSamples.map((sample) => sample.rssMb))} · renderer JS heap MB ${shrink(rendererMetrics.map((sample) => sample.jsHeapMb))} · DOM nodes ${shrink(rendererMetrics.map((sample) => sample.domNodes))}`,
    );
    for (const entry of checks) {
      console.log(
        `  ${entry.passed ? 'PASS' : 'FAIL'}  ${entry.name} · actual=${format(entry.actual)} · target=${format(entry.target)}`,
      );
    }
    console.log(`\nreport: ${reportPath}`);
    exitCode = passed ? 0 : 1;
  } finally {
    await application.close().catch(() => undefined);
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup of the temporary profile.
    }
  }

  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
