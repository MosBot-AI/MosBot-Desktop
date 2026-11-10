import type { ReactElement } from 'react';
import { useMessages } from '../../app/i18n';
import { useAppState, useDispatch } from '../../app/store';
import styles from './GroupView.module.css';

function timeLabel(seconds: number): string {
  if (seconds <= 0) {
    return '';
  }
  return new Date(seconds * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Read-only hosted-room view: room metadata plus the latest log event kinds. */
export function GroupView(): ReactElement {
  const t = useMessages();
  const dispatch = useDispatch();
  const detail = useAppState((state) => state.remote.groupDetail);
  const events = useAppState((state) => state.remote.groupEvents);
  const loading = useAppState((state) => state.remote.groupLoading);
  const error = useAppState((state) => state.remote.groupError);

  return (
    <div className={styles.group}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.back}
          onClick={() => {
            dispatch({ type: 'group-clear' });
          }}
        >
          {t('group.back')}
        </button>
        <div className={styles.heading}>
          <h2 className={styles.name}>{detail?.name ?? t('group.title')}</h2>
          <span className={styles.readOnly}>{t('group.readOnly')}</span>
        </div>
        {detail === null ? null : (
          <div className={styles.meta}>
            <span>{t('sidebar.groupMembers', { count: detail.memberCount })}</span>
            <span>{t('group.latestSeq', { seq: detail.latestSeq })}</span>
            {detail.driverStatus === null ? null : (
              <span>{t('group.driver', { status: detail.driverStatus })}</span>
            )}
          </div>
        )}
      </header>

      <div className={styles.body}>
        {loading ? <p className={styles.notice}>{t('group.loading')}</p> : null}
        {error === null ? null : (
          <p className={styles.error} role="alert">
            {t('group.error')}
          </p>
        )}
        {!loading && error === null && events.length === 0 ? (
          <p className={styles.notice}>{t('group.eventsEmpty')}</p>
        ) : null}
        {events.length === 0 ? null : (
          <ol className={styles.events}>
            {events.map((event) => (
              <li key={`${event.seq}-${event.kind}`} className={styles.event}>
                <span className={styles.eventSeq}>#{event.seq}</span>
                <span className={styles.eventKind}>{event.kind}</span>
                <span className={styles.eventTime}>{timeLabel(event.createdAt)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
