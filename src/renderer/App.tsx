import { useEffect, type ReactElement } from 'react';
import styles from './App.module.css';
import { LOCALE_TAGS } from './app/i18n';
import { appStore, useAppState, useDispatch } from './app/store';
import { BotSidebar } from './features/bots/BotSidebar';
import { ChatView } from './features/chat/ChatView';
import { ConnectionDialog } from './features/connection/ConnectionDialog';
import { restoreConnectionOnStartup } from './features/connection/useConnection';
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
  const pendingReply = useAppState((state) => state.pendingReply);
  const wakingProfileId = useAppState(
    (state) =>
      Object.values(state.computers).find((item) => item.status === 'waking')?.profileId ?? null,
  );
  const dispatch = useDispatch();

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

  // Once connected, replace the fixture roster with the real profiles.
  const connected = useAppState((state) => state.connectionUi.snapshot?.connected === true);
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
      const preferred = result.data.find((bot) => bot.isDefault) ?? result.data[0];
      if (preferred !== undefined) {
        dispatch({ type: 'remote-select', profile: preferred.profileName });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connected, dispatch]);

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
    <div className={styles.app} data-inspector-open={inspectorOpen ? 'true' : 'false'}>
      <BotSidebar />
      <div className={styles.main}>
        <ChatView />
        <InspectorPanel />
      </div>
      <SearchOverlay />
      <CreateBotDialog />
      <ConnectionDialog />
    </div>
  );
}
