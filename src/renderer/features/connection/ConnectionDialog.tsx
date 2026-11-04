import { useEffect, useRef, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import type { ProtocolErrorCode } from '../../../shared/protocol';
import { type MessageKey, useMessages } from '../../app/i18n';
import { useAppState } from '../../app/store';
import { BrandWordmark } from '../../components/BrandWordmark';
import { IconClose } from '../../components/icons';
import styles from './ConnectionDialog.module.css';
import { useConnectionActions } from './useConnection';

const ERROR_KEYS: Record<ProtocolErrorCode, MessageKey> = {
  invalid_url: 'connection.error.invalid_url',
  insecure_url: 'connection.error.insecure_url',
  unreachable: 'connection.error.unreachable',
  timeout: 'connection.error.timeout',
  http_error: 'connection.error.http_error',
  unauthorized: 'connection.error.unauthorized',
  session_expired: 'connection.error.session_expired',
  malformed_response: 'connection.error.malformed_response',
  auth_cancelled: 'connection.error.auth_cancelled',
  auth_unavailable: 'connection.error.auth_unavailable',
  provider_required: 'connection.error.provider_required',
  vault_unavailable: 'connection.error.vault_unavailable',
  conflict: 'connection.error.conflict',
  internal: 'connection.error.internal',
};

/**
 * First-connection surface: address, preflight, provider choice, browser handoff
 * and the connected summary. Credentials never enter the renderer; this window
 * only sees the account snapshot.
 */
export function ConnectionDialog(): ReactElement | null {
  const t = useMessages();
  const language = useAppState((state) => state.language);
  const { ui, connect, chooseProvider, cancel, signOut, close, updateAddress, defaultAddress } =
    useConnectionActions();
  const addressRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!ui.open) {
      return;
    }
    addressRef.current?.focus({ preventScroll: true });
  }, [ui.open]);

  useEffect(() => {
    if (!ui.open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing) {
        return;
      }
      if (ui.stage === 'awaiting-browser') {
        void cancel();
      }
      close();
      document.getElementById('sidebar-connection')?.focus({ preventScroll: true });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [ui.open, ui.stage, cancel, close]);

  if (!ui.open) {
    return null;
  }

  const busy = ui.stage === 'checking' || ui.stage === 'awaiting-browser';
  const errorMessage =
    ui.error === null
      ? null
      : t(ERROR_KEYS[ui.error.code], {
          status: ui.error.httpStatus ?? '',
        });
  const expiry =
    ui.snapshot?.expiresAt === null || ui.snapshot?.expiresAt === undefined
      ? null
      : new Intl.DateTimeFormat(language === 'zh-Hans' ? 'zh-Hans' : 'en', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(ui.snapshot.expiresAt * 1000));

  return createPortal(
    <div
      className={styles.scrim}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          close();
        }
      }}
    >
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="connection-title"
      >
        <header className={styles.header}>
          <BrandWordmark height={14} />
          <h2 id="connection-title" className={styles.title}>
            {ui.stage === 'connected' ? t('connection.connected') : t('connection.title')}
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            aria-label={t('connection.close')}
            onClick={() => {
              close();
              document.getElementById('sidebar-connection')?.focus({ preventScroll: true });
            }}
          >
            <IconClose size={14} />
          </button>
        </header>

        {ui.stage === 'connected' && ui.snapshot !== null ? (
          <div className={styles.body}>
            <dl className={styles.summary}>
              <div>
                <dt>{t('connection.account')}</dt>
                <dd>{ui.snapshot.displayName ?? ui.snapshot.userId ?? '—'}</dd>
              </div>
              <div>
                <dt>{t('connection.address')}</dt>
                <dd>{ui.snapshot.displayUrl ?? '—'}</dd>
              </div>
              {expiry === null ? null : (
                <div>
                  <dt>{t('connection.expiryLabel')}</dt>
                  <dd>{expiry}</dd>
                </div>
              )}
            </dl>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                onClick={() => {
                  close();
                }}
              >
                {t('connection.done')}
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => {
                  void signOut();
                }}
              >
                {t('connection.signOut')}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.body}>
            <label className={styles.label} htmlFor="connection-address">
              {t('connection.addressLabel')}
            </label>
            <input
              id="connection-address"
              ref={addressRef}
              className={styles.input}
              value={ui.address}
              placeholder={defaultAddress}
              disabled={busy}
              spellCheck={false}
              onChange={(event) => {
                updateAddress(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !busy && ui.address.trim() !== '') {
                  event.preventDefault();
                  void connect();
                }
              }}
            />
            <p className={styles.hint}>{t('connection.addressHint')}</p>

            {ui.stage === 'choose-provider' ? (
              <div
                className={styles.providers}
                role="group"
                aria-label={t('connection.chooseProvider')}
              >
                <p className={styles.stageText}>{t('connection.chooseProvider')}</p>
                {ui.providers.map((provider) => (
                  <button
                    key={provider.name}
                    type="button"
                    className={styles.providerButton}
                    onClick={() => {
                      void chooseProvider(provider.name);
                    }}
                  >
                    {provider.displayName || provider.name}
                  </button>
                ))}
              </div>
            ) : null}

            {ui.stage === 'checking' ? (
              <p className={styles.stageText} role="status">
                {t('connection.checking')}
              </p>
            ) : null}

            {ui.stage === 'awaiting-browser' ? (
              <div className={styles.stageText} role="status">
                <p>{t('connection.awaitingBrowser')}</p>
                <p className={styles.hint}>{t('connection.awaitingBrowserHint')}</p>
              </div>
            ) : null}

            {errorMessage === null ? null : (
              <p className={styles.error} role="alert">
                {errorMessage}
              </p>
            )}

            <div className={styles.actions}>
              {ui.stage === 'awaiting-browser' ? (
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => {
                    void cancel();
                  }}
                >
                  {t('connection.cancel')}
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => {
                    close();
                  }}
                >
                  {t('connection.cancel')}
                </button>
              )}
              <button
                type="button"
                className={styles.primary}
                disabled={busy || ui.address.trim() === ''}
                onClick={() => {
                  void connect();
                }}
              >
                {ui.error === null ? t('connection.connect') : t('connection.retry')}
              </button>
            </div>
          </div>
        )}

        <p className={styles.footnote}>{t('connection.offlineHint')}</p>
      </section>
    </div>,
    document.body,
  );
}
