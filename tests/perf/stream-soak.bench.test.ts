/**
 * 60-minute reconnect/idle mixed soak for the streaming pipeline (main-process side).
 *
 * The integration spec asks for a 60-minute mixed loop of streaming, idle time and
 * reconnects while watching memory, queue bounds, batch age and recovery counts.
 * This benchmark replays desensitised frames through the real coalescing module,
 * resets the batcher and replays a "missed events" burst on every reconnect, and
 * samples process memory during the whole window. It starts no server and performs
 * no network I/O.
 *
 * Run (defaults to one hour):
 *   BENCH_SOAK_SECONDS=3600 pnpm bench:soak
 * Quick validation:
 *   BENCH_SOAK_SECONDS=60 pnpm bench:soak
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createStreamBatcher, STREAM_BATCH_MAX_INTERVAL_MS } from '../../src/shared/stream-batch';

const SOAK_SECONDS = Number(process.env['BENCH_SOAK_SECONDS'] ?? 0);
const CHANNELS = 4;
const RATE_PER_CHANNEL = 100;
const BATCH_INTERVAL_MS = 24;
const CYCLE_SECONDS = SOAK_SECONDS >= 180 ? 90 : Math.max(10, Math.round(SOAK_SECONDS / 2));
const STREAM_SECONDS = Math.max(3, Math.round(CYCLE_SECONDS / 3));
const IDLE_SECONDS = Math.max(2, Math.round(CYCLE_SECONDS / 3));
const RECONNECT_SECONDS = Math.max(2, CYCLE_SECONDS - STREAM_SECONDS - IDLE_SECONDS);

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

function hashText(hash: number, text: string): number {
  let value = hash;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

interface Channel {
  readonly batcher: ReturnType<typeof createStreamBatcher>;
  expectedHash: number;
  receivedHash: number;
  expectedLength: number;
  receivedLength: number;
  pending: number;
  firstPendingAt: number;
  ages: number[];
  maxQueue: number;
}

function createChannels(): Channel[] {
  return Array.from({ length: CHANNELS }, () => {
    const channel: Channel = {
      batcher: createStreamBatcher({
        onFlush(text) {
          channel.receivedHash = hashText(channel.receivedHash, text);
          channel.receivedLength += text.length;
          channel.ages.push(Date.now() - channel.firstPendingAt);
          channel.pending = 0;
        },
      }),
      expectedHash: 2_166_136_261,
      receivedHash: 2_166_136_261,
      expectedLength: 0,
      receivedLength: 0,
      pending: 0,
      firstPendingAt: 0,
      ages: [],
      maxQueue: 0,
    };
    return channel;
  });
}

function resetEpoch(channels: readonly Channel[]): void {
  for (const channel of channels) {
    channel.batcher.reset();
    channel.expectedHash = 2_166_136_261;
    channel.receivedHash = 2_166_136_261;
    channel.expectedLength = 0;
    channel.receivedLength = 0;
    channel.pending = 0;
    channel.firstPendingAt = 0;
    channel.maxQueue = 0;
  }
}

async function driveFrames(
  channels: readonly Channel[],
  seconds: number,
  tag: string,
): Promise<number> {
  const intervalMs = Math.max(4, Math.round(1000 / RATE_PER_CHANNEL));
  const framesPerTick = Math.max(1, Math.round((RATE_PER_CHANNEL * intervalMs) / 1000));
  const startedAt = performance.now();
  const totalTicks = Math.max(1, Math.round((seconds * 1000) / intervalMs));
  let nextTickAt = startedAt;
  let frames = 0;
  for (let tick = 0; tick < totalTicks; tick += 1) {
    const now = Date.now();
    for (const channel of channels) {
      for (let index = 0; index < framesPerTick; index += 1) {
        const text = `${tag}${tick.toString(36)}-${index} `;
        if (channel.pending === 0) {
          channel.firstPendingAt = now;
        }
        channel.expectedHash = hashText(channel.expectedHash, text);
        channel.expectedLength += text.length;
        channel.pending += 1;
        channel.maxQueue = Math.max(channel.maxQueue, channel.pending);
        channel.batcher.push(text);
        frames += 1;
      }
    }
    nextTickAt += intervalMs;
    const wait = nextTickAt - performance.now();
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  return frames;
}

async function idle(seconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function sleepMs(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe.skipIf(SOAK_SECONDS <= 0)('streaming pipeline reconnect/idle soak', () => {
  it(`stays bounded for ${SOAK_SECONDS}s of stream, idle and reconnect cycles`, async () => {
    const channels = createChannels();
    const startedAt = Date.now();
    const cyclesTarget = Math.max(1, Math.floor(SOAK_SECONDS / CYCLE_SECONDS));
    const memorySamples: Array<{ atMs: number; rssMb: number; heapMb: number }> = [];
    const cycleReports: Array<{
      cycle: number;
      batchAgeP95Ms: number | null;
      queueMax: number;
      textComplete: boolean;
    }> = [];
    let reconnects = 0;
    let frames = 0;

    const memoryTimer = setInterval(() => {
      const usage = process.memoryUsage();
      memorySamples.push({
        atMs: Date.now() - startedAt,
        rssMb: Math.round((usage.rss / 1_048_576) * 10) / 10,
        heapMb: Math.round((usage.heapUsed / 1_048_576) * 10) / 10,
      });
    }, 5_000);

    try {
      for (let cycle = 0; cycle < cyclesTarget; cycle += 1) {
        // Steady streaming segment.
        frames += await driveFrames(channels, STREAM_SECONDS, `c${cycle}s`);
        // Idle segment: nothing arrives, the queue must drain.
        await idle(IDLE_SECONDS);
        const streamAges = channels.flatMap((channel) => channel.ages);
        const streamQueueMax = Math.max(...channels.map((channel) => channel.maxQueue));
        const streamComplete = channels.every(
          (channel) =>
            channel.expectedHash === channel.receivedHash &&
            channel.expectedLength === channel.receivedLength &&
            channel.pending === 0,
        );

        // Reconnect: the socket dropped, the batcher is reset and the missed
        // events arrive as a replay burst before streaming resumes.
        resetEpoch(channels);
        reconnects += 1;
        frames += await driveFrames(channels, RECONNECT_SECONDS, `c${cycle}r`);
        await sleepMs(Math.max(1, BATCH_INTERVAL_MS * 2));

        const reconnectAges = channels.flatMap((channel) => channel.ages);
        const reconnectQueueMax = Math.max(...channels.map((channel) => channel.maxQueue));
        const reconnectComplete = channels.every(
          (channel) =>
            channel.expectedHash === channel.receivedHash &&
            channel.expectedLength === channel.receivedLength &&
            channel.pending === 0,
        );
        cycleReports.push({
          cycle,
          batchAgeP95Ms: percentile([...streamAges, ...reconnectAges], 0.95),
          queueMax: Math.max(streamQueueMax, reconnectQueueMax),
          textComplete: streamComplete && reconnectComplete,
        });
        for (const channel of channels) {
          channel.ages = [];
        }
      }
    } finally {
      clearInterval(memoryTimer);
    }
    const elapsedMs = Date.now() - startedAt;
    const allCyclesComplete = cycleReports.every((report) => report.textComplete);
    const worstBatchAge = Math.max(
      ...cycleReports.map((report) => report.batchAgeP95Ms ?? Infinity),
    );
    const rssValues = memorySamples.map((sample) => sample.rssMb);
    const heapValues = memorySamples.map((sample) => sample.heapMb);
    const third = Math.max(1, Math.floor(memorySamples.length / 3));
    const startRss = rssValues[0] ?? 0;
    const endRss = rssValues[rssValues.length - 1] ?? 0;
    const earlyAverage =
      rssValues.slice(0, third).reduce((sum, value) => sum + value, 0) / Math.max(1, third);
    const lateAverage =
      rssValues.slice(-third).reduce((sum, value) => sum + value, 0) / Math.max(1, third);
    const report = {
      kind: 'fixture · local streaming reconnect/idle soak (no network, no server)',
      generatedAt: new Date().toISOString(),
      config: {
        channels: CHANNELS,
        ratePerChannel: RATE_PER_CHANNEL,
        soakSeconds: SOAK_SECONDS,
        cycleSeconds: CYCLE_SECONDS,
        streamSeconds: STREAM_SECONDS,
        idleSeconds: IDLE_SECONDS,
        reconnectSeconds: RECONNECT_SECONDS,
      },
      result: {
        elapsedMs,
        cycles: cycleReports.length,
        reconnects,
        frames,
        worstBatchAgeP95Ms: Number.isFinite(worstBatchAge) ? worstBatchAge : null,
        allCyclesComplete,
        queueMax: Math.max(...cycleReports.map((entry) => entry.queueMax)),
      },
      memory: {
        samples: memorySamples.length,
        startRssMb: startRss,
        endRssMb: endRss,
        earlyAverageRssMb: Math.round(earlyAverage * 10) / 10,
        lateAverageRssMb: Math.round(lateAverage * 10) / 10,
        peakHeapMb: Math.max(...heapValues, 0),
        peakRssMb: Math.max(...rssValues, 0),
        growthMb: Math.round((endRss - startRss) * 10) / 10,
      },
      cycles: cycleReports,
    };

    mkdirSync(path.resolve('docs/evidence/tmp'), { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.resolve('docs/evidence/tmp', `perf-soak-${stamp}.json`);
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    // eslint-disable-next-line no-console -- benchmark output is its deliverable
    console.log(JSON.stringify(report, null, 2));
    // eslint-disable-next-line no-console -- report path for evidence collection
    console.log(`report: ${reportPath}`);

    expect(report.result.cycles).toBeGreaterThanOrEqual(cyclesTarget);
    expect(report.result.allCyclesComplete).toBe(true);
    expect(report.result.worstBatchAgeP95Ms ?? Infinity).toBeLessThanOrEqual(
      STREAM_BATCH_MAX_INTERVAL_MS,
    );
    expect(report.result.queueMax).toBeLessThanOrEqual(200);
    // No unbounded growth: the late RSS average may not exceed the early one by
    // more than 64 MB or 50 % (whichever is larger) over the whole window.
    expect(lateAverage).toBeLessThanOrEqual(Math.max(earlyAverage + 64, earlyAverage * 1.5));
  }, 3_900_000);
});
