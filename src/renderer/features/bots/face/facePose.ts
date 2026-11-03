/**
 * Bot face motion per mood, ported from the MosBot mobile client
 * (`entry/src/main/ets/state/bot/BotFacePose.ets`, MosBot @ 3c118c4, MIT).
 * Pure and time-injected: `t` is seconds and `seed` in [0, 1) offsets phases
 * and random events so two faces never move in step. Geometry is in the 40×40
 * view box of `faceShapes.ts`.
 */

import type { FaceMood } from '../../../../shared/face';
import { ellipsePath, pathNumber, roundedRectPath } from './faceShapes';

export type EyeShape = 'dot' | 'bar' | 'happy' | 'cross' | 'closed';

export interface FacePose {
  /** Body transform; rotation in degrees about the body's bottom center (20, 35). */
  bodyScaleX: number;
  bodyScaleY: number;
  bodyRotate: number;
  /** View-box units. */
  bodyTranslateY: number;
  /** Pupil offset in view-box units, each within ±3. */
  gazeX: number;
  gazeY: number;
  /** `eyeOpen` 0..1 (blink), `eyeScale` about 1. */
  eyeShape: EyeShape;
  eyeOpen: number;
  eyeScale: number;
  /** 0 shows the face, 1 the three typing dots. */
  typing: number;
  /** Three typing-dot scales, 0.7..1.0. */
  dots: readonly number[];
  /** 0..1 each. */
  desaturate: number;
  badgePulse: number;
  glow: number;
}

/**
 * Eye geometry in view-box units. `left`/`right` are filled (dot, bar) or
 * stroked (happy, cross, closed) with `strokeWidth`; `dots` is filled and empty
 * when absent.
 */
export interface FaceEyes {
  readonly left: string;
  readonly right: string;
  readonly strokeWidth: number;
  readonly filled: boolean;
  readonly dots: string;
}

export const POSE_BLEND_MS = 400;

const TAU = Math.PI * 2;
const LEFT_EYE_X = 15;
const RIGHT_EYE_X = 25;
const EYE_Y = 20;
const STROKE_WIDTH = 1.6;
const BLINK_CURSOR_LIMIT = 64;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function lerp(from: number, to: number, k: number): number {
  return from + (to - from) * k;
}

function smoothstep(value: number): number {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
}

/** A stateless hash of (seed, index, salt) to [0, 1). */
function unitHash(seed: number, index: number, salt: number): number {
  let x =
    (Math.floor(clamp01(seed) * 4294967295) ^
      Math.imul(index + 1, 0x9e3779b1) ^
      Math.imul(salt + 1, 0x85ebca77)) >>>
    0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/**
 * 0..1 envelope of one seeded event per `slot` seconds: it starts `[0, jitter]`
 * into the slot, eases in over `ramp`, holds `hold` and eases out. Consecutive
 * starts are therefore `slot ± jitter` apart.
 */
function slotEvent(
  t: number,
  seed: number,
  salt: number,
  slot: number,
  jitter: number,
  ramp: number,
  hold: number,
): number {
  if (t < 0) {
    return 0;
  }
  const index = Math.floor(t / slot);
  const elapsed = t - index * slot - unitHash(seed, index, salt) * jitter;
  if (elapsed < 0 || elapsed > ramp * 2 + hold) {
    return 0;
  }
  if (elapsed < ramp) {
    return smoothstep(elapsed / ramp);
  }
  if (elapsed < ramp + hold) {
    return 1;
  }
  return smoothstep((ramp * 2 + hold - elapsed) / ramp);
}

function slotSign(t: number, seed: number, salt: number, slot: number): number {
  return unitHash(seed, Math.floor(Math.max(0, t) / slot), salt) < 0.5 ? -1 : 1;
}

interface BlinkCursor {
  index: number;
  start: number;
}

const blinkCursors = new Map<string, BlinkCursor>();

function blinkGap(seed: number, index: number, minGap: number, maxGap: number): number {
  return minGap + (maxGap - minGap) * unitHash(seed, index, 11);
}

/**
 * Eye openness for a seeded blink sequence: blink `i + 1` starts a uniform
 * `[minGap, maxGap]` seconds after blink `i` (the first within `maxGap` of 0);
 * during `closeSeconds` the eye closes and reopens (1 → 0 → 1), otherwise 1.
 * Deterministic for any `t`; a per-sequence cursor only makes increasing `t`
 * cheap.
 */
export function blinkOpen(
  t: number,
  seed: number,
  minGap: number,
  maxGap: number,
  closeSeconds: number,
): number {
  if (t < 0 || closeSeconds <= 0 || maxGap <= 0) {
    return 1;
  }
  const low = Math.max(0.05, Math.min(minGap, maxGap));
  const high = Math.max(low, maxGap);
  const key = seed + '|' + low + '|' + high;
  const first = high * unitHash(seed, 0, 11);
  let cursor = blinkCursors.get(key);
  if (cursor === undefined || t < cursor.start) {
    if (blinkCursors.size >= BLINK_CURSOR_LIMIT) {
      blinkCursors.clear();
    }
    cursor = { index: 0, start: first };
    blinkCursors.set(key, cursor);
  }
  if (t < cursor.start) {
    return 1;
  }
  let next = cursor.start + blinkGap(seed, cursor.index + 1, low, high);
  while (next <= t) {
    cursor.index += 1;
    cursor.start = next;
    next = cursor.start + blinkGap(seed, cursor.index + 1, low, high);
  }
  const elapsed = t - cursor.start;
  if (elapsed >= closeSeconds) {
    return 1;
  }
  return Math.abs(1 - (2 * elapsed) / closeSeconds);
}

function neutralPose(): FacePose {
  return {
    bodyScaleX: 1,
    bodyScaleY: 1,
    bodyRotate: 0,
    bodyTranslateY: 0,
    gazeX: 0,
    gazeY: 0,
    eyeShape: 'dot',
    eyeOpen: 1,
    eyeScale: 1,
    typing: 0,
    dots: [1, 1, 1],
    desaturate: 0,
    badgePulse: 1,
    glow: 0,
  };
}

/** The pose of `mood` at `t`. `done` and `oops` are one-shots: pass `t` from the mood's start. */
export function facePose(mood: FaceMood, t: number, seed: number): FacePose {
  const pose = neutralPose();
  const phase = seed * TAU;
  switch (mood) {
    case 'listening':
      pose.eyeScale = 1.08;
      pose.gazeX = 1.5;
      pose.gazeY = 2;
      pose.bodyRotate = 2;
      pose.eyeOpen = blinkOpen(t, seed, 5.6, 10.4, 0.12);
      break;
    case 'thinking':
      pose.gazeX = 1.6 * Math.sin((TAU * t) / 9 + phase);
      pose.gazeY = -2.2;
      pose.bodyRotate = 8 * Math.sin((TAU * t) / 13 + phase * 1.7);
      pose.eyeOpen = blinkOpen(t, seed, 1.45, 1.45, 0.12);
      break;
    case 'typing': {
      pose.typing = 1;
      const dots: number[] = [];
      for (let index = 0; index < 3; index += 1) {
        dots.push(0.85 + 0.15 * Math.sin(TAU * (t / 1.2 - 0.23 * index) + phase));
      }
      pose.dots = dots;
      break;
    }
    case 'working':
    case 'screen': {
      const amplitude = mood === 'working' ? 0.05 : 0.025;
      pose.eyeShape = 'bar';
      pose.bodyScaleY = 0.99 + amplitude * Math.sin((TAU * t) / 0.9 + phase);
      pose.bodyScaleX = 2 - pose.bodyScaleY;
      pose.eyeOpen = blinkOpen(t, seed, 3, 5, 0.12);
      if (mood === 'working') {
        pose.gazeX = 2 * Math.sin((TAU * t) / 2.4 + phase);
        pose.gazeY = 1.5 * slotEvent(t, seed, 2, 6.5, 1.5, 0.15, 0.3);
      } else {
        pose.gazeX = 1.6;
        pose.gazeY = 1.6;
        pose.glow = 0.6 + 0.4 * Math.sin((TAU * t) / 2.4 + phase);
      }
      break;
    }
    case 'waiting':
      pose.eyeScale = 1.12;
      pose.gazeY = -0.8;
      pose.bodyTranslateY = 1.5 * Math.sin((TAU * t) / 1.6 + phase);
      pose.badgePulse = 0.5 + 0.5 * Math.sin((TAU * t) / 1.6 + phase);
      pose.eyeOpen = blinkOpen(t, seed, 2.8, 5.2, 0.12);
      break;
    case 'watching':
      pose.gazeX = 0.8;
      pose.gazeY = 0.8;
      pose.eyeOpen = blinkOpen(t, seed, 2.8, 5.2, 0.12);
      break;
    case 'done': {
      // One-shots settle at their last frame instead of looping when a host holds the mood longer.
      const u = Math.min(Math.max(t, 0), 0.7);
      pose.eyeShape = 'happy';
      pose.bodyTranslateY = -3 * Math.exp(-6 * u) * Math.cos((3 * Math.PI * u) / 0.7);
      break;
    }
    case 'oops': {
      const u = Math.min(Math.max(t, 0), 0.9);
      pose.eyeShape = 'cross';
      // Three shakes that settle, so a blend from a thinking tilt never steps more than 1.5° a frame.
      pose.bodyRotate = 4 * Math.sin((TAU * u) / 0.3) * (1 - u / 0.9);
      break;
    }
    case 'sleep': {
      const breath = 0.99 + 0.01 * Math.sin((TAU * t) / 4 + phase);
      pose.eyeShape = 'closed';
      pose.bodyScaleX = breath;
      pose.bodyScaleY = breath;
      pose.desaturate = 0.4;
      break;
    }
    default: {
      const glance = slotEvent(t, seed, 1, 8, 2, 0.25, 1.2);
      pose.gazeX = 2 * slotSign(t, seed, 3, 8) * glance;
      pose.bodyRotate = Math.sin((TAU * t) / 23 + phase);
      pose.eyeOpen = blinkOpen(t, seed, 2.8, 5.2, 0.12);
      break;
    }
  }
  return pose;
}

/** The reduce-motion frame for `mood`: the same eyes and offsets with no motion and open eyes. */
export function staticPose(mood: FaceMood): FacePose {
  const pose = neutralPose();
  switch (mood) {
    case 'listening':
      pose.eyeScale = 1.08;
      pose.gazeX = 1.5;
      pose.gazeY = 2;
      pose.bodyRotate = 2;
      break;
    case 'thinking':
      pose.gazeY = -2.2;
      pose.bodyRotate = 6;
      break;
    case 'typing':
      pose.typing = 1;
      break;
    case 'working':
      pose.eyeShape = 'bar';
      break;
    case 'screen':
      pose.eyeShape = 'bar';
      pose.gazeX = 1.6;
      pose.gazeY = 1.6;
      pose.glow = 0.6;
      break;
    case 'waiting':
      pose.eyeScale = 1.12;
      pose.gazeY = -0.8;
      break;
    case 'watching':
      pose.gazeX = 0.8;
      pose.gazeY = 0.8;
      break;
    case 'done':
      pose.eyeShape = 'happy';
      break;
    case 'oops':
      pose.eyeShape = 'cross';
      break;
    case 'sleep':
      pose.eyeShape = 'closed';
      pose.desaturate = 0.4;
      break;
    default:
      break;
  }
  return pose;
}

export function easeOutCubic(k: number): number {
  const x = 1 - clamp01(k);
  return 1 - x * x * x;
}

/**
 * Interpolates two poses at `k` (0..1, already eased). When the eye shape
 * changes, the eyes squeeze shut at the midpoint and open as the new shape.
 */
export function blendPose(from: FacePose, to: FacePose, k: number): FacePose {
  const mix = clamp01(k);
  const swap = from.eyeShape !== to.eyeShape;
  const dots: number[] = [];
  for (let index = 0; index < 3; index += 1) {
    dots.push(lerp(from.dots[index] ?? 1, to.dots[index] ?? 1, mix));
  }
  return {
    bodyScaleX: lerp(from.bodyScaleX, to.bodyScaleX, mix),
    bodyScaleY: lerp(from.bodyScaleY, to.bodyScaleY, mix),
    bodyRotate: lerp(from.bodyRotate, to.bodyRotate, mix),
    bodyTranslateY: lerp(from.bodyTranslateY, to.bodyTranslateY, mix),
    gazeX: lerp(from.gazeX, to.gazeX, mix),
    gazeY: lerp(from.gazeY, to.gazeY, mix),
    eyeShape: swap && mix < 0.5 ? from.eyeShape : to.eyeShape,
    eyeOpen: lerp(from.eyeOpen, to.eyeOpen, mix) * (swap ? Math.abs(1 - 2 * mix) : 1),
    eyeScale: lerp(from.eyeScale, to.eyeScale, mix),
    typing: lerp(from.typing, to.typing, mix),
    dots,
    desaturate: lerp(from.desaturate, to.desaturate, mix),
    badgePulse: lerp(from.badgePulse, to.badgePulse, mix),
    glow: lerp(from.glow, to.glow, mix),
  };
}

function happyPath(cx: number, cy: number, scale: number, open: number): string {
  const half = 2.2 * scale;
  const rise = 1.1 * scale * open;
  const control = cy + rise - (4 * rise * 2) / 3;
  return (
    'M' +
    pathNumber(cx - half) +
    ' ' +
    pathNumber(cy + rise) +
    ' C' +
    pathNumber(cx - half / 2) +
    ' ' +
    pathNumber(control) +
    ' ' +
    pathNumber(cx + half / 2) +
    ' ' +
    pathNumber(control) +
    ' ' +
    pathNumber(cx + half) +
    ' ' +
    pathNumber(cy + rise)
  );
}

/** `pointRight` draws ">", otherwise "<". */
function chevronPath(
  cx: number,
  cy: number,
  scale: number,
  open: number,
  pointRight: boolean,
): string {
  const half = 1.6 * scale;
  const rise = 1.8 * scale * open;
  const tip = pointRight ? cx + half : cx - half;
  const back = pointRight ? cx - half : cx + half;
  return (
    'M' +
    pathNumber(back) +
    ' ' +
    pathNumber(cy - rise) +
    ' L' +
    pathNumber(tip) +
    ' ' +
    pathNumber(cy) +
    ' L' +
    pathNumber(back) +
    ' ' +
    pathNumber(cy + rise)
  );
}

function closedPath(cx: number, cy: number, scale: number): string {
  const half = 2.25 * scale;
  return (
    'M' +
    pathNumber(cx - half) +
    ' ' +
    pathNumber(cy + 0.5) +
    ' L' +
    pathNumber(cx + half) +
    ' ' +
    pathNumber(cy + 0.5)
  );
}

function typingDots(pose: FacePose): string {
  const amount = clamp01(pose.typing);
  if (amount < 0.01) {
    return '';
  }
  const offsets: readonly number[] = [-11, 0, 11];
  const radii: readonly number[] = [4, 5, 4];
  const parts: string[] = [];
  for (let index = 0; index < 3; index += 1) {
    const radius = (radii[index] ?? 4) * (pose.dots[index] ?? 1) * amount;
    parts.push(ellipsePath(20 + (offsets[index] ?? 0) * amount, 21, radius, radius));
  }
  return parts.join(' ');
}

/**
 * Eye and typing-dot paths for a pose; eye centers are (15, 20) and (25, 20)
 * plus the gaze. Eyes are plain solid shapes: an inner highlight read as an
 * iris and made the face look uncanny (mobile maintainer review, 2026-10-28).
 */
export function eyeGeometry(pose: FacePose): FaceEyes {
  const open = clamp01(pose.eyeOpen);
  const scale = pose.eyeScale;
  const lx = LEFT_EYE_X + pose.gazeX;
  const rx = RIGHT_EYE_X + pose.gazeX;
  const cy = EYE_Y + pose.gazeY;
  const dots = typingDots(pose);
  if (pose.eyeShape === 'dot') {
    const radius = 2.6 * scale;
    const vertical = Math.max(0.15, radius * open);
    return {
      left: ellipsePath(lx, cy, radius, vertical),
      right: ellipsePath(rx, cy, radius, vertical),
      strokeWidth: 0,
      filled: true,
      dots,
    };
  }
  if (pose.eyeShape === 'bar') {
    const width = 2.6 * scale;
    const height = Math.max(0.6, 6 * scale * open);
    const radius = Math.min(width, height) / 2;
    return {
      left: roundedRectPath(lx - width / 2, cy - height / 2, width, height, radius),
      right: roundedRectPath(rx - width / 2, cy - height / 2, width, height, radius),
      strokeWidth: 0,
      filled: true,
      dots,
    };
  }
  if (pose.eyeShape === 'happy') {
    return {
      left: happyPath(lx, cy, scale, open),
      right: happyPath(rx, cy, scale, open),
      strokeWidth: STROKE_WIDTH,
      filled: false,
      dots,
    };
  }
  if (pose.eyeShape === 'cross') {
    return {
      left: chevronPath(lx, cy, scale, open, true),
      right: chevronPath(rx, cy, scale, open, false),
      strokeWidth: STROKE_WIDTH,
      filled: false,
      dots,
    };
  }
  return {
    left: closedPath(lx, cy, scale),
    right: closedPath(rx, cy, scale),
    strokeWidth: STROKE_WIDTH,
    filled: false,
    dots,
  };
}
