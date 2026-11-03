import type { ReactElement } from 'react';
import type { BotProfile } from '../../../shared/domain';
import { useMessages } from '../../app/i18n';
import { presenceKey } from '../../app/format';
import { BotAvatar } from '../bots/BotAvatar';
import { BotStatusDot } from '../bots/BotStatusDot';
import styles from './ChatView.module.css';

export interface ChatNameplateProps {
  readonly bot: BotProfile;
  readonly open: boolean;
  readonly onToggle: () => void;
}

/**
 * The only chrome above the conversation: face, name and a short state. Clicking
 * it opens the details column; it is the focus return target when that closes.
 */
export function ChatNameplate({ bot, open, onToggle }: ChatNameplateProps): ReactElement {
  const t = useMessages();
  const label = t('chat.nameplate.open', { name: bot.name });
  return (
    <button
      id="chat-nameplate"
      type="button"
      className={styles.nameplate}
      aria-expanded={open}
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      <BotAvatar bot={bot} size={22} animated={false} />
      <span className={styles.nameplateName} title={bot.name}>
        {bot.name}
      </span>
      <span className={styles.nameplateStatus}>
        <BotStatusDot presence={bot.presence} size="sm" />
        <span>{t(presenceKey(bot.presence))}</span>
      </span>
    </button>
  );
}
