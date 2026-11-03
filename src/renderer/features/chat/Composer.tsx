import { useLayoutEffect, useRef, type ReactElement } from 'react';
import type { BotProfile } from '../../../shared/domain';
import { useMessages } from '../../app/i18n';
import { useAppState, useDispatch } from '../../app/store';
import { IconPaperclip, IconSend, IconStop } from '../../components/icons';
import styles from './ChatView.module.css';

export interface ComposerProps {
  readonly bot: BotProfile;
}

const MAX_TEXTAREA_HEIGHT = 160;

/**
 * The input bar: attach (enabled by M4), a growing text area and send/stop.
 * Enter sends, Shift+Enter breaks the line, and Enter during IME composition
 * belongs to the input method.
 */
export function Composer({ bot }: ComposerProps): ReactElement {
  const t = useMessages();
  const dispatch = useDispatch();
  const draft = useAppState((state) => state.drafts[bot.id] ?? '');
  const readOnly = useAppState(
    (state) => state.remote.status === 'ready' && state.remote.bots.length > 0,
  );
  const replying = useAppState(
    (state) => state.pendingReply?.botId === bot.id || bot.presence === 'replying',
  );
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
    dispatch({ type: 'send-message', botId: bot.id, text, at: Date.now() });
    areaRef.current?.focus();
  };

  const stop = (): void => {
    dispatch({ type: 'stop-reply', botId: bot.id, at: Date.now() });
  };

  const placeholder = t('chat.composer.placeholder', { name: bot.name });

  if (readOnly) {
    return (
      <div className={styles.composerWrap}>
        <p className={styles.readOnlyNotice}>{t('chat.readOnlyNotice')}</p>
        <div className={styles.composer} data-readonly="true">
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
            className={styles.textarea}
            rows={1}
            value=""
            readOnly
            disabled
            placeholder={t('chat.readOnlyPlaceholder')}
            aria-label={t('chat.readOnlyPlaceholder')}
          />
          <button
            type="button"
            className={styles.sendButton}
            disabled
            aria-label={t('chat.composer.send')}
          >
            <IconSend size={16} />
          </button>
        </div>
      </div>
    );
  }

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
            disabled={draft.trim() === ''}
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
