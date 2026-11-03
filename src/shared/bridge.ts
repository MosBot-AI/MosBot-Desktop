import type {
  ConnectionSnapshot,
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
  /** Authenticated capability probe for the current connection. */
  probe(): Promise<Result<ProbeReport>>;
  /** Clears local credentials and reports what survived. */
  signOut(): Promise<Result<ProbeReport>>;
  status(): Promise<Result<DashboardStatus>>;
}

export const DASHBOARD_CHANNELS = {
  preflight: 'mosbot:dashboard:preflight',
  login: 'mosbot:dashboard:login',
  probe: 'mosbot:dashboard:probe',
  signOut: 'mosbot:dashboard:signOut',
  status: 'mosbot:dashboard:status',
} as const;
