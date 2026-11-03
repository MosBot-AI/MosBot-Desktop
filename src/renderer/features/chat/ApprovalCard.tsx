import { useLayoutEffect, useRef, type ReactElement } from 'react';
import type { ApprovalRequest } from '../../../shared/domain';
import { useMessages } from '../../app/i18n';
import { isRemoteRoster, useAppState, useDispatch } from '../../app/store';
import { IconCheck, IconWarning } from '../../components/icons';
import styles from './ChatView.module.css';

export interface ApprovalCardProps {
  readonly messageId: string;
  readonly approval: ApprovalRequest;
}

const ACTION_KEYS: Record<
  ApprovalRequest['actions'][number]['id'],
  | 'chat.approval.allow'
  | 'chat.approval.allow-session'
  | 'chat.approval.allow-always'
  | 'chat.approval.deny'
> = {
  allow: 'chat.approval.allow',
  'allow-session': 'chat.approval.allow-session',
  'allow-always': 'chat.approval.allow-always',
  deny: 'chat.approval.deny',
};

/** Wire choice names of the gateway's approval tool. */
const REMOTE_CHOICES: Record<ApprovalRequest['actions'][number]['id'], string> = {
  allow: 'once',
  'allow-session': 'session',
  'allow-always': 'always',
  deny: 'deny',
};

/** A server request in the transcript; once answered it folds into a receipt. */
export function ApprovalCard({ messageId, approval }: ApprovalCardProps): ReactElement {
  const t = useMessages();
  const dispatch = useDispatch();
  const remoteMode = useAppState((state) => isRemoteRoster(state));
  const receiptRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const resolved = approval.resolution;

  useLayoutEffect(() => {
    if (resolved === null) {
      return;
    }
    if (cardRef.current?.contains(document.activeElement) === true) {
      receiptRef.current?.focus();
    }
  }, [resolved]);

  if (resolved !== null) {
    return (
      <div className={styles.receipt} role="status" tabIndex={-1} ref={receiptRef}>
        <IconCheck size={13} />
        <span>{t(`chat.approval.receipt.${resolved.action}`)}</span>
      </div>
    );
  }

  return (
    <div
      className={styles.requestCard}
      role="group"
      aria-label={t('chat.approval.title')}
      ref={cardRef}
    >
      <p className={styles.requestLabel}>
        <IconWarning size={13} />
        <span>{t('chat.approval.title')}</span>
      </p>
      <p className={styles.requestTitle}>{approval.title}</p>
      <p className={styles.requestDetail}>{approval.detail}</p>
      <div className={styles.requestActions}>
        {approval.actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={
              action.tone === 'primary'
                ? styles.actionPrimary
                : action.tone === 'danger'
                  ? styles.actionDanger
                  : styles.actionNeutral
            }
            onClick={() => {
              if (remoteMode) {
                void window.mosbot?.dashboard.chatAnswer(messageId, {
                  choice: REMOTE_CHOICES[action.id],
                });
                dispatch({
                  type: 'live-request-resolved',
                  requestId: messageId,
                  receipt: action.id,
                });
                return;
              }
              dispatch({
                type: 'answer-approval',
                messageId,
                action: action.id,
                at: Date.now(),
              });
            }}
          >
            {t(ACTION_KEYS[action.id])}
          </button>
        ))}
      </div>
    </div>
  );
}
