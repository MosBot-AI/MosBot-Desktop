import { app, BrowserWindow, nativeTheme, shell } from 'electron';
import path from 'node:path';

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

void app.whenReady().then(() => {
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
