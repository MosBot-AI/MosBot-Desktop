import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type {
  KanbanBoard,
  KanbanBoardSummary,
  RemoteBot,
  WorkbenchMessage,
  WorkbenchSession,
} from '../../../shared/protocol';
import { useMessages } from '../../app/i18n';
import { isRemoteRoster, useAppState, useDispatch } from '../../app/store';
import styles from './Workbench.module.css';

type TabId = 'profiles' | 'sessions' | 'kanban';

interface AsyncState<T> {
  readonly status: 'loading' | 'ready' | 'error';
  readonly data: T;
  readonly message: string;
}

function loading<T>(data: T): AsyncState<T> {
  return { status: 'loading', data, message: '' };
}

/**
 * The Hermes workbench: a full-window surface reachable from the footer menu with
 * Profiles, Sessions and Kanban subpages backed by the Dashboard's REST APIs.
 * The chat shell stays mounted (hidden) so returning restores the Bot, draft,
 * scroll position and details column untouched.
 */
export function Workbench(): ReactElement | null {
  const t = useMessages();
  const dispatch = useDispatch();
  const open = useAppState((state) => state.workbench.open);
  const tab = useAppState((state) => state.workbench.tab);
  const remote = useAppState(isRemoteRoster);
  const snapshot = useAppState((state) => state.connectionUi.snapshot);

  if (!open) {
    return null;
  }

  const tabs: readonly TabId[] = ['profiles', 'sessions', 'kanban'];
  return (
    <div className={styles.workbench} role="region" aria-label={t('workbench.title')}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.back}
          onClick={() => {
            dispatch({ type: 'workbench-close' });
          }}
        >
          ← {t('workbench.back')}
        </button>
        <h1 className={styles.title}>{t('workbench.title')}</h1>
        <nav className={styles.tabs} aria-label={t('workbench.title')}>
          {tabs.map((tabId) => (
            <button
              key={tabId}
              type="button"
              className={styles.tab}
              aria-current={tab === tabId ? 'page' : undefined}
              onClick={() => {
                dispatch({ type: 'workbench-tab', tab: tabId });
              }}
            >
              {t(`workbench.tab.${tabId}`)}
            </button>
          ))}
        </nav>
        <span className={styles.scope} title={snapshot?.displayUrl ?? ''}>
          {snapshot?.displayUrl ?? ''}
        </span>
      </header>

      {!remote ? (
        <p className={styles.offline}>{t('workbench.offline')}</p>
      ) : tab === 'profiles' ? (
        <ProfilesPage />
      ) : tab === 'sessions' ? (
        <SessionsPage />
      ) : (
        <KanbanPage />
      )}
    </div>
  );
}

function ProfilesPage(): ReactElement {
  const t = useMessages();
  const [state, setState] = useState<AsyncState<readonly RemoteBot[]>>(loading([]));
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<Record<string, boolean | null>>({});
  const [providerInput, setProviderInput] = useState('');
  const [modelInput, setModelInput] = useState('');
  const [modelState, setModelState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const load = useCallback(async (): Promise<void> => {
    const dashboard = window.mosbot?.dashboard;
    if (dashboard === undefined) {
      return;
    }
    setState((current) => ({ ...current, status: 'loading' }));
    const result = await dashboard.listBots();
    if (result.ok) {
      setState({ status: 'ready', data: result.data, message: '' });
    } else {
      setState({ status: 'error', data: [], message: result.error.message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === '') {
      return state.data;
    }
    return state.data.filter(
      (bot) =>
        bot.displayName.toLowerCase().includes(needle) ||
        bot.profileName.toLowerCase().includes(needle) ||
        bot.description.toLowerCase().includes(needle),
    );
  }, [state.data, query]);

  const active = state.data.find((bot) => bot.profileName === selected) ?? filtered[0];

  useEffect(() => {
    if (active === undefined) {
      return;
    }
    setProviderInput(active.provider);
    setModelInput(active.model);
    setModelState('idle');
  }, [active]);

  useEffect(() => {
    const dashboard = window.mosbot?.dashboard;
    if (active === undefined || dashboard === undefined) {
      return;
    }
    let cancelled = false;
    void dashboard.checkModelReady(active.profileName).then((result) => {
      if (!cancelled && result.ok) {
        setReadiness((current) => ({ ...current, [active.profileName]: result.data.ready }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [active]);

  return (
    <div className={styles.body}>
      <div className={styles.listPane}>
        <div className={styles.listToolbar}>
          <input
            className={styles.search}
            type="search"
            value={query}
            placeholder={t('workbench.search')}
            aria-label={t('workbench.search')}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
          <button type="button" className={styles.refresh} onClick={() => void load()}>
            {t('workbench.refresh')}
          </button>
        </div>
        {state.status === 'loading' ? (
          <p className={styles.state}>{t('workbench.loading')}</p>
        ) : state.status === 'error' ? (
          <p className={styles.state}>{t('workbench.error')}</p>
        ) : filtered.length === 0 ? (
          <p className={styles.state}>{t('workbench.profiles.empty')}</p>
        ) : (
          <ul className={styles.list}>
            {filtered.map((bot) => (
              <li key={bot.profileName}>
                <button
                  type="button"
                  className={styles.listItem}
                  aria-current={active?.profileName === bot.profileName ? 'true' : undefined}
                  onClick={() => {
                    setSelected(bot.profileName);
                  }}
                >
                  <span className={styles.listItemTitle}>{bot.displayName}</span>
                  <span className={styles.listItemMeta}>
                    {bot.model || t('workbench.profiles.notReady')}
                    {bot.isDefault ? ` · ${t('workbench.profiles.default')}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={styles.detailPane}>
        {active === undefined ? null : (
          <article className={styles.detail}>
            <header className={styles.detailHeader}>
              <h2 className={styles.detailTitle}>{active.displayName}</h2>
              {active.isDefault ? (
                <span className={styles.badge}>{t('workbench.profiles.default')}</span>
              ) : null}
            </header>
            {active.description === '' ? null : (
              <p className={styles.detailDescription}>{active.description}</p>
            )}
            <dl className={styles.fields}>
              <dt>{t('workbench.profiles.model')}</dt>
              <dd>{active.model || '—'}</dd>
              <dt>{t('workbench.profiles.provider')}</dt>
              <dd>{active.provider || '—'}</dd>
              <dt>{t('workbench.profiles.sessions')}</dt>
              <dd>{active.canonicalSessionId ?? '—'}</dd>
              <dt>Profile</dt>
              <dd>{active.profileName}</dd>
            </dl>
            <p className={styles.readiness}>
              {readiness[active.profileName] === false
                ? t('workbench.profiles.notReady')
                : readiness[active.profileName] === true
                  ? t('workbench.profiles.ready')
                  : t('workbench.loading')}
            </p>
            <section className={styles.modelEditor}>
              <h3 className={styles.columnTitle}>{t('workbench.profiles.editModel')}</h3>
              <div className={styles.listToolbar}>
                <input
                  className={styles.search}
                  value={providerInput}
                  placeholder="provider"
                  aria-label="provider"
                  onChange={(event) => {
                    setProviderInput(event.target.value);
                  }}
                />
                <input
                  className={styles.search}
                  value={modelInput}
                  placeholder="model"
                  aria-label="model"
                  onChange={(event) => {
                    setModelInput(event.target.value);
                  }}
                />
              </div>
              <div className={styles.manageRow}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={modelState === 'saving'}
                  onClick={() => {
                    const dashboard = window.mosbot?.dashboard;
                    if (dashboard === undefined || active === undefined) {
                      return;
                    }
                    setModelState('saving');
                    void dashboard
                      .setProfileModel(active.profileName, providerInput, modelInput)
                      .then((result) => {
                        if (!result.ok) {
                          setModelState('error');
                          return;
                        }
                        setModelState('saved');
                        void load();
                        void dashboard
                          .checkModelReady(active.profileName)
                          .then((readinessResult) => {
                            if (readinessResult.ok) {
                              setReadiness((current) => ({
                                ...current,
                                [active.profileName]: readinessResult.data.ready,
                              }));
                            }
                          });
                      });
                  }}
                >
                  {t('workbench.profiles.save')}
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => {
                    void window.mosbot?.dashboard.openProfileConfig();
                  }}
                >
                  {t('workbench.profiles.configure')}
                </button>
              </div>
              {modelState === 'saved' ? (
                <p className={styles.state}>{t('workbench.profiles.saved')}</p>
              ) : modelState === 'error' ? (
                <p className={styles.state}>{t('workbench.profiles.saveFailed')}</p>
              ) : null}
            </section>
          </article>
        )}
      </div>
    </div>
  );
}

function SessionsPage(): ReactElement {
  const t = useMessages();
  const bots = useAppState((state) => state.remote.bots);
  const defaultProfile = useAppState((state) => state.remote.selectedProfile) ?? '';
  const [profile, setProfile] = useState(defaultProfile);
  const [sessions, setSessions] = useState<readonly WorkbenchSession[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly WorkbenchSession[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<readonly WorkbenchMessage[]>([]);
  const [messageOffset, setMessageOffset] = useState(0);
  const [messageHasMore, setMessageHasMore] = useState(false);
  // Guards against late responses from a profile/search/session the person has
  // already switched away from.
  const currentProfile = useRef(profile);
  const currentQuery = useRef('');
  const currentSession = useRef<string | null>(null);

  const pageSize = 50;

  const load = useCallback(
    async (nextProfile: string, nextOffset: number): Promise<void> => {
      const dashboard = window.mosbot?.dashboard;
      if (dashboard === undefined || nextProfile === '') {
        return;
      }
      setStatus('loading');
      const result = await dashboard.workbenchSessions(nextProfile, nextOffset, pageSize);
      if (nextProfile !== currentProfile.current) {
        return;
      }
      if (!result.ok) {
        setStatus('error');
        return;
      }
      setSessions((current) =>
        nextOffset === 0 ? result.data.sessions : [...current, ...result.data.sessions],
      );
      setTotal(result.data.total);
      setOffset(nextOffset);
      setStatus('ready');
    },
    [pageSize],
  );

  useEffect(() => {
    currentProfile.current = profile;
    if (profile !== '') {
      void load(profile, 0);
    }
  }, [profile, load]);

  const runSearch = useCallback(
    async (value: string): Promise<void> => {
      const dashboard = window.mosbot?.dashboard;
      if (dashboard === undefined || profile === '') {
        return;
      }
      if (value.trim() === '') {
        setResults(null);
        return;
      }
      const requestedProfile = profile;
      const result = await dashboard.workbenchSearch(requestedProfile, value);
      if (value !== currentQuery.current || requestedProfile !== currentProfile.current) {
        return;
      }
      if (result.ok) {
        setResults(result.data);
      }
    },
    [profile],
  );

  const openSession = useCallback(
    async (session: WorkbenchSession): Promise<void> => {
      const dashboard = window.mosbot?.dashboard;
      if (dashboard === undefined) {
        return;
      }
      currentSession.current = session.id;
      setSelected(session.id);
      const requestedProfile = profile;
      const result = await dashboard.workbenchMessages(requestedProfile, session.id, 0);
      if (session.id !== currentSession.current || requestedProfile !== currentProfile.current) {
        return;
      }
      if (result.ok) {
        setMessages(result.data.messages);
        setMessageOffset(result.data.messages.length);
        setMessageHasMore(result.data.hasMore);
      } else {
        setMessages([]);
      }
    },
    [profile],
  );

  const visible = results ?? sessions;
  const canonicalIds = useMemo(
    () =>
      new Set(bots.map((bot) => bot.canonicalSessionId).filter((id): id is string => id !== null)),
    [bots],
  );

  return (
    <div className={styles.body}>
      <div className={styles.listPane}>
        <div className={styles.listToolbar}>
          <select
            className={styles.search}
            value={profile}
            aria-label="Profile"
            onChange={(event) => {
              currentProfile.current = event.target.value;
              currentSession.current = null;
              setProfile(event.target.value);
              setResults(null);
              setSelected(null);
              setMessages([]);
            }}
          >
            {bots.map((bot) => (
              <option key={bot.profileName} value={bot.profileName}>
                {bot.displayName}
              </option>
            ))}
          </select>
          <input
            className={styles.search}
            type="search"
            value={query}
            placeholder={t('workbench.search')}
            aria-label={t('workbench.search')}
            onChange={(event) => {
              currentQuery.current = event.target.value;
              setQuery(event.target.value);
              void runSearch(event.target.value);
            }}
          />
        </div>
        {status === 'loading' ? (
          <p className={styles.state}>{t('workbench.loading')}</p>
        ) : status === 'error' ? (
          <p className={styles.state}>{t('workbench.error')}</p>
        ) : visible.length === 0 ? (
          <p className={styles.state}>{t('workbench.sessions.empty')}</p>
        ) : (
          <ul className={styles.list}>
            {visible.map((session) => (
              <li key={session.id}>
                <button
                  type="button"
                  className={styles.listItem}
                  aria-current={selected === session.id ? 'true' : undefined}
                  onClick={() => {
                    void openSession(session);
                  }}
                >
                  <span className={styles.listItemTitle}>
                    {session.title || t('workbench.sessions.untitled')}
                  </span>
                  <span className={styles.listItemMeta}>
                    {session.messageCount} ·{' '}
                    {new Date(session.updatedAt * 1000).toLocaleDateString()}
                    {canonicalIds.has(session.id) ? ` · ${t('workbench.sessions.botChat')}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {results === null && status === 'ready' && sessions.length < total ? (
          <button
            type="button"
            className={styles.more}
            onClick={() => {
              void load(profile, offset + pageSize);
            }}
          >
            {t('workbench.sessions.loadMore')}
          </button>
        ) : null}
      </div>
      <div className={styles.detailPane}>
        {selected === null ? null : (
          <div className={styles.transcript}>
            {messageHasMore ? (
              <button
                type="button"
                className={styles.more}
                onClick={() => {
                  const dashboard = window.mosbot?.dashboard;
                  if (dashboard === undefined) {
                    return;
                  }
                  const requestedSession = selected;
                  const requestedProfile = profile;
                  void dashboard
                    .workbenchMessages(requestedProfile, requestedSession, messageOffset)
                    .then((result) => {
                      if (
                        requestedSession !== currentSession.current ||
                        requestedProfile !== currentProfile.current
                      ) {
                        return;
                      }
                      if (result.ok) {
                        setMessages((current) => [...result.data.messages, ...current]);
                        setMessageOffset((current) => current + result.data.messages.length);
                        setMessageHasMore(result.data.hasMore);
                      }
                    });
                }}
              >
                {t('workbench.sessions.loadMore')}
              </button>
            ) : null}
            {messages.length === 0 ? (
              <p className={styles.state}>{t('workbench.sessions.empty')}</p>
            ) : (
              messages.map((message) => (
                <p
                  key={message.id}
                  className={message.role === 'user' ? styles.userMessage : styles.botMessage}
                >
                  {message.text}
                </p>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function KanbanPage(): ReactElement {
  const t = useMessages();
  const [boards, setBoards] = useState<readonly KanbanBoardSummary[]>([]);
  const [board, setBoard] = useState('');
  const [snapshot, setSnapshot] = useState<KanbanBoard | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'unavailable'>('loading');
  const [liveState, setLiveState] = useState<'connected' | 'reconnecting' | 'disconnected'>(
    'disconnected',
  );
  const currentBoard = useRef('');
  const lastCursor = useRef(0);
  const reloadTimer = useRef<number | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [writing, setWriting] = useState(false);
  const [writeError, setWriteError] = useState(false);

  const loadBoards = useCallback(async (): Promise<void> => {
    const dashboard = window.mosbot?.dashboard;
    if (dashboard === undefined) {
      return;
    }
    setStatus('loading');
    const result = await dashboard.kanbanBoards();
    if (!result.ok) {
      setStatus('unavailable');
      return;
    }
    setBoards(result.data);
    const next = result.data.find((entry) => entry.isCurrent) ?? result.data[0];
    if (next === undefined) {
      setStatus('unavailable');
      return;
    }
    currentBoard.current = next.slug;
    setBoard(next.slug);
    setStatus('ready');
  }, []);

  const loadBoard = useCallback(async (slug: string): Promise<void> => {
    const dashboard = window.mosbot?.dashboard;
    if (dashboard === undefined || slug === '') {
      return;
    }
    setStatus('loading');
    const result = await dashboard.kanbanBoard(slug);
    // A response for a board the person already switched away from must never
    // repaint the current board (slow network reordering).
    if (slug !== currentBoard.current) {
      return;
    }
    if (!result.ok) {
      setStatus('error');
      return;
    }
    setSnapshot(result.data);
    setStatus('ready');
  }, []);

  useEffect(() => {
    void loadBoards();
  }, [loadBoards]);

  const reloadBoardSoon = useCallback(
    (slug: string): void => {
      if (reloadTimer.current !== null) {
        window.clearTimeout(reloadTimer.current);
      }
      reloadTimer.current = window.setTimeout(() => {
        reloadTimer.current = null;
        void loadBoard(slug);
      }, 300);
    },
    [loadBoard],
  );

  useEffect(() => {
    const dashboard = window.mosbot?.dashboard;
    if (dashboard === undefined) {
      return;
    }
    return dashboard.onKanbanEvent((event) => {
      if (event.board !== currentBoard.current) {
        // A late frame from a previous board never touches the current one.
        return;
      }
      setLiveState(event.state);
      if (event.state === 'connected') {
        void loadBoard(event.board);
      }
      if (event.events.length > 0) {
        reloadBoardSoon(event.board);
      }
    });
  }, [loadBoard, reloadBoardSoon]);

  useEffect(() => {
    const dashboard = window.mosbot?.dashboard;
    if (board === '') {
      return;
    }
    currentBoard.current = board;
    void dashboard?.kanbanWatch(board, lastCursor.current);
    return () => {
      void dashboard?.kanbanUnwatch();
      if (reloadTimer.current !== null) {
        window.clearTimeout(reloadTimer.current);
        reloadTimer.current = null;
      }
    };
  }, [board]);

  useEffect(() => {
    if (board !== '') {
      void loadBoard(board);
    }
  }, [board, loadBoard]);

  useEffect(() => {
    if (snapshot === null || snapshot.board !== currentBoard.current) {
      return;
    }
    const latest = snapshot.latestEventId ?? 0;
    if (latest < lastCursor.current) {
      // The board's event ids moved backwards (reset/restore): resubscribe from the
      // new tail instead of waiting for events that will never arrive.
      lastCursor.current = latest;
      void window.mosbot?.dashboard.kanbanWatch(snapshot.board, latest);
    } else {
      lastCursor.current = latest;
    }
  }, [snapshot]);

  if (status === 'unavailable') {
    return <p className={styles.offline}>{t('workbench.kanban.unavailable')}</p>;
  }

  return (
    <div className={styles.kanban}>
      <div className={styles.listToolbar}>
        <select
          className={styles.search}
          value={board}
          aria-label="Board"
          onChange={(event) => {
            currentBoard.current = event.target.value;
            setBoard(event.target.value);
          }}
        >
          {boards.map((entry) => (
            <option key={entry.slug} value={entry.slug}>
              {entry.name} ({entry.total})
            </option>
          ))}
        </select>
        <button type="button" className={styles.refresh} onClick={() => void loadBoard(board)}>
          {t('workbench.refresh')}
        </button>
      </div>
      <form
        className={styles.listToolbar}
        onSubmit={(event) => {
          event.preventDefault();
          const dashboard = window.mosbot?.dashboard;
          const title = newTitle.trim();
          if (dashboard === undefined || board === '' || title === '' || writing) {
            return;
          }
          setWriting(true);
          setWriteError(false);
          void dashboard.kanbanCreateTask(board, title).then((result) => {
            setWriting(false);
            if (!result.ok) {
              setWriteError(true);
              return;
            }
            setNewTitle('');
            void loadBoard(board);
          });
        }}
      >
        <input
          className={styles.search}
          value={newTitle}
          maxLength={120}
          placeholder={t('workbench.kanban.newTask')}
          aria-label={t('workbench.kanban.newTask')}
          onChange={(event) => {
            setNewTitle(event.target.value);
          }}
        />
        <button
          type="submit"
          className={styles.primary}
          disabled={newTitle.trim() === '' || writing}
        >
          {t('workbench.kanban.addTask')}
        </button>
      </form>
      {writeError ? <p className={styles.state}>{t('workbench.kanban.writeFailed')}</p> : null}
      {liveState === 'reconnecting' ? (
        <p className={styles.state}>{t('workbench.kanban.reconnecting')}</p>
      ) : null}
      {status === 'loading' ? (
        <p className={styles.state}>{t('workbench.loading')}</p>
      ) : status === 'error' ? (
        <p className={styles.state}>{t('workbench.error')}</p>
      ) : snapshot === null ? null : (
        <div className={styles.columns}>
          {snapshot.columns.map((column) => (
            <section key={column.name} className={styles.column}>
              <h3 className={styles.columnTitle}>
                {column.name} <span className={styles.columnCount}>{column.tasks.length}</span>
              </h3>
              {column.tasks.map((task) => (
                <article key={task.id} className={styles.card}>
                  <p className={styles.cardTitle}>{task.title}</p>
                  <p className={styles.cardMeta}>
                    {task.id}
                    {task.assignee === '' ? '' : ` · ${task.assignee}`}
                  </p>
                  <select
                    className={styles.search}
                    value={task.status}
                    aria-label={t('workbench.kanban.status')}
                    onChange={(event) => {
                      const dashboard = window.mosbot?.dashboard;
                      const next = event.target.value;
                      if (dashboard === undefined || board === '') {
                        return;
                      }
                      setWriteError(false);
                      void dashboard.kanbanSetTaskStatus(board, task.id, next).then((result) => {
                        if (!result.ok) {
                          setWriteError(true);
                          return;
                        }
                        void loadBoard(board);
                      });
                    }}
                  >
                    {snapshot.columns.map((option) => (
                      <option key={option.name} value={option.name}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </article>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
