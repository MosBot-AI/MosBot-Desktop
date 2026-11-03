import { WebSocket } from 'ws';
import type { ZodType } from 'zod';
import { protocolError, targetUrl, type DashboardTarget, type Result } from '../../shared/protocol';
import { wsTicketSchema } from './schemas';
import { requestJson, type TransportFetch } from './transport';

/** Minimal socket surface so tests can drive the client without a network. */
export interface WebSocketLike {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface GatewayReady {
  readonly replayEpoch: string | null;
  readonly changeEvents: boolean | null;
  readonly heartbeat: boolean | null;
  readonly payloadKeys: readonly string[];
}

export interface GatewayEvent {
  readonly type: string;
  readonly sessionId: string | null;
  readonly seq: number | null;
  readonly payloadKeys: readonly string[];
}

export interface RpcClient {
  readonly ready: GatewayReady;
  call<T>(method: string, params: Record<string, unknown>, schema: ZodType<T>): Promise<Result<T>>;
  waitForEvent(type: string, timeoutMs?: number): Promise<Result<GatewayEvent>>;
  /** Answers a server→client request by its id. */
  respond(id: string, result: Record<string, unknown>): void;
  close(): void;
}

export interface GatewayServerRequest {
  readonly id: string;
  readonly method: string;
  readonly params: Record<string, unknown>;
}

export interface GatewayOptions {
  readonly fetchImpl: TransportFetch;
  readonly target: DashboardTarget;
  readonly getAccessToken: () => string | null;
  readonly requestTimeoutMs?: number;
  readonly handshakeTimeoutMs?: number;
  readonly socketFactory?: (url: string) => WebSocketLike;
  /** Server→client requests (approval, clarify, …) needing a renderer answer. */
  readonly onRequest?: (request: GatewayServerRequest) => void;
  /** Every `event` frame, after gateway.ready. */
  readonly onEvent?: (type: string, params: Record<string, unknown>) => void;
  /** Socket closed unexpectedly (not via `close()`), e.g. for reconnect. */
  readonly onClose?: (code: number, reason: string) => void;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 10_000;

/** `http(s)://host/prefix` → `ws(s)://host/prefix/api/ws?ticket=…` */
export function gatewayUrl(target: DashboardTarget, ticket: string): string {
  const httpUrl = targetUrl(target, '/api/ws');
  const url = new URL(httpUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('ticket', ticket);
  return url.toString();
}

function parseReady(params: Record<string, unknown>): GatewayReady {
  const payload =
    typeof params['payload'] === 'object' && params['payload'] !== null
      ? (params['payload'] as Record<string, unknown>)
      : {};
  return {
    replayEpoch: typeof payload['replay_epoch'] === 'string' ? payload['replay_epoch'] : null,
    changeEvents: typeof payload['change_events'] === 'boolean' ? payload['change_events'] : null,
    heartbeat: typeof payload['heartbeat'] === 'boolean' ? payload['heartbeat'] : null,
    payloadKeys: Object.keys(payload).sort(),
  };
}

/**
 * Opens one gateway socket and reports whether the handshake was accepted. Used to
 * prove that a consumed or expired ticket is rejected; never logs the ticket.
 */
export async function attemptGatewayConnection(
  url: string,
  timeoutMs = 5_000,
  holdMs = 0,
): Promise<{
  readonly accepted: boolean;
  readonly code: number | null;
  readonly reason: string | null;
}> {
  return new Promise((resolve) => {
    let accepted = false;
    const socket = new WebSocket(url);
    const timer = setTimeout(() => {
      socket.terminate();
      resolve({ accepted, code: null, reason: 'timeout' });
    }, timeoutMs);
    timer.unref?.();
    socket.on('open', () => {
      accepted = true;
      if (holdMs > 0) {
        setTimeout(() => {
          socket.terminate();
        }, holdMs);
      } else {
        socket.terminate();
      }
    });
    socket.on('error', () => undefined);
    socket.on('close', (code: number, reason: Buffer) => {
      clearTimeout(timer);
      resolve({ accepted, code, reason: reason.toString().slice(0, 120) });
    });
  });
}

interface PendingCall {
  readonly resolve: (value: Result<unknown>) => void;
  readonly schema: ZodType<unknown>;
  readonly timer: NodeJS.Timeout;
}

/**
 * JSON-RPC 2.0 client for `/api/ws`. One-time ticket, `gateway.ready` as the first
 * frame, request/response by id, and server events surfaced as typed notifications.
 * Tickets and tokens never appear in error messages.
 */
export async function connectGateway(options: GatewayOptions): Promise<Result<RpcClient>> {
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const handshakeTimeoutMs = options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;

  const ticket = await requestJson(
    {
      fetchImpl: options.fetchImpl,
      target: options.target,
      ...(options.requestTimeoutMs === undefined ? {} : { timeoutMs: options.requestTimeoutMs }),
      getAccessToken: options.getAccessToken,
    },
    { method: 'POST', path: '/api/auth/ws-ticket', authenticated: true, schema: wsTicketSchema },
  );
  if (!ticket.ok) {
    return { ok: false, error: ticket.error };
  }

  const url = gatewayUrl(options.target, ticket.data.ticket);
  const socket = options.socketFactory
    ? options.socketFactory(url)
    : (new WebSocket(url) as unknown as WebSocketLike);

  let nextId = 1;
  const pending = new Map<number, PendingCall>();
  const listeners = new Map<string, Array<(event: GatewayEvent) => void>>();
  let ready: GatewayReady | null = null;
  let closed = false;

  const failAll = (message: string): void => {
    for (const [, entry] of pending) {
      clearTimeout(entry.timer);
      entry.resolve({
        ok: false,
        error: protocolError('unreachable', message, { retriable: true }),
      });
    }
    pending.clear();
  };

  const readyPromise = new Promise<Result<GatewayReady>>((resolve) => {
    const timer = setTimeout(() => {
      resolve({
        ok: false,
        error: protocolError('timeout', 'The Dashboard gateway did not send gateway.ready.'),
      });
    }, handshakeTimeoutMs);
    timer.unref?.();

    socket.onopen = () => undefined;
    socket.onerror = () => {
      clearTimeout(timer);
      resolve({
        ok: false,
        error: protocolError('unreachable', 'The Dashboard gateway connection failed.', {
          retriable: true,
        }),
      });
    };
    socket.onclose = (event) => {
      const wasClosed = closed;
      closed = true;
      clearTimeout(timer);
      failAll(`The Dashboard gateway closed the connection (code ${event.code}).`);
      if (!wasClosed && options.onClose !== undefined) {
        options.onClose(event.code, event.reason);
      }
      resolve({
        ok: false,
        error: protocolError('unreachable', 'The Dashboard gateway closed the connection.', {
          retriable: true,
        }),
      });
    };
    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') {
        return;
      }
      let frame: unknown;
      try {
        frame = JSON.parse(event.data) as unknown;
      } catch {
        return;
      }
      if (typeof frame !== 'object' || frame === null) {
        return;
      }
      const record = frame as Record<string, unknown>;
      if (record['method'] === 'event') {
        const params =
          typeof record['params'] === 'object' && record['params'] !== null
            ? (record['params'] as Record<string, unknown>)
            : {};
        const type = typeof params['type'] === 'string' ? params['type'] : '';
        const gatewayEvent: GatewayEvent = {
          type,
          sessionId: typeof params['session_id'] === 'string' ? params['session_id'] : null,
          seq: typeof params['seq'] === 'number' ? params['seq'] : null,
          payloadKeys:
            typeof params['payload'] === 'object' && params['payload'] !== null
              ? Object.keys(params['payload'] as Record<string, unknown>).sort()
              : [],
        };
        if (type === 'gateway.ready' && ready === null) {
          ready = parseReady(params);
          clearTimeout(timer);
          resolve({ ok: true, data: ready });
        }
        for (const listener of listeners.get(type) ?? []) {
          listener(gatewayEvent);
        }
        options.onEvent?.(type, params);
        return;
      }
      const id = record['id'];
      if (typeof id === 'string' && typeof record['method'] === 'string') {
        const params =
          typeof record['params'] === 'object' && record['params'] !== null
            ? (record['params'] as Record<string, unknown>)
            : {};
        options.onRequest?.({ id, method: record['method'], params });
        return;
      }
      if (typeof id !== 'number') {
        return;
      }
      const entry = pending.get(id);
      if (entry === undefined) {
        return;
      }
      pending.delete(id);
      clearTimeout(entry.timer);
      if (record['error'] !== undefined) {
        const errorRecord =
          typeof record['error'] === 'object' && record['error'] !== null
            ? (record['error'] as Record<string, unknown>)
            : {};
        const message =
          typeof errorRecord['message'] === 'string' ? errorRecord['message'] : 'RPC failed';
        entry.resolve({
          ok: false,
          error: protocolError('http_error', message),
        });
        return;
      }
      const parsed = entry.schema.safeParse(record['result']);
      entry.resolve(
        parsed.success
          ? { ok: true, data: parsed.data }
          : {
              ok: false,
              error: protocolError(
                'malformed_response',
                'The gateway returned an unknown payload.',
              ),
            },
      );
    };
  });

  const readyResult = await readyPromise;
  if (!readyResult.ok) {
    socket.close();
    return { ok: false, error: readyResult.error };
  }
  if (ready === null) {
    socket.close();
    return {
      ok: false,
      error: protocolError('malformed_response', 'The gateway did not send gateway.ready.'),
    };
  }
  const gatewayReady: GatewayReady = ready;

  const client: RpcClient = {
    ready: gatewayReady,
    call<T>(
      method: string,
      params: Record<string, unknown>,
      schema: ZodType<T>,
    ): Promise<Result<T>> {
      if (closed) {
        return Promise.resolve({
          ok: false,
          error: protocolError('unreachable', 'The Dashboard gateway is not connected.'),
        });
      }
      const id = nextId;
      nextId += 1;
      return new Promise<Result<T>>((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          resolve({
            ok: false,
            error: protocolError('timeout', `The gateway did not answer ${method}.`),
          });
        }, timeoutMs);
        timer.unref?.();
        pending.set(id, {
          resolve: resolve as (value: Result<unknown>) => void,
          schema: schema as ZodType<unknown>,
          timer,
        });
        socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      });
    },
    waitForEvent(type: string, eventTimeoutMs = timeoutMs): Promise<Result<GatewayEvent>> {
      return new Promise<Result<GatewayEvent>>((resolve) => {
        const timer = setTimeout(() => {
          remove();
          resolve({
            ok: false,
            error: protocolError('timeout', `No ${type} event arrived from the gateway.`),
          });
        }, eventTimeoutMs);
        timer.unref?.();
        const handler = (event: GatewayEvent): void => {
          clearTimeout(timer);
          remove();
          resolve({ ok: true, data: event });
        };
        const remove = (): void => {
          const current = listeners.get(type) ?? [];
          listeners.set(
            type,
            current.filter((listener) => listener !== handler),
          );
        };
        listeners.set(type, [...(listeners.get(type) ?? []), handler]);
      });
    },
    respond(id: string, result: Record<string, unknown>): void {
      if (closed) {
        return;
      }
      socket.send(JSON.stringify({ jsonrpc: '2.0', id, result }));
    },
    close(): void {
      closed = true;
      failAll('The Dashboard gateway connection was closed locally.');
      socket.close();
    },
  };
  return { ok: true, data: client };
}
