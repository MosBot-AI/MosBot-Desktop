import type {
  ChatOpenResult,
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
  signOut: 'mosbot:dashboard:signOut',
  status: 'mosbot:dashboard:status',
  listBots: 'mosbot:dashboard:listBots',
  openChat: 'mosbot:dashboard:openChat',
  loadOlderChat: 'mosbot:dashboard:loadOlderChat',
  chatOpen: 'mosbot:dashboard:chatOpen',
  chatSend: 'mosbot:dashboard:chatSend',
  chatStop: 'mosbot:dashboard:chatStop',
  chatAnswer: 'mosbot:dashboard:chatAnswer',
  chatEvent: 'mosbot:dashboard:chatEvent',
  pendingEvent: 'mosbot:dashboard:pendingEvent',
  settings: 'mosbot:dashboard:settings',
  saveAddress: 'mosbot:dashboard:saveAddress',
} as const;
