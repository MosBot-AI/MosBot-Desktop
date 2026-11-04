import { useEffect, useRef, useState, type ReactElement } from 'react';
import RFB from '@novnc/novnc/lib/rfb';
import type { ComputerBootstrap, DisplayLease } from '../../../shared/protocol';
import { useMessages } from '../../app/i18n';
import styles from './ComputerViewer.module.css';

/**
 * Independent remote-computer window: RFB rendering plus a control bar. The window
 * starts read-only, acquires the display lease explicitly and always shows the
 * authoritative lease state (someone else controlling disables the control action).
 */
export function ComputerViewer(): ReactElement {
  const t = useMessages();
  const screenRef = useRef<HTMLDivElement | null>(null);
  const rfbRef = useRef<RFB | null>(null);
  const [bootstrap, setBootstrap] = useState<ComputerBootstrap | null>(null);
  const [lease, setLease] = useState<DisplayLease | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [online, setOnline] = useState<boolean>(() => navigator.onLine);
  const wasOnline = useRef(online);

  useEffect(() => {
    const computer = window.mosbot?.computer;
    if (computer === undefined) {
      return;
    }
    const offBootstrap = computer.onBootstrap((payload) => {
      // A re-minted ticket (network recovery) replaces the old RFB session.
      if (rfbRef.current !== null) {
        rfbRef.current.disconnect();
        rfbRef.current = null;
      }
      setStatus('connecting');
      setBootstrap(payload);
    });
    const offLease = computer.onLease((next) => {
      setLease(next);
    });
    return () => {
      offBootstrap();
      offLease();
    };
  }, []);

  // Network loss is shown explicitly; when it returns the main process re-mints
  // the display ticket and this window reconnects instead of staying dead.
  useEffect(() => {
    const onOnline = (): void => {
      setOnline(true);
    };
    const onOffline = (): void => {
      setOnline(false);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (online && !wasOnline.current) {
      setStatus('connecting');
      void window.mosbot?.computer.reconnect().then((result) => {
        if (result.ok !== true) {
          setStatus('disconnected');
        }
      });
    }
    wasOnline.current = online;
  }, [online]);

  useEffect(() => {
    const screen = screenRef.current;
    if (bootstrap === null || screen === null || rfbRef.current !== null) {
      return;
    }
    // The deployment's RFB bridge does not negotiate a WebSocket subprotocol, so
    // noVNC must not offer one (otherwise the handshake is rejected with 1006).
    const rfb = new RFB(screen, bootstrap.wsUrl, { shared: true, wsProtocols: [] });
    rfb.viewOnly = true;
    rfb.scaleViewport = true;
    rfb.resizeSession = false;
    rfb.addEventListener('connect', () => {
      setStatus('connected');
    });
    rfb.addEventListener('disconnect', () => {
      setStatus('disconnected');
    });
    rfbRef.current = rfb;
    return () => {
      rfb.disconnect();
      rfbRef.current = null;
    };
  }, [bootstrap]);

  const mine = lease !== null && lease.holder === 'human' && lease.mine === true;
  const someoneElse = lease !== null && lease.holder === 'human' && !mine;

  useEffect(() => {
    const rfb = rfbRef.current;
    if (rfb === null) {
      return;
    }
    rfb.viewOnly = !mine;
    if (mine) {
      rfb.focus();
    }
  }, [mine]);

  const acquire = async (): Promise<void> => {
    const computer = window.mosbot?.computer;
    if (computer !== undefined) {
      const result = await computer.acquire();
      if (!result.ok) {
        setStatus('disconnected');
      }
    }
  };

  const release = async (): Promise<void> => {
    await window.mosbot?.computer.release();
  };

  return (
    <div className={styles.viewer}>
      <div ref={screenRef} className={styles.screen} aria-label={t('computer.viewer.screen')} />
      <footer className={styles.controls}>
        <span className={styles.status} role="status" aria-live="polite">
          {!online
            ? t('computer.viewer.offline')
            : status === 'connecting'
              ? t(
                  bootstrap !== null && rfbRef.current === null
                    ? 'computer.viewer.reconnecting'
                    : 'computer.viewer.connecting',
                )
              : status === 'disconnected'
                ? t('computer.viewer.disconnected')
                : mine
                  ? t('computer.viewer.controlling')
                  : someoneElse
                    ? t('computer.viewer.otherViewer')
                    : t('computer.viewer.viewOnly')}
        </span>
        {mine ? (
          <button type="button" className={styles.controlButton} onClick={() => void release()}>
            {t('computer.viewer.release')}
          </button>
        ) : (
          <button
            type="button"
            className={styles.controlButton}
            disabled={!online || someoneElse || status !== 'connected'}
            onClick={() => void acquire()}
          >
            {t('computer.viewer.acquire')}
          </button>
        )}
        <button
          type="button"
          className={styles.closeButton}
          onClick={() => {
            void window.mosbot?.computer.close();
          }}
        >
          {t('computer.viewer.close')}
        </button>
      </footer>
    </div>
  );
}
