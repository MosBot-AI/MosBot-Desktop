import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  Notification,
  safeStorage,
  Menu,
  session,
  shell,
} from 'electron';
import { existsSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { DASHBOARD_CHANNELS, SHELL_CHANNELS, type MenuCommand } from '../shared/bridge';
import { protocolError, type Result } from '../shared/protocol';
import path from 'node:path';
import { createAuthManager } from './dashboard/auth';
import { createChatManager } from './dashboard/chat';
import { registerChatIpc } from './dashboard/chat-ipc';
import { watchKanbanBoard, type KanbanWatcher } from './dashboard/kanban-events';
import { createPendingWatcher } from './dashboard/pending';
import { createComputerViewer } from './computer-viewer';
import { createApplicationMenu, menuLanguageForLocale, type MenuLanguage } from './menu';
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

/** Query parameters the stream benchmark harness may receive (test-only). */
const BENCH_QUERY_KEYS = [
  'seconds',
  'rate',
  'batchMs',
  'burst',
  'burstFactor',
  'history',
  'historyBase',
  'markdownEvery',
] as const;

/** `?bench=1&…` for the frame replayer, or null in every normal launch. */
function windowQuery(): Record<string, string> | null {
  const query: Record<string, string> = {};
  if (process.env['MOSBOT_DIAG'] === '1') {
    query['diag'] = '1';
  }
  if (process.env['MOSBOT_BENCH'] === '1') {
    query['bench'] = '1';
    const raw = new URLSearchParams(process.env['MOSBOT_BENCH_QUERY'] ?? '');
    for (const key of BENCH_QUERY_KEYS) {
      const value = raw.get(key);
      if (value !== null) {
        query[key] = value;
      }
    }
  }
  return Object.keys(query).length === 0 ? null : query;
}

const BACKGROUND_TEST = process.env['MOSBOT_TEST_BACKGROUND'] === '1';

function createMainWindow(): void {
  const benchQuery = windowQuery();
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 760,
    minWidth: 720,
    minHeight: 500,
    show: false,
    // Background test mode: keep the window out of the way (no activation, no
    // Dock presence) while Playwright drives its DOM.
    ...(BACKGROUND_TEST ? { focusable: false, skipTaskbar: true, hasShadow: false } : {}),
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
      // Benchmarks need unthrottled timers/rAF even if the window is occluded.
      ...(benchQuery === null && !BACKGROUND_TEST ? {} : { backgroundThrottling: false }),
    },
  });

  hardenWebContents(mainWindow);

  mainWindow.once('ready-to-show', () => {
    if (!BACKGROUND_TEST) {
      mainWindow?.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // The stream benchmark harness (`pnpm bench:stream`) appends `?bench=1` so the
  // renderer can install its in-process frame replayer. Never set in normal runs.
  if (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === 'string') {
    try {
      const devUrl = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
      for (const [key, value] of Object.entries(benchQuery ?? {})) {
        devUrl.searchParams.set(key, value);
      }
      void mainWindow.loadURL(devUrl.toString());
    } catch {
      void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    }
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      benchQuery === null ? undefined : { query: benchQuery },
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

/** Sends a native-menu command to the main window, recreating/showing it first. */
function dispatchMenuCommand(command: MenuCommand): void {
  ensureWindow();
  if (command === 'show-main-window') {
    return;
  }
  const contents = mainWindow?.webContents;
  if (contents !== undefined && contents !== null && !contents.isDestroyed()) {
    contents.send(SHELL_CHANNELS.menuCommand, command);
  }
}

function installMenu(language: MenuLanguage): void {
  Menu.setApplicationMenu(createApplicationMenu(language, dispatchMenuCommand));
}

/** Shows the main window, recreating it when the person closed it earlier. */
function ensureWindow(): void {
  if (mainWindow === null || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  if (!BACKGROUND_TEST) {
    mainWindow.show();
    mainWindow.focus();
  }
}

function registerShellIpc(): void {
  const isTrustedSender = createTrustedSenderCheck(() => mainWindow?.webContents ?? null);
  ipcMain.handle(SHELL_CHANNELS.setMenuLanguage, (event, rawLanguage: unknown): boolean => {
    if (!isTrustedSender(event) || (rawLanguage !== 'zh-Hans' && rawLanguage !== 'en')) {
      return false;
    }
    installMenu(rawLanguage);
    return true;
  });
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

  const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
  const mimeForPath = (filePath: string): string => {
    const extension = path.extname(filePath).toLowerCase();
    switch (extension) {
      case '.png':
        return 'image/png';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.gif':
        return 'image/gif';
      case '.webp':
        return 'image/webp';
      case '.pdf':
        return 'application/pdf';
      case '.txt':
      case '.md':
      case '.json':
      case '.csv':
      case '.log':
        return 'text/plain';
      default:
        return 'application/octet-stream';
    }
  };
  ipcMain.handle(
    DASHBOARD_CHANNELS.chatAttachFile,
    async (event): Promise<Result<{ name: string; refText: string }>> => {
      if (!trusted(event) || mainWindow === null) {
        return { ok: false, error: protocolError('internal', 'Untrusted renderer request.') };
      }
      const picked = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'] });
      const filePath = picked.filePaths[0];
      if (picked.canceled || filePath === undefined) {
        return { ok: false, error: protocolError('invalid_url', 'No file selected.') };
      }
      try {
        const info = await stat(filePath);
        if (info.size > MAX_ATTACHMENT_BYTES) {
          return {
            ok: false,
            error: protocolError('invalid_url', 'The file is larger than 10 MB.'),
          };
        }
        const buffer = await readFile(filePath);
        const dataUrl = `data:${mimeForPath(filePath)};base64,${buffer.toString('base64')}`;
        return chat.attachFile(path.basename(filePath), dataUrl);
      } catch {
        return { ok: false, error: protocolError('internal', 'The file could not be read.') };
      }
    },
  );

  ipcMain.handle(
    DASHBOARD_CHANNELS.saveArtifact,
    async (event, artifactPath: unknown, name: unknown): Promise<Result<string>> => {
      if (
        !trusted(event) ||
        typeof artifactPath !== 'string' ||
        artifactPath.length === 0 ||
        artifactPath.length > 4096 ||
        typeof name !== 'string' ||
        name.length === 0 ||
        name.length > 200
      ) {
        return {
          ok: false,
          error: protocolError('invalid_url', 'The artifact request is not valid.'),
        };
      }
      const content = await service.readArtifact(artifactPath);
      if (!content.ok) {
        return content;
      }
      const match = /^data:[^;,]*;base64,(.*)$/s.exec(content.data.dataUrl);
      if (match === null) {
        return {
          ok: false,
          error: protocolError('malformed_response', 'The artifact payload is not valid.'),
        };
      }
      try {
        const downloads = app.getPath('downloads');
        const safeName =
          path
            .basename(name)
            .split('')
            .filter((character) => character.charCodeAt(0) > 31)
            .join('') || 'artifact';
        let destination = path.join(downloads, safeName);
        if (existsSync(destination)) {
          const extension = path.extname(safeName);
          const stem = safeName.slice(0, safeName.length - extension.length);
          destination = path.join(downloads, `${stem}-${Date.now()}${extension}`);
        }
        await writeFile(destination, Buffer.from(match[1] ?? '', 'base64'));
        await shell.openPath(destination);
        return { ok: true, data: destination };
      } catch {
        return { ok: false, error: protocolError('internal', 'The artifact could not be saved.') };
      }
    },
  );

  const watcher = createPendingWatcher({
    auth,
    fetchImpl,
    notify: (pending) => {
      const window = mainWindow;
      const focused =
        window !== null && !window.isDestroyed() && window.isVisible() && window.isFocused();
      const supported = Notification.isSupported();
      const diag =
        process.env['MOSBOT_DIAG'] === '1'
          ? (globalThis as typeof globalThis & {
              __mosbotNotify?: {
                entries: Array<{
                  title: string;
                  body: string;
                  profile: string;
                  approval: boolean;
                  at: number;
                  focused: boolean;
                  supported: boolean;
                  shown: boolean;
                  click: () => void;
                }>;
              };
            })
          : null;
      if (focused || !supported) {
        diag?.__mosbotNotify?.entries.push({
          title: pending.displayName,
          body: '(skipped)',
          profile: pending.profile,
          approval: pending.method === 'approval',
          at: Date.now(),
          focused,
          supported,
          shown: false,
          click: () => undefined,
        });
        return;
      }
      const zh = app.getLocale().toLowerCase().startsWith('zh');
      const title = pending.displayName;
      const body = zh
        ? pending.method === 'approval'
          ? '需要你确认'
          : '有一个问题需要你回答'
        : pending.method === 'approval'
          ? 'Needs your confirmation'
          : 'A question is waiting';
      const notification = new Notification({ title, body });
      const click = (): void => {
        ensureWindow();
        mainWindow?.webContents.send(DASHBOARD_CHANNELS.pendingEvent, {
          type: 'open',
          profile: pending.profile,
        });
      };
      notification.on('click', click);
      // Test-only diagnostics (MOSBOT_DIAG=1): lets the walkthrough assert that a
      // notification was requested and that its click path opens the Bot, without
      // needing macOS screen-recording permission to read the actual banner.
      if (diag !== null) {
        diag.__mosbotNotify ??= { entries: [] };
        diag.__mosbotNotify.entries.push({
          title,
          body,
          profile: pending.profile,
          approval: pending.method === 'approval',
          at: Date.now(),
          focused: false,
          supported: true,
          shown: true,
          click,
        });
      }
      notification.show();
    },
    onEvent: (event) => {
      mainWindow?.webContents.send(DASHBOARD_CHANNELS.pendingEvent, event);
    },
    ...(process.env['MOSBOT_DIAG'] === '1'
      ? {
          onDiagnostics: (info: {
            canonicalProfiles: number;
            active: Array<{ status: string; mapped: boolean }>;
            waitingProfiles: string[];
          }) => {
            const host = globalThis as typeof globalThis & {
              __mosbotPendingScans?: unknown[];
            };
            host.__mosbotPendingScans ??= [];
            host.__mosbotPendingScans.push({ at: Date.now(), ...info });
            if (host.__mosbotPendingScans.length > 20) {
              host.__mosbotPendingScans.shift();
            }
          },
        }
      : {}),
  });
  const trusted = createTrustedSenderCheck(() => mainWindow?.webContents ?? null);
  const computerViewer = createComputerViewer({
    auth,
    fetchImpl,
    preloadPath: path.join(__dirname, 'preload.cjs'),
    rendererDevUrl:
      typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === 'string' ? MAIN_WINDOW_VITE_DEV_SERVER_URL : null,
    rendererIndex: path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    getParent: () => mainWindow,
    isTrustedEvent: trusted,
  });

  registerDashboardIpc({
    ipcMain,
    service,
    isTrustedEvent: trusted,
    onSignOut: () => {
      chat.close();
      watcher.stop();
      stopKanbanWatcher();
      computerViewer.dispose();
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
    computerViewer.dispose();
  });
  watcher.start();
}

void app.whenReady().then(() => {
  if (BACKGROUND_TEST) {
    // No Dock icon and no activation: UI tests must not steal focus from the person
    // using the machine.
    app.setActivationPolicy('accessory');
    app.dock?.hide();
  }
  registerShellIpc();
  registerDashboard();
  installMenu(menuLanguageForLocale(app.getLocale()));
  createMainWindow();

  app.on('activate', () => {
    // Closing the main window keeps the app (and its connection) alive on
    // macOS; the Dock icon brings the same window back.
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else if (!BACKGROUND_TEST) {
      mainWindow?.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit();
  }
});
