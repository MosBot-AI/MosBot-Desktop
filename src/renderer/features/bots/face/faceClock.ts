/**
 * One shared requestAnimationFrame clock for Bot faces, ported from the MosBot
 * mobile client (`entry/src/main/ets/state/bot/FaceClock.ets`, MosBot @
 * 3c118c4, MIT). Subscribers get `t`, seconds since the clock's first frame,
 * at most `fps` times a second by frame skipping; the clock runs only while it
 * has subscribers, and requestAnimationFrame pauses itself in a hidden window.
 */

type FaceFrameCallback = (seconds: number) => void;

interface ClockSubscriber {
  readonly callback: FaceFrameCallback;
  readonly fps: number;
  lastDelivered: number;
}

const FULL_RATE_SUBSCRIBERS = 6;
const CAPPED_FPS = 15;
/** A frame may arrive this fraction of an interval early and still count, so 60 fps survives vsync jitter. */
const FRAME_SLACK = 0.9;

const subscribers: ClockSubscriber[] = [];
let handle: number | null = null;
let origin = 0;
let lastT = 0;

function onFrame(timestamp: number): void {
  if (handle === null) {
    return;
  }
  handle = requestAnimationFrame(onFrame);
  if (origin === 0) {
    origin = timestamp;
  }
  const t = Math.max(lastT, (timestamp - origin) / 1000);
  lastT = t;
  const list = subscribers.slice();
  for (let index = 0; index < list.length; index += 1) {
    const subscriber = list[index];
    if (subscriber === undefined) {
      continue;
    }
    const fps =
      index < FULL_RATE_SUBSCRIBERS ? subscriber.fps : Math.min(subscriber.fps, CAPPED_FPS);
    if (subscriber.lastDelivered >= 0 && t - subscriber.lastDelivered < FRAME_SLACK / fps) {
      continue;
    }
    subscriber.lastDelivered = t;
    subscriber.callback(t);
  }
}

function start(): void {
  if (handle !== null) {
    return;
  }
  handle = requestAnimationFrame(onFrame);
}

function stop(): void {
  if (handle === null) {
    return;
  }
  cancelAnimationFrame(handle);
  handle = null;
  origin = 0;
  lastT = 0;
}

/** Adds a subscriber and starts the clock; the returned function removes it and stops the clock when it was the last. */
export function subscribeFaceClock(fps: number, callback: FaceFrameCallback): () => void {
  const subscriber: ClockSubscriber = {
    callback,
    fps: Math.max(1, Math.min(60, fps)),
    lastDelivered: -1,
  };
  subscribers.push(subscriber);
  start();
  return (): void => {
    const index = subscribers.indexOf(subscriber);
    if (index >= 0) {
      subscribers.splice(index, 1);
    }
    if (subscribers.length === 0) {
      stop();
    }
  };
}
