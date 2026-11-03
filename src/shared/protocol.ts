/**
 * Dashboard protocol types and URL policy shared by main, preload and tests.
 *
 * The only real acceptance target is `192.168.2.171:9119`; its plain-HTTP origin
 * is the single, exact non-TLS exception allowed by docs/plans/02. Everything
 * else must be HTTPS so bearer tokens never travel in clear text.
 */

export const TEST_DASHBOARD_URL = 'http://192.168.2.171:9119';

export type ProtocolErrorCode =
  | 'invalid_url'
  | 'insecure_url'
  | 'unreachable'
  | 'timeout'
  | 'http_error'
  | 'unauthorized'
  | 'session_expired'
  | 'malformed_response'
  | 'auth_cancelled'
  | 'auth_unavailable'
  | 'provider_required'
  | 'vault_unavailable'
  | 'internal';

export interface ProtocolError {
  readonly code: ProtocolErrorCode;
  readonly message: string;
  readonly retriable: boolean;
  readonly httpStatus?: number;
}

export type Result<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: ProtocolError };

export function protocolError(
  code: ProtocolErrorCode,
  message: string,
  extra: { retriable?: boolean; httpStatus?: number } = {},
): ProtocolError {
  return {
    code,
    message,
    retriable: extra.retriable ?? false,
    ...(extra.httpStatus === undefined ? {} : { httpStatus: extra.httpStatus }),
  };
}

export type Failure<T> = Extract<Result<T>, { ok: false }>;

/** A validated dashboard endpoint: origin plus an optional reverse-proxy prefix. */
export interface DashboardTarget {
  /** Lower-case origin without a trailing slash, e.g. `https://hermes.example.com:8443`. */
  readonly origin: string;
  /** `''` or `/prefix` (no trailing slash). */
  readonly basePath: string;
  /** Human-readable URL used in reports. */
  readonly displayUrl: string;
}

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', '[::1]', 'localhost']);

export function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname.toLowerCase());
}

function isExactTestOrigin(origin: string): boolean {
  return origin.toLowerCase() === TEST_DASHBOARD_URL;
}

/**
 * Parses and validates a dashboard address. Throws a ProtocolError payload so
 * callers can forward it to the UI unchanged.
 */
export function parseDashboardTarget(raw: string): DashboardTarget {
  const input = raw.trim();
  if (input === '') {
    throw protocolError('invalid_url', 'Enter the Dashboard address.');
  }
  // Reject traversal in the raw text: URL normalisation would otherwise hide it.
  if (input.includes('..')) {
    throw protocolError('invalid_url', 'The Dashboard address must not contain "..".');
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw protocolError('invalid_url', 'The Dashboard address is not a valid URL.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw protocolError(
      'invalid_url',
      'The Dashboard address must start with https:// or http://.',
    );
  }
  if (url.username !== '' || url.password !== '') {
    throw protocolError('invalid_url', 'The Dashboard address must not contain credentials.');
  }
  if (url.search !== '' || url.hash !== '') {
    throw protocolError(
      'invalid_url',
      'The Dashboard address must not contain a query or fragment.',
    );
  }
  if (url.port === '0') {
    throw protocolError('invalid_url', 'The Dashboard port is not valid.');
  }

  const origin = url.origin;
  if (url.protocol === 'http:') {
    const allowed = isExactTestOrigin(origin) || isLoopbackHostname(url.hostname);
    if (!allowed) {
      throw protocolError(
        'insecure_url',
        'Plain http is only allowed for the local test Dashboard or loopback; use https.',
      );
    }
  }

  const basePath = url.pathname.replace(/\/+$/, '');
  return {
    origin,
    basePath,
    displayUrl: `${origin}${basePath}`,
  };
}

/** Joins a validated target with an API path (`/api/health`). */
export function targetUrl(target: DashboardTarget, path: string): string {
  if (!path.startsWith('/')) {
    throw protocolError('internal', 'Protocol paths must start with "/".');
  }
  return `${target.origin}${target.basePath}${path}`;
}

// --- Payloads --------------------------------------------------------------

export interface HealthPayload {
  readonly ok: boolean;
  readonly version: string;
  readonly displayVersion: string;
  readonly commit: string;
  readonly authRequired: boolean;
}

export interface AuthProviderInfo {
  readonly name: string;
  readonly displayName: string;
  readonly supportsPassword: boolean;
}

export interface AuthProvidersPayload {
  readonly providers: readonly AuthProviderInfo[];
}

/** The public (unauthenticated) part of `GET /api/status` this client uses. */
export interface StatusPayload {
  readonly version: string | null;
  readonly overall: string | null;
  readonly gatewayRunning: boolean | null;
  readonly gatewayState: string | null;
  readonly authRequired: boolean | null;
  readonly authProviders: readonly string[];
  readonly authFlows: readonly string[];
  readonly activeSessions: number | null;
  readonly profiles: readonly string[];
  /** Sorted top-level keys, kept so the probe can show field availability. */
  readonly presentKeys: readonly string[];
}

export interface AuthMePayload {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly orgId: string;
  readonly provider: string;
  readonly expiresAt: number;
}

/** Tokens never cross the IPC boundary; this stays inside the main process. */
export interface TokenBundle {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly tokenType: string;
  readonly expiresAt: number;
  readonly provider: string;
  readonly userId: string;
}

export interface WsTicketPayload {
  readonly ticket: string;
  readonly ttlSeconds: number;
}

export interface ConnectionSnapshot {
  readonly connected: boolean;
  readonly displayUrl: string | null;
  readonly userId: string | null;
  readonly displayName: string | null;
  readonly provider: string | null;
  readonly expiresAt: number | null;
}

export type CapabilityStatus = 'pass' | 'fail' | 'unverified' | 'not-supported';

export interface CapabilityRow {
  readonly id: string;
  readonly title: string;
  readonly status: CapabilityStatus;
  /** Redacted, human-readable result; never tokens, tickets or credentials. */
  readonly detail: string;
  readonly required: boolean;
}

export interface ProbeReport {
  readonly generatedAt: number;
  readonly target: string;
  readonly rows: readonly CapabilityRow[];
}

/** A roster row the renderer may draw (no tokens, no raw session content beyond preview). */
export interface RemoteBot {
  readonly profileName: string;
  readonly displayName: string;
  readonly description: string;
  readonly model: string;
  readonly provider: string;
  readonly isDefault: boolean;
  /** Canonical Bot Chat preview, else newest-session preview, else the profile description. */
  readonly summary: string;
  readonly canonicalSessionId: string | null;
  readonly lastActiveAt: number | null;
  readonly messageCount: number;
}

export interface RemoteMessage {
  readonly id: string;
  readonly role: 'user' | 'bot';
  readonly text: string;
  readonly at: number;
}

export type ChatTurnStatus = 'complete' | 'error' | 'interrupted';

export interface ChatServerRequest {
  readonly id: string;
  readonly method: 'approval' | 'clarify';
  readonly payload: Readonly<Record<string, unknown>>;
}

/** Events the main process pushes to the renderer for the live chat turn. */
export type DashboardChatEvent =
  | {
      readonly type: 'connection';
      readonly state: 'connected' | 'reconnecting' | 'disconnected';
      readonly detail?: string;
    }
  | {
      readonly type: 'session';
      readonly profile: string;
      readonly storedSessionId: string | null;
      readonly runtimeSessionId: string | null;
    }
  | { readonly type: 'turn-start' }
  | { readonly type: 'delta'; readonly text: string }
  | { readonly type: 'interim'; readonly text: string }
  | {
      readonly type: 'turn-complete';
      readonly status: ChatTurnStatus;
      readonly text: string;
      readonly error: string | null;
    }
  | {
      readonly type: 'tool';
      readonly phase: 'start' | 'progress' | 'complete';
      readonly name: string;
    }
  | { readonly type: 'request'; readonly request: ChatServerRequest }
  | { readonly type: 'request-cancel'; readonly requestId: string }
  | { readonly type: 'error'; readonly message: string };

export interface ChatOpenResult {
  readonly profile: string;
  readonly storedSessionId: string | null;
  readonly runtimeSessionId: string | null;
}

/** Read-only Bot Chat history for one profile (M1 transcript prefetch). */
export interface RemoteChat {
  readonly profileName: string;
  readonly storedSessionId: string | null;
  readonly messages: readonly RemoteMessage[];
  readonly hasMore: boolean;
}

export interface PreflightResult {
  readonly report: ProbeReport;
  readonly providers: readonly AuthProviderInfo[];
  readonly health: HealthPayload;
}

/** Non-secret connection preferences persisted by the main process. */
export interface DashboardSettings {
  readonly version: 1;
  readonly lastAddress: string | null;
}

/** What the details panel may know about the connection. */
export interface DashboardStatus {
  readonly connection: ConnectionSnapshot;
  readonly lastProbe: ProbeReport | null;
}
