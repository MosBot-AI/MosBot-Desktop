import type { ReactElement } from 'react';
import { createPortal } from 'react-dom';
import type { BotProfile } from '../../../shared/domain';
import { useMessages } from '../../app/i18n';
import { formatRelativeMinutes, presenceKey } from '../../app/format';
import { useAppState } from '../../app/store';
import { BotAvatar } from './BotAvatar';
import { BotStatusDot } from './BotStatusDot';
import styles from './BotHoverCard.module.css';
import type { HoverCardPosition } from './useHoverPreview';

export interface BotHoverCardProps {
  readonly bot: BotProfile;
  readonly position: HoverCardPosition;
}

/**
 * Hover preview beside a roster item: who the Bot is, what it is doing and when
 * it last acted. Decorative duplicate of row text (`aria-hidden`), so screen
 * readers keep the concise button label.
 */
export function BotHoverCard({ bot, position }: BotHoverCardProps): ReactElement {
  const t = useMessages();
  const language = useAppState((state) => state.language);
  return createPortal(
    <div
      className={styles.card}
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
      role="tooltip"
      aria-hidden="true"
    >
      <div className={styles.head}>
        <BotAvatar bot={bot} size={34} animated={false} />
        <span className={styles.name}>{bot.name}</span>
      </div>
      <p className={styles.summary}>{bot.summary || t(presenceKey(bot.presence))}</p>
      <div className={styles.meta}>
        <BotStatusDot presence={bot.presence} size="sm" />
        <span>{t(presenceKey(bot.presence))}</span>
        <span className={styles.separator}>·</span>
        <span>{formatRelativeMinutes(language, bot.lastActiveMinutes)}</span>
      </div>
    </div>,
    document.body,
  );
}
