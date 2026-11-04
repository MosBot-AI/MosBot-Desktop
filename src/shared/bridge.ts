import type {
  AppearanceInput,
  AppearanceResult,
  ChatOpenResult,
  CreateBotInput,
  CreateBotResult,
  KanbanBoard,
  KanbanBoardSummary,
  KanbanWatchEvent,
  ModelReadiness,
  WorkbenchMessage,
  WorkbenchSession,
  WorkbenchSessionPage,
  LocalState,
  ConnectionSnapshot,
  DashboardChatEvent,
  DashboardPendingEvent,
  DashboardSettings,
  DashboardStatus,
  PreflightResult,
  ProbeReport,
  RemoteBot,
  RemoteChat,
  Result,
} from './protocol';

/**
 * The only surface the renderer gets from Electron. No business data yet in
 * M0a; the dashboard section is the M0b bridge and never exposes tokens.
 */
export interface MosBotBridge {
  readonly platform: NodeJS.Platform;
  readonly versions: {
    readonly electron: string;
    readonly chrome: string;
  };
  readonly dashboard: MosBotDashboardBridge;
  /** Opens an https URL in the system browser (main process validates the scheme). */
  openExternal(url: string): Promise<boolean>;
  /** Versioned, non-secret local state (drafts, selection, preferences). */
  readonly local: MosBotLocalBridge;
}

export interface MosBotLocalBridge {
  load(): Promise<Result<LocalState | null>>;
  save(state: LocalState): Promise<Result<void>>;
}

export interface MosBotDashboardBridge {
  /** Unauthenticated readiness probe; safe to call before signing in. */
  preflight(address: string): Promise<Result<PreflightResult>>;
  /** Opens the system browser for RFC 8252 PKCE sign-in and waits for the loopback callback. */
  login(address: string, provider?: string): Promise<Result<ConnectionSnapshot>>;
  /** Silently restores a saved sign-in for this address (refresh token in safeStorage). */
  restore(address: string): Promise<Result<ConnectionSnapshot>>;
  /** Aborts a pending browser sign-in. */
  cancelLogin(): Promise<Result<void>>;
  /** Authenticated capability probe for the current connection. */
  probe(): Promise<Result<ProbeReport>>;
  /** Step 2 probe: WS handshake, gateway.ready, profiles, Bot Chat query, ticket replay. */
  probeWebSocket(): Promise<Result<ProbeReport>>;
  /** Step 4 read-only probe: profiles, model read, sessions paging/search, cron, kanban. */
  probeWorkbench(): Promise<Result<ProbeReport>>;
  /** Step 3 write probe on a dedicated profile (created and deleted by the probe). */
  probeNewBot(): Promise<Result<ProbeReport>>;
  /** Step 4 write probe on a dedicated Kanban board (created and deleted by the probe). */
  probeKanbanWrite(): Promise<Result<ProbeReport>>;
  /** M1 chat probe: dedicated profile, real send/stream/stop, cleanup. */
  probeChat(): Promise<Result<ProbeReport>>;
  /** M2 probe: dedicated profile create/appearance/rename/cleanup. */
  probeCreateBot(): Promise<Result<ProbeReport>>;
  /** M3 probe: workbench REST (sessions, search, messages, Kanban). */
  probeWorkbench(): Promise<Result<ProbeReport>>;
  /** Clears local credentials and reports what survived. */
  signOut(): Promise<Result<ProbeReport>>;
  status(): Promise<Result<DashboardStatus>>;
  /** Roster from `profiles.list` for the connected Dashboard. */
  listBots(): Promise<Result<readonly RemoteBot[]>>;
  /** Read-only Bot Chat history for one profile (latest page). */
  openChat(profileName: string): Promise<Result<RemoteChat>>;
  /** One older page of the same Bot Chat (offset-based). */
  loadOlderChat(
    profileName: string,
    storedSessionId: string,
    offset: number,
  ): Promise<Result<RemoteChat>>;
  /** M2: create a fresh Bot, write its appearance and read readiness back. */
  createBot(input: CreateBotInput): Promise<Result<CreateBotResult>>;
  /** CAS-protected appearance write. */
  setBotAppearance(
    profileName: string,
    look: AppearanceInput,
    expectedRevision: number,
  ): Promise<Result<AppearanceResult>>;
  /** Renames a profile (REST PATCH). */
  renameBot(
    profileName: string,
    newName: string,
  ): Promise<Result<{ profile: string; displayName: string }>>;
  /** Model/authorisation readiness for one profile. */
  checkModelReady(profileName: string): Promise<Result<ModelReadiness>>;
  /** Opens the Dashboard page where a Bot's model is configured. */
  openProfileConfig(): Promise<Result<void>>;
  /** Workbench: recent sessions for one profile. */
  workbenchSessions(
    profile: string,
    offset: number,
    limit?: number,
  ): Promise<Result<WorkbenchSessionPage>>;
  /** Workbench: session search by id and message content. */
  workbenchSearch(profile: string, query: string): Promise<Result<readonly WorkbenchSession[]>>;
  /** Workbench: read-only transcript for one stored session. */
  workbenchMessages(
    profile: string,
    sessionId: string,
    offset: number,
  ): Promise<Result<{ messages: readonly WorkbenchMessage[]; hasMore: boolean }>>;
  /** Workbench: Kanban boards (plugin may be absent). */
  kanbanBoards(): Promise<Result<readonly KanbanBoardSummary[]>>;
  /** Workbench: Kanban board snapshot. */
  kanbanBoard(board: string): Promise<Result<KanbanBoard>>;
  /** Workbench: create a task on a board. */
  kanbanCreateTask(
    board: string,
    title: string,
  ): Promise<Result<{ taskId: string; status: string }>>;
  /** Workbench: move a task to another workflow status. */
  kanbanSetTaskStatus(
    board: string,
    taskId: string,
    status: string,
  ): Promise<Result<{ status: string }>>;
  /** Workbench: write the profile's model/provider and read it back. */
  setProfileModel(
    profileName: string,
    provider: string,
    model: string,
  ): Promise<Result<{ provider: string; model: string }>>;
  /** Tails one Kanban board's events from a cursor (board pinned per watcher). */
  kanbanWatch(board: string, since: number): Promise<Result<void>>;
  kanbanUnwatch(): Promise<Result<void>>;
  /** Subscribes to Kanban board events; returns an unsubscribe function. */
  onKanbanEvent(listener: (event: KanbanWatchEvent) => void): () => void;
  /** Resumes (or creates) the live Bot Chat session so prompts can be sent. */
  chatOpen(profileName: string, storedSessionId: string | null): Promise<Result<ChatOpenResult>>;
  /** Submits one prompt to the open session. */
  chatSend(text: string): Promise<Result<void>>;
  /** Interrupts the running turn. */
  chatStop(): Promise<Result<void>>;
  /** Answers a server→client approval/clarify request. */
  chatAnswer(requestId: string, result: Readonly<Record<string, unknown>>): Promise<Result<void>>;
  /** Subscribes to live turn events; returns an unsubscribe function. */
  onChatEvent(listener: (event: DashboardChatEvent) => void): () => void;
  /** Subscribes to pending-request discovery events (Bots not currently open). */
  onPendingEvent(listener: (event: DashboardPendingEvent) => void): () => void;
  /** Non-secret connection preferences (last address). */
  settings(): Promise<Result<DashboardSettings>>;
  saveAddress(address: string | null): Promise<Result<void>>;
}

export const LOCAL_CHANNELS = {
  load: 'mosbot:local:load',
  save: 'mosbot:local:save',
} as const;

export const SHELL_CHANNELS = {
  openExternal: 'mosbot:shell:openExternal',
} as const;

export const DASHBOARD_CHANNELS = {
  preflight: 'mosbot:dashboard:preflight',
  login: 'mosbot:dashboard:login',
  restore: 'mosbot:dashboard:restore',
  cancelLogin: 'mosbot:dashboard:cancelLogin',
  probe: 'mosbot:dashboard:probe',
  probeWebSocket: 'mosbot:dashboard:probeWebSocket',
  probeWorkbench: 'mosbot:dashboard:probeWorkbench',
  probeNewBot: 'mosbot:dashboard:probeNewBot',
  probeKanbanWrite: 'mosbot:dashboard:probeKanbanWrite',
  probeChat: 'mosbot:dashboard:probeChat',
  probeCreateBot: 'mosbot:dashboard:probeCreateBot',
  signOut: 'mosbot:dashboard:signOut',
  status: 'mosbot:dashboard:status',
  listBots: 'mosbot:dashboard:listBots',
  openChat: 'mosbot:dashboard:openChat',
  loadOlderChat: 'mosbot:dashboard:loadOlderChat',
  createBot: 'mosbot:dashboard:createBot',
  setBotAppearance: 'mosbot:dashboard:setBotAppearance',
  renameBot: 'mosbot:dashboard:renameBot',
  checkModelReady: 'mosbot:dashboard:checkModelReady',
  openProfileConfig: 'mosbot:dashboard:openProfileConfig',
  workbenchSessions: 'mosbot:dashboard:workbenchSessions',
  workbenchSearch: 'mosbot:dashboard:workbenchSearch',
  workbenchMessages: 'mosbot:dashboard:workbenchMessages',
  kanbanBoards: 'mosbot:dashboard:kanbanBoards',
  kanbanBoard: 'mosbot:dashboard:kanbanBoard',
  kanbanCreateTask: 'mosbot:dashboard:kanbanCreateTask',
  kanbanSetTaskStatus: 'mosbot:dashboard:kanbanSetTaskStatus',
  setProfileModel: 'mosbot:dashboard:setProfileModel',
  kanbanWatch: 'mosbot:dashboard:kanbanWatch',
  kanbanUnwatch: 'mosbot:dashboard:kanbanUnwatch',
  kanbanEvent: 'mosbot:dashboard:kanbanEvent',
  chatOpen: 'mosbot:dashboard:chatOpen',
  chatSend: 'mosbot:dashboard:chatSend',
  chatStop: 'mosbot:dashboard:chatStop',
  chatAnswer: 'mosbot:dashboard:chatAnswer',
  chatEvent: 'mosbot:dashboard:chatEvent',
  pendingEvent: 'mosbot:dashboard:pendingEvent',
  settings: 'mosbot:dashboard:settings',
  saveAddress: 'mosbot:dashboard:saveAddress',
} as const;
