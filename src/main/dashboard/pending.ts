import type { DashboardPendingEvent, DashboardTarget } from '../../shared/protocol';
import type { AuthManager } from './auth';
import { connectGateway, type GatewayOptions, type RpcClient } from './rpc';
import { emptySchema } from './schemas';
import type { TransportFetch } from './transport';

export interface PendingNotification {
  readonly requestId: string;
  readonly profile: string;
  readonly displayName: string;
  readonly method: 'approval' | 'clarify';
  readonly title: string;
}

export interface PendingWatcherDeps {
  readonly auth: AuthManager;
  readonly fetchImpl: TransportFetch;
  readonly requestTimeoutMs?: number;
  /** Called once per newly discovered request (main decides whether to show a system notification). */
  readonly notify: (notification: PendingNotification) => void;
  /** Pushes add/remove/open events to the renderer. */
  readonly onEvent: (event: DashboardPendingEvent) => void;
  /** Test seam: defaults to the real gateway client. */
  readonly connect?: (
    options: GatewayOptions,
  ) => Promise<
    | { ok: true; data: RpcClient }
    | { ok: false; error: { code: string; message: string; retriable: boolean } }
  >;
}

export interface PendingWatcher {
  start(): void;
  stop(): void;
}

interface KnownRequest {
  readonly profile: string;
  readonly displayName: string;
  readonly method: 'approval' | 'clarify';
  readonly title: string;
}

const POLL_INTERVAL_MS = 5_000;
const RETRY_INTERVAL_MS = 5_000;
const RPC_TIMEOUT_MS = 20_000;

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Discovers pending approval/clarify requests for Bot Chats the window is not
 * showing. It polls the gateway's live session list, attaches (read-only) to the
 * waiting canonical Bot Chats, forwards newly seen requests to the renderer and
 * asks the main process for a system notification. It never answers requests:
 * clicking a notification opens the Bot, whose chat connection resumes the same
 * session and re-delivers the request as an inline card.
 */
export function createPendingWatcher(deps: PendingWatcherDeps): PendingWatcher {
  const known = new Map<string, KnownRequest>();
  const attached = new Map<
    string,
    { readonly profile: string; readonly runtimeId: string; readonly displayName: string }
  >();
  const runtimeToProfile = new Map<string, string>();
  let client: RpcClient | null = null;
  let pollTimer: NodeJS.Timeout | null = null;
  let retryTimer: NodeJS.Timeout | null = null;
  let started = false;
  let connecting = false;

  const emit = (event: DashboardPendingEvent): void => {
    deps.onEvent(event);
  };

  const removeRequest = (requestId: string): void => {
    if (known.delete(requestId)) {
      emit({ type: 'remove', requestId });
    }
  };

  const titleOf = (method: string, params: Record<string, unknown>): string => {
    if (method === 'approval') {
      return str(params['description']) || str(params['command']) || 'Approval';
    }
    const questions = asArray(params['questions']);
    const first = asRecord(questions[0]);
    return str(first?.['question']) || 'Question';
  };

  const registerRequest = (
    profile: string,
    displayName: string,
    request: { id: string; method: string; params: Record<string, unknown> },
  ): void => {
    if (request.method !== 'approval' && request.method !== 'clarify') {
      return;
    }
    if (known.has(request.id)) {
      return;
    }
    const title = titleOf(request.method, request.params);
    known.set(request.id, { profile, displayName, method: request.method, title });
    emit({
      type: 'add',
      requestId: request.id,
      profile,
      method: request.method,
      title,
    });
    deps.notify({
      requestId: request.id,
      profile,
      displayName,
      method: request.method,
      title,
    });
  };

  const attachWaiting = async (rpc: RpcClient): Promise<void> => {
    const profiles = await rpc.call('profiles.list', { include_sessions: true }, emptySchema);
    if (!profiles.ok) {
      return;
    }
    const rows = asArray(asRecord(profiles.data)?.['profiles']);
    const canonical = new Map<string, { profile: string; displayName: string }>();
    for (const row of rows) {
      const record = asRecord(row);
      const profile = str(record?.['name']);
      const session = asRecord(record?.['canonical_session']);
      const storedId = str(session?.['id']);
      if (profile !== '' && storedId !== '') {
        canonical.set(storedId, {
          profile,
          displayName: str(record?.['display_name']) || profile,
        });
      }
    }

    const active = await rpc.call('session.active_list', {}, emptySchema);
    if (!active.ok) {
      return;
    }
    const sessions = asArray(asRecord(active.data)?.['sessions']);
    const waitingProfiles = new Set<string>();
    for (const row of sessions) {
      const record = asRecord(row);
      const status = str(record?.['status']);
      const runtimeId = str(record?.['id']);
      const storedId = str(record?.['session_key']);
      const owner = canonical.get(storedId);
      if (status !== 'waiting' || owner === undefined || runtimeId === '') {
        continue;
      }
      waitingProfiles.add(owner.profile);
      if (attached.has(owner.profile)) {
        continue;
      }
      const activated = await rpc.call(
        'session.activate',
        { session_id: runtimeId, omit_messages: true },
        emptySchema,
      );
      if (!activated.ok) {
        continue;
      }
      attached.set(owner.profile, {
        profile: owner.profile,
        runtimeId,
        displayName: owner.displayName,
      });
      runtimeToProfile.set(runtimeId, owner.profile);
      const openRequests = asArray(asRecord(activated.data)?.['open_requests']);
      for (const entry of openRequests) {
        const request = asRecord(entry);
        if (request === null) {
          continue;
        }
        registerRequest(owner.profile, owner.displayName, {
          id: str(request['id']),
          method: str(request['method']),
          params: asRecord(request['params']) ?? {},
        });
      }
    }

    // Requests whose session stopped waiting (answered here or on another client).
    for (const [requestId, request] of known) {
      if (!waitingProfiles.has(request.profile)) {
        removeRequest(requestId);
      }
    }
  };

  const poll = async (): Promise<void> => {
    if (!started) {
      return;
    }
    if (client === null) {
      scheduleRetry();
      return;
    }
    try {
      await attachWaiting(client);
    } catch {
      // A transient RPC failure retries on the next tick.
    }
    schedulePoll();
  };

  const schedulePoll = (): void => {
    if (!started || pollTimer !== null) {
      return;
    }
    pollTimer = setTimeout(() => {
      pollTimer = null;
      void poll();
    }, POLL_INTERVAL_MS);
    pollTimer.unref?.();
  };

  const scheduleRetry = (): void => {
    if (!started || retryTimer !== null) {
      return;
    }
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void connect();
    }, RETRY_INTERVAL_MS);
    retryTimer.unref?.();
  };

  const connect = async (): Promise<void> => {
    if (!started || connecting) {
      return;
    }
    if (!deps.auth.current().connected) {
      scheduleRetry();
      return;
    }
    const target: DashboardTarget | null = deps.auth.target();
    if (target === null) {
      scheduleRetry();
      return;
    }
    connecting = true;
    try {
      const connectFn = deps.connect ?? connectGateway;
      const result = await connectFn({
        fetchImpl: deps.fetchImpl,
        target,
        getAccessToken: () => deps.auth.accessToken(),
        requestTimeoutMs: deps.requestTimeoutMs ?? RPC_TIMEOUT_MS,
        onRequest: (request) => {
          const runtimeId = str(request.params['session_id']);
          const profile = runtimeToProfile.get(runtimeId);
          if (profile === undefined) {
            return;
          }
          const owner = attached.get(profile);
          registerRequest(profile, owner?.displayName ?? profile, {
            id: request.id,
            method: request.method,
            params: request.params,
          });
        },
        onEvent: (type, params) => {
          if (type !== 'request.cancel') {
            return;
          }
          const payload = asRecord(params['payload']) ?? {};
          removeRequest(str(payload['id']));
        },
        onClose: () => {
          client = null;
          attached.clear();
          runtimeToProfile.clear();
          scheduleRetry();
        },
      });
      if (!result.ok) {
        scheduleRetry();
        return;
      }
      client = result.data;
      void result.data.call('client.capabilities', { server_requests: true }, emptySchema);
      await poll();
    } finally {
      connecting = false;
    }
  };

  return {
    start() {
      if (started) {
        return;
      }
      started = true;
      void connect();
    },
    stop() {
      started = false;
      if (pollTimer !== null) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      for (const requestId of [...known.keys()]) {
        removeRequest(requestId);
      }
      attached.clear();
      runtimeToProfile.clear();
      client?.close();
      client = null;
    },
  };
}
