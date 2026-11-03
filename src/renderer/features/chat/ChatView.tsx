import { useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { useMessages } from '../../app/i18n';
import { selectSelectedBot, useAppState, useDispatch } from '../../app/store';
import { IconChevronDown } from '../../components/icons';
import { userBubbleTheme } from '../bots/botLook';
import { ChatNameplate } from './ChatNameplate';
import { Composer } from './Composer';
import styles from './ChatView.module.css';
import { EmptyChat } from './EmptyChat';
import { MessageBubble } from './MessageBubble';

/**
 * Conversation column. The timeline owns its own scroll position: new replies
 * never pull the viewport away while the user is reading history, and a jump
 * control brings them back. Switching Bots restores that Bot's draft (the
 * composer reads it from the store).
 */
export function ChatView(): ReactElement {
  const t = useMessages();
  const dispatch = useDispatch();
  const state = useAppState((value) => value);
  const bot = selectSelectedBot(state);
  const messages = state.messages[state.selectedBotId] ?? [];
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const lastBotRef = useRef(state.selectedBotId);
  const lastCountRef = useRef(messages.length);
  const [atBottom, setAtBottom] = useState(true);
  const [hasNew, setHasNew] = useState(false);

  const scrollToLatest = (smooth: boolean): void => {
    const timeline = timelineRef.current;
    if (timeline === null) {
      return;
    }
    timeline.scrollTo({ top: timeline.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    setAtBottom(true);
    setHasNew(false);
  };

  // Switching Bots lands on the newest message.
  useLayoutEffect(() => {
    lastBotRef.current = state.selectedBotId;
    lastCountRef.current = messages.length;
    scrollToLatest(false);
  }, [state.selectedBotId]);

  // New messages: follow when already at the bottom, otherwise offer the jump.
  useLayoutEffect(() => {
    const added = messages.length > lastCountRef.current;
    lastCountRef.current = messages.length;
    if (!added) {
      return;
    }
    if (atBottom) {
      scrollToLatest(true);
    } else {
      setHasNew(true);
    }
  }, [messages.length]);

  if (bot === undefined) {
    return <section className={styles.chat} aria-label="MosBot" />;
  }

  const onScroll = (): void => {
    const timeline = timelineRef.current;
    if (timeline === null) {
      return;
    }
    const distance = timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight;
    const nextAtBottom = distance < 80;
    setAtBottom(nextAtBottom);
    if (nextAtBottom) {
      setHasNew(false);
    }
  };

  return (
    <section className={styles.chat} aria-label={bot.name}>
      <header className={styles.header}>
        <ChatNameplate
          bot={bot}
          open={state.inspector.open}
          onToggle={() => {
            dispatch({ type: 'set-inspector-open', open: !state.inspector.open });
          }}
        />
      </header>

      <div
        className={styles.timeline}
        ref={timelineRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-label={bot.name}
      >
        {messages.length === 0 ? (
          <EmptyChat bot={bot} />
        ) : (
          <div className={styles.thread}>
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} userBubble={userBubbleTheme(bot)} />
            ))}
          </div>
        )}
      </div>

      {atBottom ? null : (
        <button
          type="button"
          className={styles.jump}
          onClick={() => {
            scrollToLatest(true);
          }}
        >
          {hasNew ? <span className={styles.jumpDot} aria-hidden="true" /> : null}
          <IconChevronDown size={13} />
          <span>{t('chat.backToLatest')}</span>
        </button>
      )}

      <Composer bot={bot} />
    </section>
  );
}
