import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createStreamBatcher,
  STREAM_BATCH_DEFAULT_INTERVAL_MS,
  STREAM_BATCH_MAX_INTERVAL_MS,
  STREAM_BATCH_MIN_INTERVAL_MS,
} from '../../src/shared/stream-batch';

afterEach(() => {
  vi.useRealTimers();
});

function collector(): { batches: string[]; onFlush: (text: string) => void } {
  const batches: string[] = [];
  return {
    batches,
    onFlush: (text) => {
      batches.push(text);
    },
  };
}

describe('stream batcher', () => {
  it('merges deltas inside one window into a single ordered batch', () => {
    vi.useFakeTimers();
    const { batches, onFlush } = collector();
    const batcher = createStreamBatcher({ onFlush });

    batcher.push('Hel');
    batcher.push('lo');
    batcher.push(' world');
    expect(batches).toEqual([]);
    expect(batcher.pendingFrames()).toBe(3);

    vi.advanceTimersByTime(STREAM_BATCH_DEFAULT_INTERVAL_MS);
    expect(batches).toEqual(['Hello world']);
    expect(batcher.pendingFrames()).toBe(0);

    // A second window is a separate batch; text is never repeated.
    batcher.push('!');
    vi.advanceTimersByTime(STREAM_BATCH_DEFAULT_INTERVAL_MS);
    expect(batches).toEqual(['Hello world', '!']);
    batcher.dispose();
  });

  it('flushes immediately at the frame cap and keeps arrival order', () => {
    vi.useFakeTimers();
    const { batches, onFlush } = collector();
    const batcher = createStreamBatcher({ onFlush, maxFrames: 4 });
    for (const chunk of ['a', 'b', 'c', 'd', 'e']) {
      batcher.push(chunk);
    }
    expect(batches).toEqual(['abcd']);
    vi.advanceTimersByTime(STREAM_BATCH_DEFAULT_INTERVAL_MS);
    expect(batches).toEqual(['abcd', 'e']);
    batcher.dispose();
  });

  it('flushes immediately at the byte cap', () => {
    vi.useFakeTimers();
    const { batches, onFlush } = collector();
    const batcher = createStreamBatcher({ onFlush, maxBytes: 8 });
    batcher.push('1234');
    expect(batches).toEqual([]);
    batcher.push('5678');
    expect(batches).toEqual(['12345678']);
    batcher.dispose();
  });

  it('flushes on demand and never delivers a batch twice', () => {
    vi.useFakeTimers();
    const { batches, onFlush } = collector();
    const batcher = createStreamBatcher({ onFlush });
    batcher.push('partial');
    batcher.flush();
    batcher.flush();
    vi.advanceTimersByTime(STREAM_BATCH_DEFAULT_INTERVAL_MS);
    expect(batches).toEqual(['partial']);
    batcher.dispose();
  });

  it('ignores empty pushes', () => {
    vi.useFakeTimers();
    const { batches, onFlush } = collector();
    const batcher = createStreamBatcher({ onFlush });
    batcher.push('');
    vi.advanceTimersByTime(STREAM_BATCH_MAX_INTERVAL_MS);
    expect(batches).toEqual([]);
    expect(batcher.pendingFrames()).toBe(0);
    batcher.dispose();
  });

  it('clamps the coalescing window into the required 16–32 ms range', () => {
    vi.useFakeTimers();
    const fast = collector();
    const fastBatcher = createStreamBatcher({ onFlush: fast.onFlush, intervalMs: 1 });
    fastBatcher.push('a');
    vi.advanceTimersByTime(STREAM_BATCH_MIN_INTERVAL_MS - 1);
    expect(fast.batches).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(fast.batches).toEqual(['a']);
    fastBatcher.dispose();

    const slow = collector();
    const slowBatcher = createStreamBatcher({ onFlush: slow.onFlush, intervalMs: 10_000 });
    slowBatcher.push('b');
    vi.advanceTimersByTime(STREAM_BATCH_MAX_INTERVAL_MS - 1);
    expect(slow.batches).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(slow.batches).toEqual(['b']);
    slowBatcher.dispose();
  });

  it('drops pending text without emitting on reset', () => {
    vi.useFakeTimers();
    const { batches, onFlush } = collector();
    const batcher = createStreamBatcher({ onFlush });
    batcher.push('old session');
    batcher.reset();
    expect(batcher.pendingFrames()).toBe(0);
    vi.advanceTimersByTime(STREAM_BATCH_MAX_INTERVAL_MS);
    expect(batches).toEqual([]);
    batcher.push('new session');
    vi.advanceTimersByTime(STREAM_BATCH_DEFAULT_INTERVAL_MS);
    expect(batches).toEqual(['new session']);
    batcher.dispose();
  });

  it('drops pending text on dispose and cancels the timer', () => {
    vi.useFakeTimers();
    const { batches, onFlush } = collector();
    const batcher = createStreamBatcher({ onFlush });
    batcher.push('dropped');
    batcher.dispose();
    batcher.push('ignored-after-dispose');
    vi.advanceTimersByTime(STREAM_BATCH_MAX_INTERVAL_MS);
    expect(batches).toEqual([]);
  });
});
