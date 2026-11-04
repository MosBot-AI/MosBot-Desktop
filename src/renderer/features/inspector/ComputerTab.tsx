import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { ComputerState, ComputerStatus } from '../../../shared/domain';
import { type MessageKey, useMessages } from '../../app/i18n';
import { useAppState, useDispatch } from '../../app/store';
import type { DisplaySnapshot } from '../../../shared/protocol';
import styles from './InspectorPanel.module.css';

export interface ComputerTabProps {
  readonly profileId: string;
  readonly botName: string;
}

interface StatusCopy {
  readonly title: MessageKey;
  readonly hint: MessageKey | null;
}

const STATUS_COPY: Record<ComputerStatus, StatusCopy> = {
  asleep: { title: 'inspector.computer.asleep', hint: 'inspector.computer.asleepHint' },
  waking: { title: 'inspector.computer.waking', hint: null },
  preview: { title: 'inspector.computer.preview', hint: 'inspector.computer.previewHint' },
  watching: { title: 'inspector.computer.watching', hint: 'inspector.computer.previewHint' },
  controlling: { title: 'inspector.computer.controlling', hint: null },
  'other-viewer': {
    title: 'inspector.computer.other-viewer',
    hint: 'inspector.computer.other-viewerHint',
  },
  reconnecting: { title: 'inspector.computer.reconnecting', hint: null },
  failed: { title: 'inspector.computer.failed', hint: 'inspector.computer.failedHint' },
};

const STATUS_TONES: Record<ComputerStatus, string | undefined> = {
  asleep: styles.statusAsleep,
  waking: styles.statusWaking,
  preview: styles.statusLive,
  watching: styles.statusLive,
  controlling: styles.statusLive,
  'other-viewer': styles.statusBusy,
  reconnecting: styles.statusWaking,
  failed: styles.statusFailed,
};

const FRAME_STATUSES: readonly ComputerStatus[] = ['preview', 'watching', 'controlling'];

const ASLEEP_FALLBACK: ComputerState = { profileId: '', status: 'asleep', frameAgeSeconds: 0 };

/**
 * Read-only remote-computer status for this Bot. The preview never draws a fake
 * screen: it is a token-coloured 16:10 placeholder, and any takeover
 * (`other-viewer`) or reconnect drops the frame instead of showing a stale one.
 */
export function ComputerTab({ profileId, botName }: ComputerTabProps): ReactElement {
  const t = useMessages();
  const dispatch = useDispatch();
  const remoteRoster = useAppState(
    (state) => state.remote.status === 'ready' && state.remote.bots.length > 0,
  );
  const [remoteState, setRemoteState] = useState<{
    status: 'loading' | 'ready' | 'error';
    snapshot: DisplaySnapshot | null;
    frame: string | null;
    suppressed: string | null;
    waking: boolean;
  }>({ status: 'loading', snapshot: null, frame: null, suppressed: null, waking: false });
  const computer = useAppState((state) => state.computers[profileId]) ?? ASLEEP_FALLBACK;
  const copy = STATUS_COPY[computer.status];
  const showsFrame = FRAME_STATUSES.includes(computer.status);

  const loadRemote = useCallback(async (): Promise<void> => {
    const dashboard = window.mosbot?.dashboard;
    if (dashboard === undefined) {
      return;
    }
    const status = await dashboard.displayStatus(profileId);
    if (!status.ok) {
      setRemoteState((current) => ({ ...current, status: 'error' }));
      return;
    }
    let frame: string | null = null;
    let suppressed: string | null = null;
    if (status.data.running) {
      const thumbnail = await dashboard.displayThumbnail(profileId);
      if (thumbnail.ok) {
        frame = thumbnail.data.dataUrl;
        suppressed = thumbnail.data.suppressed;
      }
    }
    setRemoteState((current) => ({
      ...current,
      status: 'ready',
      snapshot: status.data,
      frame,
      suppressed,
    }));
  }, []);

  useEffect(() => {
    if (!remoteRoster) {
      return;
    }
    let cancelled = false;
    void loadRemote();
    const timer = window.setInterval(() => {
      if (!cancelled) {
        void loadRemote();
      }
    }, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [remoteRoster, profileId, loadRemote]);

  if (remoteRoster) {
    const snapshot = remoteState.snapshot;
    const wake = async (): Promise<void> => {
      const dashboard = window.mosbot?.dashboard;
      if (dashboard === undefined) {
        return;
      }
      setRemoteState((current) => ({ ...current, waking: true }));
      const started = await dashboard.displayStart(profileId);
      setRemoteState((current) => ({
        ...current,
        waking: false,
        snapshot: started.ok ? started.data : current.snapshot,
      }));
      if (started.ok) {
        window.setTimeout(() => {
          void loadRemote();
        }, 1_500);
      }
    };
    const blocked = snapshot?.blocker ?? null;
    const humanHolds = snapshot?.lease?.holder === 'human';
    return (
      <div className={styles.tabContent}>
        <section className={styles.computerCard}>
          {remoteState.status === 'loading' ? (
            <p className={styles.hint}>{t('inspector.computer.remote.loading')}</p>
          ) : remoteState.status === 'error' || snapshot === null ? (
            <p className={styles.hint}>{t('inspector.computer.remote.failed')}</p>
          ) : (
            <>
              <div className={styles.computerStatus} role="status" aria-live="polite">
                <span
                  className={[
                    styles.statusDot,
                    snapshot.running ? styles.statusLive : styles.statusAsleep,
                  ].join(' ')}
                  aria-hidden="true"
                />
                <span className={styles.statusTitle}>
                  {snapshot.running
                    ? t('inspector.computer.remote.running')
                    : t('inspector.computer.remote.asleep')}
                </span>
              </div>
              {snapshot.geometry === '' ? null : <p className={styles.hint}>{snapshot.geometry}</p>}
              {humanHolds || remoteState.suppressed !== null ? (
                <p className={styles.hint}>{t('inspector.computer.remote.otherViewer')}</p>
              ) : remoteState.frame === null ? null : (
                <img
                  className={styles.computerFrame}
                  src={remoteState.frame}
                  alt={t('inspector.computer.remote.running')}
                />
              )}
              {blocked === null ? null : (
                <p className={styles.hint}>
                  {t('inspector.computer.remote.blocked', { reason: blocked })}
                </p>
              )}
              {snapshot.running ? (
                <button
                  type="button"
                  className={styles.wakeButton}
                  onClick={() => {
                    void window.mosbot?.dashboard.openComputerViewer(profileId);
                  }}
                >
                  {t('inspector.computer.remote.open')}
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.wakeButton}
                  disabled={remoteState.waking || !snapshot.supported || blocked !== null}
                  onClick={() => {
                    void wake();
                  }}
                >
                  {remoteState.waking
                    ? t('inspector.computer.remote.waking')
                    : t('inspector.computer.remote.wake')}
                </button>
              )}
            </>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className={styles.tabContent}>
      <section className={styles.computerCard}>
        <div className={styles.computerStatus} role="status" aria-live="polite">
          <span
            className={[styles.statusDot, STATUS_TONES[computer.status]].join(' ')}
            aria-hidden="true"
          />
          <span className={styles.statusTitle}>{t(copy.title)}</span>
          {showsFrame && computer.frameAgeSeconds > 0 ? (
            <span className={styles.frameAge}>
              {t('inspector.computer.frameAge', { seconds: computer.frameAgeSeconds })}
            </span>
          ) : null}
        </div>

        {copy.hint === null ? null : <p className={styles.hint}>{t(copy.hint)}</p>}

        {computer.status === 'asleep' ? (
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => {
              dispatch({ type: 'wake-computer', profileId });
            }}
          >
            {t('inspector.computer.wake')}
          </button>
        ) : null}

        {computer.status === 'failed' ? (
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => {
              dispatch({ type: 'wake-computer', profileId });
            }}
          >
            {t('inspector.computer.retry')}
          </button>
        ) : null}

        {computer.status === 'waking' ? (
          <div
            className={styles.progress}
            role="progressbar"
            aria-label={t('inspector.computer.waking')}
          />
        ) : null}

        {showsFrame ? (
          <div
            className={styles.frame}
            role="img"
            aria-label={t('inspector.computer.previewAlt', { name: botName })}
          />
        ) : null}

        {showsFrame ? (
          <div className={styles.openRow}>
            <span className={styles.openWrap} title={t('inspector.computer.openUnavailable')}>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled
                title={t('inspector.computer.openUnavailable')}
              >
                {t('inspector.computer.open')}
              </button>
            </span>
            <p className={styles.unavailable}>{t('inspector.computer.openUnavailable')}</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
