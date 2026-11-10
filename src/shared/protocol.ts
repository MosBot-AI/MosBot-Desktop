/**
 * Dashboard protocol types and URL policy shared by main, preload and tests.
 *
 * The only real acceptance target is `192.168.2.171:9119`; its plain-HTTP origin
 * is the single, exact non-TLS exception allowed by docs/plans/02. Everything
 * else must be HTTPS so bearer tokens never travel in clear text.
 */

import type { InspectorTab, Language, ThemePreference } from './domain';

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
  | 'conflict'
  | 'internal';

export interface ProtocolError {
  readonly code: ProtocolErrorCode;
  readonly message: string;
  readonly retriable: boolean;
  readonly httpStatus?: number;
  /** Machine-readable code from a gateway error payload (`error.data.code`). */
  readonly serverCode?: string;
}

export type Result<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: ProtocolError };

export function protocolError(
  code: ProtocolErrorCode,
  message: string,
  extra: { retriable?: boolean; httpStatus?: number; serverCode?: string } = {},
): ProtocolError {
  return {
    code,
    message,
    retriable: extra.retriable ?? false,
    ...(extra.httpStatus === undefined ? {} : { httpStatus: extra.httpStatus }),
    ...(extra.serverCode === undefined ? {} : { serverCode: extra.serverCode }),
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
  /** Appearance from `ui_meta['hermes-bots']`; null when the Bot uses the MosBot default look. */
  readonly shape: string | null;
  readonly color: string;
  /** `ui_meta_revisions['hermes-bots']` for compare-and-swap writes. */
  readonly metaRevision: number;
  readonly model: string;
  readonly provider: string;
  readonly isDefault: boolean;
  /** Canonical Bot Chat preview, else newest-session preview, else the profile description. */
  readonly summary: string;
  readonly canonicalSessionId: string | null;
  readonly lastActiveAt: number | null;
  readonly messageCount: number;
}

export interface RemoteGroup {
  readonly roomId: string;
  readonly name: string;
  readonly memberCount: number;
  readonly updatedAt: number;
  readonly latestSeq: number;
}

export interface RemoteGroupMemberInput {
  readonly memberId: string;
  readonly profile: string;
  readonly handle: string;
  readonly displayName?: string;
}

export interface RemoteGroupState {
  readonly roomId: string;
  readonly name: string;
  readonly memberCount: number;
  readonly latestSeq: number;
  readonly authorityEpoch: number;
  readonly updatedAt: number;
  readonly driverStatus: string | null;
  readonly working?: boolean;
  readonly blocked?: boolean;
}

export interface RemoteGroupEvent {
  readonly seq: number;
  readonly kind: string;
  readonly createdAt: number;
  /** Raw event payload; rendering interprets only the fields it needs. */
  readonly payload?: unknown;
}

export interface RemoteGroupLogPage {
  readonly events: readonly RemoteGroupEvent[];
  readonly cursor: number;
  readonly latestSeq: number;
  readonly hasMore: boolean;
}

export interface WorkbenchSession {
  readonly id: string;
  readonly title: string;
  readonly profile: string;
  readonly updatedAt: number;
  readonly messageCount: number;
  readonly pinned: boolean;
  readonly archived: boolean;
  readonly preview: string;
}

export interface WorkbenchSessionPage {
  readonly sessions: readonly WorkbenchSession[];
  readonly total: number;
  readonly hasMore: boolean;
}

export interface WorkbenchMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly text: string;
  readonly at: number;
}

export interface KanbanBoardSummary {
  readonly slug: string;
  readonly name: string;
  readonly isCurrent: boolean;
  readonly total: number;
}

export interface KanbanTask {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly priority: number;
  readonly assignee: string;
  readonly updatedAt: number;
  readonly latestSummary: string;
}

export interface KanbanColumn {
  readonly name: string;
  readonly tasks: readonly KanbanTask[];
}

export interface KanbanBoard {
  readonly board: string;
  readonly columns: readonly KanbanColumn[];
  readonly latestEventId: number | null;
}

export interface KanbanWatchEvent {
  readonly board: string;
  readonly events: readonly {
    readonly id: number;
    readonly taskId: string;
    readonly kind: string;
    readonly createdAt: number;
    readonly payload: unknown;
  }[];
  readonly cursor: number;
  readonly state: 'connected' | 'reconnecting' | 'disconnected';
}

export interface CreateBotInput {
  readonly name: string;
  readonly description?: string;
  readonly shape?: string;
  readonly color?: string;
}

export interface CreateBotResult {
  readonly bot: RemoteBot;
  readonly modelReady: boolean;
  readonly configUrl: string;
  readonly appearanceApplied: boolean;
}

export interface AppearanceInput {
  readonly shape: string;
  readonly color: string;
  readonly title?: string;
}

export interface AppearanceResult {
  readonly revision: number;
}

export interface ModelReadiness {
  readonly ready: boolean;
  readonly provider: string;
  readonly model: string;
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
  | { readonly type: 'delta'; readonly text: string; readonly profile?: string }
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
  | { readonly type: 'history-stale'; readonly reason: string }
  | { readonly type: 'request'; readonly request: ChatServerRequest }
  | {
      readonly type: 'request-cancel';
      readonly requestId: string;
      readonly reason?: string;
    }
  | { readonly type: 'error'; readonly message: string };

/** Events the main-process pending watcher pushes for Bots the window is not showing. */
export type DashboardPendingEvent =
  | {
      readonly type: 'add';
      readonly requestId: string;
      readonly profile: string;
      readonly method: 'approval' | 'clarify';
      readonly title: string;
    }
  | { readonly type: 'remove'; readonly requestId: string }
  | { readonly type: 'open'; readonly profile: string };

export interface CronJob {
  readonly id: string;
  readonly name: string;
  readonly schedule: string;
  readonly enabled: boolean;
  readonly lastRunAt: number | null;
}

export interface BotArtifact {
  readonly name: string;
  readonly path: string;
  readonly size: number;
  readonly mimeType: string;
  readonly kind: 'image' | 'text' | 'pdf' | 'other';
  readonly modifiedAt: number;
  /** A dangling symlink reported by the Dashboard; it cannot be opened. */
  readonly brokenLink?: boolean;
}

export interface BotArtifactContent {
  readonly name: string;
  readonly path: string;
  readonly size: number;
  readonly mimeType: string;
  readonly dataUrl: string;
}

export interface DisplayLease {
  readonly holder: string;
  readonly since: number | null;
  readonly viewerHash: string | null;
  readonly reason: string;
  /** True when this viewer window holds the human lease. */
  readonly mine: boolean;
}

export interface ComputerBootstrap {
  readonly wsUrl: string;
  readonly viewerId: string;
  readonly profile: string;
  readonly botName: string;
}

export interface DisplaySnapshot {
  readonly supported: boolean;
  readonly installed: boolean;
  readonly running: boolean;
  readonly geometry: string;
  readonly blocker: string | null;
  readonly placement: string;
  readonly lease: DisplayLease | null;
}

export interface DisplayThumbnail {
  readonly dataUrl: string | null;
  readonly suppressed: string | null;
}

export interface AttachedFile {
  readonly name: string;
  readonly refText: string;
}

export interface ChatOpenResult {
  readonly profile: string;
  readonly storedSessionId: string | null;
  readonly runtimeSessionId: string | null;
  /** The Bot Chat workspace, used as the artifact library root. */
  readonly workspace: string | null;
}

/** Read-only Bot Chat history for one profile (M1 transcript prefetch). */
export interface RemoteChat {
  readonly profileName: string;
  readonly storedSessionId: string | null;
  readonly messages: readonly RemoteMessage[];
  readonly hasMore: boolean;
  /** Offset for the next (older) page; equal to the raw row count consumed so far. */
  readonly nextOffset: number;
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

export interface LocalSection {
  readonly id: string;
  readonly title: string;
  readonly botIds: readonly string[];
  readonly collapsed: boolean;
}

export interface LocalOrganization {
  readonly pinned: readonly string[];
  readonly sections: readonly LocalSection[];
  readonly unsortedCollapsed?: boolean;
}

export interface LocalConnectionState {
  readonly selectedProfile: string | null;
  readonly drafts: Readonly<Record<string, string>>;
  readonly organization: LocalOrganization;
  readonly inspector: {
    readonly open: boolean;
    readonly tab: InspectorTab;
    readonly width: number;
  };
}

/** Versioned, non-secret local state persisted by the main process. */
export interface LocalState {
  readonly version: 2;
  readonly connections: Readonly<Record<string, LocalConnectionState>>;
  readonly preferences: {
    readonly theme: ThemePreference;
    readonly language: Language;
  };
}
