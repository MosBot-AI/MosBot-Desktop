import type { ReactElement } from 'react';
import type { BotProfile } from '../../../shared/domain';
import {
  EMPTY_CHAT_PATHS,
  EMPTY_CHAT_STROKE_WIDTH,
  EMPTY_CHAT_VIEW_BOX,
} from '../../assets/brand/artwork';
import { useMessages } from '../../app/i18n';
import styles from './ChatView.module.css';

export interface EmptyChatProps {
  readonly bot: BotProfile;
}

/** Empty conversation: one brand mark, one sentence, no filler. */
export function EmptyChat({ bot }: EmptyChatProps): ReactElement {
  const t = useMessages();
  return (
    <div className={styles.empty}>
      <svg
        aria-hidden="true"
        focusable="false"
        width={40}
        height={40}
        viewBox={EMPTY_CHAT_VIEW_BOX}
        className={styles.emptyIcon}
        fill="none"
        stroke="currentColor"
        strokeWidth={EMPTY_CHAT_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {EMPTY_CHAT_PATHS.map((path, index) => (
          <path key={`bubble-${index}`} d={path} />
        ))}
      </svg>
      <p className={styles.emptyTitle}>{t('chat.empty.title')}</p>
      <p className={styles.emptyBody}>{t('chat.empty.body', { name: bot.name })}</p>
    </div>
  );
}
