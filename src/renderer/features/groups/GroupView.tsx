import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useMessages } from '../../app/i18n';
import { useAppState, useDispatch } from '../../app/store';
import { RichText } from '../chat/RichText';
import type { RemoteGroupEvent } from '../../../shared/protocol';
import styles from './GroupView.module.css';

function payloadRecord(event: RemoteGroupEvent): Record<string, unknown> | null {
  const payload = event.payload;
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null;
}

function threadIdFor(events: readonly RemoteGroupEvent[]): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const threadId = payloadRecord(events[index]!)?.['thread_id'];
    if (typeof threadId === 'string' && threadId !== '') {
      return threadId;
    }
  }
  return null;
}

function eventText(event: RemoteGroupEvent): string {
  const payload = payloadRecord(event);
  const text = payload?.['text'];
  if (typeof text === 'string' && text !== '') {
    return text;
  }
  return event.kind;
}

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
  const roomId = useAppState((state) => state.remote.selectedGroupId);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [stopNotice, setStopNotice] = useState<string | null>(null);
  const [approvalBusy, setApprovalBusy] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const threadId = threadIdFor(events);

  useEffect(() => {
    const body = bodyRef.current;
    if (body !== null) {
      body.scrollTop = body.scrollHeight;
    }
  }, [events.length]);

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
            {detail.working === true ? <span>{t('group.working')}</span> : null}
            {detail.blocked === true ? <span>{t('group.blocked')}</span> : null}
            {(detail.members ?? []).map((member) => (
              <span key={member.memberId} className={styles.member}>
                {member.displayName}
              </span>
            ))}
            <button
              type="button"
              className={styles.stop}
              disabled={stopping}
              onClick={() => {
                void stop();
              }}
            >
              {stopping ? t('group.stopping') : t('group.stop')}
            </button>
            {stopNotice === null ? null : <span>{stopNotice}</span>}
          </div>
        )}
      </header>

      {(detail?.pendingActions ?? []).map((action) => (
        <div key={`${action.memberId}-${action.requestId}`} className={styles.approval}>
          <span>{t('group.approval', { member: action.memberId })}</span>
          <button
            type="button"
            className={styles.approvalAllow}
            disabled={approvalBusy !== null}
            onClick={() => {
              void decide(action, 'once');
            }}
          >
            {t('group.approveOnce')}
          </button>
          <button
            type="button"
            className={styles.approvalDeny}
            disabled={approvalBusy !== null}
            onClick={() => {
              void decide(action, 'deny');
            }}
          >
            {t('group.deny')}
          </button>
          {approvalError === null ? null : <span className={styles.error}>{approvalError}</span>}
        </div>
      ))}

      <div className={styles.body} ref={bodyRef}>
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
                <span className={styles.eventKind}>
                  {event.kind.startsWith('message.') ? (
                    <RichText text={eventText(event)} />
                  ) : (
                    event.kind
                  )}
                </span>
                <span className={styles.eventTime}>{timeLabel(event.createdAt)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <footer className={styles.composer}>
        <textarea
          className={styles.input}
          value={draft}
          placeholder={t('group.composerPlaceholder')}
          aria-label={t('group.composerPlaceholder')}
          rows={2}
          disabled={sending}
          onChange={(event) => {
            setDraft(event.target.value);
            setSendError(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
              return;
            }
            event.preventDefault();
            void send();
          }}
        />
        <button
          type="button"
          className={styles.send}
          disabled={sending || draft.trim() === '' || roomId === null}
          onClick={() => {
            void send();
          }}
        >
          {sending ? t('group.sending') : t('group.send')}
        </button>
        {sendError === null ? null : (
          <p className={styles.error} role="alert">
            {sendError}
          </p>
        )}
      </footer>
    </div>
  );

  async function decide(
    action: NonNullable<NonNullable<typeof detail>['pendingActions']>[number],
    choice: 'once' | 'deny',
  ): Promise<void> {
    const dashboard = window.mosbot?.dashboard;
    if (dashboard === undefined || roomId === null) {
      return;
    }
    setApprovalBusy(action.requestId);
    setApprovalError(null);
    const result = await dashboard.chatGroupApprove(roomId, action, choice);
    if (!result.ok) {
      setApprovalBusy(null);
      setApprovalError(t('group.approvalError'));
      return;
    }
    const [state, log] = await Promise.all([
      dashboard.chatGroupState(roomId),
      dashboard.chatGroupLog(roomId, 0, 50),
    ]);
    if (state.ok) {
      dispatch({ type: 'group-detail', detail: state.data });
    }
    if (log.ok) {
      dispatch({ type: 'group-log', events: [...log.data.events] });
    }
    setApprovalBusy(null);
  }

  async function stop(): Promise<void> {
    const dashboard = window.mosbot?.dashboard;
    if (dashboard === undefined || roomId === null) {
      return;
    }
    setStopping(true);
    setStopNotice(null);
    const result = await dashboard.chatGroupStop(roomId);
    if (!result.ok) {
      setStopping(false);
      setStopNotice(t('group.stopError'));
      return;
    }
    setStopNotice(t('group.stopped'));
    const [detail, log] = await Promise.all([
      dashboard.chatGroupState(roomId),
      dashboard.chatGroupLog(roomId, 0, 50),
    ]);
    if (detail.ok) {
      dispatch({ type: 'group-detail', detail: detail.data });
    }
    if (log.ok) {
      dispatch({ type: 'group-log', events: [...log.data.events] });
    }
    setStopping(false);
  }

  async function send(): Promise<void> {
    const dashboard = window.mosbot?.dashboard;
    const text = draft.trim();
    if (dashboard === undefined || roomId === null || text === '') {
      return;
    }
    setSending(true);
    setSendError(null);
    const eventId = `group-${crypto.randomUUID()}`;
    const sent = await dashboard.chatGroupSend(
      roomId,
      threadId ?? crypto.randomUUID(),
      text,
      eventId,
    );
    if (!sent.ok) {
      setSending(false);
      setSendError(t('group.sendError'));
      return;
    }
    setDraft('');
    const [detail, log] = await Promise.all([
      dashboard.chatGroupState(roomId),
      dashboard.chatGroupLog(roomId, 0, 50),
    ]);
    if (detail.ok) {
      dispatch({ type: 'group-detail', detail: detail.data });
    }
    if (log.ok) {
      dispatch({ type: 'group-log', events: [...log.data.events] });
    }
    setSending(false);
  }
}
