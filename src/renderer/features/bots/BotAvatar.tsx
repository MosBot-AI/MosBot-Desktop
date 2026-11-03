import type { ReactElement } from 'react';
import type { BotProfile } from '../../../shared/domain';
import { faceMoodForPresence, type FaceMood } from '../../../shared/face';
import { BotFace } from './face/BotFace';
import { botFaceColor } from './botLook';

export interface BotAvatarProps {
  readonly bot: Pick<
    BotProfile,
    'id' | 'name' | 'shape' | 'color' | 'useMosbotDefault' | 'presence'
  >;
  readonly size: number;
  readonly animated?: boolean;
  /** Accessible name; the face is decorative when omitted. */
  readonly label?: string;
  readonly className?: string;
  /** One-off mood (e.g. `listening` while hovered) that wins over presence. */
  readonly moodOverride?: FaceMood | undefined;
}

/**
 * A roster/chat silhouette. Small faces stay calm (no idle animation) and only
 * the focused face near a Bot's name animates, matching the mobile client.
 */
export function BotAvatar({
  bot,
  size,
  animated,
  label,
  className,
  moodOverride,
}: BotAvatarProps): ReactElement {
  return (
    <BotFace
      shape={bot.shape}
      color={botFaceColor(bot)}
      seed={bot.id}
      mood={moodOverride ?? faceMoodForPresence(bot.presence)}
      size={size}
      animated={animated ?? size >= 40}
      {...(label === undefined ? {} : { label })}
      {...(className === undefined ? {} : { className })}
    />
  );
}
