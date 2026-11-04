import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
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
            <button
              type="button"
              className={styles.primary}
              onClick={() => {
                void window.mosbot?.dashboard.openProfileConfig();
              }}
            >
              {t('workbench.profiles.configure')}
            </button>
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

  const pageSize = 50;

  const load = useCallback(
    async (nextProfile: string, nextOffset: number): Promise<void> => {
      const dashboard = window.mosbot?.dashboard;
      if (dashboard === undefined || nextProfile === '') {
        return;
      }
      setStatus('loading');
      const result = await dashboard.workbenchSessions(nextProfile, nextOffset, pageSize);
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
      const result = await dashboard.workbenchSearch(profile, value);
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
      setSelected(session.id);
      const result = await dashboard.workbenchMessages(profile, session.id, 0);
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
                  void dashboard
                    .workbenchMessages(profile, selected, messageOffset)
                    .then((result) => {
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

  useEffect(() => {
    if (board !== '') {
      void loadBoard(board);
    }
  }, [board, loadBoard]);

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
                </article>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
