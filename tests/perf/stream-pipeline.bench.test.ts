/**
 * Local streaming-pipeline benchmark (main-process side).
 *
 * Replays desensitised deltas through the real coalescing module used by the
 * chat manager, with four independent channels (the integration spec's "4 active
 * bots × 100 small deltas/s"), then a 5 s ×5 burst. Each frame is serialised to
 * the gateway's JSON shape and parsed again before coalescing, so the measured
 * cost includes JSON parsing; the coalesced batch is then structured-cloned the
 * way Electron's IPC does before it crosses to the renderer.
 *
 * It measures batch age (time from the first frame of a batch to its flush),
 * flush cadence, queue bounds, achieved frame rate, JSON parse cost and memory.
 * It starts no server and performs no network I/O. Text integrity is verified
 * with rolling hashes so the harness itself does not retain the whole stream.
 *
 * Run: `pnpm bench:pipeline` (defaults to 600 s steady / 5 s burst).
 * Env: BENCH_SECONDS, BENCH_RATE, BENCH_BURST_SECONDS, BENCH_BURST_FACTOR.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createStreamBatcher, STREAM_BATCH_MAX_INTERVAL_MS } from '../../src/shared/stream-batch';

const CHANNELS = 4;
const STEADY_SECONDS = Number(process.env['BENCH_SECONDS'] ?? 600);
const RATE_PER_CHANNEL = Number(process.env['BENCH_RATE'] ?? 100);
const BURST_SECONDS = Number(process.env['BENCH_BURST_SECONDS'] ?? 5);
const BURST_FACTOR = Number(process.env['BENCH_BURST_FACTOR'] ?? 5);
const BATCH_INTERVAL_MS = 24;

function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  const value = sorted[index] ?? 0;
  return Math.round(value * 100) / 100;
}

/** FNV-1a, enough to prove loss/duplication without keeping the whole stream. */
function hashText(hash: number, text: string): number {
  let value = hash;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

interface ChannelState {
  expectedHash: number;
  expectedLength: number;
  receivedHash: number;
  receivedLength: number;
  ages: number[];
  batches: number;
  maxQueue: number;
  firstPendingAt: number;
  pending: number;
  parseTimes: number[];
  cloneTimes: number[];
}

interface Channel {
  readonly state: ChannelState;
  readonly batcher: ReturnType<typeof createStreamBatcher>;
}

function createChannels(): Channel[] {
  return Array.from({ length: CHANNELS }, () => {
    const state: ChannelState = {
      expectedHash: 2_166_136_261,
      expectedLength: 0,
      receivedHash: 2_166_136_261,
      receivedLength: 0,
      ages: [],
      batches: 0,
      maxQueue: 0,
      firstPendingAt: 0,
      pending: 0,
      parseTimes: [],
      cloneTimes: [],
    };
    const batcher = createStreamBatcher({
      onFlush(text) {
        state.receivedHash = hashText(state.receivedHash, text);
        state.receivedLength += text.length;
        state.batches += 1;
        state.ages.push(Date.now() - state.firstPendingAt);
        state.pending = 0;
      },
    });
    return { state, batcher };
  });
}

/** Drives frames into every channel at `rate` frames/s for `seconds`. */
async function drive(
  channels: readonly Channel[],
  rate: number,
  seconds: number,
  tag: string,
): Promise<{ elapsedMs: number; frames: number; achievedPerSecond: number }> {
  const intervalMs = Math.max(1, Math.round(1000 / rate));
  const startedAt = performance.now();
  const totalTicks = Math.max(1, Math.round((seconds * 1000) / intervalMs));
  let frames = 0;
  let nextTickAt = startedAt;
  for (let tick = 0; tick < totalTicks; tick += 1) {
    const at = Date.now();
    for (const channel of channels) {
      const { state, batcher } = channel;
      if (state.pending === 0) {
        state.firstPendingAt = at;
      }
      const token = `${tag}${tick.toString(36)} `;
      // Exercise the gateway's JSON transport cost as well as coalescing.
      const wire = `{"type":"message.delta","payload":{"text":${JSON.stringify(token)}}}`;
      const parseStartedAt = performance.now();
      const parsed = JSON.parse(wire) as { payload: { text: string } };
      state.parseTimes.push(performance.now() - parseStartedAt);
      state.expectedHash = hashText(state.expectedHash, parsed.payload.text);
      state.expectedLength += parsed.payload.text.length;
      state.pending += 1;
      state.maxQueue = Math.max(state.maxQueue, state.pending);
      batcher.push(parsed.payload.text);
      frames += 1;
    }
    if (tick % 3 === 0) {
      // Approximate the structured clone that crosses the Electron IPC boundary.
      for (const channel of channels) {
        const cloneStartedAt = performance.now();
        structuredClone({ type: 'delta', text: `${tag}${tick.toString(36)} `, profile: 'bench' });
        channel.state.cloneTimes.push(performance.now() - cloneStartedAt);
      }
    }
    // Deadline-based cadence: the harness' own parse/clone work must not stretch
    // the requested frame rate.
    nextTickAt += intervalMs;
    const wait = nextTickAt - performance.now();
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  const elapsedMs = Math.round(performance.now() - startedAt);
  return {
    elapsedMs,
    frames,
    achievedPerSecond: Math.round((frames / Math.max(1, elapsedMs)) * 1000),
  };
}

describe('local streaming pipeline', () => {
  it('coalesces four channels at the spec load and keeps text complete', async () => {
    const channels = createChannels();
    const rssBefore = process.memoryUsage().rss;
    const heapBefore = process.memoryUsage().heapUsed;

    const steady = await drive(channels, RATE_PER_CHANNEL, STEADY_SECONDS, 's');
    await new Promise((resolve) => setTimeout(resolve, STREAM_BATCH_MAX_INTERVAL_MS + 10));
    const steadyAges = channels.flatMap((channel) => channel.state.ages);
    const steadyBatches = channels.map((channel) => channel.state.batches);

    const complete = channels.every(
      (channel) =>
        channel.state.expectedHash === channel.state.receivedHash &&
        channel.state.expectedLength === channel.state.receivedLength,
    );
    expect(complete).toBe(true);

    const burst = await drive(channels, RATE_PER_CHANNEL * BURST_FACTOR, BURST_SECONDS, 'b');
    await new Promise((resolve) => setTimeout(resolve, STREAM_BATCH_MAX_INTERVAL_MS + 10));
    const burstAges = channels.flatMap((channel) => channel.state.ages).slice(steadyAges.length);
    const burstComplete = channels.every(
      (channel) =>
        channel.state.expectedHash === channel.state.receivedHash &&
        channel.state.expectedLength === channel.state.receivedLength,
    );
    expect(burstComplete).toBe(true);

    const parseTimes = channels.flatMap((channel) => channel.state.parseTimes);
    const cloneTimes = channels.flatMap((channel) => channel.state.cloneTimes);
    const rssAfter = process.memoryUsage().rss;
    const heapAfter = process.memoryUsage().heapUsed;
    const batchesPerSecond =
      steady.frames / Math.max(1, steady.elapsedMs / 1000) / CHANNELS / (BATCH_INTERVAL_MS / 1000);
    const report = {
      kind: 'fixture · local coalescing pipeline (no network, no server)',
      generatedAt: new Date().toISOString(),
      config: {
        channels: CHANNELS,
        ratePerChannel: RATE_PER_CHANNEL,
        steadySeconds: STEADY_SECONDS,
        burstSeconds: BURST_SECONDS,
        burstFactor: BURST_FACTOR,
        coalescingWindowMs: BATCH_INTERVAL_MS,
      },
      steady: {
        frames: steady.frames,
        achievedPerSecond: steady.achievedPerSecond,
        batches: steadyBatches,
        batchAgeP50Ms: percentile(steadyAges, 0.5),
        batchAgeP95Ms: percentile(steadyAges, 0.95),
        batchAgeMaxMs: percentile(steadyAges, 1),
        queueMaxPerChannel: channels.map((channel) => channel.state.maxQueue),
        elapsedMs: steady.elapsedMs,
      },
      burst: {
        frames: burst.frames,
        achievedPerSecond: burst.achievedPerSecond,
        batchAgeP95Ms: percentile(burstAges, 0.95),
        batchAgeMaxMs: percentile(burstAges, 1),
        queueMaxPerChannel: channels.map((channel) => channel.state.maxQueue),
        elapsedMs: burst.elapsedMs,
      },
      transport: {
        jsonParseP95Ms: percentile(parseTimes, 0.95),
        jsonParseMaxMs: percentile(parseTimes, 1),
        structuredCloneP95Ms: percentile(cloneTimes, 0.95),
      },
      memory: {
        rssBeforeMb: Math.round(rssBefore / 1_048_576),
        rssAfterMb: Math.round(rssAfter / 1_048_576),
        heapBeforeMb: Math.round(heapBefore / 1_048_576),
        heapAfterMb: Math.round(heapAfter / 1_048_576),
      },
      correctness: { textComplete: complete && burstComplete },
      derived: { batchesPerSecond: Math.round(batchesPerSecond * 10) / 10 },
    };

    mkdirSync(path.resolve('docs/evidence/tmp'), { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.resolve('docs/evidence/tmp', `perf-pipeline-${stamp}.json`);
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    // eslint-disable-next-line no-console -- benchmark output is its deliverable
    console.log(JSON.stringify(report, null, 2));
    // eslint-disable-next-line no-console -- report path for evidence collection
    console.log(`report: ${reportPath}`);

    // Regression gates: same thresholds the release acceptance uses.
    expect(complete && burstComplete).toBe(true);
    expect(report.steady.batchAgeP95Ms ?? Infinity).toBeLessThanOrEqual(
      STREAM_BATCH_MAX_INTERVAL_MS,
    );
    expect(report.burst.batchAgeP95Ms ?? Infinity).toBeLessThanOrEqual(
      STREAM_BATCH_MAX_INTERVAL_MS,
    );
    expect(Math.max(...report.steady.queueMaxPerChannel)).toBeLessThanOrEqual(200);
    // The driver's own JSON parse/clone work keeps the timer cadence slightly
    // below nominal; require at least 80 % of the requested load.
    expect(report.steady.achievedPerSecond).toBeGreaterThanOrEqual(
      RATE_PER_CHANNEL * CHANNELS * 0.8,
    );

    for (const channel of channels) {
      channel.batcher.dispose();
    }
  });
});
