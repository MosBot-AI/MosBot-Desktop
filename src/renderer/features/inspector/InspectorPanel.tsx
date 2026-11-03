import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';
import type { InspectorTab } from '../../../shared/domain';
import { type MessageKey, useMessages } from '../../app/i18n';
import {
  MAX_INSPECTOR_WIDTH,
  MIN_INSPECTOR_WIDTH,
  selectSelectedBot,
  useAppState,
  useDispatch,
} from '../../app/store';
import { ComputerTab } from './ComputerTab';
import { DetailsTab } from './DetailsTab';
import { LibraryTab } from './LibraryTab';
import styles from './InspectorPanel.module.css';

const PANEL_ID = 'inspector-panel';
const BODY_ID = 'inspector-body';
const NAMEPLATE_ID = 'chat-nameplate';
/**
 * While the panel is a column the conversation keeps at least this much width;
 * below it the panel is presented as a right-hand overlay instead.
 */
const CHAT_MIN_WIDTH = 360;
const RESIZE_STEP = 16;
const OVERLAY_GUTTER = 48;
const NARROWEST_COLUMN = MIN_INSPECTOR_WIDTH;

const TABS: readonly { readonly id: InspectorTab; readonly key: MessageKey }[] = [
  { id: 'details', key: 'inspector.tab.details' },
  { id: 'library', key: 'inspector.tab.library' },
  { id: 'computer', key: 'inspector.tab.computer' },
];

const tabElementId = (tab: InspectorTab): string => `inspector-tab-${tab}`;

interface DragOrigin {
  readonly pointerId: number;
  readonly startX: number;
  readonly startWidth: number;
}

/**
 * The on-demand details surface. On wide windows it is the third column, with a
 * keyboard- and pointer-resizable divider; on narrow ones it becomes a right
 * overlay above the chat with a scrim. Closing returns focus to the nameplate.
 */
export function InspectorPanel(): ReactElement | null {
  const open = useAppState((state) => state.inspector.open);
  const tab = useAppState((state) => state.inspector.tab);
  const width = useAppState((state) => state.inspector.width);
  const overlayPreferred = useAppState((state) => state.inspector.overlay);
  const searchOpen = useAppState((state) => state.search.open);
  const createOpen = useAppState((state) => state.create.open);
  const bot = useAppState(selectSelectedBot);
  const dispatch = useDispatch();
  const t = useMessages();

  const asideRef = useRef<HTMLElement | null>(null);
  const activeTabRef = useRef<HTMLButtonElement | null>(null);
  const dragOrigin = useRef<DragOrigin | null>(null);
  const wasOpen = useRef(false);
  const panelHadFocus = useRef(false);
  const focusTabAfterRender = useRef(false);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  // The column can only exist when the chat keeps its readable width; otherwise
  // the same content is presented as an overlay, even before the store's own
  // narrow-window flag flips.
  const columnCapacity =
    containerWidth === null ? MAX_INSPECTOR_WIDTH : containerWidth - CHAT_MIN_WIDTH;
  const fitsAsColumn = containerWidth === null || columnCapacity >= NARROWEST_COLUMN;
  const isOverlay = overlayPreferred || !fitsAsColumn;
  const columnWidth =
    containerWidth === null ? width : Math.min(width, Math.max(NARROWEST_COLUMN, columnCapacity));
  const overlayWidth =
    containerWidth === null
      ? width
      : Math.min(width, Math.max(NARROWEST_COLUMN, containerWidth - OVERLAY_GUTTER));
  const renderedWidth = isOverlay ? overlayWidth : columnWidth;
  const resizeCeiling = Math.max(NARROWEST_COLUMN, columnCapacity);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const panel = asideRef.current;
    const container = panel?.parentElement ?? null;
    if (container === null) {
      return;
    }
    const measure = (): void => {
      setContainerWidth(container.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [open]);

  // Opening moves focus onto the selected tab; closing (button, scrim or Esc)
  // restores it to the nameplate that opened the panel.
  useEffect(() => {
    if (open && !wasOpen.current) {
      panelHadFocus.current = false;
      activeTabRef.current?.focus({ preventScroll: true });
    } else if (!open && wasOpen.current) {
      if (panelHadFocus.current) {
        document.getElementById(NAMEPLATE_ID)?.focus({ preventScroll: true });
      }
      panelHadFocus.current = false;
    }
    wasOpen.current = open;
  }, [open]);

  // Roving tab focus must wait for the newly selected tab to become tabbable.
  useEffect(() => {
    if (!focusTabAfterRender.current) {
      return;
    }
    focusTabAfterRender.current = false;
    activeTabRef.current?.focus({ preventScroll: true });
  }, [tab]);

  useEffect(() => {
    if (!open || searchOpen || createOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing) {
        return;
      }
      const active = document.activeElement;
      const panel = asideRef.current;
      const focusInside = panel !== null && active !== null && panel.contains(active);
      if (!focusInside && !isOverlay) {
        return;
      }
      event.preventDefault();
      dispatch({ type: 'set-inspector-open', open: false });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, isOverlay, searchOpen, createOpen, dispatch]);

  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  const closePanel = (): void => {
    dispatch({ type: 'set-inspector-open', open: false });
  };

  const selectTab = (next: InspectorTab): void => {
    if (next !== tab) {
      dispatch({ type: 'set-inspector-tab', tab: next });
    }
  };

  const onTabListKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const currentIndex = Math.max(
      0,
      TABS.findIndex((item) => item.id === tab),
    );
    let nextIndex: number | null = null;
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % TABS.length;
        break;
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = TABS.length - 1;
        break;
      default:
        break;
    }
    if (nextIndex === null) {
      return;
    }
    const target = TABS[nextIndex];
    if (target === undefined) {
      return;
    }
    event.preventDefault();
    focusTabAfterRender.current = target.id !== tab;
    dispatch({ type: 'set-inspector-tab', tab: target.id });
  };

  const releaseDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragOrigin.current === null) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragOrigin.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  const onHandlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragOrigin.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: renderedWidth,
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const onHandlePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const origin = dragOrigin.current;
    if (origin === null || origin.pointerId !== event.pointerId) {
      return;
    }
    // The divider sits on the panel's leading edge: dragging left widens it.
    const next = origin.startWidth + (origin.startX - event.clientX);
    dispatch({ type: 'set-inspector-width', width: Math.min(next, resizeCeiling) });
  };

  const onHandleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowLeft':
        next = renderedWidth + RESIZE_STEP;
        break;
      case 'ArrowRight':
        next = renderedWidth - RESIZE_STEP;
        break;
      case 'Home':
        next = MIN_INSPECTOR_WIDTH;
        break;
      case 'End':
        next = MAX_INSPECTOR_WIDTH;
        break;
      default:
        break;
    }
    if (next === null) {
      return;
    }
    event.preventDefault();
    dispatch({ type: 'set-inspector-width', width: Math.min(next, resizeCeiling) });
  };

  if (!open || bot === undefined) {
    return null;
  }

  const panelClassName = [styles.panel, isOverlay ? styles.overlay : styles.column]
    .join(' ')
    .trim();

  return (
    <>
      {isOverlay ? (
        <div className={styles.scrim} onMouseDown={closePanel} aria-hidden="true" />
      ) : null}
      <aside
        ref={asideRef}
        id={PANEL_ID}
        className={panelClassName}
        style={{ width: renderedWidth }}
        aria-label={t('inspector.tabs.label')}
        tabIndex={-1}
        onFocus={() => {
          panelHadFocus.current = true;
        }}
      >
        {isOverlay ? null : (
          <div
            id="inspector-resize-handle"
            className={styles.resizeHandle}
            role="separator"
            aria-orientation="vertical"
            aria-label={t('inspector.resize')}
            aria-controls={PANEL_ID}
            aria-valuenow={renderedWidth}
            aria-valuemin={MIN_INSPECTOR_WIDTH}
            aria-valuemax={Math.min(MAX_INSPECTOR_WIDTH, resizeCeiling)}
            aria-valuetext={`${renderedWidth}px`}
            tabIndex={0}
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={releaseDrag}
            onPointerCancel={releaseDrag}
            onLostPointerCapture={releaseDrag}
            onKeyDown={onHandleKeyDown}
          />
        )}
        <header className={styles.header}>
          <div
            className={styles.tabs}
            role="tablist"
            aria-label={t('inspector.tabs.label')}
            onKeyDown={onTabListKeyDown}
          >
            {TABS.map((item) => {
              const selected = item.id === tab;
              return (
                <button
                  key={item.id}
                  ref={selected ? activeTabRef : null}
                  id={tabElementId(item.id)}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={BODY_ID}
                  tabIndex={selected ? 0 : -1}
                  className={styles.tab}
                  onClick={() => {
                    selectTab(item.id);
                  }}
                >
                  {t(item.key)}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className={styles.closeButton}
            aria-label={t('inspector.close')}
            title={t('inspector.close')}
            onClick={closePanel}
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
        </header>
        <div
          id={BODY_ID}
          className={styles.body}
          role="tabpanel"
          aria-labelledby={tabElementId(tab)}
          tabIndex={0}
        >
          {tab === 'details' ? <DetailsTab bot={bot} /> : null}
          {tab === 'library' ? <LibraryTab botId={bot.id} /> : null}
          {tab === 'computer' ? <ComputerTab profileId={bot.id} botName={bot.name} /> : null}
        </div>
      </aside>
    </>
  );
}
