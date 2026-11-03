import type { ReactElement } from 'react';
import type { BotShape } from '../../../shared/domain';
import { faceMoodForPresence, type FaceMood } from '../../../shared/face';
import { BotFace } from './face/BotFace';
import { botFaceColor } from './botLook';

export interface BotLookFaceProps {
  readonly shape: BotShape;
  readonly color: string;
  readonly useMosbotDefault?: boolean;
  readonly seed: string;
  readonly size: number;
  readonly presence?: Parameters<typeof faceMoodForPresence>[0];
  readonly mood?: FaceMood;
  readonly animated?: boolean;
  readonly label?: string;
  readonly className?: string;
}

/**
 * A face for a look that is not (yet) a profile: the create dialog's live
 * preview and the details header. Shares the roster rendering with BotAvatar.
 */
export function BotLookFace({
  shape,
  color,
  useMosbotDefault = false,
  seed,
  size,
  presence = 'idle',
  mood,
  animated,
  label,
  className,
}: BotLookFaceProps): ReactElement {
  return (
    <BotFace
      shape={shape}
      color={botFaceColor({ color, useMosbotDefault })}
      seed={seed}
      mood={mood ?? faceMoodForPresence(presence)}
      size={size}
      animated={animated ?? size >= 40}
      {...(label === undefined ? {} : { label })}
      {...(className === undefined ? {} : { className })}
    />
  );
}
