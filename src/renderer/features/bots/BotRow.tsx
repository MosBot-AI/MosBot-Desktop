import type { ReactElement } from 'react';
import type { BotProfile } from '../../../shared/domain';
import { useMessages } from '../../app/i18n';
import { presenceKey } from '../../app/format';
import { BotAvatar } from './BotAvatar';
import { BotHoverCard } from './BotHoverCard';
import { BotStatusDot } from './BotStatusDot';
import { useHoverPreview } from './useHoverPreview';
import styles from './BotRoster.module.css';

function cx(...values: Array<string | false | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export interface BotRowProps {
  readonly bot: BotProfile;
  readonly selected: boolean;
  readonly onSelect: (botId: string) => void;
}

/** One roster line: face, name, one-line summary, unread badge, presence dot. */
export function BotRow({ bot, selected, onSelect }: BotRowProps): ReactElement {
  const t = useMessages();
  const preview = useHoverPreview();
  const showUnread = bot.unread > 0;
  return (
    <>
      <button
        type="button"
        ref={preview.anchorRef}
        className={cx(styles.row, selected && styles.rowSelected)}
        onClick={() => {
          onSelect(bot.id);
        }}
        onPointerEnter={preview.onEnter}
        onPointerLeave={preview.onLeave}
        onFocus={preview.onFocus}
        onBlur={preview.onBlur}
        aria-current={selected ? 'true' : undefined}
      >
        <BotAvatar bot={bot} size={34} moodOverride={preview.hovered ? 'listening' : undefined} />
        <span className={styles.rowText}>
          <span className={styles.rowTop}>
            <span className={styles.rowName} title={bot.name}>
              {bot.name}
            </span>
            {showUnread ? (
              <span
                className={styles.unread}
                aria-label={t('app.unread', { count: bot.unread })}
                title={t('app.unread', { count: bot.unread })}
              >
                {bot.unread > 99 ? '99+' : bot.unread}
              </span>
            ) : null}
          </span>
          <span className={styles.rowBottom}>
            <BotStatusDot presence={bot.presence} size="sm" />
            <span className={styles.rowSummary} title={bot.summary}>
              {bot.summary === '' ? t(presenceKey(bot.presence)) : bot.summary}
            </span>
          </span>
        </span>
      </button>
      {preview.position === null ? null : <BotHoverCard bot={bot} position={preview.position} />}
    </>
  );
}
