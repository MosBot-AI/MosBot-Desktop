/**
 * Stream-performance harness.
 *
 * `pnpm bench:stream` launches the packaged app with `?bench=1`; this module seeds
 * a synthetic (desensitised) remote roster, replays streamed deltas through the
 * real store/reducer/React/CSS pipeline and records how long a frame takes to
 * become visible text. It is a test harness, not a product surface: normal
 * launches never load the `bench` query parameter.
 *
 * Methodology (recorded in docs/evidence/m5-performance.md):
 * - a frame is one delta generated at the configured rate; batches are dispatched
 *   on the coalescing window (`batchMs`), mirroring the main-process batcher;
 * - the transcript DOM is watched with a `MutationObserver`; a frame is "visible"
 *   at the first `requestAnimationFrame` after the DOM changed (paint follows
 *   immediately). This avoids reading `textContent` every frame, which would add
 *   O(reply length) probe cost to the measurement;
 * - content is replayed with Markdown blocks (blank-line separated, plus inline
 *   emphasis) so the streaming block renderer and the terminal full pass are
 *   actually exercised;
 * - completeness is verified against the rendered DOM token count as well as the
 *   store projection, so a rendering bug cannot be hidden by a perfect store.
 */
import { appStore } from './store';
import type { RemoteBot, RemoteChat, RemoteMessage } from '../../shared/protocol';

const params = new URLSearchParams(window.location.search);

function intParam(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null || raw.trim() === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

const CONFIG = {
  seconds: intParam(params.get('seconds'), 600, 5, 3_600),
  rate: intParam(params.get('rate'), 100, 1, 1_000),
  batchMs: intParam(params.get('batchMs'), 24, 16, 32),
  burstSeconds: intParam(params.get('burst'), 5, 0, 60),
  burstFactor: intParam(params.get('burstFactor'), 5, 1, 10),
  historyCount: intParam(params.get('history'), 10_000, 0, 20_000),
  historyBase: intParam(params.get('historyBase'), 200, 0, 2_000),
  markdownEvery: intParam(params.get('markdownEvery'), 40, 0, 1_000),
} as const;

type Batch = {
  readonly text: string;
  readonly frameTimes: readonly number[];
  readonly dispatchedAt: number;
};

type LatencyReport = {
  frames: number;
  batches: number;
  generatedPerSecond: number;
  targetRate: number;
  visibleP50Ms: number | null;
  visibleP95Ms: number | null;
  visibleMaxMs: number | null;
  renderP95Ms: number | null;
  queueMax: number;
  unresolvedBatches: number;
  fps: number;
  longFrames: number;
  longTasks: number;
  domTokens: number;
  domUniqueTokens: number;
  expectedFrames: number;
  domTextComplete: boolean;
};

type FeedbackReport = {
  samples: readonly number[];
  p95Ms: number | null;
  maxMs: number | null;
};

type BenchResult = {
  scenario: typeof CONFIG;
  visibility: string;
  userAgent: string;
  steady: LatencyReport | null;
  burst: LatencyReport | null;
  sendFeedback: FeedbackReport | null;
  switchFeedback: FeedbackReport | null;
  terminalRenderMs: number | null;
  history: {
    messages: number;
    renderMs: number | null;
    rendered: boolean;
  } | null;
  correctness: {
    storeTextComplete: boolean;
    domTextComplete: boolean;
    noLostText: boolean;
    noDuplicateText: boolean;
    terminalSettled: boolean;
  };
  errors: string[];
};

type BenchGlobal = {
  status: 'running' | 'core' | 'complete' | 'error';
  result: BenchResult | null;
  error: string | null;
  runHistory(): Promise<void>;
};

declare global {
  interface Window {
    __mosbotBench?: BenchGlobal;
  }
}

const ACTIVE_PROFILE = 'bench-bot-0';
const HISTORY_PROFILE = 'bench-bot-2';
const STATE_PROFILE = 'bench-bot-1';

function now(): number {
  return performance.now();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function nextFrame(): Promise<number> {
  return new Promise((resolve) => {
    requestAnimationFrame((timestamp) => {
      resolve(timestamp);
    });
  });
}

/** Nearest-rank percentile: for n=20, p95 is the second-largest sample. */
function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = fraction >= 1 ? sorted.length : Math.ceil(fraction * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  const value = sorted[index] ?? 0;
  return Math.round(value * 100) / 100;
}

function syntheticBots(): RemoteBot[] {
  return Array.from({ length: 4 }, (_, index) => ({
    profileName: `bench-bot-${index}`,
    displayName: `Bench Bot ${index}`,
    description: 'desensitised benchmark profile',
    shape: index % 2 === 0 ? 'circle' : 'pill',
    color: '#6fa86f',
    metaRevision: 0,
    model: 'bench-model',
    provider: 'bench-provider',
    isDefault: index === 0,
    summary: 'Local benchmark stream',
    canonicalSessionId: `bench-stored-${index}`,
    lastActiveAt: Date.now(),
    messageCount: 0,
  }));
}

/** Oldest first, matching the transcript order returned by the gateway. */
function historyMessages(count: number, prefix: string): RemoteMessage[] {
  const base = Date.now();
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    role: index % 2 === 0 ? 'user' : 'bot',
    text: `history ${prefix} line ${index} with a few words`,
    at: base - (count - index) * 1_000,
  }));
}

function chatFor(profile: string, storedSessionId: string, messages: RemoteMessage[]): RemoteChat {
  return {
    profileName: profile,
    storedSessionId,
    messages,
    hasMore: false,
    nextOffset: messages.length,
  };
}

function transcript(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="log"]');
}

async function waitForTranscript(timeoutMs = 10_000): Promise<HTMLElement> {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    const element = transcript();
    if (element !== null) {
      return element;
    }
    await nextFrame();
  }
  throw new Error('The transcript never rendered.');
}

async function waitForCondition(
  condition: () => boolean,
  timeoutMs: number,
): Promise<{ rendered: boolean; paintedAt: number }> {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    const paintedAt = await nextFrame();
    if (condition()) {
      return { rendered: true, paintedAt };
    }
  }
  return { rendered: false, paintedAt: now() };
}

/** Long-task observer is Chromium-only; absent elsewhere it reports zero. */
function countLongTasks(): { count: () => number; disconnect: () => void } {
  let count = 0;
  let observer: PerformanceObserver | null = null;
  try {
    observer = new PerformanceObserver((list) => {
      count += list.getEntries().length;
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch {
    observer = null;
  }
  return {
    count: () => count,
    disconnect: () => {
      observer?.disconnect();
    },
  };
}

function chunkFor(tag: string, sequence: number): string {
  const token = `${tag}f${sequence.toString().padStart(6, '0')}`;
  if (CONFIG.markdownEvery > 0 && sequence % CONFIG.markdownEvery === 0) {
    return `${token}\n\n`;
  }
  if (CONFIG.markdownEvery > 0 && sequence % 17 === 0) {
    return `**${token}** `;
  }
  return `${token} `;
}

function tokenRegex(tag: string): RegExp {
  return new RegExp(`${tag}f\\d{6}`, 'g');
}

/**
 * Replays one stream scenario and measures per-frame visibility latency.
 */
async function replayStream(options: {
  seconds: number;
  rate: number;
  tag: string;
  element: HTMLElement;
}): Promise<{
  report: LatencyReport;
  expectedText: string;
  errors: string[];
}> {
  const frameLatencies: number[] = [];
  const renderLatencies: number[] = [];
  const frameGaps: number[] = [];
  const pending: Batch[] = [];
  const errors: string[] = [];
  const longTasks = countLongTasks();
  let maxQueue = 0;
  let expected = '';
  let buffer = '';
  let bufferFrames: number[] = [];
  let sequence = 0;
  let generated = 0;
  let running = true;
  let lastFrameAt = now();
  let rafHandle = 0;
  let dirty = false;

  const observer = new MutationObserver(() => {
    dirty = true;
  });
  observer.observe(options.element, { subtree: true, childList: true, characterData: true });

  const monitor = (timestamp: number): void => {
    frameGaps.push(timestamp - lastFrameAt);
    lastFrameAt = timestamp;
    if (dirty && pending.length > 0) {
      dirty = false;
      // A synchronous React commit per batch means everything pending is painted
      // by this frame; resolving oldest-first keeps every latency conservative.
      while (pending.length > 0) {
        const batch = pending.shift();
        if (batch === undefined) {
          break;
        }
        for (const frameAt of batch.frameTimes) {
          frameLatencies.push(timestamp - frameAt);
        }
        renderLatencies.push(timestamp - batch.dispatchedAt);
      }
    }
    if (running) {
      rafHandle = requestAnimationFrame(monitor);
    }
  };
  rafHandle = requestAnimationFrame(monitor);

  const frameIntervalMs = Math.max(4, Math.round(1_000 / options.rate));
  const framesPerTick = Math.max(1, Math.round((options.rate * frameIntervalMs) / 1_000));
  const frameTimer = window.setInterval(() => {
    for (let index = 0; index < framesPerTick; index += 1) {
      sequence += 1;
      generated += 1;
      const at = now();
      buffer += chunkFor(options.tag, sequence);
      bufferFrames.push(at);
    }
  }, frameIntervalMs);

  const batchTimer = window.setInterval(() => {
    if (buffer === '') {
      return;
    }
    const batch: Batch = { text: buffer, frameTimes: bufferFrames, dispatchedAt: now() };
    expected += buffer;
    buffer = '';
    bufferFrames = [];
    pending.push(batch);
    maxQueue = Math.max(maxQueue, pending.length);
    appStore.dispatch({ type: 'live-delta', text: batch.text });
  }, CONFIG.batchMs);

  await delay(options.seconds * 1_000);

  window.clearInterval(frameTimer);
  window.clearInterval(batchTimer);
  if (buffer !== '') {
    const batch: Batch = { text: buffer, frameTimes: bufferFrames, dispatchedAt: now() };
    expected += buffer;
    buffer = '';
    pending.push(batch);
    appStore.dispatch({ type: 'live-delta', text: batch.text });
  }

  const drainDeadline = now() + 5_000;
  while (pending.length > 0 && now() < drainDeadline) {
    await nextFrame();
  }
  running = false;
  cancelAnimationFrame(rafHandle);
  observer.disconnect();
  longTasks.disconnect();

  const renderedText = options.element.textContent ?? '';
  const tokens = renderedText.match(tokenRegex(options.tag)) ?? [];
  const domTokens = tokens.length;
  const domUniqueTokens = new Set(tokens).size;
  const lastToken = `${options.tag}f${sequence.toString().padStart(6, '0')}`;
  const domTextComplete =
    domTokens === generated && domUniqueTokens === domTokens && renderedText.includes(lastToken);
  if (!domTextComplete) {
    errors.push(
      `${options.tag}: DOM tokens=${domTokens} unique=${domUniqueTokens} expected=${generated}`,
    );
  }
  if (pending.length > 0) {
    errors.push(`${options.tag}: ${pending.length} batches never became visible`);
  }

  const elapsedSeconds = Math.max(1, options.seconds);
  const report: LatencyReport = {
    frames: generated,
    batches: renderLatencies.length,
    generatedPerSecond: Math.round((generated / elapsedSeconds) * 10) / 10,
    targetRate: options.rate,
    visibleP50Ms: percentile(frameLatencies, 0.5),
    visibleP95Ms: percentile(frameLatencies, 0.95),
    visibleMaxMs: percentile(frameLatencies, 1),
    renderP95Ms: percentile(renderLatencies, 0.95),
    queueMax: maxQueue,
    unresolvedBatches: pending.length,
    fps: Math.round((frameGaps.length / elapsedSeconds) * 10) / 10,
    longFrames: frameGaps.filter((gap) => gap > 50).length,
    longTasks: longTasks.count(),
    domTokens,
    domUniqueTokens,
    expectedFrames: generated,
    domTextComplete,
  };
  return { report, expectedText: expected, errors };
}

async function seedCore(history: number): Promise<void> {
  appStore.dispatch({ type: 'remote-ready', bots: syntheticBots() });
  appStore.dispatch({ type: 'remote-select', profile: ACTIVE_PROFILE });
  appStore.dispatch({
    type: 'remote-chat',
    chat: chatFor(ACTIVE_PROFILE, 'bench-stored-0', historyMessages(history, 'boot')),
  });
  appStore.dispatch({
    type: 'live-session',
    profile: ACTIVE_PROFILE,
    storedSessionId: 'bench-stored-0',
    runtimeSessionId: 'bench-runtime-0',
  });
  appStore.dispatch({
    type: 'live-user',
    profile: ACTIVE_PROFILE,
    text: 'benchmark prompt',
    at: Date.now(),
  });
  appStore.dispatch({ type: 'live-phase', phase: 'streaming' });
  appStore.dispatch({
    type: 'remote-chat',
    chat: chatFor(STATE_PROFILE, 'bench-stored-1', []),
  });
}

/**
 * Resolves with the first frame painted after the next transcript mutation.
 * Falls back to `null` when the DOM never changes (nothing to measure).
 */
async function measureNextMutation(
  element: HTMLElement,
  action: () => void,
): Promise<number | null> {
  const startedAt = now();
  return new Promise((resolve) => {
    let settled = false;
    let timer = 0;
    const observer = new MutationObserver(() => {
      requestAnimationFrame((frameTime) => {
        finish(frameTime - startedAt);
      });
    });
    const finish = (value: number | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      observer.disconnect();
      window.clearTimeout(timer);
      resolve(value);
    };
    observer.observe(element, { subtree: true, childList: true, characterData: true });
    timer = window.setTimeout(() => {
      finish(null);
    }, 5_000);
    action();
  });
}

async function measureSamples(
  count: number,
  action: (index: number) => void,
  condition: (index: number) => boolean,
): Promise<FeedbackReport> {
  const samples: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const startedAt = now();
    action(index);
    const outcome = await waitForCondition(() => condition(index), 5_000);
    if (outcome.rendered) {
      samples.push(Math.round((outcome.paintedAt - startedAt) * 100) / 100);
    }
  }
  return {
    samples,
    p95Ms: percentile(samples, 0.95),
    maxMs: percentile(samples, 1),
  };
}

async function runCore(result: BenchResult): Promise<void> {
  const element = await waitForTranscript();
  await delay(1_200);

  const steady = await replayStream({
    seconds: CONFIG.seconds,
    rate: CONFIG.rate,
    tag: 's',
    element,
  });
  result.steady = steady.report;
  result.errors.push(...steady.errors);
  const liveText = appStore.getState().live.botText;
  result.correctness = {
    storeTextComplete: liveText === steady.expectedText,
    domTextComplete: steady.report.domTextComplete,
    noLostText: steady.report.domTokens === steady.report.frames,
    noDuplicateText: steady.report.domUniqueTokens === steady.report.domTokens,
    terminalSettled: false,
  };

  if (CONFIG.burstSeconds > 0) {
    const burst = await replayStream({
      seconds: CONFIG.burstSeconds,
      rate: CONFIG.rate * CONFIG.burstFactor,
      tag: 'b',
      element,
    });
    result.burst = burst.report;
    result.errors.push(...burst.errors);
  }

  // The terminal render re-runs the full Markdown pass once; measure that frame
  // separately because it is not part of the per-batch p95 budget.
  result.terminalRenderMs = await measureNextMutation(element, () => {
    appStore.dispatch({
      type: 'live-complete',
      status: 'complete',
      text: appStore.getState().live.botText,
      error: null,
    });
  });
  result.correctness.terminalSettled = appStore.getState().live.phase === 'idle';

  result.sendFeedback = await measureSamples(
    20,
    (index) => {
      appStore.dispatch({
        type: 'live-user',
        profile: ACTIVE_PROFILE,
        text: `feedback-send-${index}`,
        at: Date.now(),
      });
    },
    (index) => (transcript()?.textContent ?? '').includes(`feedback-send-${index}`),
  );

  // Warm up two switch round-trips before sampling so lazy layout/mount work
  // does not make the first measured switch unrepresentative.
  for (let index = 0; index < 2; index += 1) {
    appStore.dispatch({
      type: 'remote-select',
      profile: index % 2 === 0 ? STATE_PROFILE : ACTIVE_PROFILE,
    });
    await nextFrame();
  }
  result.switchFeedback = await measureSamples(
    20,
    (index) => {
      appStore.dispatch({
        type: 'remote-select',
        profile: index % 2 === 0 ? STATE_PROFILE : ACTIVE_PROFILE,
      });
    },
    (index) =>
      document.querySelector(
        index % 2 === 0 ? 'section[aria-label="Bench Bot 1"]' : 'section[aria-label="Bench Bot 0"]',
      ) !== null,
  );
  appStore.dispatch({ type: 'remote-select', profile: ACTIVE_PROFILE });
  await delay(300);
}

async function runHistoryScenario(result: BenchResult): Promise<void> {
  const element = await waitForTranscript();
  appStore.dispatch({
    type: 'remote-chat',
    chat: chatFor(HISTORY_PROFILE, 'bench-stored-2', historyMessages(CONFIG.historyCount, 'deep')),
  });
  const startedAt = now();
  appStore.dispatch({ type: 'remote-select', profile: HISTORY_PROFILE });
  const target = `history deep line ${CONFIG.historyCount - 1} with a few words`;
  const outcome = await waitForCondition(
    () => (element.textContent ?? '').includes(target),
    20_000,
  );
  result.history = {
    messages: CONFIG.historyCount,
    renderMs: outcome.rendered ? Math.round((outcome.paintedAt - startedAt) * 100) / 100 : null,
    rendered: outcome.rendered,
  };
  appStore.dispatch({ type: 'remote-select', profile: ACTIVE_PROFILE });
}

export function startBench(): void {
  const bench: BenchGlobal = {
    status: 'running',
    result: null,
    error: null,
    runHistory: async () => {
      if (bench.result === null) {
        return;
      }
      await runHistoryScenario(bench.result);
      bench.status = 'complete';
    },
  };
  window.__mosbotBench = bench;

  void (async () => {
    try {
      await delay(800);
      const result: BenchResult = {
        scenario: CONFIG,
        visibility: document.visibilityState,
        userAgent: navigator.userAgent,
        steady: null,
        burst: null,
        sendFeedback: null,
        switchFeedback: null,
        terminalRenderMs: null,
        history: null,
        correctness: {
          storeTextComplete: false,
          domTextComplete: false,
          noLostText: false,
          noDuplicateText: false,
          terminalSettled: false,
        },
        errors: [],
      };
      bench.result = result;

      if (appStore.getState().connectionUi.snapshot?.connected === true) {
        result.errors.push('bench mode started from a live connection; synthetic load is invalid');
      }

      await seedCore(CONFIG.historyBase);
      await runCore(result);
      bench.status = 'core';
    } catch (error) {
      bench.status = 'error';
      bench.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    }
  })();
}
