/**
 * Coalesces streamed assistant deltas before they cross the process boundary.
 *
 * The Dashboard emits one frame per token-sized chunk (often hundreds per second).
 * Forwarding each frame individually makes every process hop, store notification
 * and React render O(frames); the integration spec requires deltas to be merged
 * per turn in a 16–32 ms window instead, with a hard cap on batch size so a burst
 * cannot grow the queue without bound.
 *
 * Ordering contract: `onFlush` receives text in arrival order, control events
 * (terminal status, requests, connection changes) flush the pending batch first,
 * and a flushed batch is never delivered twice.
 */
export interface StreamBatcherOptions {
  readonly onFlush: (text: string) => void;
  /** Coalescing window; clamped to the 16–32 ms range from the spec. */
  readonly intervalMs?: number;
  /** Flush immediately once this many deltas are pending. */
  readonly maxFrames?: number;
  /**
   * Flush threshold in UTF-16 code units. A single push larger than the
   * threshold is delivered whole (it is already one frame), never split.
   */
  readonly maxBytes?: number;
  /** Test seams. */
  readonly setTimeoutImpl?: (callback: () => void, ms: number) => unknown;
  readonly clearTimeoutImpl?: (handle: unknown) => void;
}

export interface StreamBatcher {
  push(text: string): void;
  /** Emits the pending text now (no-op when nothing is pending). */
  flush(): void;
  /** Drops pending text and cancels the timer without emitting (session switch). */
  reset(): void;
  /** Pending frame count, for diagnostics and tests. */
  pendingFrames(): number;
  /** Drops pending text and cancels the timer, for teardown. */
  dispose(): void;
}

export const STREAM_BATCH_MIN_INTERVAL_MS = 16;
export const STREAM_BATCH_MAX_INTERVAL_MS = 32;
export const STREAM_BATCH_DEFAULT_INTERVAL_MS = 24;
export const STREAM_BATCH_DEFAULT_MAX_FRAMES = 200;
export const STREAM_BATCH_DEFAULT_MAX_BYTES = 64 * 1024;

function clampInterval(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return STREAM_BATCH_DEFAULT_INTERVAL_MS;
  }
  return Math.min(
    STREAM_BATCH_MAX_INTERVAL_MS,
    Math.max(STREAM_BATCH_MIN_INTERVAL_MS, Math.round(value)),
  );
}

export function createStreamBatcher(options: StreamBatcherOptions): StreamBatcher {
  const intervalMs = clampInterval(options.intervalMs);
  const maxFrames = Math.max(1, options.maxFrames ?? STREAM_BATCH_DEFAULT_MAX_FRAMES);
  const maxBytes = Math.max(1, options.maxBytes ?? STREAM_BATCH_DEFAULT_MAX_BYTES);
  const schedule = options.setTimeoutImpl ?? ((callback, ms) => setTimeout(callback, ms));
  const cancel = options.clearTimeoutImpl ?? ((handle) => clearTimeout(handle as NodeJS.Timeout));

  let text = '';
  let frames = 0;
  let timer: unknown = null;
  let disposed = false;

  const clearTimer = (): void => {
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
  };

  const flush = (): void => {
    clearTimer();
    if (text === '') {
      return;
    }
    const pending = text;
    text = '';
    frames = 0;
    options.onFlush(pending);
  };

  const scheduleFlush = (): void => {
    if (timer !== null) {
      return;
    }
    timer = schedule(() => {
      timer = null;
      flush();
    }, intervalMs);
    (timer as { unref?: () => void }).unref?.();
  };

  return {
    push(chunk) {
      if (disposed || chunk === '') {
        return;
      }
      text += chunk;
      frames += 1;
      if (frames >= maxFrames || text.length >= maxBytes) {
        flush();
        return;
      }
      scheduleFlush();
    },
    flush() {
      if (disposed) {
        return;
      }
      flush();
    },
    reset() {
      clearTimer();
      text = '';
      frames = 0;
    },
    pendingFrames() {
      return frames;
    },
    dispose() {
      disposed = true;
      clearTimer();
      text = '';
      frames = 0;
    },
  };
}
