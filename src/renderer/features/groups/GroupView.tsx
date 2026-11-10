import { Fragment, useEffect, useRef, useState, type ReactElement } from 'react';
import { profileColor } from '../../../shared/color';
import type {
  RemoteGroupEvent,
  RemoteGroupMember,
  RemoteGroupPendingAction,
} from '../../../shared/protocol';
import { useMessages } from '../../app/i18n';
import { appStore, useAppState, useDispatch } from '../../app/store';
import { IconChevronDown, IconSend } from '../../components/icons';
import { BotFace } from '../bots/face/BotFace';
import { RichText } from '../chat/RichText';
import { GroupAvatar } from './GroupAvatar';
import styles from './GroupView.module.css';

const AUTHOR_COLORS = ['#7f9a3f', '#4f86d6', '#d97757', '#8c6bb1', '#2f9e8f', '#b7791f'];

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

function authorFor(
  event: RemoteGroupEvent,
  members: readonly RemoteGroupMember[],
): RemoteGroupMember | null {
  const memberId = payloadRecord(event)?.['member_id'];
  if (typeof memberId !== 'string' || memberId === '') {
    return null;
  }
  return members.find((member) => member.memberId === memberId) ?? null;
}

function authorColor(author: RemoteGroupMember | null, seed: string): string {
  if (author !== null) {
    const color = profileColor(author.profile);
    if (color !== '') {
      return color;
    }
  }
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return AUTHOR_COLORS[hash % AUTHOR_COLORS.length]!;
}

function dayKey(seconds: number): string {
  return new Date(seconds * 1000).toDateString();
}

function dayLabel(seconds: number, today: string, yesterday: string): string {
  const date = new Date(seconds * 1000);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return today;
  }
  const prior = new Date(now);
  prior.setDate(prior.getDate() - 1);
  if (date.toDateString() === prior.toDateString()) {
    return yesterday;
  }
  return date.toLocaleDateString([], { month: 'long', day: 'numeric', weekday: 'short' });
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

/** Group conversation: bubbles, member faces, dates, inline requests and composer. */
export function GroupView(): ReactElement {
  const t = useMessages();
  const dispatch = useDispatch();
  const detail = useAppState((state) => state.remote.groupDetail);
  const events = useAppState((state) => state.remote.groupEvents);
  const loading = useAppState((state) => state.remote.groupLoading);
  const error = useAppState((state) => state.remote.groupError);
  const roomId = useAppState((state) => state.remote.selectedGroupId);
  const bots = useAppState((state) => state.remote.bots);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [stopNotice, setStopNotice] = useState<string | null>(null);
  const [approvalBusy, setApprovalBusy] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [disbandConfirm, setDisbandConfirm] = useState(false);
  const [disbanding, setDisbanding] = useState(false);
  const [disbandError, setDisbandError] = useState<string | null>(null);
  const [retryBusy, setRetryBusy] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [hasNew, setHasNew] = useState(false);
  const [copiedSeq, setCopiedSeq] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const threadId = threadIdFor(events);
  const isCurrentRoom = (): boolean => appStore.getState().remote.selectedGroupId === roomId;
  const firstSeq = events.length === 0 ? 0 : (events[0]?.seq ?? 0);
  const canLoadEarlier = firstSeq > 1;
  const approvals = (detail?.pendingActions ?? []).filter((action) => action.kind === 'approval');
  const retries = (detail?.pendingActions ?? []).filter((action) => action.kind === 'retry');
  const otherActions = (detail?.pendingActions ?? []).filter(
    (action) => action.kind !== 'approval' && action.kind !== 'retry',
  );
  const visibleEvents = events.filter((event) => event.kind !== 'turn.settled');
  const lastSeq = events.length === 0 ? 0 : (events[events.length - 1]?.seq ?? 0);
  const lastSeqRef = useRef(0);
  const displayNameFor = (member: RemoteGroupMember): string => {
    const bot = bots.find((entry) => entry.profileName === member.profile);
    return bot?.displayName ?? member.displayName ?? member.profile;
  };
  const driverLabel =
    detail?.driverStatus === undefined || detail.driverStatus === null
      ? null
      : detail.driverStatus === 'running'
        ? t('group.driverRunning')
        : detail.driverStatus === 'idle'
          ? t('group.driverIdle')
          : detail.driverStatus;

  useEffect(() => {
    const body = bodyRef.current;
    if (body !== null && lastSeq > lastSeqRef.current) {
      if (atBottom) {
        body.scrollTop = body.scrollHeight;
      } else {
        setHasNew(true);
      }
    }
    lastSeqRef.current = lastSeq;
  }, [atBottom, lastSeq]);

  const scrollToLatest = (): void => {
    const body = bodyRef.current;
    if (body !== null) {
      body.scrollTop = body.scrollHeight;
    }
    setAtBottom(true);
    setHasNew(false);
  };

  let lastDay = '';

  return (
    <div className={styles.group}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.back}
          aria-label={t('group.back')}
          title={t('group.back')}
          onClick={() => {
            dispatch({ type: 'group-clear' });
          }}
        >
          ←
        </button>
        <div
          className={styles.nameplate}
          title={
            driverLabel === null
              ? (detail?.name ?? t('group.title'))
              : `${detail?.name ?? t('group.title')} · ${t('group.driver', { status: driverLabel })}`
          }
        >
          <GroupAvatar
            seed={roomId ?? detail?.name ?? 'group'}
            count={detail?.memberCount ?? 0}
            members={detail?.members ?? []}
            size={24}
            label={detail?.name ?? t('group.title')}
          />
          <h2 className={styles.name}>{detail?.name ?? t('group.title')}</h2>
          <span className={styles.nameplateStatus}>
            {t('sidebar.groupMembers', { count: detail?.memberCount ?? 0 })}
          </span>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.headerButton}
            disabled={stopping}
            onClick={() => {
              void stop();
            }}
          >
            {stopping ? t('group.stopping') : t('group.stop')}
          </button>
          <button
            type="button"
            className={styles.headerDanger}
            disabled={disbanding}
            onClick={() => {
              setDisbandConfirm(true);
              setDisbandError(null);
            }}
          >
            {t('group.disband')}
          </button>
        </div>
      </header>

      {disbandConfirm ? (
        <div className={styles.confirmBar}>
          <span>{t('group.disbandConfirm')}</span>
          <button
            type="button"
            className={styles.confirmDanger}
            disabled={disbanding}
            onClick={() => {
              void disband();
            }}
          >
            {disbanding ? t('group.disbanding') : t('group.disbandConfirmAction')}
          </button>
          <button
            type="button"
            className={styles.confirmCancel}
            disabled={disbanding}
            onClick={() => {
              setDisbandConfirm(false);
            }}
          >
            {t('group.disbandCancel')}
          </button>
          {disbandError === null ? null : <span className={styles.error}>{disbandError}</span>}
        </div>
      ) : null}

      <div
        className={styles.body}
        ref={bodyRef}
        onScroll={(event) => {
          const body = event.currentTarget;
          const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 40;
          setAtBottom(nearBottom);
          if (nearBottom) {
            setHasNew(false);
          }
        }}
      >
        {canLoadEarlier ? (
          <button
            type="button"
            className={styles.loadEarlier}
            disabled={loadingEarlier}
            onClick={() => {
              void loadEarlier();
            }}
          >
            {loadingEarlier ? t('group.loadingEarlier') : t('group.loadEarlier')}
          </button>
        ) : null}
        {historyError === null ? null : (
          <p className={styles.error} role="alert">
            {historyError}
          </p>
        )}
        {stopNotice === null ? null : <p className={styles.notice}>{stopNotice}</p>}
        {loading ? <p className={styles.notice}>{t('group.loading')}</p> : null}
        {error === null ? null : (
          <p className={styles.error} role="alert">
            {t('group.error')}
          </p>
        )}
        {!loading && error === null && visibleEvents.length === 0 ? (
          <p className={styles.notice}>{t('group.eventsEmpty')}</p>
        ) : null}

        <ol
          className={styles.messages}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label={t('group.eventsLabel')}
        >
          {visibleEvents.map((event) => {
            const day = dayKey(event.createdAt);
            const separator =
              day === lastDay ? null : (
                <li key={`day-${day}`} className={styles.day}>
                  <span>
                    {dayLabel(event.createdAt, t('group.today'), t('group.yesterday'))}{' '}
                    {timeLabel(event.createdAt)}
                  </span>
                </li>
              );
            lastDay = day;
            if (event.kind === 'message.user') {
              return (
                <Fragment key={`${event.seq}-${event.kind}`}>
                  {separator}
                  <li className={styles.userRow}>
                    <div className={styles.userBubble}>
                      <RichText text={eventText(event)} />
                    </div>
                    <div className={styles.messageActions}>
                      <button
                        type="button"
                        className={styles.messageAction}
                        onClick={() => {
                          void copy(event);
                        }}
                      >
                        {copiedSeq === event.seq ? t('group.copied') : t('group.copy')}
                      </button>
                    </div>
                  </li>
                </Fragment>
              );
            }
            if (event.kind === 'message.member') {
              const author = authorFor(event, detail?.members ?? []);
              const display = author === null ? event.kind : displayNameFor(author);
              return (
                <Fragment key={`${event.seq}-${event.kind}`}>
                  {separator}
                  <li className={styles.memberRow}>
                    <span className={styles.memberAvatar}>
                      <BotFace
                        shape="circle"
                        color={authorColor(author, display)}
                        seed={author?.profile ?? display}
                        mood="idle"
                        size={28}
                      />
                    </span>
                    <div className={styles.memberBody}>
                      <span
                        className={styles.author}
                        style={{ color: authorColor(author, display) }}
                      >
                        {display}
                      </span>
                      <div className={styles.memberBubble}>
                        <RichText text={eventText(event)} />
                      </div>
                      <div className={styles.messageActions}>
                        <button
                          type="button"
                          className={styles.messageAction}
                          onClick={() => {
                            replyTo(display);
                          }}
                        >
                          {t('group.reply')}
                        </button>
                        <button
                          type="button"
                          className={styles.messageAction}
                          onClick={() => {
                            void copy(event);
                          }}
                        >
                          {copiedSeq === event.seq ? t('group.copied') : t('group.copy')}
                        </button>
                      </div>
                    </div>
                  </li>
                </Fragment>
              );
            }
            return (
              <Fragment key={`${event.seq}-${event.kind}`}>
                {separator}
                <li className={styles.systemRow}>
                  <span className={styles.systemPill}>
                    {event.kind === 'room.activity'
                      ? t('group.roomActivity', {
                          status: String(payloadRecord(event)?.['status'] ?? event.kind),
                        })
                      : event.kind}
                  </span>
                </li>
              </Fragment>
            );
          })}
        </ol>

        {approvals.map((action) => {
          const member = (detail?.members ?? []).find(
            (entry) => entry.memberId === action.memberId,
          );
          return (
            <div key={`${action.memberId}-${action.requestId}`} className={styles.requestCard}>
              <div className={styles.requestTitle}>
                {t('group.approval', {
                  member: member === undefined ? action.memberId : displayNameFor(member),
                })}
              </div>
              <div className={styles.requestActions}>
                <button
                  type="button"
                  className={styles.allow}
                  disabled={approvalBusy !== null}
                  onClick={() => {
                    void decide(action, 'once');
                  }}
                >
                  {t('group.approveOnce')}
                </button>
                <button
                  type="button"
                  className={styles.deny}
                  disabled={approvalBusy !== null}
                  onClick={() => {
                    void decide(action, 'deny');
                  }}
                >
                  {t('group.deny')}
                </button>
              </div>
              {approvalError === null ? null : (
                <span className={styles.error}>{approvalError}</span>
              )}
            </div>
          );
        })}

        {retries.map((action) => (
          <div key={`retry-${action.taskId}`} className={styles.requestCard}>
            <div className={styles.requestTitle}>{t('group.retryPending')}</div>
            <div className={styles.requestActions}>
              <button
                type="button"
                className={styles.allow}
                disabled={retryBusy !== null}
                onClick={() => {
                  void retry(action);
                }}
              >
                {retryBusy === action.taskId ? t('group.retrying') : t('group.retry')}
              </button>
            </div>
            {retryError === null ? null : <span className={styles.error}>{retryError}</span>}
          </div>
        ))}

        {otherActions.map((action) => (
          <div key={`action-${action.taskId}`} className={styles.requestCard}>
            <div className={styles.requestTitle}>
              {t('group.pendingAction', { kind: action.kind })}
            </div>
          </div>
        ))}
      </div>

      {hasNew ? (
        <button
          type="button"
          className={styles.scrollDown}
          aria-label={t('group.scrollToLatest')}
          title={t('group.scrollToLatest')}
          onClick={scrollToLatest}
        >
          <IconChevronDown size={16} />
        </button>
      ) : null}

      <footer className={styles.composer}>
        <div className={styles.composerBox}>
          <textarea
            ref={inputRef}
            className={styles.input}
            value={draft}
            placeholder={t('group.composerPlaceholder', {
              name: detail?.name ?? t('group.title'),
            })}
            aria-label={t('group.composerPlaceholder', {
              name: detail?.name ?? t('group.title'),
            })}
            rows={1}
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
            className={styles.sendButton}
            aria-label={t('group.send')}
            title={t('group.send')}
            disabled={sending || draft.trim() === '' || roomId === null}
            onClick={() => {
              void send();
            }}
          >
            <IconSend size={16} />
          </button>
        </div>
        {sendError === null ? null : (
          <p className={styles.error} role="alert">
            {sendError}
          </p>
        )}
      </footer>
    </div>
  );

  async function loadEarlier(): Promise<void> {
    const dashboard = window.mosbot?.dashboard;
    if (dashboard === undefined || roomId === null || firstSeq <= 1) {
      return;
    }
    setLoadingEarlier(true);
    setHistoryError(null);
    try {
      const result = await dashboard.chatGroupLog(roomId, Math.max(0, firstSeq - 51), 50);
      if (!result.ok) {
        setHistoryError(t('group.loadEarlierError'));
        return;
      }
      if (isCurrentRoom()) {
        dispatch({ type: 'group-log-prepend', events: [...result.data.events] });
      }
    } finally {
      setLoadingEarlier(false);
    }
  }

  async function copy(event: RemoteGroupEvent): Promise<void> {
    try {
      await navigator.clipboard.writeText(eventText(event));
      setCopiedSeq(event.seq);
      window.setTimeout(() => {
        setCopiedSeq((current) => (current === event.seq ? null : current));
      }, 1_500);
    } catch {
      // Clipboard access can be denied; keep the message selectable instead.
    }
  }

  const replyTo = (display: string): void => {
    const mention = `@${display} `;
    setDraft((current) => (current.startsWith(mention) ? current : `${mention}${current}`));
    inputRef.current?.focus();
  };

  async function disband(): Promise<void> {
    const dashboard = window.mosbot?.dashboard;
    if (dashboard === undefined || roomId === null) {
      return;
    }
    setDisbanding(true);
    setDisbandError(null);
    const result = await dashboard.chatGroupDisband(roomId);
    if (!result.ok) {
      setDisbanding(false);
      setDisbandError(t('group.disbandError'));
      return;
    }
    if (!isCurrentRoom()) {
      setDisbanding(false);
      return;
    }
    const refreshed = await dashboard.chatListGroups();
    if (refreshed.ok) {
      dispatch({ type: 'remote-groups', groups: [...refreshed.data] });
    }
    dispatch({ type: 'group-clear' });
    setDisbanding(false);
  }

  async function refreshAfterAction(): Promise<void> {
    const dashboard = window.mosbot?.dashboard;
    if (dashboard === undefined || roomId === null) {
      return;
    }
    const lastSeen = appStore.getState().remote.groupEvents;
    const since = lastSeen.length === 0 ? 0 : (lastSeen[lastSeen.length - 1]?.seq ?? 0);
    const [state, log] = await Promise.all([
      dashboard.chatGroupState(roomId),
      dashboard.chatGroupLog(roomId, since, 100),
    ]);
    if (!isCurrentRoom()) {
      return;
    }
    if (state.ok) {
      dispatch({ type: 'group-detail', detail: state.data });
    }
    if (log.ok) {
      if (log.data.events.length > 0) {
        dispatch({ type: 'group-log-append', events: [...log.data.events] });
      }
      dispatch({ type: 'group-latest', latestSeq: log.data.latestSeq });
    }
  }

  async function retry(action: RemoteGroupPendingAction): Promise<void> {
    const dashboard = window.mosbot?.dashboard;
    if (dashboard === undefined || roomId === null) {
      return;
    }
    setRetryBusy(action.taskId);
    setRetryError(null);
    const result = await dashboard.chatGroupRetry(roomId, action.taskId);
    if (!result.ok) {
      setRetryBusy(null);
      setRetryError(t('group.retryError'));
      return;
    }
    await refreshAfterAction();
    setRetryBusy(null);
  }

  async function decide(action: RemoteGroupPendingAction, choice: 'once' | 'deny'): Promise<void> {
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
    if (!isCurrentRoom()) {
      setApprovalBusy(null);
      return;
    }
    await refreshAfterAction();
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
    if (!isCurrentRoom()) {
      setStopping(false);
      return;
    }
    setStopNotice(t('group.stopped'));
    await refreshAfterAction();
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
    if (!isCurrentRoom()) {
      setSending(false);
      return;
    }
    setDraft('');
    await refreshAfterAction();
    setSending(false);
  }
}
