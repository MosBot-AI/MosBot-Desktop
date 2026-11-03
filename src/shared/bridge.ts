import type {
  ConnectionSnapshot,
  DashboardSettings,
  DashboardStatus,
  PreflightResult,
  ProbeReport,
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
  /** Clears local credentials and reports what survived. */
  signOut(): Promise<Result<ProbeReport>>;
  status(): Promise<Result<DashboardStatus>>;
  /** Non-secret connection preferences (last address). */
  settings(): Promise<Result<DashboardSettings>>;
  saveAddress(address: string | null): Promise<Result<void>>;
}

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
  signOut: 'mosbot:dashboard:signOut',
  status: 'mosbot:dashboard:status',
  settings: 'mosbot:dashboard:settings',
  saveAddress: 'mosbot:dashboard:saveAddress',
} as const;
