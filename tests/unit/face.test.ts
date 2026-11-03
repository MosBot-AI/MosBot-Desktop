import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BOT_SHAPES } from '../../src/shared/domain';
import type { FaceMood } from '../../src/shared/face';
import { BotFace } from '../../src/renderer/features/bots/face/BotFace';
import { desaturate, eyeColorFor } from '../../src/renderer/features/bots/face/faceColor';
import {
  blinkOpen,
  blendPose,
  easeOutCubic,
  eyeGeometry,
  facePose,
  POSE_BLEND_MS,
  staticPose,
  type FacePose,
} from '../../src/renderer/features/bots/face/facePose';
import {
  bodyPath,
  cachedBodyPath,
  ellipsePath,
  pathNumber,
  radialPoints,
  roundedRectPath,
  seedNumber,
  seededRandom,
  smoothClosedPath,
  superellipsePoints,
} from '../../src/renderer/features/bots/face/faceShapes';

const MOODS: readonly FaceMood[] = [
  'sleep',
  'idle',
  'listening',
  'thinking',
  'typing',
  'working',
  'screen',
  'waiting',
  'watching',
  'done',
  'oops',
];

const VIEW_BOX = 40;
const PATH_CHARACTERS = /^[MLCZ0-9.\- ]+$/;
const NUMBER_PATTERN = /-?\d+(?:\.\d+)?/g;

/** Every coordinate pair in a path, control points included. */
function pathCoordinates(path: string): { x: number; y: number }[] {
  const numbers = path.match(NUMBER_PATTERN) ?? [];
  const points: { x: number; y: number }[] = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    points.push({ x: Number(numbers[index]), y: Number(numbers[index + 1]) });
  }
  return points;
}

function expectPathCommands(path: string): void {
  expect(path.length).toBeGreaterThan(0);
  expect(path.startsWith('M')).toBe(true);
  expect(path).toMatch(PATH_CHARACTERS);
  expect(path).not.toContain('NaN');
  expect(path).not.toContain('Infinity');
  expect(path).not.toContain('undefined');
}

function expectClosedPath(path: string): void {
  expectPathCommands(path);
  expect(path.endsWith('Z')).toBe(true);
}

describe('pathNumber', () => {
  it('rounds to at most two decimals', () => {
    expect(pathNumber(0)).toBe('0');
    expect(pathNumber(-0)).toBe('0');
    expect(pathNumber(1.234)).toBe('1.23');
    expect(pathNumber(1.235)).toBe('1.24');
    expect(pathNumber(-1.234)).toBe('-1.23');
    expect(pathNumber(12.3456)).toBe('12.35');
  });

  it('never emits -0 or scientific notation for face geometry', () => {
    expect(pathNumber(0.004)).toBe('0');
    expect(pathNumber(-0.004)).toBe('0');
    expect(pathNumber(39.999)).toBe('40');
  });
});

describe('path primitives', () => {
  it('draws an ellipse and a rounded rectangle as closed paths inside the view box', () => {
    const ellipse = ellipsePath(20, 21, 15, 15);
    const rect = roundedRectPath(4, 10, 32, 22, 11);
    expectClosedPath(ellipse);
    expectClosedPath(rect);
    for (const point of pathCoordinates(ellipse)) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(VIEW_BOX);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(VIEW_BOX);
    }
    for (const point of pathCoordinates(rect)) {
      expect(point.x).toBeGreaterThanOrEqual(4);
      expect(point.x).toBeLessThanOrEqual(36);
      expect(point.y).toBeGreaterThanOrEqual(10);
      expect(point.y).toBeLessThanOrEqual(32);
    }
  });

  it('clamps a rounded rectangle radius to half the shorter side', () => {
    const path = roundedRectPath(10, 10, 20, 20, 999);
    expectClosedPath(path);
    expect(pathCoordinates(path).length).toBeGreaterThan(0);
  });

  it('smoothClosedPath needs three points and emits one curve per point', () => {
    expect(smoothClosedPath([])).toBe('');
    expect(
      smoothClosedPath([
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ]),
    ).toBe('');
    const path = smoothClosedPath(superellipsePoints(20, 21, 15, 15, 2, 8));
    expectClosedPath(path);
    expect(path.match(/C/g)).toHaveLength(8);
  });

  it('samples radial and superellipse rings at the requested count', () => {
    expect(radialPoints(20, 21, () => 10, 48)).toHaveLength(48);
    const ring = superellipsePoints(20, 21, 15, 15, 4, 48);
    expect(ring).toHaveLength(48);
    for (const point of ring) {
      expect(Math.abs(point.x - 20)).toBeLessThanOrEqual(15.001);
      expect(Math.abs(point.y - 21)).toBeLessThanOrEqual(15.001);
    }
  });
});

describe('bodyPath', () => {
  it('draws every shape as a closed path inside the view box', () => {
    for (const shape of BOT_SHAPES) {
      const path = bodyPath(shape, 'seed-for-shape');
      expectClosedPath(path);
      for (const point of pathCoordinates(path)) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(VIEW_BOX);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(VIEW_BOX);
      }
    }
  });

  it('is deterministic per (shape, seed)', () => {
    for (const shape of BOT_SHAPES) {
      expect(bodyPath(shape, 'alice')).toBe(bodyPath(shape, 'alice'));
    }
  });

  it('seeds the blobatar wobble from the seed', () => {
    expect(bodyPath('blobatar', 'alice')).not.toBe(bodyPath('blobatar', 'bob'));
    expect(bodyPath('blobatar', 'alice')).toBe(bodyPath('blobatar', 'alice'));
  });

  it('accepts a blobatar seed segment and falls back to the profile seed', () => {
    expect(bodyPath('blobatar:custom', 'alice')).toBe(bodyPath('blobatar', 'custom'));
    expect(bodyPath('blobatar:custom', 'alice')).not.toBe(bodyPath('blobatar:other', 'alice'));
    expect(bodyPath('blobatar:', 'alice')).toBe(bodyPath('blobatar', 'alice'));
    expect(bodyPath('blob', 'alice')).toBe(bodyPath('blobatar', 'alice'));
  });

  it('falls back to a circle for an unknown shape', () => {
    expect(bodyPath('nonsense', 'alice')).toBe(bodyPath('circle', 'alice'));
  });

  it('keeps the mosbot body distinct from a plain circle', () => {
    expect(bodyPath('mosbot', 'alice')).not.toBe(bodyPath('circle', 'alice'));
  });
});

describe('cachedBodyPath', () => {
  it('matches bodyPath and is stable across calls', () => {
    const first = cachedBodyPath('hexagon', 'cache-seed');
    expect(first).toBe(bodyPath('hexagon', 'cache-seed'));
    expect(cachedBodyPath('hexagon', 'cache-seed')).toBe(first);
  });

  it('keeps working after the cache is cleared by many distinct seeds', () => {
    for (let index = 0; index < 70; index += 1) {
      cachedBodyPath('blobatar', 'evict-' + index);
    }
    expect(cachedBodyPath('blobatar', 'after-evict')).toBe(bodyPath('blobatar', 'after-evict'));
  });
});

describe('seededRandom / seedNumber', () => {
  it('is deterministic and yields values in [0, 1)', () => {
    const first = seededRandom('alice');
    const second = seededRandom('alice');
    const other = seededRandom('bob');
    const values = [first(), first(), first(), first()];
    expect(values).toEqual([second(), second(), second(), second()]);
    expect(values).not.toEqual([other(), other(), other(), other()]);
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('hashes the seed to a stable number in [0, 1)', () => {
    expect(seedNumber('alice')).toBe(seedNumber('alice'));
    expect(seedNumber('alice')).toBeGreaterThanOrEqual(0);
    expect(seedNumber('alice')).toBeLessThan(1);
    expect(seedNumber('alice')).not.toBe(seedNumber('bob'));
  });
});

describe('facePose', () => {
  it('keeps every mood finite and bounded at any time', () => {
    for (const mood of MOODS) {
      for (const t of [0, 0.35, 1.7, 5, 30]) {
        const pose = facePose(mood, t, 0.42);
        for (const value of [
          pose.bodyScaleX,
          pose.bodyScaleY,
          pose.bodyRotate,
          pose.bodyTranslateY,
          pose.gazeX,
          pose.gazeY,
          pose.eyeOpen,
          pose.eyeScale,
          pose.typing,
          pose.desaturate,
          pose.badgePulse,
          pose.glow,
        ]) {
          expect(Number.isFinite(value)).toBe(true);
        }
        expect(pose.dots).toHaveLength(3);
        for (const dot of pose.dots) {
          expect(Number.isFinite(dot)).toBe(true);
        }
        expect(Math.abs(pose.gazeX)).toBeLessThanOrEqual(3);
        expect(Math.abs(pose.gazeY)).toBeLessThanOrEqual(3);
      }
    }
  });

  it('maps moods to their signature pose', () => {
    expect(facePose('typing', 0.3, 0.5).typing).toBe(1);
    expect(facePose('working', 0.3, 0.5).eyeShape).toBe('bar');
    expect(facePose('screen', 0.3, 0.5).eyeShape).toBe('bar');
    expect(facePose('sleep', 0.3, 0.5).eyeShape).toBe('closed');
    expect(facePose('sleep', 0.3, 0.5).desaturate).toBe(0.4);
    expect(facePose('done', 0.1, 0.5).eyeShape).toBe('happy');
    expect(facePose('oops', 0.1, 0.5).eyeShape).toBe('cross');
  });

  it('settles the done and oops one-shots instead of looping', () => {
    expect(Math.abs(facePose('done', 5, 0.5).bodyTranslateY)).toBeLessThan(0.1);
    expect(Math.abs(facePose('oops', 5, 0.5).bodyRotate)).toBeLessThan(0.01);
  });

  it('is deterministic for the same (mood, t, seed)', () => {
    for (const mood of MOODS) {
      expect(facePose(mood, 3.25, 0.77)).toEqual(facePose(mood, 3.25, 0.77));
    }
  });
});

describe('staticPose', () => {
  it('is finite and keeps the mood eyes without motion', () => {
    for (const mood of MOODS) {
      const pose = staticPose(mood);
      expect(Number.isFinite(pose.bodyRotate)).toBe(true);
      expect(pose.eyeOpen).toBe(1);
      expect(pose.typing === 0 || pose.typing === 1).toBe(true);
      expect(pose.dots).toHaveLength(3);
    }
    expect(staticPose('idle').eyeShape).toBe('dot');
    expect(staticPose('working').eyeShape).toBe('bar');
    expect(staticPose('screen').eyeShape).toBe('bar');
    expect(staticPose('done').eyeShape).toBe('happy');
    expect(staticPose('oops').eyeShape).toBe('cross');
    expect(staticPose('sleep').eyeShape).toBe('closed');
    expect(staticPose('sleep').desaturate).toBe(0.4);
    expect(staticPose('typing').typing).toBe(1);
  });
});

describe('blendPose', () => {
  it('interpolates between two poses', () => {
    const from = staticPose('idle');
    const to = staticPose('listening');
    const start = blendPose(from, to, 0);
    expect(start.bodyRotate).toBe(from.bodyRotate);
    expect(start.gazeX).toBe(from.gazeX);
    expect(blendPose(from, to, 1).gazeX).toBe(to.gazeX);
    expect(blendPose(from, to, 1).eyeShape).toBe(to.eyeShape);
    const middle = blendPose(from, to, 0.5);
    expect(middle.bodyRotate).toBeCloseTo((from.bodyRotate + to.bodyRotate) / 2);
  });

  it('squeezes the eyes shut at the midpoint of an eye-shape swap', () => {
    const middle = blendPose(staticPose('idle'), staticPose('working'), 0.5);
    expect(middle.eyeOpen).toBe(0);
    expect(middle.eyeShape).toBe('bar');
    const late = blendPose(staticPose('idle'), staticPose('working'), 0.75);
    expect(late.eyeShape).toBe('bar');
    expect(late.eyeOpen).toBeGreaterThan(0);
  });

  it('lerps the typing dots', () => {
    const blended = blendPose(staticPose('idle'), staticPose('typing'), 0.5);
    expect(blended.typing).toBeCloseTo(0.5);
    expect(blended.dots).toHaveLength(3);
    for (const dot of blended.dots) {
      expect(dot).toBeGreaterThan(0);
    }
  });
});

describe('easeOutCubic', () => {
  it('starts at 0, ends at 1 and decelerates', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });
});

describe('blinkOpen', () => {
  it('returns open eyes for degenerate inputs', () => {
    expect(blinkOpen(-1, 0.5, 3, 5, 0.12)).toBe(1);
    expect(blinkOpen(2, 0.5, 3, 5, 0)).toBe(1);
    expect(blinkOpen(2, 0.5, 3, 0, 0.12)).toBe(1);
  });

  it('closes and reopens on a seeded schedule', () => {
    const seed = 0.31;
    const samples: number[] = [];
    for (let t = 0; t <= 30; t += 0.01) {
      samples.push(blinkOpen(t, seed, 2.8, 5.2, 0.12));
    }
    expect(Math.min(...samples)).toBeLessThan(0.05);
    expect(Math.max(...samples)).toBe(1);
    for (const value of samples) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(blinkOpen(7.77, seed, 2.8, 5.2, 0.12)).toBe(blinkOpen(7.77, seed, 2.8, 5.2, 0.12));
  });
});

describe('eyeGeometry', () => {
  it('produces finite paths for every mood and time', () => {
    for (const mood of MOODS) {
      for (const t of [0, 0.35, 1.7, 5, 30]) {
        const eyes = eyeGeometry(facePose(mood, t, 0.42));
        expectPathCommands(eyes.left);
        expectPathCommands(eyes.right);
        expect(Number.isFinite(eyes.strokeWidth)).toBe(true);
        expect(eyes.strokeWidth).toBeGreaterThanOrEqual(0);
        if (eyes.dots !== '') {
          expectClosedPath(eyes.dots);
        }
        for (const path of [eyes.left, eyes.right, eyes.dots]) {
          for (const point of pathCoordinates(path)) {
            expect(Number.isFinite(point.x)).toBe(true);
            expect(Number.isFinite(point.y)).toBe(true);
          }
        }
      }
    }
  });

  it('fills dot and bar eyes and strokes the expression eyes', () => {
    expect(eyeGeometry(staticPose('idle')).filled).toBe(true);
    expect(eyeGeometry(staticPose('idle')).strokeWidth).toBe(0);
    expect(eyeGeometry(staticPose('working')).filled).toBe(true);
    expect(eyeGeometry(staticPose('done')).filled).toBe(false);
    expect(eyeGeometry(staticPose('done')).strokeWidth).toBeGreaterThan(0);
    expect(eyeGeometry(staticPose('oops')).filled).toBe(false);
    expect(eyeGeometry(staticPose('sleep')).filled).toBe(false);
  });

  it('draws three typing dots only while typing', () => {
    expect(eyeGeometry(staticPose('idle')).dots).toBe('');
    const dots = eyeGeometry(staticPose('typing')).dots;
    expectClosedPath(dots);
    expect(dots.match(/M/g)).toHaveLength(3);
  });

  it('keeps blinking dot eyes visible', () => {
    const pose: FacePose = { ...staticPose('idle'), eyeOpen: 0 };
    const eyes = eyeGeometry(pose);
    expectClosedPath(eyes.left);
    expect(pathCoordinates(eyes.left).length).toBeGreaterThan(0);
  });
});

describe('colours', () => {
  it('picks white eyes on dark bodies and near-black eyes on light bodies', () => {
    expect(eyeColorFor('#111111')).toBe('#FFFFFF');
    expect(eyeColorFor('#8b5cf6')).toBe('#111111');
    expect(eyeColorFor('#F2F2F2')).toBe('#111111');
    expect(eyeColorFor('#AFE17B')).toBe('#111111');
  });

  it('falls back to white eyes for unparseable input', () => {
    expect(eyeColorFor('rebeccapurple')).toBe('#FFFFFF');
  });

  it('desaturates toward the colour own gray', () => {
    expect(desaturate('#ff0000', 0)).toBe('#ff0000');
    expect(desaturate('#ff0000', 1)).toBe('#363636');
    expect(desaturate('#ff0000', 0.5)).toBe('#9b1b1b');
    expect(desaturate('not-a-colour', 0.5)).toBe('not-a-colour');
    expect(desaturate('#ff0000', 5)).toBe('#363636');
    expect(desaturate('#ff0000', -1)).toBe('#ff0000');
  });
});

describe('POSE_BLEND_MS', () => {
  it('is the mobile client 400 ms mood blend', () => {
    expect(POSE_BLEND_MS).toBe(400);
  });
});

describe('BotFace render (static frame)', () => {
  it('renders an inline 40×40 svg with no animation listeners', () => {
    const markup = renderToStaticMarkup(
      createElement(BotFace, {
        shape: 'mosbot',
        color: '#111111',
        seed: 'alice',
        mood: 'idle',
        size: 40,
        animated: false,
      }),
    );
    expect(markup).toContain('<svg');
    expect(markup).toContain('viewBox="0 0 40 40"');
    expect(markup).toContain('width="40"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('<path');
  });

  it('exposes role="img" and the label when one is given', () => {
    const markup = renderToStaticMarkup(
      createElement(BotFace, {
        shape: 'blobatar',
        color: '#afe17b',
        seed: 'alice',
        mood: 'working',
        size: 96,
        animated: false,
        label: 'Alice',
      }),
    );
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Alice"');
    expect(markup).not.toContain('aria-hidden');
  });
});
