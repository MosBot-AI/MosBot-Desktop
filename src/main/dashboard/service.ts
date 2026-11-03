import type {
  ConnectionSnapshot,
  DashboardStatus,
  PreflightResult,
  ProtocolError,
  ProbeReport,
  Result,
} from '../../shared/protocol';
import { parseDashboardTarget, protocolError } from '../../shared/protocol';
import type { AuthManager } from './auth';
import { createProbeService, type ProbeService } from './probe';
import type { TransportFetch } from './transport';

export interface DashboardService {
  /** Unauthenticated readiness probe for an address; no credentials involved. */
  preflight(address: string): Promise<Result<PreflightResult>>;
  /** Starts the RFC 8252 sign-in and returns the connected snapshot. */
  login(address: string, provider?: string): Promise<Result<ConnectionSnapshot>>;
  /** Restores a saved session without user interaction; `connected: false` when none. */
  restore(address: string): Promise<Result<ConnectionSnapshot>>;
  /** Authenticated capability probe for the current connection. */
  probe(): Promise<Result<ProbeReport>>;
  /** Step 2: gateway handshake, gateway.ready, profiles, Bot Chat query, ticket replay. */
  probeWebSocket(): Promise<Result<ProbeReport>>;
  /** Local sign-out plus what it verified. */
  signOut(): Result<ProbeReport>;
  status(): Promise<Result<DashboardStatus>>;
}

export interface DashboardServiceDeps {
  readonly auth: AuthManager;
  readonly fetchImpl: TransportFetch;
  readonly requestTimeoutMs?: number;
  readonly now?: () => number;
  readonly ticketExpiryCheck?: boolean;
}

function toProtocolError(error: unknown): ProtocolError {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  ) {
    return error as ProtocolError;
  }
  return protocolError('internal', 'The Dashboard request failed unexpectedly.');
}

/**
 * The IPC-facing facade. It owns parsing addresses, keeping secrets inside the
 * main process and turning failures into structured results the UI can render.
 */
export function createDashboardService(deps: DashboardServiceDeps): DashboardService {
  const now = deps.now ?? (() => Date.now());
  const probe: ProbeService = createProbeService({
    auth: deps.auth,
    fetchImpl: deps.fetchImpl,
    ...(deps.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: deps.requestTimeoutMs }),
    ...(deps.now === undefined ? {} : { now: deps.now }),
    ...(deps.ticketExpiryCheck === undefined ? {} : { ticketExpiryCheck: deps.ticketExpiryCheck }),
  });

  return {
    async preflight(address) {
      let target;
      try {
        target = parseDashboardTarget(address);
      } catch (error) {
        return { ok: false, error: toProtocolError(error) };
      }
      const preflight = await deps.auth.preflight(target);
      if (!preflight.ok) {
        return { ok: false, error: preflight.error };
      }
      const report = await probe.runPreflight(target);
      if (!report.ok) {
        return { ok: false, error: report.error };
      }
      return {
        ok: true,
        data: {
          report: report.data,
          providers: preflight.data.providers,
          health: preflight.data.health,
        },
      };
    },

    async login(address, provider) {
      let target;
      try {
        target = parseDashboardTarget(address);
      } catch (error) {
        return { ok: false, error: toProtocolError(error) };
      }
      const session = await deps.auth.login({
        target,
        ...(provider === undefined || provider === '' ? {} : { provider }),
      });
      if (!session.ok) {
        return { ok: false, error: session.error };
      }
      return { ok: true, data: deps.auth.current() };
    },

    async restore(address) {
      let target;
      try {
        target = parseDashboardTarget(address);
      } catch (error) {
        return { ok: false, error: toProtocolError(error) };
      }
      const restored = await deps.auth.restore(target);
      if (!restored.ok) {
        return { ok: false, error: restored.error };
      }
      return { ok: true, data: deps.auth.current() };
    },

    async probe() {
      const report = await probe.runAuthenticated();
      return report;
    },

    async probeWebSocket() {
      return probe.runWebSocket();
    },

    signOut() {
      const rows = probe.runSignOut();
      return {
        ok: true,
        data: { generatedAt: now(), target: deps.auth.current().displayUrl ?? '', rows },
      };
    },

    async status() {
      return { ok: true, data: { connection: deps.auth.current(), lastProbe: null } };
    },
  };
}
