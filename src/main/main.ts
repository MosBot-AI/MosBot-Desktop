import {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  Notification,
  safeStorage,
  session,
  shell,
} from 'electron';
import { DASHBOARD_CHANNELS, SHELL_CHANNELS } from '../shared/bridge';
import { protocolError, type Result } from '../shared/protocol';
import path from 'node:path';
import { createAuthManager } from './dashboard/auth';
import { createChatManager } from './dashboard/chat';
import { registerChatIpc } from './dashboard/chat-ipc';
import { watchKanbanBoard, type KanbanWatcher } from './dashboard/kanban-events';
import { createPendingWatcher } from './dashboard/pending';
import { registerLocalIpc } from './local/ipc';
import { createTrustedSenderCheck, registerDashboardIpc } from './dashboard/ipc';
import { createDashboardService } from './dashboard/service';
import { createSettingsStore } from './dashboard/settings';
import type { TransportFetch } from './dashboard/transport';

const isMac = process.platform === 'darwin';
const CHAT_SURFACE_LIGHT = '#fbfaf8';
const CHAT_SURFACE_DARK = '#17181a';

let mainWindow: BrowserWindow | null = null;

function allowedExternalUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function hardenWebContents(window: BrowserWindow): void {
  const { webContents } = window;

  webContents.setWindowOpenHandler(({ url }) => {
    if (allowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  webContents.on('will-navigate', (event, url) => {
    if (url !== webContents.getURL()) {
      event.preventDefault();
    }
  });

  webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  if (!app.isPackaged) {
    webContents.on('before-input-event', (event, input) => {
      const isToggleDevTools =
        input.type === 'keyDown' && input.key.toLowerCase() === 'i' && input.meta && input.alt;
      if (isToggleDevTools) {
        webContents.toggleDevTools();
        event.preventDefault();
      }
    });
  }
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 760,
    minWidth: 720,
    minHeight: 500,
    show: false,
    title: 'MosBot',
    backgroundColor: nativeTheme.shouldUseDarkColors ? CHAT_SURFACE_DARK : CHAT_SURFACE_LIGHT,
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 18, y: 20 },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webviewTag: false,
      webSecurity: true,
    },
  });

  hardenWebContents(mainWindow);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === 'string') {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

app.setName('MosBot');

/**
 * Electron's Chromium network stack (not Node's) performs Dashboard REST calls,
 * so the deployment's proxy, certificate and URL-prefix behaviour is exercised.
 */
function createSessionFetch(): TransportFetch {
  return async (url, init) => {
    const request: RequestInit = {
      method: init.method,
      headers: init.headers,
      redirect: init.redirect,
      signal: init.signal,
    };
    if (init.body !== undefined) {
      request.body = init.body;
    }
    const response = await session.defaultSession.fetch(url, request);
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      text: () => response.text(),
    };
  };
}

function loginTimeoutMs(): number | undefined {
  const raw = process.env['MOSBOT_LOGIN_TIMEOUT_MS'];
  if (raw === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 60_000 || parsed > 3_600_000) {
    return undefined;
  }
  return parsed;
}

/** Shows the main window, recreating it when the person closed it earlier. */
function ensureWindow(): void {
  if (mainWindow === null || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  mainWindow.show();
  mainWindow.focus();
}

function registerShellIpc(): void {
  ipcMain.handle(SHELL_CHANNELS.openExternal, async (_event, rawUrl: unknown): Promise<boolean> => {
    if (typeof rawUrl !== 'string' || rawUrl.length > 2048) {
      return false;
    }
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== 'https:') {
        return false;
      }
      await shell.openExternal(url.toString());
      return true;
    } catch {
      return false;
    }
  });
}

function registerDashboard(): void {
  const fetchImpl = createSessionFetch();
  const timeoutMs = loginTimeoutMs();
  const auth = createAuthManager({
    fetchImpl,
    openExternal: async (url) => {
      await shell.openExternal(url);
    },
    safeStorage,
    credentialsPath: path.join(app.getPath('userData'), 'dashboard-credentials.json'),
    ...(timeoutMs === undefined ? {} : { loopbackTimeoutMs: timeoutMs }),
  });
  const settings = createSettingsStore(
    path.join(app.getPath('userData'), 'dashboard-settings.json'),
  );
  const service = createDashboardService({
    auth,
    fetchImpl,
    settings,
    ticketExpiryCheck: process.env['MOSBOT_PROBE_TICKET_EXPIRY'] === '1',
  });
  const chat = createChatManager({ auth, fetchImpl });
  let kanbanWatcher: KanbanWatcher | null = null;
  const stopKanbanWatcher = (): void => {
    kanbanWatcher?.close();
    kanbanWatcher = null;
  };
  ipcMain.handle(
    DASHBOARD_CHANNELS.kanbanWatch,
    (event, board: unknown, since: unknown): Result<void> => {
      if (!trusted(event)) {
        return { ok: false, error: protocolError('internal', 'Untrusted renderer request.') };
      }
      if (
        typeof board !== 'string' ||
        board.length === 0 ||
        board.length > 128 ||
        typeof since !== 'number' ||
        !Number.isInteger(since) ||
        since < 0
      ) {
        return { ok: false, error: protocolError('invalid_url', 'The board watch is not valid.') };
      }
      stopKanbanWatcher();
      kanbanWatcher = watchKanbanBoard(
        {
          auth,
          fetchImpl,
          onEvent: (payload) => {
            mainWindow?.webContents.send(DASHBOARD_CHANNELS.kanbanEvent, payload);
          },
        },
        board,
        since,
      );
      return { ok: true, data: undefined };
    },
  );
  ipcMain.handle(DASHBOARD_CHANNELS.kanbanUnwatch, (event): Result<void> => {
    if (!trusted(event)) {
      return { ok: false, error: protocolError('internal', 'Untrusted renderer request.') };
    }
    stopKanbanWatcher();
    return { ok: true, data: undefined };
  });

  const watcher = createPendingWatcher({
    auth,
    fetchImpl,
    notify: (pending) => {
      const window = mainWindow;
      const focused =
        window !== null && !window.isDestroyed() && window.isVisible() && window.isFocused();
      if (focused || !Notification.isSupported()) {
        return;
      }
      const zh = app.getLocale().toLowerCase().startsWith('zh');
      const notification = new Notification({
        title: pending.displayName,
        body: zh
          ? pending.method === 'approval'
            ? '需要你确认'
            : '有一个问题需要你回答'
          : pending.method === 'approval'
            ? 'Needs your confirmation'
            : 'A question is waiting',
      });
      notification.on('click', () => {
        ensureWindow();
        mainWindow?.webContents.send(DASHBOARD_CHANNELS.pendingEvent, {
          type: 'open',
          profile: pending.profile,
        });
      });
      notification.show();
    },
    onEvent: (event) => {
      mainWindow?.webContents.send(DASHBOARD_CHANNELS.pendingEvent, event);
    },
  });
  const trusted = createTrustedSenderCheck(() => mainWindow?.webContents ?? null);
  registerDashboardIpc({
    ipcMain,
    service,
    isTrustedEvent: trusted,
    onSignOut: () => {
      chat.close();
      watcher.stop();
      stopKanbanWatcher();
    },
    onSessionReady: () => {
      watcher.start();
    },
  });
  registerChatIpc({
    ipcMain,
    chat,
    getWebContents: () => mainWindow?.webContents ?? null,
    isTrustedEvent: trusted,
  });
  registerLocalIpc({
    ipcMain,
    filePath: path.join(app.getPath('userData'), 'local-state.json'),
    isTrustedEvent: trusted,
  });
  app.on('before-quit', () => {
    auth.cancelLogin();
    chat.close();
    watcher.stop();
    stopKanbanWatcher();
  });
  watcher.start();
}

void app.whenReady().then(() => {
  registerShellIpc();
  registerDashboard();
  createMainWindow();

  app.on('activate', () => {
    // Closing the main window keeps the app (and its connection) alive on
    // macOS; the Dock icon brings the same window back.
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit();
  }
});
