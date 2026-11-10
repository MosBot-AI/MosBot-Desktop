import { useEffect, type ReactElement } from 'react';
import type { MenuCommand } from '../shared/bridge';
import styles from './App.module.css';
import { LOCALE_TAGS, useMessages } from './app/i18n';
import {
  appStore,
  buildLocalState,
  chatEventAction,
  connectionKey,
  useAppState,
  useDispatch,
} from './app/store';
import { BotSidebar } from './features/bots/BotSidebar';
import { ChatView } from './features/chat/ChatView';
import { GroupView } from './features/groups/GroupView';
import { ConnectionDialog } from './features/connection/ConnectionDialog';
import { Workbench } from './features/workbench/Workbench';
import { restoreConnectionOnStartup } from './features/connection/useConnection';
import { openPendingProfile } from './app/pending-open';
import { CreateBotDialog } from './features/create/CreateBotDialog';
import { InspectorPanel } from './features/inspector/InspectorPanel';
import { SearchOverlay } from './features/search/SearchOverlay';

/**
 * The shell: roster, conversation and the on-demand details column. Only the
 * conversation is always visible; search and create are overlays owned by the
 * window, while the details panel is a column on wide windows and a right-hand
 * overlay on narrow ones.
 */
export function App(): ReactElement {
  const theme = useAppState((state) => state.resolvedTheme);
  const language = useAppState((state) => state.language);
  const reduceMotion = useAppState((state) => state.reduceMotion);
  const inspectorOpen = useAppState((state) => state.inspector.open);
  const workbenchOpen = useAppState((state) => state.workbench.open);
  const pendingReply = useAppState((state) => state.pendingReply);
  const wakingProfileId = useAppState(
    (state) =>
      Object.values(state.computers).find((item) => item.status === 'waking')?.profileId ?? null,
  );
  const dispatch = useDispatch();
  const t = useMessages();
  const networkOnline = useAppState((state) => state.networkOnline);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset['theme'] = theme;
    root.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = LOCALE_TAGS[language];
  }, [language]);

  useEffect(() => {
    document.documentElement.dataset['reduceMotion'] = reduceMotion ? 'true' : 'false';
  }, [reduceMotion]);

  // Native macOS menu → the same overlay actions the pointer reaches.
  useEffect(() => {
    const menu = window.mosbot?.menu;
    if (menu === undefined) {
      return;
    }
    return menu.onCommand((command: MenuCommand) => {
      if (command === 'new-bot') {
        dispatch({ type: 'create-open' });
      } else if (command === 'search') {
        dispatch({ type: 'search-open' });
      } else if (command === 'settings') {
        dispatch({ type: 'set-footer-menu', open: true });
      }
    });
  }, [dispatch]);

  // Keep the native menu labels in the interface language.
  useEffect(() => {
    void window.mosbot?.menu.setLanguage(language);
  }, [language]);

  // Network loss must be visible: the Dashboard connection and the viewer drop
  // silently otherwise. Chromium's online/offline events cover Wi-Fi/Ethernet.
  useEffect(() => {
    const update = (): void => {
      dispatch({ type: 'set-network-online', online: navigator.onLine });
    };
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [dispatch]);

  useEffect(() => {
    const dark = window.matchMedia('(prefers-color-scheme: dark)');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onDarkChange = (): void => {
      dispatch({ type: 'resolve-theme', resolvedTheme: dark.matches ? 'dark' : 'light' });
    };
    const onMotionChange = (): void => {
      dispatch({ type: 'set-reduce-motion', reduceMotion: motion.matches });
    };
    dark.addEventListener('change', onDarkChange);
    motion.addEventListener('change', onMotionChange);
    return () => {
      dark.removeEventListener('change', onDarkChange);
      motion.removeEventListener('change', onMotionChange);
    };
  }, [dispatch]);

  // Fixture-only reply pacing for the design slice. M1 replaces this with real
  // streaming events from the Dashboard utility process.
  useEffect(() => {
    if (pendingReply === null) {
      return;
    }
    const timer = window.setTimeout(() => {
      dispatch({
        type: 'deliver-reply',
        botId: pendingReply.botId,
        text: pendingReply.text,
        at: Date.now(),
      });
    }, 1400);
    return () => {
      window.clearTimeout(timer);
    };
  }, [pendingReply, dispatch]);

  // Fixture-only wake pacing; the real display state arrives over the WS in M4.
  useEffect(() => {
    if (wakingProfileId === null) {
      return;
    }
    const timer = window.setTimeout(() => {
      dispatch({ type: 'computer-woke', profileId: wakingProfileId });
    }, 1200);
    return () => {
      window.clearTimeout(timer);
    };
  }, [wakingProfileId, dispatch]);

  // Silently restore a saved Dashboard sign-in; nothing prompts for a password.
  useEffect(() => {
    void restoreConnectionOnStartup(dispatch);
  }, [dispatch]);

  // Hydrate non-secret local state (drafts, selection, preferences).
  useEffect(() => {
    const local = window.mosbot?.local;
    if (local === undefined) {
      return;
    }
    void local.load().then((result) => {
      if (result.ok) {
        dispatch({ type: 'hydrate-local', state: result.data });
      }
    });
  }, [dispatch]);

  const activeConnectionKey = useAppState(connectionKey);
  useEffect(() => {
    const current = appStore.getState().localState;
    if (current !== null) {
      dispatch({ type: 'hydrate-local', state: current });
    }
  }, [activeConnectionKey, dispatch]);

  // Persist drafts/selection/preferences with a short debounce, and flush on close.
  useEffect(() => {
    const local = window.mosbot?.local;
    if (local === undefined) {
      return;
    }
    let timer: number | null = null;
    let lastSaved = '';
    const flush = (): void => {
      const next = buildLocalState(appStore.getState());
      const serialized = JSON.stringify(next);
      if (serialized === lastSaved) {
        return;
      }
      lastSaved = serialized;
      void local.save(next);
    };
    const unsubscribe = appStore.subscribe(() => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(() => {
        timer = null;
        flush();
      }, 600);
    });
    const onBeforeUnload = (): void => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      flush();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      unsubscribe();
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  // Once connected, replace the fixture roster with the real profiles.
  const connected = useAppState((state) => state.connectionUi.snapshot?.connected === true);
  const chatConnection = useAppState((state) => state.live.connection);
  const selectedGroupId = useAppState((state) => state.remote.selectedGroupId);
  useEffect(() => {
    const dashboard = window.mosbot?.dashboard;
    if (dashboard === undefined) {
      return;
    }
    if (!connected) {
      dispatch({ type: 'remote-reset' });
      return;
    }
    let cancelled = false;
    dispatch({ type: 'remote-loading' });
    void (async () => {
      const result = await dashboard.listBots();
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        dispatch({ type: 'remote-error', error: result.error });
        return;
      }
      dispatch({ type: 'remote-ready', bots: [...result.data] });
      const saved = appStore.getState().savedSelectedProfile;
      const preferred =
        result.data.find((bot) => bot.profileName === saved) ??
        result.data.find((bot) => bot.isDefault) ??
        result.data[0];
      if (preferred !== undefined) {
        dispatch({ type: 'remote-select', profile: preferred.profileName });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connected, dispatch]);

  // M6 group roster: fetch the read-only hosted-room list once a Bot Chat
  // connection is live (the gateway RPC client is owned by the chat manager).
  useEffect(() => {
    const dashboard = window.mosbot?.dashboard;
    if (dashboard === undefined || !connected || chatConnection !== 'connected') {
      return;
    }
    let cancelled = false;
    dispatch({ type: 'group-roster-loading' });
    void (async () => {
      const result = await dashboard.chatListGroups();
      if (cancelled) {
        return;
      }
      if (result.ok) {
        dispatch({ type: 'remote-groups', groups: [...result.data] });
      } else {
        dispatch({ type: 'group-roster-error', message: result.error.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chatConnection, connected, dispatch]);

  // M6 read-only group view: fetch room state and the latest log delta when a
  // hosted room is selected.
  useEffect(() => {
    const dashboard = window.mosbot?.dashboard;
    if (
      dashboard === undefined ||
      !connected ||
      chatConnection !== 'connected' ||
      selectedGroupId === null
    ) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const detail = await dashboard.chatGroupState(selectedGroupId);
      if (cancelled) {
        return;
      }
      if (!detail.ok) {
        dispatch({ type: 'group-error', message: detail.error.message });
        return;
      }
      dispatch({ type: 'group-detail', detail: detail.data });
      // Open on the latest page instead of replaying the room from seq 0.
      const since = Math.max(0, detail.data.latestSeq - 50);
      const log = await dashboard.chatGroupLog(selectedGroupId, since, 50);
      if (cancelled) {
        return;
      }
      if (log.ok) {
        dispatch({ type: 'group-log', events: [...log.data.events] });
      } else {
        dispatch({ type: 'group-error', message: log.error.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chatConnection, connected, selectedGroupId, dispatch]);

  // M6 group log polling while the read-only group view is open.
  useEffect(() => {
    const dashboard = window.mosbot?.dashboard;
    if (
      dashboard === undefined ||
      !connected ||
      chatConnection !== 'connected' ||
      selectedGroupId === null
    ) {
      return;
    }
    let cancelled = false;
    let running = false;
    const poll = async (): Promise<void> => {
      if (running || cancelled) {
        return;
      }
      running = true;
      try {
        const current = appStore.getState().remote;
        const events = current.groupEvents;
        const since =
          events.length === 0
            ? Math.max(0, (current.groupDetail?.latestSeq ?? 0) - 100)
            : (events[events.length - 1]?.seq ?? 0);
        const [log, state] = await Promise.all([
          dashboard.chatGroupLog(selectedGroupId, since, 100),
          dashboard.chatGroupState(selectedGroupId),
        ]);
        if (cancelled) {
          return;
        }
        if (log.ok) {
          if (log.data.events.length > 0) {
            dispatch({ type: 'group-log-append', events: [...log.data.events] });
          }
          dispatch({ type: 'group-latest', latestSeq: log.data.latestSeq });
        } else {
          dispatch({ type: 'group-error', message: log.error.message });
        }
        if (state.ok) {
          dispatch({ type: 'group-detail', detail: state.data });
        } else {
          dispatch({ type: 'group-error', message: state.error.message });
        }
      } finally {
        running = false;
      }
    };
    const timer = window.setInterval(() => {
      void poll();
    }, 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [chatConnection, connected, selectedGroupId, dispatch]);

  // Pending requests discovered for Bots that are not open: badge + notification click.
  useEffect(() => {
    const dashboard = window.mosbot?.dashboard;
    if (dashboard === undefined) {
      return;
    }
    return dashboard.onPendingEvent((event) => {
      if (event.type === 'add') {
        dispatch({
          type: 'pending-add',
          requestId: event.requestId,
          profile: event.profile,
          method: event.method,
          title: event.title,
        });
      } else if (event.type === 'remove') {
        dispatch({ type: 'pending-remove', requestId: event.requestId });
      } else {
        void openPendingProfile({
          profile: event.profile,
          bots: appStore.getState().remote.bots,
          listBots: () => dashboard.listBots(),
          applyBots: (bots) => dispatch({ type: 'remote-ready', bots: [...bots] }),
          select: (profile) => dispatch({ type: 'select-bot', botId: profile }),
        });
      }
    });
  }, [dispatch]);

  // Subscribe to live turn events from the main process (stream, requests, reconnect).
  useEffect(() => {
    const dashboard = window.mosbot?.dashboard;
    if (dashboard === undefined) {
      return;
    }
    return dashboard.onChatEvent((event) => {
      // A flush that was in flight while switching Bots must not append the
      // previous Bot's tail to the newly opened chat.
      if (
        event.type === 'delta' &&
        event.profile !== undefined &&
        event.profile !== appStore.getState().live.profile
      ) {
        return;
      }
      const action = chatEventAction(event);
      if (action !== null) {
        dispatch(action);
      }
    });
  }, [dispatch]);

  // Load the selected Bot Chat once per profile (read-only prefetch).
  const selectedProfile = useAppState((state) => state.remote.selectedProfile);
  useEffect(() => {
    const dashboard = window.mosbot?.dashboard;
    if (dashboard === undefined || !connected || selectedProfile === null) {
      return;
    }
    if (appStore.getState().remote.chats[selectedProfile] !== undefined) {
      return;
    }
    void (async () => {
      const chat = await dashboard.openChat(selectedProfile);
      if (chat.ok) {
        dispatch({ type: 'remote-chat', chat: chat.data });
      }
    })();
  }, [connected, selectedProfile, dispatch]);

  // Open (resume or create) the live chat session behind the selected Bot.
  const remoteChat = useAppState((state) =>
    state.remote.selectedProfile === null
      ? undefined
      : state.remote.chats[state.remote.selectedProfile],
  );
  const liveProfile = useAppState((state) => state.live.profile);
  useEffect(() => {
    const dashboard = window.mosbot?.dashboard;
    if (dashboard === undefined || !connected || selectedProfile === null) {
      return;
    }
    if (remoteChat === undefined || liveProfile === selectedProfile) {
      return;
    }
    dispatch({ type: 'live-reset', profile: selectedProfile });
    void dashboard.chatOpen(selectedProfile, remoteChat.storedSessionId).then((result) => {
      if (result.ok) {
        dispatch({
          type: 'remote-workspace',
          profile: selectedProfile,
          workspace: result.data.workspace,
        });
      } else {
        dispatch({ type: 'live-error', message: result.error.message });
      }
    });
  }, [connected, selectedProfile, remoteChat, liveProfile, dispatch]);

  // Model readiness follows the selected Bot; re-check when the window regains focus
  // (the person may have finished configuring it in the browser).
  const remoteStatus = useAppState((state) => state.remote.status);
  useEffect(() => {
    if (remoteStatus !== 'ready' || selectedProfile === null) {
      return;
    }
    const dashboard = window.mosbot?.dashboard;
    if (dashboard === undefined) {
      return;
    }
    let cancelled = false;
    const check = async (): Promise<void> => {
      const result = await dashboard.checkModelReady(selectedProfile);
      if (!cancelled && result.ok) {
        dispatch({
          type: 'remote-model-ready',
          profile: selectedProfile,
          ready: result.data.ready,
        });
      }
    };
    void check();
    const onFocus = (): void => {
      void check();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, [selectedProfile, remoteStatus, dispatch]);

  // A replay gap means the live transcript is stale: refetch the page and reset it.
  const staleReason = useAppState((state) => state.live.staleReason);
  useEffect(() => {
    if (staleReason === null) {
      return;
    }
    const dashboard = window.mosbot?.dashboard;
    const profile = appStore.getState().remote.selectedProfile;
    if (dashboard === undefined || profile === null) {
      dispatch({ type: 'live-history-refreshed' });
      return;
    }
    void dashboard.openChat(profile).then((result) => {
      if (result.ok) {
        dispatch({ type: 'remote-chat', chat: result.data });
        dispatch({ type: 'live-reset', profile });
      }
      dispatch({ type: 'live-history-refreshed' });
    });
  }, [staleReason, dispatch]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 968px)');
    const apply = (): void => {
      dispatch({ type: 'set-inspector-overlay', overlay: media.matches });
    };
    apply();
    media.addEventListener('change', apply);
    return () => {
      media.removeEventListener('change', apply);
    };
  }, [dispatch]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const command = event.metaKey || event.ctrlKey;
      if (command && (event.key === 'k' || event.key === 'f')) {
        event.preventDefault();
        dispatch({ type: 'search-open' });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [dispatch]);

  return (
    <>
      {networkOnline ? null : (
        <div className={styles.networkBanner} role="alert">
          {t('network.offline')}
        </div>
      )}
      <div
        className={workbenchOpen ? styles.appHidden : styles.app}
        data-inspector-open={inspectorOpen ? 'true' : 'false'}
      >
        <BotSidebar />
        <div className={styles.main}>
          {selectedGroupId === null ? <ChatView /> : <GroupView />}
          <InspectorPanel />
        </div>
      </div>
      <SearchOverlay />
      <CreateBotDialog />
      <ConnectionDialog />
      <Workbench />
    </>
  );
}
