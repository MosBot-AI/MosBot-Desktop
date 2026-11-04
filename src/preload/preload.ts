import { contextBridge, ipcRenderer } from 'electron';
import {
  DASHBOARD_CHANNELS,
  LOCAL_CHANNELS,
  SHELL_CHANNELS,
  type MosBotBridge,
} from '../shared/bridge';
import type {
  AppearanceInput,
  AppearanceResult,
  ChatOpenResult,
  CreateBotInput,
  CreateBotResult,
  KanbanBoard,
  KanbanBoardSummary,
  BotArtifact,
  ComputerBootstrap,
  DisplayLease,
  BotArtifactContent,
  CronJob,
  DisplaySnapshot,
  DisplayThumbnail,
  KanbanWatchEvent,
  ModelReadiness,
  WorkbenchMessage,
  WorkbenchSession,
  WorkbenchSessionPage,
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
const bridge: Omit<MosBotBridge, 'openExternal' | 'local' | 'computer'> = {
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
    cancelLogin(): Promise<Result<void>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.cancelLogin) as Promise<Result<void>>;
    },
    listBots(): Promise<Result<readonly RemoteBot[]>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.listBots) as Promise<
        Result<readonly RemoteBot[]>
      >;
    },
    createBot(input: CreateBotInput): Promise<Result<CreateBotResult>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.createBot, input) as Promise<
        Result<CreateBotResult>
      >;
    },
    setBotAppearance(
      profileName: string,
      look: AppearanceInput,
      expectedRevision: number,
    ): Promise<Result<AppearanceResult>> {
      return ipcRenderer.invoke(
        DASHBOARD_CHANNELS.setBotAppearance,
        profileName,
        look,
        expectedRevision,
      ) as Promise<Result<AppearanceResult>>;
    },
    renameBot(
      profileName: string,
      newName: string,
    ): Promise<Result<{ profile: string; displayName: string }>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.renameBot, profileName, newName) as Promise<
        Result<{ profile: string; displayName: string }>
      >;
    },
    checkModelReady(profileName: string): Promise<Result<ModelReadiness>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.checkModelReady, profileName) as Promise<
        Result<ModelReadiness>
      >;
    },
    openProfileConfig(): Promise<Result<void>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.openProfileConfig) as Promise<Result<void>>;
    },
    workbenchSessions(
      profile: string,
      offset: number,
      limit?: number,
    ): Promise<Result<WorkbenchSessionPage>> {
      return ipcRenderer.invoke(
        DASHBOARD_CHANNELS.workbenchSessions,
        profile,
        offset,
        limit,
      ) as Promise<Result<WorkbenchSessionPage>>;
    },
    workbenchSearch(profile: string, query: string): Promise<Result<readonly WorkbenchSession[]>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.workbenchSearch, profile, query) as Promise<
        Result<readonly WorkbenchSession[]>
      >;
    },
    workbenchMessages(
      profile: string,
      sessionId: string,
      offset: number,
    ): Promise<Result<{ messages: readonly WorkbenchMessage[]; hasMore: boolean }>> {
      return ipcRenderer.invoke(
        DASHBOARD_CHANNELS.workbenchMessages,
        profile,
        sessionId,
        offset,
      ) as Promise<Result<{ messages: readonly WorkbenchMessage[]; hasMore: boolean }>>;
    },
    kanbanBoards(): Promise<Result<readonly KanbanBoardSummary[]>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.kanbanBoards) as Promise<
        Result<readonly KanbanBoardSummary[]>
      >;
    },
    kanbanBoard(board: string): Promise<Result<KanbanBoard>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.kanbanBoard, board) as Promise<
        Result<KanbanBoard>
      >;
    },
    kanbanCreateTask(
      board: string,
      title: string,
    ): Promise<Result<{ taskId: string; status: string }>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.kanbanCreateTask, board, title) as Promise<
        Result<{ taskId: string; status: string }>
      >;
    },
    kanbanSetTaskStatus(
      board: string,
      taskId: string,
      status: string,
    ): Promise<Result<{ status: string }>> {
      return ipcRenderer.invoke(
        DASHBOARD_CHANNELS.kanbanSetTaskStatus,
        board,
        taskId,
        status,
      ) as Promise<Result<{ status: string }>>;
    },
    setProfileModel(
      profileName: string,
      provider: string,
      model: string,
    ): Promise<Result<{ provider: string; model: string }>> {
      return ipcRenderer.invoke(
        DASHBOARD_CHANNELS.setProfileModel,
        profileName,
        provider,
        model,
      ) as Promise<Result<{ provider: string; model: string }>>;
    },
    displayStatus(): Promise<Result<DisplaySnapshot>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.displayStatus) as Promise<
        Result<DisplaySnapshot>
      >;
    },
    displayThumbnail(): Promise<Result<DisplayThumbnail>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.displayThumbnail) as Promise<
        Result<DisplayThumbnail>
      >;
    },
    displayStart(): Promise<Result<DisplaySnapshot>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.displayStart) as Promise<
        Result<DisplaySnapshot>
      >;
    },
    listCronJobs(profile: string): Promise<Result<readonly CronJob[]>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.listCronJobs, profile) as Promise<
        Result<readonly CronJob[]>
      >;
    },
    listArtifacts(
      profile: string,
      workspace?: string | null,
    ): Promise<Result<readonly BotArtifact[]>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.listArtifacts, profile, workspace) as Promise<
        Result<readonly BotArtifact[]>
      >;
    },
    readArtifact(artifactPath: string): Promise<Result<BotArtifactContent>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.readArtifact, artifactPath) as Promise<
        Result<BotArtifactContent>
      >;
    },
    openComputerViewer(profile: string): Promise<Result<void>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.openComputerViewer, profile) as Promise<
        Result<void>
      >;
    },
    saveArtifact(artifactPath: string, name: string): Promise<Result<string>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.saveArtifact, artifactPath, name) as Promise<
        Result<string>
      >;
    },
    kanbanWatch(board: string, since: number): Promise<Result<void>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.kanbanWatch, board, since) as Promise<
        Result<void>
      >;
    },
    kanbanUnwatch(): Promise<Result<void>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.kanbanUnwatch) as Promise<Result<void>>;
    },
    onKanbanEvent(listener: (event: KanbanWatchEvent) => void): () => void {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: KanbanWatchEvent): void => {
        listener(payload);
      };
      ipcRenderer.on(DASHBOARD_CHANNELS.kanbanEvent, wrapped);
      return () => {
        ipcRenderer.removeListener(DASHBOARD_CHANNELS.kanbanEvent, wrapped);
      };
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
    attachFile(): Promise<Result<{ name: string; refText: string }>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.chatAttachFile) as Promise<
        Result<{ name: string; refText: string }>
      >;
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
    probeCreateBot(): Promise<Result<ProbeReport>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.probeCreateBot) as Promise<Result<ProbeReport>>;
    },
    probeWorkbench(): Promise<Result<ProbeReport>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.probeWorkbench) as Promise<Result<ProbeReport>>;
    },
    probeComputer(): Promise<Result<ProbeReport>> {
      return ipcRenderer.invoke(DASHBOARD_CHANNELS.probeComputer) as Promise<Result<ProbeReport>>;
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

const computerBridge: MosBotBridge['computer'] = {
  onBootstrap(listener: (payload: ComputerBootstrap) => void): () => void {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: ComputerBootstrap): void => {
      listener(payload);
    };
    ipcRenderer.on(DASHBOARD_CHANNELS.computerBootstrap, wrapped);
    return () => {
      ipcRenderer.removeListener(DASHBOARD_CHANNELS.computerBootstrap, wrapped);
    };
  },
  onLease(listener: (lease: DisplayLease | null) => void): () => void {
    const wrapped = (_event: Electron.IpcRendererEvent, lease: DisplayLease | null): void => {
      listener(lease);
    };
    ipcRenderer.on(DASHBOARD_CHANNELS.computerLease, wrapped);
    return () => {
      ipcRenderer.removeListener(DASHBOARD_CHANNELS.computerLease, wrapped);
    };
  },
  acquire(): Promise<Result<void>> {
    return ipcRenderer.invoke(DASHBOARD_CHANNELS.computerAcquire) as Promise<Result<void>>;
  },
  release(): Promise<Result<void>> {
    return ipcRenderer.invoke(DASHBOARD_CHANNELS.computerRelease) as Promise<Result<void>>;
  },
  close(): Promise<void> {
    return ipcRenderer.invoke(DASHBOARD_CHANNELS.computerClose) as Promise<void>;
  },
};

const fullBridge: MosBotBridge = {
  ...bridge,
  openExternal: shellBridge,
  local: localBridge,
  computer: computerBridge,
};

contextBridge.exposeInMainWorld('mosbot', fullBridge);
