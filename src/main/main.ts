import { app, BrowserWindow, ipcMain, nativeTheme, safeStorage, session, shell } from 'electron';
import path from 'node:path';
import { createAuthManager } from './dashboard/auth';
import { createTrustedSenderCheck, registerDashboardIpc } from './dashboard/ipc';
import { createDashboardService } from './dashboard/service';
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
  const service = createDashboardService({
    auth,
    fetchImpl,
    ticketExpiryCheck: process.env['MOSBOT_PROBE_TICKET_EXPIRY'] === '1',
  });
  registerDashboardIpc({
    ipcMain,
    service,
    isTrustedEvent: createTrustedSenderCheck(() => mainWindow?.webContents ?? null),
  });
  app.on('before-quit', () => {
    auth.cancelLogin();
  });
}

void app.whenReady().then(() => {
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
