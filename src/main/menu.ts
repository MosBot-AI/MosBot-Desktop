import {
  app,
  BrowserWindow,
  type BaseWindow,
  type MenuItemConstructorOptions,
  Menu,
  type WebContents,
} from 'electron';
import type { MenuCommand } from '../shared/bridge';

export type MenuLanguage = 'zh-Hans' | 'en';

interface Labels {
  readonly about: string;
  readonly settings: string;
  readonly showMainWindow: string;
  readonly file: string;
  readonly newBot: string;
  readonly search: string;
  readonly closeWindow: string;
  readonly view: string;
  readonly zoomIn: string;
  readonly zoomOut: string;
  readonly actualSize: string;
  readonly fullScreen: string;
  readonly window: string;
  readonly minimize: string;
  readonly zoom: string;
  readonly front: string;
}

const LABELS: Record<MenuLanguage, Labels> = {
  'zh-Hans': {
    about: '关于 MosBot',
    settings: '设置…',
    showMainWindow: '显示主窗口',
    file: '文件',
    newBot: '新建 Bot',
    search: '搜索 Bot',
    closeWindow: '关闭窗口',
    view: '显示',
    zoomIn: '放大',
    zoomOut: '缩小',
    actualSize: '实际大小',
    fullScreen: '进入全屏幕',
    window: '窗口',
    minimize: '最小化',
    zoom: '缩放',
    front: '全部置于顶层',
  },
  en: {
    about: 'About MosBot',
    settings: 'Settings…',
    showMainWindow: 'Show Main Window',
    file: 'File',
    newBot: 'New Bot',
    search: 'Search Bots',
    closeWindow: 'Close Window',
    view: 'View',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    actualSize: 'Actual Size',
    fullScreen: 'Toggle Full Screen',
    window: 'Window',
    minimize: 'Minimize',
    zoom: 'Zoom',
    front: 'Bring All to Front',
  },
};

export function menuLanguageForLocale(locale: string): MenuLanguage {
  return locale.toLowerCase().startsWith('zh') ? 'zh-Hans' : 'en';
}

/**
 * macOS application menu. The custom items dispatch renderer commands (new Bot,
 * search, settings, show window); standard roles keep the system edit, zoom and
 * window behaviour, including the shortcuts a Mac user expects.
 */
export function createApplicationMenu(
  language: MenuLanguage,
  onCommand: (command: MenuCommand) => void,
): Menu {
  const labels = LABELS[language];
  const appName = app.name;

  const zoomContents = (window?: BaseWindow | null): WebContents | null => {
    if (window instanceof BrowserWindow) {
      return window.webContents;
    }
    const target = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    return target?.webContents ?? null;
  };

  const changeZoom = (delta: number, window?: BaseWindow | null): void => {
    const contents = zoomContents(window);
    if (contents === null) {
      return;
    }
    const next = Math.max(-2, Math.min(3, contents.getZoomLevel() + delta));
    contents.setZoomLevel(next);
  };

  const resetZoom = (window?: BaseWindow | null): void => {
    zoomContents(window)?.setZoomLevel(0);
  };

  const template: MenuItemConstructorOptions[] = [
    {
      label: appName,
      submenu: [
        { role: 'about', label: labels.about },
        {
          id: 'app-settings',
          label: labels.settings,
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            onCommand('settings');
          },
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: labels.file,
      submenu: [
        {
          id: 'file-new-bot',
          label: labels.newBot,
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            onCommand('new-bot');
          },
        },
        {
          id: 'file-search',
          label: labels.search,
          accelerator: 'CmdOrCtrl+K',
          click: () => {
            onCommand('search');
          },
        },
        { type: 'separator' },
        { role: 'close', label: labels.closeWindow },
      ],
    },
    {
      label: language === 'zh-Hans' ? '编辑' : 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
      ],
    },
    {
      label: labels.view,
      submenu: [
        {
          id: 'view-zoom-in',
          label: labels.zoomIn,
          accelerator: 'CmdOrCtrl+=',
          click: (_item, window) => {
            changeZoom(0.5, window);
          },
        },
        {
          id: 'view-zoom-out',
          label: labels.zoomOut,
          accelerator: 'CmdOrCtrl+-',
          click: (_item, window) => {
            changeZoom(-0.5, window);
          },
        },
        {
          id: 'view-actual-size',
          label: labels.actualSize,
          accelerator: 'CmdOrCtrl+0',
          click: (_item, window) => {
            resetZoom(window);
          },
        },
        { type: 'separator' },
        { role: 'togglefullscreen', label: labels.fullScreen },
      ],
    },
    {
      label: labels.window,
      submenu: [
        {
          id: 'window-show-main',
          label: labels.showMainWindow,
          accelerator: 'CmdOrCtrl+Shift+M',
          click: () => {
            onCommand('show-main-window');
          },
        },
        { type: 'separator' },
        { role: 'minimize', label: labels.minimize },
        { role: 'zoom', label: labels.zoom },
        { type: 'separator' },
        { role: 'front', label: labels.front },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}
