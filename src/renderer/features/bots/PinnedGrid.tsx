import type { ReactElement } from 'react';
import type { BotProfile } from '../../../shared/domain';
import { useMessages } from '../../app/i18n';
import { presenceKey } from '../../app/format';
import { BotAvatar } from './BotAvatar';
import { BotStatusDot } from './BotStatusDot';
import styles from './BotRoster.module.css';

export interface PinnedGridProps {
  readonly bots: readonly BotProfile[];
  readonly selectedBotId: string;
  readonly onSelect: (botId: string) => void;
  readonly onOpenAll: () => void;
}

const MAX_TILES = 6;

/**
 * The frequent row: three columns, at most two rows of faces. Anything past the
 * sixth slot stays reachable through the "all pinned" entry.
 */
export function PinnedGrid({
  bots,
  selectedBotId,
  onSelect,
  onOpenAll,
}: PinnedGridProps): ReactElement {
  const t = useMessages();
  const visible = bots.slice(0, MAX_TILES);
  return (
    <section className={styles.pinned} aria-label={t('sidebar.pinned')}>
      {visible.length === 0 ? (
        <p className={styles.pinnedEmpty}>{t('sidebar.pinnedEmpty')}</p>
      ) : (
        <div className={styles.pinnedGrid}>
          {visible.map((bot) => {
            const selected = bot.id === selectedBotId;
            return (
              <button
                key={bot.id}
                type="button"
                className={styles.pinTile}
                data-selected={selected ? 'true' : 'false'}
                onClick={() => {
                  onSelect(bot.id);
                }}
                aria-current={selected ? 'true' : undefined}
                title={`${bot.name} · ${t(presenceKey(bot.presence))}`}
              >
                <span className={styles.pinFace}>
                  <BotAvatar bot={bot} size={52} label={bot.name} />
                  {bot.unread > 0 ? <span className={styles.pinUnread} aria-hidden="true" /> : null}
                  <BotStatusDot presence={bot.presence} size="sm" className={styles.pinDot} />
                </span>
                <span className={styles.pinName} title={bot.name}>
                  {bot.name}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <button type="button" className={styles.pinnedAll} onClick={onOpenAll}>
        {t('sidebar.pinnedAll')}
      </button>
    </section>
  );
}
