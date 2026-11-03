import type { ReactElement } from 'react';
import type { ComputerState, ComputerStatus } from '../../../shared/domain';
import { type MessageKey, useMessages } from '../../app/i18n';
import { useAppState, useDispatch } from '../../app/store';
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
  const computer = useAppState((state) => state.computers[profileId]) ?? ASLEEP_FALLBACK;
  const copy = STATUS_COPY[computer.status];
  const showsFrame = FRAME_STATUSES.includes(computer.status);

  if (remoteRoster) {
    return (
      <div className={styles.tabContent}>
        <section className={styles.computerCard}>
          <p className={styles.hint}>{t('inspector.computer.pending')}</p>
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
