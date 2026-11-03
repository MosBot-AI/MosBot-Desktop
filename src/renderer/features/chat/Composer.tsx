import { useLayoutEffect, useRef, type ReactElement } from 'react';
import type { BotProfile } from '../../../shared/domain';
import { useMessages } from '../../app/i18n';
import { isRemoteRoster, useAppState, useDispatch } from '../../app/store';
import { IconPaperclip, IconSend, IconStop } from '../../components/icons';
import styles from './ChatView.module.css';

export interface ComposerProps {
  readonly bot: BotProfile;
}

const MAX_TEXTAREA_HEIGHT = 160;

/**
 * The input bar: attach (enabled by M4), a growing text area and send/stop.
 * In fixture mode a local echo simulates a reply; in connected mode the prompt is
 * submitted to the real Bot Chat and the reply streams back over the gateway.
 */
export function Composer({ bot }: ComposerProps): ReactElement {
  const t = useMessages();
  const dispatch = useDispatch();
  const draft = useAppState((state) => state.drafts[bot.id] ?? '');
  const remoteMode = useAppState((state) => isRemoteRoster(state));
  const livePhase = useAppState((state) => state.live.phase);
  const liveConnection = useAppState((state) => state.live.connection);
  const fixtureReplying = useAppState(
    (state) => state.pendingReply?.botId === bot.id || bot.presence === 'replying',
  );
  const replying = remoteMode
    ? livePhase === 'sending' || livePhase === 'streaming'
    : fixtureReplying;
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const composingRef = useRef(false);

  useLayoutEffect(() => {
    const area = areaRef.current;
    if (area === null) {
      return;
    }
    area.style.height = 'auto';
    area.style.height = `${Math.min(area.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [draft]);

  const send = (): void => {
    const text = draft.trim();
    if (text === '' || replying) {
      return;
    }
    if (remoteMode) {
      dispatch({ type: 'live-user', profile: bot.id, text, at: Date.now() });
      dispatch({ type: 'set-draft', botId: bot.id, text: '' });
      void window.mosbot?.dashboard.chatSend(text).then((result) => {
        if (!result.ok) {
          dispatch({ type: 'live-error', message: result.error.message });
          dispatch({ type: 'set-draft', botId: bot.id, text });
        }
      });
      areaRef.current?.focus();
      return;
    }
    dispatch({ type: 'send-message', botId: bot.id, text, at: Date.now() });
    areaRef.current?.focus();
  };

  const stop = (): void => {
    if (remoteMode) {
      void window.mosbot?.dashboard.chatStop();
      dispatch({ type: 'live-phase', phase: 'stopped' });
      return;
    }
    dispatch({ type: 'stop-reply', botId: bot.id, at: Date.now() });
  };

  const placeholder = t('chat.composer.placeholder', { name: bot.name });
  const disabled = remoteMode && liveConnection === 'disconnected';

  return (
    <div className={styles.composerWrap}>
      <div className={styles.composer} data-replying={replying ? 'true' : 'false'}>
        <button
          type="button"
          className={styles.attachButton}
          disabled
          aria-label={t('chat.composer.attach')}
          title={t('chat.composer.attachDisabled')}
        >
          <IconPaperclip size={16} />
        </button>
        <textarea
          ref={areaRef}
          className={styles.textarea}
          rows={1}
          value={draft}
          placeholder={placeholder}
          aria-label={placeholder}
          disabled={disabled}
          onChange={(event) => {
            dispatch({ type: 'set-draft', botId: bot.id, text: event.target.value });
          }}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') {
              return;
            }
            if (event.nativeEvent.isComposing || composingRef.current) {
              return;
            }
            if (event.shiftKey) {
              return;
            }
            event.preventDefault();
            send();
          }}
        />
        {replying ? (
          <button
            type="button"
            className={styles.sendButton}
            onClick={stop}
            aria-label={t('chat.composer.stop')}
            title={t('chat.composer.stop')}
          >
            <IconStop size={16} />
          </button>
        ) : (
          <button
            type="button"
            className={styles.sendButton}
            onClick={send}
            disabled={draft.trim() === '' || disabled}
            aria-label={t('chat.composer.send')}
            title={t('chat.composer.send')}
          >
            <IconSend size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
