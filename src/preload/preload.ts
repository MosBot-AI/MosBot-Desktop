import { contextBridge, ipcRenderer } from 'electron';
import {
  DASHBOARD_CHANNELS,
  LOCAL_CHANNELS,
  SHELL_CHANNELS,
  type MosBotBridge,
} from '../shared/bridge';
import type {
  ChatOpenResult,
  ConnectionSnapshot,
  DashboardChatEvent,
  DashboardPendingEvent,
  DashboardSettings,
  DashboardStatus,
  LocalState,
  PreflightResult,
  ProbeReport,
  RemoteBot,
  RemoteChat,
  Result,
} from '../shared/protocol';

/**
 * Narrow renderer bridge. `sandbox: true` keeps this file free of Node APIs
 * beyond the preload-safe `process` snapshot; every Dashboard call is a
 * validated IPC invoke handled in the main process.
 */
const bridge: Omit<MosBotBridge, 'openExternal' | 'local'> = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
  dashboard: {
    preflight(address: string): Promise<Result<PreflightResult>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.preflight, address) as Promise<
        Result<PreflightResult>
      >;
    },
    login(address: string, provider?: string): Promise<Result<ConnectionSnapshot>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.login, address, provider) as Promise<
        Result<ConnectionSnapshot>
      >;
    },
    restore(address: string): Promise<Result<ConnectionSnapshot>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.restore, address) as Promise<
        Result<ConnectionSnapshot>
      >;
    },
    probe(): Promise<Result<ProbeReport>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.probe) as Promise<Result<ProbeReport>>;
    },
    probeWebSocket(): Promise<Result<ProbeReport>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.probeWebSocket) as Promise<Result<ProbeReport>>;
    },
    probeWorkbench(): Promise<Result<ProbeReport>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.probeWorkbench) as Promise<Result<ProbeReport>>;
    },
    cancelLogin(): Promise<Result<void>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.cancelLogin) as Promise<Result<void>>;
    },
    listBots(): Promise<Result<readonly RemoteBot[]>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.listBots) as Promise<
        Result<readonly RemoteBot[]>
      >;
    },
    loadOlderChat(
      profileName: string,
      storedSessionId: string,
      offset: number,
    ): Promise<Result<RemoteChat>> {
      return ipcRenderer.invoke(
        DASHBOARD_CHANNELS.loadOlderChat,
        profileName,
        storedSessionId,
        offset,
      ) as Promise<Result<RemoteChat>>;
    },
    openChat(profileName: string): Promise<Result<RemoteChat>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.openChat, profileName) as Promise<
        Result<RemoteChat>
      >;
    },
    chatOpen(profileName: string, storedSessionId: string | null): Promise<Result<ChatOpenResult>> {
      return ipcRenderer.invoke(
        DASHBOARD_CHANNELS.chatOpen,
        profileName,
        storedSessionId,
      ) as Promise<Result<ChatOpenResult>>;
    },
    chatSend(text: string): Promise<Result<void>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.chatSend, text) as Promise<Result<void>>;
    },
    chatStop(): Promise<Result<void>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.chatStop) as Promise<Result<void>>;
    },
    chatAnswer(
      requestId: string,
      result: Readonly<Record<string, unknown>>,
    ): Promise<Result<void>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.chatAnswer, requestId, result) as Promise<
        Result<void>
      >;
    },
    onPendingEvent(listener: (event: DashboardPendingEvent) => void): () => void {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: DashboardPendingEvent): void => {
        listener(payload);
      };
      ipcRenderer.on(DASHBOARD_CHANNELS.pendingEvent, wrapped);
      return () => {
        ipcRenderer.removeListener(DASHBOARD_CHANNELS.pendingEvent, wrapped);
      };
    },
    onChatEvent(listener: (event: DashboardChatEvent) => void): () => void {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: DashboardChatEvent): void => {
        listener(payload);
      };
      ipcRenderer.on(DASHBOARD_CHANNELS.chatEvent, wrapped);
      return () => {
        ipcRenderer.removeListener(DASHBOARD_CHANNELS.chatEvent, wrapped);
      };
    },
    settings(): Promise<Result<DashboardSettings>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.settings) as Promise<Result<DashboardSettings>>;
    },
    saveAddress(address: string | null): Promise<Result<void>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.saveAddress, address) as Promise<Result<void>>;
    },
    probeNewBot(): Promise<Result<ProbeReport>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.probeNewBot) as Promise<Result<ProbeReport>>;
    },
    probeKanbanWrite(): Promise<Result<ProbeReport>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.probeKanbanWrite) as Promise<
        Result<ProbeReport>
      >;
    },
    probeChat(): Promise<Result<ProbeReport>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.probeChat) as Promise<Result<ProbeReport>>;
    },
    signOut(): Promise<Result<ProbeReport>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.signOut) as Promise<Result<ProbeReport>>;
    },
    status(): Promise<Result<DashboardStatus>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.status) as Promise<Result<DashboardStatus>>;
    },
  },
};

const shellBridge: MosBotBridge['openExternal'] = (url: string): Promise<boolean> =>
  ipcRenderer.invoke(SHELL_CHANNELS.openExternal, url) as Promise<boolean>;

const localBridge: MosBotBridge['local'] = {
  load(): Promise<Result<LocalState | null>> {
    return ipcRenderer.invoke(LOCAL_CHANNELS.load) as Promise<Result<LocalState | null>>;
  },
  save(state: LocalState): Promise<Result<void>> {
    return ipcRenderer.invoke(LOCAL_CHANNELS.save, state) as Promise<Result<void>>;
  },
};

const fullBridge: MosBotBridge = { ...bridge, openExternal: shellBridge, local: localBridge };

contextBridge.exposeInMainWorld('mosbot', fullBridge);
