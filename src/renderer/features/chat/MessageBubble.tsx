import type { ReactElement } from 'react';
import type { ChatMessage } from '../../../shared/domain';
import { useMessages } from '../../app/i18n';
import styles from './ChatView.module.css';
import { ApprovalCard } from './ApprovalCard';
import { ClarifyCard } from './ClarifyCard';
import { RichText } from './RichText';
import { WorkRecord } from './WorkRecord';

export interface MessageBubbleProps {
  readonly message: ChatMessage;
  readonly userBubble: { readonly background: string; readonly color: string };
}

/** Renders one stream item: text bubble, grouped work log, or an inline request. */
export function MessageBubble({ message, userBubble }: MessageBubbleProps): ReactElement {
  const t = useMessages();

  switch (message.kind) {
    case 'text': {
      const isUser = message.role === 'user';
      return (
        <div
          className={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowBot].join(
            ' ',
          )}
        >
          <div
            className={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot].join(' ')}
            style={
              isUser ? { background: userBubble.background, color: userBubble.color } : undefined
            }
          >
            {isUser ? (
              <p className={styles.plainText}>{message.text}</p>
            ) : (
              <RichText text={message.text} streaming={message.streaming === true} />
            )}
          </div>
        </div>
      );
    }
    case 'work':
      return (
        <div className={styles.bubbleRowBot}>
          <WorkRecord title={message.title} steps={message.steps} />
        </div>
      );
    case 'approval':
      return (
        <div className={styles.bubbleRowBot}>
          <ApprovalCard messageId={message.id} approval={message.approval} />
        </div>
      );
    case 'clarify':
      return (
        <div className={styles.bubbleRowBot}>
          <ClarifyCard messageId={message.id} clarify={message.clarify} />
        </div>
      );
    case 'stopped':
      return (
        <div className={styles.bubbleRowBot}>
          <p className={styles.stopped}>
            <span className={styles.stoppedDot} aria-hidden="true" />
            <span>{t('chat.stopped')}</span>
            {message.text === '' ? null : (
              <span className={styles.stoppedText}>{message.text}</span>
            )}
          </p>
        </div>
      );
    default: {
      const exhaustive: never = message;
      return exhaustive;
    }
  }
}
