import type { ReactElement } from 'react';
import type { RemoteGroup } from '../../../shared/protocol';
import { useMessages } from '../../app/i18n';
import { BotFace } from './face/BotFace';
import styles from './BotRoster.module.css';

export interface GroupRowProps {
  readonly group: RemoteGroup;
  readonly onSelect: (group: RemoteGroup) => void;
}

/** One read-only hosted-room line in the roster; group chat itself is the next slice. */
export function GroupRow({ group, onSelect }: GroupRowProps): ReactElement {
  const t = useMessages();
  return (
    <button
      type="button"
      className={styles.row}
      onClick={() => {
        onSelect(group);
      }}
      aria-label={`${group.name} · ${t('sidebar.groupMembers', { count: group.memberCount })}`}
    >
      <BotFace
        shape="circle"
        color="#6E7781"
        seed={group.roomId}
        mood="idle"
        size={34}
        label={group.name}
      />
      <span className={styles.rowText}>
        <span className={styles.rowTop}>
          <span className={styles.rowName} title={group.name}>
            {group.name}
          </span>
        </span>
        <span className={styles.rowBottom}>
          <span className={styles.rowSummary}>
            {t('sidebar.groupMembers', { count: group.memberCount })}
          </span>
        </span>
      </span>
    </button>
  );
}
