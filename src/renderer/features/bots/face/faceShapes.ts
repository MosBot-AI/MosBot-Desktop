/**
 * Bot body outlines ported from the MosBot mobile client
 * (`entry/src/main/ets/state/bot/BotFaceShapes.ets`, MosBot @ 3c118c4, MIT —
 * see `licenses/hermes-desktop-bots-LICENSE`). Pure geometry in a 40×40 view
 * box with y growing downward, returned as SVG path commands (`M`, `L`, `C`,
 * `Z` only) so the same functions run in the renderer and in Vitest.
 */

export interface FacePoint {
  readonly x: number;
  readonly y: number;
}

const TAU = Math.PI * 2;
/** Cubic Bézier handle length for a quarter circle of radius 1. */
const KAPPA = 0.5522847498;
/** The blob's largest radius, so the seeded wobble always fits inside 4..36 around (20, 21). */
const BLOB_MAX_RADIUS = 14.8;
const BODY_PATH_CACHE_LIMIT = 64;

const bodyPathCache = new Map<string, string>();

/** At most two decimals, no `-0`. */
export function pathNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded === 0 ? '0' : rounded.toString();
}

function pair(x: number, y: number): string {
  return pathNumber(x) + ' ' + pathNumber(y);
}

/** Cyclic access into a point ring, for the Catmull-Rom and corner smoothing. */
function pointAt(points: readonly FacePoint[], index: number): FacePoint {
  const count = points.length;
  const point = points[((index % count) + count) % count];
  if (point === undefined) {
    throw new RangeError('face point index out of range');
  }
  return point;
}

/** Catmull-Rom (tension 0.5) through `points` as cubic segments, closed with `Z`. */
export function smoothClosedPath(points: readonly FacePoint[]): string {
  const count = points.length;
  if (count < 3) {
    return '';
  }
  const first = pointAt(points, 0);
  const parts: string[] = ['M' + pair(first.x, first.y)];
  for (let index = 0; index < count; index += 1) {
    const p0 = pointAt(points, index - 1);
    const p1 = pointAt(points, index);
    const p2 = pointAt(points, index + 1);
    const p3 = pointAt(points, index + 2);
    parts.push(
      'C' +
        pair(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6) +
        ' ' +
        pair(p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6) +
        ' ' +
        pair(p2.x, p2.y),
    );
  }
  parts.push('Z');
  return parts.join(' ');
}

/** `count` points around (cx, cy) at evenly spaced angles, θ = 0 pointing right and growing clockwise. */
export function radialPoints(
  cx: number,
  cy: number,
  radiusAt: (theta: number) => number,
  count: number,
): FacePoint[] {
  const points: FacePoint[] = [];
  for (let index = 0; index < count; index += 1) {
    const theta = (TAU * index) / count;
    const radius = radiusAt(theta);
    points.push({ x: cx + radius * Math.cos(theta), y: cy + radius * Math.sin(theta) });
  }
  return points;
}

function signedPower(value: number, exponent: number): number {
  return (value < 0 ? -1 : 1) * Math.pow(Math.abs(value), exponent);
}

/** `|x/rx|^n + |y/ry|^n = 1` sampled at `count` evenly spaced parameter angles. */
export function superellipsePoints(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  n: number,
  count: number,
): FacePoint[] {
  const points: FacePoint[] = [];
  const exponent = 2 / n;
  for (let index = 0; index < count; index += 1) {
    const theta = (TAU * index) / count;
    points.push({
      x: cx + rx * signedPower(Math.cos(theta), exponent),
      y: cy + ry * signedPower(Math.sin(theta), exponent),
    });
  }
  return points;
}

/** A closed ellipse as four cubic arcs. */
export function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return (
    'M' +
    pair(cx + rx, cy) +
    ' C' +
    pair(cx + rx, cy + ky) +
    ' ' +
    pair(cx + kx, cy + ry) +
    ' ' +
    pair(cx, cy + ry) +
    ' C' +
    pair(cx - kx, cy + ry) +
    ' ' +
    pair(cx - rx, cy + ky) +
    ' ' +
    pair(cx - rx, cy) +
    ' C' +
    pair(cx - rx, cy - ky) +
    ' ' +
    pair(cx - kx, cy - ry) +
    ' ' +
    pair(cx, cy - ry) +
    ' C' +
    pair(cx + kx, cy - ry) +
    ' ' +
    pair(cx + rx, cy - ky) +
    ' ' +
    pair(cx + rx, cy) +
    ' Z'
  );
}

/** A closed rounded rectangle; `radius` is clamped to half the shorter side. */
export function roundedRectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): string {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const k = r * KAPPA;
  const right = x + width;
  const bottom = y + height;
  return (
    'M' +
    pair(x + r, y) +
    ' L' +
    pair(right - r, y) +
    ' C' +
    pair(right - r + k, y) +
    ' ' +
    pair(right, y + r - k) +
    ' ' +
    pair(right, y + r) +
    ' L' +
    pair(right, bottom - r) +
    ' C' +
    pair(right, bottom - r + k) +
    ' ' +
    pair(right - r + k, bottom) +
    ' ' +
    pair(right - r, bottom) +
    ' L' +
    pair(x + r, bottom) +
    ' C' +
    pair(x + r - k, bottom) +
    ' ' +
    pair(x, bottom - r + k) +
    ' ' +
    pair(x, bottom - r) +
    ' L' +
    pair(x, y + r) +
    ' C' +
    pair(x, y + r - k) +
    ' ' +
    pair(x + r - k, y) +
    ' ' +
    pair(x + r, y) +
    ' Z'
  );
}

/** A polygon whose corners are cut `cut` units along each edge and joined by a curve through the corner. */
function roundedPolygonPath(vertices: readonly FacePoint[], cut: number): string {
  const count = vertices.length;
  const parts: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const corner = pointAt(vertices, index);
    const previous = pointAt(vertices, index - 1);
    const next = pointAt(vertices, index + 1);
    const toPrevious = Math.hypot(previous.x - corner.x, previous.y - corner.y);
    const toNext = Math.hypot(next.x - corner.x, next.y - corner.y);
    const ax = corner.x + ((previous.x - corner.x) * cut) / toPrevious;
    const ay = corner.y + ((previous.y - corner.y) * cut) / toPrevious;
    const bx = corner.x + ((next.x - corner.x) * cut) / toNext;
    const by = corner.y + ((next.y - corner.y) * cut) / toNext;
    parts.push((index === 0 ? 'M' : 'L') + pair(ax, ay));
    parts.push(
      'C' +
        pair(ax + ((corner.x - ax) * 2) / 3, ay + ((corner.y - ay) * 2) / 3) +
        ' ' +
        pair(bx + ((corner.x - bx) * 2) / 3, by + ((corner.y - by) * 2) / 3) +
        ' ' +
        pair(bx, by),
    );
  }
  parts.push('Z');
  return parts.join(' ');
}

/** Cubic arcs on a circle from `start` to `end` (radians, y down), continuing an open path. */
function arcSegments(
  cx: number,
  cy: number,
  radius: number,
  start: number,
  end: number,
  segments: number,
): string {
  const step = (end - start) / segments;
  const handle = ((radius * 4) / 3) * Math.tan(step / 4);
  const parts: string[] = [];
  for (let index = 0; index < segments; index += 1) {
    const a0 = start + step * index;
    const a1 = a0 + step;
    const x0 = cx + radius * Math.cos(a0);
    const y0 = cy + radius * Math.sin(a0);
    const x1 = cx + radius * Math.cos(a1);
    const y1 = cy + radius * Math.sin(a1);
    parts.push(
      'C' +
        pair(x0 - handle * Math.sin(a0), y0 + handle * Math.cos(a0)) +
        ' ' +
        pair(x1 + handle * Math.sin(a1), y1 - handle * Math.cos(a1)) +
        ' ' +
        pair(x1, y1),
    );
  }
  return parts.join(' ');
}

function mosbotPath(): string {
  const points = superellipsePoints(20, 22, 15, 14, 2.4, 40);
  const widened = points.map((point, index) => {
    const widen = 1 + 0.06 * Math.max(0, Math.sin((TAU * index) / points.length));
    return { x: 20 + (point.x - 20) * widen, y: point.y };
  });
  return smoothClosedPath(widened);
}

function hexagonPath(): string {
  // Flat top: corners at 0°, 60°, …; dividing by a narrowed cosine pulls the corners in before smoothing.
  const apothem = 16 * Math.cos(Math.PI / 6);
  const sector = Math.PI / 3;
  const radiusAt = (theta: number): number => {
    const local = (((theta % sector) + sector) % sector) - sector / 2;
    return apothem / Math.cos(local * 0.86);
  };
  return smoothClosedPath(radialPoints(20, 21, radiusAt, 48));
}

function dropPath(): string {
  // Tip (20, 5), round bottom r 13 at (20, 23); the sides are tangents from the tip, the tip slightly softened.
  const cx = 20;
  const cy = 23;
  const radius = 13;
  const tipY = 5;
  const reach = Math.acos(radius / (cy - tipY));
  const rightAngle = -Math.PI / 2 + reach;
  const leftAngle = -Math.PI / 2 - reach + TAU;
  const rx = cx + radius * Math.cos(rightAngle);
  const ry = cy + radius * Math.sin(rightAngle);
  const lx = cx + radius * Math.cos(leftAngle);
  const ly = cy + radius * Math.sin(leftAngle);
  const side = Math.hypot(rx - cx, ry - tipY);
  const soften = 2;
  const ax = cx + ((rx - cx) * soften) / side;
  const ay = tipY + ((ry - tipY) * soften) / side;
  const bx = cx + ((lx - cx) * soften) / side;
  const by = tipY + ((ly - tipY) * soften) / side;
  return (
    'M' +
    pair(ax, ay) +
    ' L' +
    pair(rx, ry) +
    ' ' +
    arcSegments(cx, cy, radius, rightAngle, leftAngle, 4) +
    ' L' +
    pair(bx, by) +
    ' C' +
    pair(bx + ((cx - bx) * 2) / 3, by + ((tipY - by) * 2) / 3) +
    ' ' +
    pair(ax + ((cx - ax) * 2) / 3, ay + ((tipY - ay) * 2) / 3) +
    ' ' +
    pair(ax, ay) +
    ' Z'
  );
}

interface BlobWobble {
  readonly harmonic: number;
  readonly amplitude: number;
  readonly phase: number;
}

/**
 * A seeded radial blob, `14.5 × (1 + Σ_{k=2..4} a_k cos(kθ + φ_k))` with
 * `a_k ∈ [0, 0.06]`. A MosBot approximation, not the blobatar generator;
 * scaled down only when a rare peak would leave the box.
 */
function blobPath(seed: string): string {
  const random = seededRandom(seed);
  const wobbles: BlobWobble[] = [];
  for (let harmonic = 2; harmonic <= 4; harmonic += 1) {
    wobbles.push({ harmonic, amplitude: 0.06 * random(), phase: TAU * random() });
  }
  const radiusAt = (theta: number): number => {
    let wobble = 1;
    for (const item of wobbles) {
      wobble += item.amplitude * Math.cos(item.harmonic * theta + item.phase);
    }
    return 14.5 * wobble;
  };
  const points = radialPoints(20, 21, radiusAt, 48);
  let largest = 0;
  for (const point of points) {
    largest = Math.max(largest, Math.hypot(point.x - 20, point.y - 21));
  }
  if (largest > BLOB_MAX_RADIUS) {
    const shrink = BLOB_MAX_RADIUS / largest;
    return smoothClosedPath(
      points.map((point) => ({ x: 20 + (point.x - 20) * shrink, y: 21 + (point.y - 21) * shrink })),
    );
  }
  return smoothClosedPath(points);
}

/**
 * The body outline for a `ui_meta` shape. `blob`, `blobatar`,
 * `blobatar:<seed>`, `blobatar:<seed>:<kind>` and `blobatar::<kind>` seed the
 * blob from the seed segment or, when it is empty, from `seed` (the profile
 * name). Unknown shapes draw a circle.
 */
export function bodyPath(shape: string, seed: string): string {
  const segments = shape.trim().split(':');
  const name = (segments[0] ?? '').toLowerCase();
  if (name === 'mosbot') {
    return mosbotPath();
  }
  if (name === 'squircle') {
    return smoothClosedPath(superellipsePoints(20, 21, 15, 15, 4, 48));
  }
  if (name === 'pill') {
    return roundedRectPath(4, 10, 32, 22, 11);
  }
  if (name === 'hexagon') {
    return hexagonPath();
  }
  if (name === 'triangle') {
    return roundedPolygonPath(
      [
        { x: 20, y: 6 },
        { x: 35, y: 33 },
        { x: 5, y: 33 },
      ],
      4.5,
    );
  }
  if (name === 'cloud') {
    const puff = (theta: number): number => 13 + 2.4 * Math.abs(Math.sin(3 * theta));
    return smoothClosedPath(radialPoints(20, 20.5, puff, 72));
  }
  if (name === 'drop') {
    return dropPath();
  }
  if (name === 'blob' || name === 'blobatar') {
    const own = segments.length > 1 ? (segments[1] ?? '').trim() : '';
    return blobPath(own.length > 0 ? own : seed);
  }
  return ellipsePath(20, 21, 15, 15);
}

/** The body outline for a shape, memoised per `(shape, seed)` for the window's many faces. */
export function cachedBodyPath(shape: string, seed: string): string {
  const key = shape + '\n' + seed;
  const cached = bodyPathCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  if (bodyPathCache.size >= BODY_PATH_CACHE_LIMIT) {
    bodyPathCache.clear();
  }
  const commands = bodyPath(shape, seed);
  bodyPathCache.set(key, commands);
  return commands;
}

/** FNV-1a 32-bit hash of the text. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

// Port of the Hermes Desktop hermes-bots `sigilRng` (MIT, Nous Research): FNV-1a seed, then xorshift32.
/** A deterministic generator of values in [0, 1) for the text. */
export function seededRandom(text: string): () => number {
  let state = fnv1a(text) || 0x9e3779b9;
  return (): number => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

/** The text's FNV-1a hash as a number in [0, 1), used to offset animation phases. */
export function seedNumber(text: string): number {
  return fnv1a(text) / 4294967296;
}
