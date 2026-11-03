import { useLayoutEffect, useRef, type ReactElement } from 'react';
import type { ClarifyRequest } from '../../../shared/domain';
import { useMessages } from '../../app/i18n';
import { useDispatch } from '../../app/store';
import { IconCheck } from '../../components/icons';
import styles from './ChatView.module.css';

export interface ClarifyCardProps {
  readonly messageId: string;
  readonly clarify: ClarifyRequest;
}

/** A question the Bot needs answered before it can continue. */
export function ClarifyCard({ messageId, clarify }: ClarifyCardProps): ReactElement {
  const t = useMessages();
  const dispatch = useDispatch();
  const receiptRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const answered = clarify.options.find((option) => option.id === clarify.answerId) ?? null;

  useLayoutEffect(() => {
    if (answered === null) {
      return;
    }
    if (cardRef.current?.contains(document.activeElement) === true) {
      receiptRef.current?.focus();
    }
  }, [answered]);

  if (answered !== null) {
    return (
      <div className={styles.receipt} role="status" tabIndex={-1} ref={receiptRef}>
        <IconCheck size={13} />
        <span>{t('chat.clarify.answered', { answer: answered.label })}</span>
      </div>
    );
  }

  return (
    <div className={styles.requestCard} role="group" aria-label={clarify.question} ref={cardRef}>
      <p className={styles.requestTitle}>{clarify.question}</p>
      <div className={styles.requestActions}>
        {clarify.options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={styles.actionNeutral}
            onClick={() => {
              dispatch({
                type: 'answer-clarify',
                messageId,
                optionId: option.id,
                at: Date.now(),
              });
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
