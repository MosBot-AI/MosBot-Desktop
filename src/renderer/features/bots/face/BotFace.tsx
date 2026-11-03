import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from 'react';
import { normalizeColor } from '../../../../shared/color';
import type { BotShape } from '../../../../shared/domain';
import type { FaceMood } from '../../../../shared/face';
import { desaturate, eyeColorFor } from './faceColor';
import { subscribeFaceClock } from './faceClock';
import {
  blendPose,
  easeOutCubic,
  eyeGeometry,
  facePose,
  POSE_BLEND_MS,
  staticPose,
  type FaceEyes,
  type FacePose,
} from './facePose';
import { cachedBodyPath, pathNumber, seedNumber } from './faceShapes';
import { getReducedMotion, subscribeReducedMotion } from './reducedMotion';
import styles from './BotFace.module.css';

export interface BotFaceProps {
  readonly shape: BotShape;
  readonly color: string;
  readonly seed: string;
  readonly mood: FaceMood;
  readonly size: number;
  readonly animated?: boolean;
  readonly label?: string;
  readonly className?: string;
}

const FALLBACK_BODY_COLOR = '#8b5cf6';
const GLOW_COLOR = '#64D2FF';
/** Moods whose small faces only blink: the motion is too slight to spend a frame-clock slot on. */
const QUIET_MOODS: ReadonlySet<FaceMood> = new Set<FaceMood>(['idle', 'sleep', 'watching']);
/** Faces at or above this size always animate; smaller quiet faces keep a still frame and blink. */
const CLOCK_MIN_FACE_SIZE = 96;
const FULL_FRAME_RATE_SIZE = 28;
const BLINK_CLOSE_MS = 120;
const BLINK_GAP_MIN_MS = 2800;
const BLINK_GAP_SPREAD_MS = 2400;
const POSE_BLEND_SECONDS = POSE_BLEND_MS / 1000;
const GLOW_STROKE_WIDTH = 1.4;

interface MotionState {
  mood: FaceMood;
  from: FacePose | undefined;
  blendStart: number | null;
  moodStart: number | null;
}

function noopSubscribe(): () => void {
  return () => undefined;
}

function useReducedMotion(enabled: boolean): boolean {
  return useSyncExternalStore(
    enabled ? subscribeReducedMotion : noopSubscribe,
    getReducedMotion,
    getReducedMotion,
  );
}

/**
 * The pose a face should draw now: the animated mood pose while the shared
 * clock runs, the mood's static pose under reduce-motion or `animated={false}`,
 * and a still frame that only blinks for small quiet faces. Mood changes blend
 * over `POSE_BLEND_MS`; one-shots start when their mood arrives.
 */
function useFacePose(mood: FaceMood, seed: number, animated: boolean, size: number): FacePose {
  const reducedMotion = useReducedMotion(animated);
  const still = !animated || reducedMotion;
  const stillPose = useMemo(() => staticPose(mood), [mood]);
  const [livePose, setLivePose] = useState<FacePose>(stillPose);
  const moodRef = useRef<FaceMood>(mood);
  const lastPoseRef = useRef<FacePose>(stillPose);

  useEffect(() => {
    moodRef.current = mood;
  }, [mood]);

  useEffect(() => {
    if (still) {
      lastPoseRef.current = stillPose;
    }
  }, [still, stillPose]);

  const clockWanted = !still && (size >= CLOCK_MIN_FACE_SIZE || !QUIET_MOODS.has(mood));

  useEffect(() => {
    if (!clockWanted) {
      return undefined;
    }
    let motion: MotionState = {
      mood: moodRef.current,
      from: lastPoseRef.current,
      blendStart: null,
      moodStart: null,
    };
    const fps = size >= FULL_FRAME_RATE_SIZE ? 60 : 30;
    return subscribeFaceClock(fps, (t: number) => {
      const target = moodRef.current;
      if (motion.mood !== target) {
        motion = { mood: target, from: lastPoseRef.current, blendStart: t, moodStart: t };
      }
      const oneShot = target === 'done' || target === 'oops';
      if (oneShot && motion.moodStart === null) {
        motion.moodStart = t;
      }
      const local = oneShot ? t - (motion.moodStart ?? t) : t;
      let next = facePose(target, local, seed);
      if (motion.from !== undefined) {
        const blendStart = motion.blendStart ?? t;
        motion.blendStart = blendStart;
        const k = (t - blendStart) / POSE_BLEND_SECONDS;
        if (k >= 1) {
          motion.from = undefined;
        } else {
          next = blendPose(motion.from, next, easeOutCubic(k));
        }
      }
      lastPoseRef.current = next;
      setLivePose(next);
    });
  }, [clockWanted, seed, size]);

  useEffect(() => {
    if (still || clockWanted) {
      return undefined;
    }
    const show = (pose: FacePose): void => {
      lastPoseRef.current = pose;
      setLivePose(pose);
    };
    show(staticPose(moodRef.current));
    const canBlink = (pose: FacePose): boolean =>
      pose.eyeShape === 'dot' || pose.eyeShape === 'bar';
    if (!canBlink(staticPose(moodRef.current))) {
      return undefined;
    }
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    let openTimer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (): void => {
      closeTimer = setTimeout(
        () => {
          const closed = staticPose(moodRef.current);
          if (!canBlink(closed)) {
            schedule();
            return;
          }
          closed.eyeOpen = 0;
          show(closed);
          openTimer = setTimeout(() => {
            show(staticPose(moodRef.current));
            schedule();
          }, BLINK_CLOSE_MS);
        },
        BLINK_GAP_MIN_MS + Math.random() * BLINK_GAP_SPREAD_MS,
      );
    };
    schedule();
    return (): void => {
      if (closeTimer !== undefined) {
        clearTimeout(closeTimer);
      }
      if (openTimer !== undefined) {
        clearTimeout(openTimer);
      }
    };
  }, [still, clockWanted, mood]);

  return still ? stillPose : livePose;
}

interface EyePathsProps {
  readonly eyes: FaceEyes;
  readonly color: string;
}

function EyePaths({ eyes, color }: EyePathsProps): ReactElement {
  const fill = eyes.filled ? color : 'none';
  const stroke = eyes.filled ? 'none' : color;
  return (
    <>
      <path
        d={eyes.left}
        fill={fill}
        stroke={stroke}
        strokeWidth={eyes.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={eyes.right}
        fill={fill}
        stroke={stroke}
        strokeWidth={eyes.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

/**
 * A Bot's face in the mobile client's 40×40 view box, drawn inline at `size`
 * px. Animated faces follow one shared frame clock and blend 400 ms between
 * moods; `animated={false}` or the system reduce-motion setting draws a still
 * frame with no listeners. The body fill is `color` (desaturated for sleep) and
 * the eyes pick white or near-black ink from its luminance.
 */
export function BotFace({
  shape,
  color,
  seed,
  mood,
  size,
  animated = true,
  label,
  className,
}: BotFaceProps): ReactElement {
  const bodyCommands = useMemo(() => cachedBodyPath(shape, seed), [shape, seed]);
  const seedValue = useMemo(() => seedNumber(seed), [seed]);
  const baseColor = useMemo(() => normalizeColor(color, FALLBACK_BODY_COLOR), [color]);
  const pose = useFacePose(mood, seedValue, animated, size);
  const eyes = eyeGeometry(pose);
  const bodyFill = pose.desaturate > 0.001 ? desaturate(baseColor, pose.desaturate) : baseColor;
  const eyeColor = eyeColorFor(bodyFill);
  const typing = Math.max(0, Math.min(1, pose.typing));
  const faceOpacity = 1 - typing;
  const faceShrink = 1 - 0.5 * typing;
  const glowOpacity = eyes.filled ? Math.max(0, Math.min(1, pose.glow)) * 0.7 : 0;
  const labelled = label !== undefined && label.length > 0;
  const accessibility = labelled
    ? ({ role: 'img', 'aria-label': label } as const)
    : ({ 'aria-hidden': true } as const);
  const bodyTransform =
    'translate(0 ' +
    pathNumber(pose.bodyTranslateY) +
    ') translate(20 35) rotate(' +
    pathNumber(pose.bodyRotate) +
    ') scale(' +
    pathNumber(pose.bodyScaleX) +
    ' ' +
    pathNumber(pose.bodyScaleY) +
    ') translate(-20 -35)';
  const faceTransform = 'translate(20 21) scale(' + pathNumber(faceShrink) + ') translate(-20 -21)';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={className === undefined ? styles.face : `${styles.face} ${className}`}
      {...accessibility}
    >
      <g transform={bodyTransform}>
        <g transform={faceTransform} opacity={faceOpacity}>
          <path d={bodyCommands} fill={bodyFill} />
          {glowOpacity > 0.01 && eyes.filled ? (
            <g
              fill="none"
              stroke={GLOW_COLOR}
              strokeWidth={GLOW_STROKE_WIDTH}
              strokeOpacity={glowOpacity}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={eyes.left} />
              <path d={eyes.right} />
            </g>
          ) : null}
          <EyePaths eyes={eyes} color={eyeColor} />
        </g>
        {eyes.dots === '' ? null : <path d={eyes.dots} fill={bodyFill} />}
      </g>
    </svg>
  );
}
