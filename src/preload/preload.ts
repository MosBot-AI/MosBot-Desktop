import { contextBridge, ipcRenderer } from 'electron';
import { DASHBOARD_CHANNELS, type MosBotBridge } from '../shared/bridge';
import type {
  ConnectionSnapshot,
  DashboardSettings,
  DashboardStatus,
  PreflightResult,
  ProbeReport,
  Result,
} from '../shared/protocol';

/**
 * Narrow renderer bridge. `sandbox: true` keeps this file free of Node APIs
 * beyond the preload-safe `process` snapshot; every Dashboard call is a
 * validated IPC invoke handled in the main process.
 */
const bridge: MosBotBridge = {
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
    signOut(): Promise<Result<ProbeReport>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.signOut) as Promise<Result<ProbeReport>>;
    },
    status(): Promise<Result<DashboardStatus>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.status) as Promise<Result<DashboardStatus>>;
    },
  },
};

contextBridge.exposeInMainWorld('mosbot', bridge);
