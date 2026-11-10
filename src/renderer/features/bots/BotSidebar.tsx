import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { BotProfile, ThemePreference } from '../../../shared/domain';
import { useMessages } from '../../app/i18n';
import type { MessageKey } from '../../app/i18n';
import {
  isRemoteRoster,
  selectPendingCount,
  selectPendingProfile,
  selectPinnedBots,
  selectRosterBots,
  selectRosterSections,
  REMOTE_UNSORTED_ID,
  selectSectionBots,
  selectUnreadTotal,
  useAppState,
  useDispatch,
} from '../../app/store';
import { TEST_DASHBOARD_URL } from '../../../shared/protocol';
import { BrandWordmark } from '../../components/BrandWordmark';
import {
  IconChevronDown,
  IconChevronUp,
  IconPlus,
  IconSearch,
  IconWarning,
} from '../../components/icons';
import { BotRow } from './BotRow';
import { GroupRow } from './GroupRow';
import { GroupCreateDialog } from '../groups/GroupCreateDialog';
import { PinnedGrid } from './PinnedGrid';
import styles from './BotSidebar.module.css';

const THEMES: readonly ThemePreference[] = ['system', 'light', 'dark'];
const THEME_KEYS: Record<ThemePreference, MessageKey> = {
  system: 'sidebar.menu.theme.system',
  light: 'sidebar.menu.theme.light',
  dark: 'sidebar.menu.theme.dark',
};

/**
 * Left column: search and create on top, the frequent faces, the collapsible
 * sections and — alone at the bottom — the MosBot connection entry. Sections and
 * the bump of attention live here; chat keeps its own surface clean.
 */
export function BotSidebar(): ReactElement {
  const t = useMessages();
  const dispatch = useDispatch();
  const state = useAppState((value) => value);
  const pinned = selectPinnedBots(state);
  const groups = state.remote.groups;
  const sections = selectRosterSections(state);
  const roster = selectRosterBots(state);
  const remote = isRemoteRoster(state);
  const unresolved = selectPendingCount(state);
  const unreadTotal = selectUnreadTotal(state);
  const pendingProfile = selectPendingProfile(state);
  const connectionUi = state.connectionUi;
  const connectedName =
    connectionUi.snapshot?.connected === true
      ? (connectionUi.snapshot.displayName ?? connectionUi.snapshot.userId ?? '')
      : null;
  const menuRef = useRef<HTMLDivElement | null>(null);
  const footerButtonRef = useRef<HTMLButtonElement | null>(null);
  const footerWasOpen = useRef(false);
  const [sectionMenuId, setSectionMenuId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [groupCreateOpen, setGroupCreateOpen] = useState(false);

  useEffect(() => {
    if (sectionMenuId === null) {
      return;
    }
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-section-menu]') !== null) {
        return;
      }
      setSectionMenuId(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [sectionMenuId]);

  const selectBot = (botId: string): void => {
    dispatch({ type: 'select-bot', botId });
  };

  // Menu commands and the footer toggle both land here: move focus into the
  // menu when it opens and back to the footer button when it closes.
  useEffect(() => {
    if (state.footerMenuOpen === footerWasOpen.current) {
      return;
    }
    footerWasOpen.current = state.footerMenuOpen;
    if (state.footerMenuOpen) {
      const first = menuRef.current?.querySelector<HTMLElement>('[data-footer-menu] button');
      first?.focus({ preventScroll: true });
    } else {
      footerButtonRef.current?.focus({ preventScroll: true });
    }
  }, [state.footerMenuOpen]);

  useEffect(() => {
    if (!state.footerMenuOpen && !state.pinnedMenuOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target) === false) {
        dispatch({ type: 'set-footer-menu', open: false });
        dispatch({ type: 'set-pinned-menu', open: false });
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        dispatch({ type: 'set-footer-menu', open: false });
        dispatch({ type: 'set-pinned-menu', open: false });
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [state.footerMenuOpen, state.pinnedMenuOpen, dispatch]);

  return (
    <aside className={styles.sidebar} aria-label={t('sidebar.label')}>
      <div className={styles.titlebar} aria-hidden="true" />

      <header className={styles.toolbar}>
        <button
          type="button"
          className={styles.searchField}
          onClick={() => {
            dispatch({ type: 'search-open' });
          }}
          aria-label={t('sidebar.search')}
          aria-keyshortcuts="Meta+K"
        >
          <IconSearch size={14} />
          <span className={styles.searchLabel}>{t('sidebar.search')}</span>
        </button>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => {
            dispatch({ type: 'create-open' });
          }}
          aria-label={t('sidebar.add')}
          title={t('sidebar.add')}
        >
          <IconPlus size={16} />
        </button>
      </header>

      {unresolved > 0 ? (
        <button
          type="button"
          className={styles.attention}
          onClick={() => {
            if (pendingProfile !== null) {
              selectBot(pendingProfile);
            }
          }}
          aria-label={t('sidebar.attention', { count: unresolved })}
        >
          <IconWarning size={13} />
          <span>{t('sidebar.attention', { count: unresolved })}</span>
          {unreadTotal > 0 ? <span className={styles.attentionUnread}>{unreadTotal}</span> : null}
        </button>
      ) : null}

      <div className={styles.scrollArea}>
        <PinnedGrid
          bots={pinned}
          selectedBotId={state.selectedBotId}
          onSelect={selectBot}
          onOpenAll={() => {
            dispatch({ type: 'set-pinned-menu', open: !state.pinnedMenuOpen });
          }}
        />

        {remote ? (
          <section className={styles.section}>
            <div className={styles.sectionHeaderRow}>
              <div className={styles.sectionHeader} aria-hidden="true">
                <span className={styles.sectionName}>{t('sidebar.groups')}</span>
                <span className={styles.sectionCount}>{groups.length}</span>
              </div>
              <button
                type="button"
                className={styles.sectionMenuButton}
                aria-label={t('sidebar.groupCreate')}
                title={t('sidebar.groupCreate')}
                onClick={() => {
                  setGroupCreateOpen(true);
                }}
              >
                <IconPlus size={12} />
              </button>
            </div>
            <div className={styles.sectionBots}>
              {groups.length === 0 ? (
                <p className={styles.sectionEmpty}>{t('sidebar.groupsEmpty')}</p>
              ) : (
                groups.map((group) => (
                  <GroupRow
                    key={group.roomId}
                    group={group}
                    selected={group.roomId === state.remote.selectedGroupId}
                    onSelect={(group) => {
                      dispatch({ type: 'select-group', group });
                    }}
                  />
                ))
              )}
            </div>
          </section>
        ) : null}

        <nav className={styles.sections} aria-label={t('sidebar.label')}>
          {sections.map((section) => {
            const bots = selectSectionBots(state, section.id);
            return (
              <section key={section.id} className={styles.section}>
                <div className={styles.sectionHeaderRow} data-section-menu>
                  <button
                    type="button"
                    className={styles.sectionHeader}
                    aria-expanded={!section.collapsed}
                    aria-label={t('sidebar.sectionToggle', {
                      name: section.name,
                      count: bots.length,
                    })}
                    onClick={() => {
                      dispatch({ type: 'toggle-section', sectionId: section.id });
                    }}
                  >
                    <IconChevronDown
                      size={12}
                      className={section.collapsed ? styles.chevronCollapsed : styles.chevron}
                    />
                    {renaming?.id === section.id ? (
                      <input
                        className={styles.sectionRenameInput}
                        value={renaming.title}
                        maxLength={24}
                        autoFocus
                        aria-label={t('sidebar.sectionRename')}
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                        onChange={(event) => {
                          setRenaming({ id: section.id, title: event.target.value });
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            dispatch({
                              type: 'org-rename-section',
                              sectionId: section.id,
                              title: renaming.title,
                            });
                            setRenaming(null);
                          } else if (event.key === 'Escape') {
                            event.preventDefault();
                            setRenaming(null);
                          }
                        }}
                        onBlur={() => {
                          dispatch({
                            type: 'org-rename-section',
                            sectionId: section.id,
                            title: renaming.title,
                          });
                          setRenaming(null);
                        }}
                      />
                    ) : (
                      <span className={styles.sectionName}>{section.name}</span>
                    )}
                    <span className={styles.sectionCount}>{bots.length}</span>
                  </button>
                  {remote && section.id !== REMOTE_UNSORTED_ID ? (
                    <button
                      type="button"
                      className={styles.sectionMenuButton}
                      aria-label={t('sidebar.sectionMenu')}
                      aria-expanded={sectionMenuId === section.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSectionMenuId(sectionMenuId === section.id ? null : section.id);
                      }}
                    >
                      ⋯
                    </button>
                  ) : null}
                  {sectionMenuId === section.id ? (
                    <div className={styles.sectionMenu} role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        className={styles.sectionMenuItem}
                        onClick={() => {
                          setRenaming({ id: section.id, title: section.name });
                          setSectionMenuId(null);
                        }}
                      >
                        {t('sidebar.sectionRename')}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className={styles.sectionMenuItem}
                        onClick={() => {
                          dispatch({ type: 'org-remove-section', sectionId: section.id });
                          setSectionMenuId(null);
                        }}
                      >
                        {t('sidebar.sectionDelete')}
                      </button>
                    </div>
                  ) : null}
                </div>
                {!section.collapsed ? (
                  <div className={styles.sectionBots}>
                    {bots.length === 0 ? (
                      <p className={styles.sectionEmpty}>{t('sidebar.sectionEmpty')}</p>
                    ) : (
                      bots.map((bot) => (
                        <BotRow
                          key={bot.id}
                          bot={bot}
                          selected={bot.id === state.selectedBotId}
                          onSelect={selectBot}
                        />
                      ))
                    )}
                  </div>
                ) : null}
              </section>
            );
          })}

          {!remote && roster.some((bot) => bot.sectionId === null && bot.pinnedIndex === null) ? (
            <section className={styles.section}>
              <div className={styles.sectionHeader} aria-hidden="true">
                <span className={styles.sectionName}>{t('sidebar.ungrouped')}</span>
              </div>
              <div className={styles.sectionBots}>
                {roster
                  .filter((bot) => bot.sectionId === null && bot.pinnedIndex === null)
                  .map((bot) => (
                    <BotRow
                      key={bot.id}
                      bot={bot}
                      selected={bot.id === state.selectedBotId}
                      onSelect={selectBot}
                    />
                  ))}
              </div>
            </section>
          ) : null}
        </nav>
      </div>

      <footer className={styles.footer} ref={menuRef}>
        {state.footerMenuOpen ? (
          <div
            className={styles.menu}
            role="dialog"
            aria-label={t('sidebar.menu.label')}
            data-footer-menu=""
          >
            <div className={styles.menuSection}>
              <span className={styles.menuLabel}>{t('sidebar.menu.dashboard')}</span>
              <button
                type="button"
                className={styles.connectionItem}
                onClick={() => {
                  dispatch({
                    type: 'connection-open',
                    address: state.connectionUi.address || TEST_DASHBOARD_URL,
                  });
                }}
              >
                {connectedName === null
                  ? t('connection.menuItem')
                  : t('connection.menuConnected', { name: connectedName })}
              </button>
              <button
                type="button"
                className={styles.connectionItem}
                onClick={() => {
                  dispatch({ type: 'workbench-open', tab: 'profiles' });
                  dispatch({ type: 'set-footer-menu', open: false });
                }}
              >
                {t('sidebar.menu.workbench')}
              </button>
            </div>
            <div className={styles.menuSection}>
              <span className={styles.menuLabel}>{t('sidebar.menu.appearance')}</span>
              <div
                className={styles.segmented}
                role="group"
                aria-label={t('sidebar.menu.appearance')}
              >
                {THEMES.map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    className={styles.segment}
                    aria-pressed={state.theme === theme}
                    onClick={() => {
                      dispatch({ type: 'set-theme', theme });
                    }}
                  >
                    {t(THEME_KEYS[theme])}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.menuSection}>
              <span className={styles.menuLabel}>{t('sidebar.menu.language')}</span>
              <div
                className={styles.segmented}
                role="group"
                aria-label={t('sidebar.menu.language')}
              >
                <button
                  type="button"
                  className={styles.segment}
                  aria-pressed={state.language === 'zh-Hans'}
                  onClick={() => {
                    dispatch({ type: 'set-language', language: 'zh-Hans' });
                  }}
                >
                  简体中文
                </button>
                <button
                  type="button"
                  className={styles.segment}
                  aria-pressed={state.language === 'en'}
                  onClick={() => {
                    dispatch({ type: 'set-language', language: 'en' });
                  }}
                >
                  English
                </button>
              </div>
            </div>
            <dl className={styles.menuMeta}>
              <div>
                <dt>{t('sidebar.menu.dashboard')}</dt>
                <dd>{state.connection.dashboardLabel}</dd>
              </div>
              <div>
                <dt>{t('sidebar.menu.account')}</dt>
                <dd>{state.connection.accountLabel}</dd>
              </div>
            </dl>
          </div>
        ) : null}

        {state.pinnedMenuOpen ? (
          <div className={styles.menu} role="dialog" aria-label={t('sidebar.pinned')}>
            <div className={styles.menuSection}>
              <span className={styles.menuLabel}>{t('sidebar.pinned')}</span>
              <div className={styles.pinnedList}>
                {pinned.length === 0 ? (
                  <p className={styles.sectionEmpty}>{t('sidebar.pinnedEmpty')}</p>
                ) : (
                  pinned.map((bot: BotProfile) => (
                    <BotRow
                      key={bot.id}
                      bot={bot}
                      selected={bot.id === state.selectedBotId}
                      onSelect={selectBot}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}

        <button
          id="sidebar-connection"
          ref={footerButtonRef}
          type="button"
          className={styles.footerButton}
          aria-expanded={state.footerMenuOpen}
          aria-label={t('sidebar.menu.label')}
          onClick={() => {
            dispatch({ type: 'set-footer-menu', open: !state.footerMenuOpen });
          }}
        >
          <span className={styles.footerTop}>
            <BrandWordmark height={15} />
            <span className={styles.footerConnection}>
              <span
                className={styles.connectionDot}
                data-status={connectedName === null ? state.connection.status : 'connected'}
              />
              <span
                className={styles.connectionLabel}
                title={
                  connectedName === null
                    ? state.connection.accountLabel
                    : `${connectedName} · ${connectionUi.snapshot?.displayUrl ?? ''}`
                }
              >
                {connectedName === null ? state.connection.accountLabel : connectedName}
              </span>
            </span>
          </span>
          <span className={styles.footerChevron}>
            {state.footerMenuOpen ? <IconChevronDown size={13} /> : <IconChevronUp size={13} />}
          </span>
        </button>
      </footer>
      <GroupCreateDialog
        open={groupCreateOpen}
        onClose={() => {
          setGroupCreateOpen(false);
        }}
      />
    </aside>
  );
}
