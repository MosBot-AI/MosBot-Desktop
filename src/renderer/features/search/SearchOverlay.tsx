import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
} from 'react';
import { presenceKey } from '../../app/format';
import { useMessages } from '../../app/i18n';
import { searchEntries, useAppState, useDispatch } from '../../app/store';
import { BotLookFace } from '../bots/BotLookFace';
import styles from './SearchOverlay.module.css';

const INPUT_ID = 'search-input';
const LIST_ID = 'search-results';

const optionId = (botId: string): string => `search-option-${botId}`;

/**
 * Centred search overlay. The query filters as it is typed, an empty query lists
 * the recently active Bots, and the result list follows the combobox pattern so
 * focus stays in the input while ↑/↓ move the active option. Closing returns
 * focus to whatever opened the overlay.
 */
export function SearchOverlay(): ReactElement | null {
  const state = useAppState((current) => current);
  const dispatch = useDispatch();
  const t = useMessages();

  const open = state.search.open;
  const { flat } = searchEntries(state);
  const hasQuery = state.search.query.trim() !== '';
  const activeIndex =
    flat.length === 0 ? -1 : Math.min(Math.max(state.search.activeIndex, 0), flat.length - 1);
  const activeBot = activeIndex === -1 ? undefined : flat[activeIndex];

  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      const active = document.activeElement;
      openerRef.current = active instanceof HTMLElement ? active : null;
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    } else if (!open && wasOpen.current) {
      const opener = openerRef.current;
      if (opener !== null && opener.isConnected) {
        opener.focus({ preventScroll: true });
      }
      openerRef.current = null;
    }
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const list = listRef.current;
    if (list === null) {
      return;
    }
    const active = list.querySelector('[data-active="true"]');
    if (active instanceof HTMLElement) {
      active.scrollIntoView({ block: 'nearest' });
    }
  }, [open, activeIndex, state.search.query]);

  useEffect(() => {
    if (!open || state.create.open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing) {
        return;
      }
      event.preventDefault();
      dispatch({ type: 'search-close' });
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, state.create.open, dispatch]);

  const close = (): void => {
    dispatch({ type: 'search-close' });
  };

  const activate = (index: number): void => {
    const delta = index - state.search.activeIndex;
    if (delta !== 0) {
      // The only way to point the store at a clicked row is a relative move;
      // dispatches are synchronous, so activate then sees the new index.
      dispatch({ type: 'search-move', delta });
    }
    dispatch({ type: 'search-activate' });
  };

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        dispatch({ type: 'search-move', delta: 1 });
        break;
      case 'ArrowUp':
        event.preventDefault();
        dispatch({ type: 'search-move', delta: -1 });
        break;
      case 'Enter':
        event.preventDefault();
        dispatch({ type: 'search-activate' });
        break;
      default:
        break;
    }
  };

  // Only two controls live inside the dialog; Tab cycles between them.
  const onDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Tab') {
      return;
    }
    const first = inputRef.current;
    const last = closeButtonRef.current;
    if (first === null || last === null) {
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const onScrimMouseDown = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (event.target === event.currentTarget) {
      close();
    }
  };

  if (!open) {
    return null;
  }

  const sectionLabel = hasQuery ? t('search.results') : t('search.recent');

  return (
    <div className={styles.scrim} onMouseDown={onScrimMouseDown}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t('search.title')}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
        onKeyDown={onDialogKeyDown}
      >
        <div className={styles.inputRow}>
          <span className={styles.searchIcon}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
              <circle cx="7" cy="7" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M10.5 10.5L13 13"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <input
            ref={inputRef}
            id={INPUT_ID}
            className={styles.input}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={LIST_ID}
            aria-autocomplete="list"
            aria-activedescendant={activeBot === undefined ? undefined : optionId(activeBot.id)}
            aria-label={t('search.title')}
            placeholder={t('search.placeholder')}
            autoComplete="off"
            spellCheck={false}
            value={state.search.query}
            onChange={(event) => {
              dispatch({ type: 'search-query', query: event.target.value });
            }}
            onKeyDown={onInputKeyDown}
          />
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            aria-label={t('search.close')}
            title={t('search.close')}
            onClick={close}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
              <path
                d="M4 4l8 8M12 4l-8 8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <ul
          ref={listRef}
          id={LIST_ID}
          className={styles.list}
          role="listbox"
          aria-label={sectionLabel}
        >
          {flat.length === 0 ? (
            <li role="presentation" className={styles.empty}>
              <p className={styles.emptyTitle}>{t('search.empty')}</p>
              <p className={styles.emptyHint}>{t('search.emptyHint')}</p>
            </li>
          ) : (
            <>
              <li role="presentation" className={styles.sectionLabel}>
                {sectionLabel}
              </li>
              {flat.map((bot, index) => {
                const active = index === activeIndex;
                const summary = bot.summary === '' ? t(presenceKey(bot.presence)) : bot.summary;
                return (
                  <li
                    key={bot.id}
                    id={optionId(bot.id)}
                    role="option"
                    aria-selected={active}
                    data-active={active ? 'true' : 'false'}
                    className={styles.option}
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onClick={() => {
                      activate(index);
                    }}
                  >
                    <BotLookFace
                      shape={bot.shape}
                      color={bot.color}
                      useMosbotDefault={bot.useMosbotDefault}
                      seed={bot.id}
                      size={32}
                      presence={bot.presence}
                    />
                    <span className={styles.optionText}>
                      <span className={styles.optionName} title={bot.name}>
                        {bot.name}
                      </span>
                      <span className={styles.optionSummary} title={summary}>
                        {summary}
                      </span>
                    </span>
                  </li>
                );
              })}
            </>
          )}
        </ul>

        <p className={styles.hint}>{t('search.hint')}</p>
      </div>
    </div>
  );
}
