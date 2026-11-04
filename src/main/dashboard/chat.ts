import type {
  ChatOpenResult,
  ChatServerRequest,
  ChatTurnStatus,
  DashboardChatEvent,
  Result,
} from '../../shared/protocol';
import { protocolError } from '../../shared/protocol';
import type { AuthManager } from './auth';
import {
  connectGateway,
  type GatewayOptions,
  type GatewayServerRequest,
  type RpcClient,
} from './rpc';
import { createStreamBatcher } from '../../shared/stream-batch';
import { emptySchema } from './schemas';
import type { TransportFetch } from './transport';

export interface ChatManagerDeps {
  readonly auth: AuthManager;
  readonly fetchImpl: TransportFetch;
  readonly requestTimeoutMs?: number;
  readonly now?: () => number;
  /** Test seam: defaults to the real gateway client. */
  readonly connect?: (options: GatewayOptions) => Promise<Result<RpcClient>>;
}

export interface ChatState {
  readonly profile: string | null;
  readonly storedSessionId: string | null;
  readonly runtimeSessionId: string | null;
  readonly approvalMode: string | null;
  readonly serverRequests: readonly string[];
  readonly workspaceCwd: string | null;
  readonly connection: 'connected' | 'reconnecting' | 'disconnected';
}

export interface ChatManager {
  subscribe(listener: (event: DashboardChatEvent) => void): () => void;
  open(profileName: string, storedSessionId: string | null): Promise<Result<ChatOpenResult>>;
  send(text: string): Promise<Result<void>>;
  /** Stages a file into the live session and returns its `@file:` reference. */
  attachFile(name: string, dataUrl: string): Promise<Result<{ name: string; refText: string }>>;
  stop(): Promise<Result<void>>;
  answer(requestId: string, result: Readonly<Record<string, unknown>>): Promise<Result<void>>;
  close(): void;
  state(): ChatState;
}

const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000];
const RPC_TIMEOUT_MS = 30_000;

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function turnStatus(value: unknown): ChatTurnStatus {
  const status = str(value);
  if (status === 'error') {
    return 'error';
  }
  if (status === 'interrupted') {
    return 'interrupted';
  }
  return 'complete';
}

/**
 * One live Bot Chat connection: resumes the canonical session, submits prompts,
 * interrupts turns and relays streamed events plus server→client requests to the
 * renderer. Reconnects with backoff and re-resumes the same stored session.
 */
export function createChatManager(deps: ChatManagerDeps): ChatManager {
  const listeners = new Set<(event: DashboardChatEvent) => void>();
  let client: RpcClient | null = null;
  let profile: string | null = null;
  let storedSessionId: string | null = null;
  let runtimeSessionId: string | null = null;
  let approvalMode: string | null = null;
  let serverRequests: string[] = [];
  let workspaceCwd: string | null = null;
  let replayEpoch: string | null = null;
  let runningTurn = false;
  let lastSeenSeq = 0;
  let connection: ChatState['connection'] = 'disconnected';
  let closing = false;
  let reconnectAttempt = 0;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let connecting: Promise<Result<ChatOpenResult>> | null = null;

  const deliver = (event: DashboardChatEvent): void => {
    for (const listener of listeners) {
      listener(event);
    }
  };

  // Streamed deltas are merged per turn before delivery; every control event
  // flushes the pending text first so ordering is preserved end to end. Every
  // delta carries the profile it belongs to so a late flush can never leak into
  // the chat of a Bot the user just switched to.
  const deltaBatcher = createStreamBatcher({
    onFlush: (text) => {
      deliver({ type: 'delta', text, ...(profile === null ? {} : { profile }) });
    },
  });

  const emit = (event: DashboardChatEvent): void => {
    deltaBatcher.flush();
    deliver(event);
  };

  const setConnection = (next: ChatState['connection'], detail?: string): void => {
    connection = next;
    emit({ type: 'connection', state: next, ...(detail === undefined ? {} : { detail }) });
  };

  const handleEvent = (type: string, params: Record<string, unknown>): void => {
    if (closing) {
      return;
    }
    const sessionId = str(params['session_id']);
    if (sessionId !== '' && runtimeSessionId !== null && sessionId !== runtimeSessionId) {
      return;
    }
    const seq = typeof params['seq'] === 'number' ? params['seq'] : null;
    if (seq !== null) {
      if (seq <= lastSeenSeq) {
        return;
      }
      lastSeenSeq = seq;
    }
    const payload = asRecord(params['payload']) ?? {};
    switch (type) {
      case 'message.start':
        emit({ type: 'turn-start' });
        return;
      case 'message.delta': {
        const text = payload['text'];
        if (typeof text === 'string' && text !== '') {
          deltaBatcher.push(text);
        }
        return;
      }
      case 'message.interim': {
        const text = payload['text'];
        if (typeof text === 'string' && text !== '') {
          emit({ type: 'interim', text });
        }
        return;
      }
      case 'message.complete':
        emit({
          type: 'turn-complete',
          status: turnStatus(payload['status']),
          text: typeof payload['text'] === 'string' ? payload['text'] : '',
          error: typeof payload['error'] === 'string' ? payload['error'] : null,
        });
        return;
      case 'tool.start':
      case 'tool.generating':
      case 'tool.complete':
        emit({
          type: 'tool',
          phase:
            type === 'tool.start' ? 'start' : type === 'tool.generating' ? 'progress' : 'complete',
          name: str(payload['tool_name']) || str(payload['name']) || str(payload['tool']),
        });
        return;
      case 'error': {
        const message =
          str(payload['message']) || str(payload['error']) || 'The Dashboard reported an error.';
        emit({ type: 'error', message });
        return;
      }
      case 'request.cancel': {
        const requestId = str(payload['id']);
        if (requestId !== '') {
          emit({ type: 'request-cancel', requestId });
        }
        return;
      }
      default:
        return;
    }
  };

  const handleServerRequest = (request: GatewayServerRequest): void => {
    if (request.method !== 'approval' && request.method !== 'clarify') {
      // Unknown prompt kinds are declined so the agent is never parked on a client
      // that cannot render them.
      client?.respond(request.id, { value: '' });
      return;
    }
    const payload: ChatServerRequest = {
      id: request.id,
      method: request.method,
      payload: request.params,
    };
    emit({ type: 'request', request: payload });
  };

  const attachClient = async (rpc: RpcClient): Promise<void> => {
    client = rpc;
    const capabilities = await rpc.call(
      'client.capabilities',
      { server_requests: true },
      emptySchema,
    );
    if (capabilities.ok) {
      const methods = asRecord(capabilities.data)?.['server_requests'];
      if (Array.isArray(methods)) {
        serverRequests = methods.filter((method): method is string => typeof method === 'string');
      }
    }
  };

  /** Replays missed events (or flags a stale transcript when the ring or epoch moved). */
  const replayMissedEvents = async (rpc: RpcClient, epochChanged: boolean): Promise<void> => {
    if (runtimeSessionId === null) {
      return;
    }
    if (epochChanged) {
      lastSeenSeq = 0;
      emit({ type: 'history-stale', reason: 'epoch-changed' });
      return;
    }
    if (lastSeenSeq <= 0) {
      return;
    }
    const replay = await rpc.call(
      'session.events.since',
      { session_id: runtimeSessionId, last_seen: lastSeenSeq },
      emptySchema,
    );
    if (!replay.ok) {
      emit({ type: 'history-stale', reason: 'replay-failed' });
      return;
    }
    const record = asRecord(replay.data);
    const latestSeq =
      typeof record?.['latest_seq'] === 'number' ? record['latest_seq'] : lastSeenSeq;
    if (record?.['truncated'] === true) {
      lastSeenSeq = Math.max(lastSeenSeq, latestSeq);
      emit({ type: 'history-stale', reason: 'replay-truncated' });
    } else {
      const frames = Array.isArray(record?.['events']) ? (record['events'] as unknown[]) : [];
      for (const frame of frames) {
        const event = asRecord(frame);
        if (event !== null) {
          handleEvent(str(event['type']), event);
        }
      }
      lastSeenSeq = Math.max(lastSeenSeq, latestSeq);
    }
    // Requests still waiting are re-delivered; the replay ring cannot carry them.
    const openRequests = Array.isArray(record?.['open_requests'])
      ? (record['open_requests'] as unknown[])
      : [];
    for (const entry of openRequests) {
      const request = asRecord(entry);
      if (request === null) {
        continue;
      }
      const id = str(request['id']);
      const method = str(request['method']);
      if (id !== '' && method !== '') {
        handleServerRequest({
          id,
          method,
          params: asRecord(request['params']) ?? {},
        });
      }
    }
  };

  const resumeSession = async (rpc: RpcClient): Promise<Result<ChatOpenResult>> => {
    if (profile === null) {
      return {
        ok: false,
        error: protocolError('internal', 'No profile is open for chat.'),
      };
    }
    if (storedSessionId !== null) {
      let resumed = await rpc.call(
        'session.resume',
        { session_id: storedSessionId, profile, omit_messages: true },
        emptySchema,
      );
      if (!resumed.ok) {
        // Older gateways ignore the omit flag rather than rejecting it; retry plainly.
        resumed = await rpc.call(
          'session.resume',
          { session_id: storedSessionId, profile },
          emptySchema,
        );
      }
      if (resumed.ok) {
        const record = asRecord(resumed.data);
        runtimeSessionId = str(record?.['session_id']) || null;
        storedSessionId = str(record?.['session_key']) || storedSessionId;
        approvalMode = str(asRecord(record?.['info'])?.['approval_mode']) || approvalMode;
        workspaceCwd = str(asRecord(record?.['info'])?.['cwd']) || workspaceCwd;
        workspaceCwd = str(asRecord(record?.['info'])?.['cwd']) || workspaceCwd;
        runningTurn = record?.['running'] === true;
        // Resume carries unanswered requests for reconnecting clients.
        const openRequests = Array.isArray(record?.['open_requests'])
          ? (record['open_requests'] as unknown[])
          : [];
        for (const entry of openRequests) {
          const request = asRecord(entry);
          if (request === null) {
            continue;
          }
          const id = str(request['id']);
          const method = str(request['method']);
          if (id !== '' && method !== '') {
            handleServerRequest({ id, method, params: asRecord(request['params']) ?? {} });
          }
        }
        return {
          ok: true,
          data: { profile, storedSessionId, runtimeSessionId, workspace: workspaceCwd },
        };
      }
      return resumed as Result<ChatOpenResult>;
    }

    const created = await rpc.call(
      'session.create',
      {
        profile,
        title: 'Bot Chat',
        hidden: true,
        follow_profile_config: true,
        idempotency_key: `mosbot-chat-${Date.now()}`,
      },
      emptySchema,
    );
    if (!created.ok) {
      return created as Result<ChatOpenResult>;
    }
    const record = asRecord(created.data);
    runtimeSessionId = str(record?.['session_id']) || null;
    storedSessionId = str(record?.['stored_session_id']) || null;
    approvalMode = str(asRecord(record?.['info'])?.['approval_mode']) || approvalMode;
    workspaceCwd = str(asRecord(record?.['info'])?.['cwd']) || workspaceCwd;
    if (runtimeSessionId === null) {
      return {
        ok: false,
        error: protocolError('malformed_response', 'The gateway did not return a session id.'),
      };
    }
    if (storedSessionId !== null) {
      await rpc.call(
        'session.title',
        { session_id: runtimeSessionId, title: 'Bot Chat' },
        emptySchema,
      );
    }
    return {
      ok: true,
      data: { profile, storedSessionId, runtimeSessionId, workspace: workspaceCwd },
    };
  };

  const connect = async (): Promise<Result<ChatOpenResult>> => {
    const target = deps.auth.target();
    if (target === null || !deps.auth.current().connected) {
      return {
        ok: false,
        error: protocolError('unauthorized', 'Sign in to the Dashboard first.'),
      };
    }
    setConnection('reconnecting', 'connecting');
    const connectFn = deps.connect ?? connectGateway;
    const result = await connectFn({
      fetchImpl: deps.fetchImpl,
      target,
      getAccessToken: () => deps.auth.accessToken(),
      requestTimeoutMs: deps.requestTimeoutMs ?? RPC_TIMEOUT_MS,
      onRequest: handleServerRequest,
      onEvent: handleEvent,
      onClose: () => {
        if (closing) {
          return;
        }
        client = null;
        setConnection('disconnected', 'socket closed');
        scheduleReconnect();
      },
    });
    if (!result.ok) {
      setConnection('disconnected', result.error.message);
      return result as Result<ChatOpenResult>;
    }
    await attachClient(result.data);
    const nextEpoch = result.data.ready.replayEpoch;
    const epochChanged = replayEpoch !== null && nextEpoch !== null && replayEpoch !== nextEpoch;
    replayEpoch = nextEpoch;
    const opened = await resumeSession(result.data);
    if (!opened.ok) {
      result.data.close();
      setConnection('disconnected', opened.error.message);
      return opened;
    }
    await replayMissedEvents(result.data, epochChanged);
    if (runningTurn) {
      emit({ type: 'turn-start' });
    }
    reconnectAttempt = 0;
    setConnection('connected');
    const currentProfile = profile;
    if (currentProfile !== null) {
      emit({
        type: 'session',
        profile: currentProfile,
        storedSessionId,
        runtimeSessionId,
      });
    }
    return opened;
  };

  const scheduleReconnect = (): void => {
    if (closing || profile === null) {
      return;
    }
    const delay = RECONNECT_DELAYS_MS[Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
    reconnectAttempt += 1;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
    }
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (closing || client !== null) {
        return;
      }
      setConnection('reconnecting', `retry ${reconnectAttempt}`);
      void connect().then((result) => {
        if (!result.ok && reconnectAttempt <= RECONNECT_DELAYS_MS.length) {
          scheduleReconnect();
        }
      });
    }, delay);
    reconnectTimer.unref?.();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    open(profileName, stored) {
      if (connecting !== null) {
        return connecting;
      }
      const run = async (): Promise<Result<ChatOpenResult>> => {
        if (client !== null && profile === profileName && storedSessionId === stored) {
          // The renderer may have been reloaded or its window reopened while this
          // chat manager stayed connected: re-emit the connection/session state
          // (and any still-open requests) so the new surface is not stuck on
          // "disconnected" with a cached, event-less result.
          const resumed = await resumeSession(client);
          if (!resumed.ok) {
            return resumed;
          }
          setConnection('connected');
          emit({
            type: 'session',
            profile: profileName,
            storedSessionId,
            runtimeSessionId,
          });
          if (runningTurn) {
            emit({ type: 'turn-start' });
          }
          return resumed;
        }
        // Switching sessions drops any text still waiting in the coalescing
        // window; it belongs to the previous Bot and the transcript is reset.
        deltaBatcher.reset();
        if (client !== null) {
          client.close();
          client = null;
        }
        profile = profileName;
        storedSessionId = stored;
        runtimeSessionId = null;
        closing = false;
        reconnectAttempt = 0;
        const opened = await connect();
        return opened;
      };
      connecting = run().finally(() => {
        connecting = null;
      });
      return connecting;
    },

    async attachFile(name, dataUrl) {
      const rpc = client;
      if (rpc === null || runtimeSessionId === null) {
        return {
          ok: false,
          error: protocolError('unauthorized', 'Open a Bot Chat before attaching a file.'),
        };
      }
      const attached = await rpc.call(
        'file.attach',
        { session_id: runtimeSessionId, name, data_url: dataUrl },
        emptySchema,
      );
      if (!attached.ok) {
        return attached;
      }
      const record = asRecord(attached.data);
      return {
        ok: true,
        data: {
          name: str(record?.['name']) || name,
          refText: str(record?.['ref_text']),
        },
      };
    },

    async send(text) {
      const trimmed = text.trim();
      if (trimmed === '') {
        return { ok: false, error: protocolError('invalid_url', 'Enter a message first.') };
      }
      if (client === null || runtimeSessionId === null) {
        return {
          ok: false,
          error: protocolError('unauthorized', 'The chat session is not ready yet.'),
        };
      }
      const result = await client.call(
        'prompt.submit',
        { session_id: runtimeSessionId, text: trimmed },
        emptySchema,
      );
      return result.ok ? { ok: true, data: undefined } : result;
    },

    async stop() {
      if (client === null || runtimeSessionId === null) {
        return {
          ok: false,
          error: protocolError('unauthorized', 'The chat session is not ready yet.'),
        };
      }
      const result = await client.call(
        'session.interrupt',
        { session_id: runtimeSessionId },
        emptySchema,
      );
      return result.ok ? { ok: true, data: undefined } : result;
    },

    async answer(requestId, result) {
      if (client === null) {
        return {
          ok: false,
          error: protocolError('unauthorized', 'The chat session is not connected.'),
        };
      }
      client.respond(requestId, { ...result });
      return { ok: true, data: undefined };
    },

    close() {
      closing = true;
      // Deliver any text that already arrived before the session goes away.
      deltaBatcher.flush();
      deltaBatcher.reset();
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      client?.close();
      client = null;
      profile = null;
      storedSessionId = null;
      runtimeSessionId = null;
      approvalMode = null;
      workspaceCwd = null;
      serverRequests = [];
      replayEpoch = null;
      lastSeenSeq = 0;
      runningTurn = false;
      connection = 'disconnected';
    },

    state() {
      return {
        profile,
        storedSessionId,
        runtimeSessionId,
        approvalMode,
        serverRequests,
        workspaceCwd,
        connection,
      };
    },
  };
}
