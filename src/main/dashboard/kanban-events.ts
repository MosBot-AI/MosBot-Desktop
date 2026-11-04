import { WebSocket, type RawData } from 'ws';
import type { DashboardTarget, Result } from '../../shared/protocol';
import { protocolError } from '../../shared/protocol';
import type { AuthManager } from './auth';
import { emptySchema } from './schemas';
import { requestJson, type TransportFetch } from './transport';

export interface KanbanEvent {
  readonly id: number;
  readonly taskId: string;
  readonly kind: string;
  readonly createdAt: number;
  readonly payload: unknown;
}

export type KanbanWatchState = 'connected' | 'reconnecting' | 'disconnected';

export interface KanbanWatchEvent {
  readonly board: string;
  readonly events: readonly KanbanEvent[];
  readonly cursor: number;
  readonly state: KanbanWatchState;
}

export interface KanbanEventsDeps {
  readonly auth: AuthManager;
  readonly fetchImpl: TransportFetch;
  readonly requestTimeoutMs?: number;
  readonly onEvent: (event: KanbanWatchEvent) => void;
  readonly socketFactory?: (url: string) => WebSocket;
}

export interface KanbanWatcher {
  close(): void;
}

const RETRY_MS = 2_000;
const MAX_RETRY_MS = 15_000;

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function wsBaseUrl(target: DashboardTarget): string {
  const url = new URL(target.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const prefix = target.basePath === '/' ? '' : target.basePath.replace(/\/$/, '');
  return `${url.origin}${prefix}`;
}

async function fetchTicket(
  deps: KanbanEventsDeps,
  target: DashboardTarget,
): Promise<Result<string>> {
  const response = await requestJson(
    {
      fetchImpl: deps.fetchImpl,
      target,
      ...(deps.requestTimeoutMs === undefined ? {} : { timeoutMs: deps.requestTimeoutMs }),
      getAccessToken: () => deps.auth.accessToken(),
    },
    {
      method: 'POST',
      path: '/api/auth/ws-ticket',
      authenticated: true,
      schema: emptySchema,
    },
  );
  if (!response.ok) {
    return response;
  }
  const ticket = str(asRecord(response.data)?.['ticket']);
  return ticket === ''
    ? { ok: false, error: protocolError('malformed_response', 'The Dashboard returned no ticket.') }
    : { ok: true, data: ticket };
}

/**
 * Tails one board's `task_events` WebSocket. The board is pinned per connection:
 * switching boards closes this watcher and opens a new one, so a late frame can
 * never be applied to the board the person switched to. Reconnects re-sign a
 * ticket and resume from the last cursor; the renderer refetches the snapshot when
 * the cursor falls behind the board's `latest_event_id`.
 */
export function watchKanbanBoard(
  deps: KanbanEventsDeps,
  board: string,
  since: number,
): KanbanWatcher {
  let cursor = Math.max(0, since);
  let socket: WebSocket | null = null;
  let closed = false;
  let retryTimer: NodeJS.Timeout | null = null;
  let attempt = 0;
  let state: KanbanWatchState = 'disconnected';

  const setState = (next: KanbanWatchState): void => {
    if (state === next) {
      return;
    }
    state = next;
    deps.onEvent({ board, events: [], cursor, state: next });
  };

  const connect = async (): Promise<void> => {
    if (closed) {
      return;
    }
    const target = deps.auth.target();
    if (target === null || !deps.auth.current().connected) {
      setState('disconnected');
      return;
    }
    setState(attempt === 0 ? 'connected' : 'reconnecting');
    const ticket = await fetchTicket(deps, target);
    if (!ticket.ok) {
      scheduleRetry();
      return;
    }
    if (closed) {
      return;
    }
    const url = `${wsBaseUrl(target)}/api/plugins/kanban/events?board=${encodeURIComponent(board)}&since=${cursor}&ticket=${encodeURIComponent(ticket.data)}`;
    const ws = deps.socketFactory === undefined ? new WebSocket(url) : deps.socketFactory(url);
    socket = ws;

    ws.on('open', () => {
      attempt = 0;
      setState('connected');
    });
    ws.on('message', (raw: RawData) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const record = asRecord(parsed);
      const events: KanbanEvent[] = [];
      if (Array.isArray(record?.['events'])) {
        for (const value of record['events'] as unknown[]) {
          const event = asRecord(value);
          if (event === null) {
            continue;
          }
          events.push({
            id: num(event['id']),
            taskId: str(event['task_id']),
            kind: str(event['kind']),
            createdAt: num(event['created_at']),
            payload: event['payload'],
          });
        }
      }
      const nextCursor = num(record?.['cursor']);
      if (nextCursor > cursor) {
        cursor = nextCursor;
      }
      if (events.length > 0) {
        deps.onEvent({ board, events, cursor, state: 'connected' });
      }
    });
    ws.on('close', () => {
      socket = null;
      if (closed) {
        return;
      }
      scheduleRetry();
    });
    ws.on('error', () => {
      // 'close' follows and schedules the retry.
    });
  };

  const scheduleRetry = (): void => {
    if (closed || retryTimer !== null) {
      return;
    }
    setState('reconnecting');
    const delay = Math.min(MAX_RETRY_MS, RETRY_MS * 2 ** Math.min(attempt, 3));
    attempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void connect();
    }, delay);
    retryTimer.unref?.();
  };

  void connect();

  return {
    close() {
      closed = true;
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      socket?.close();
      socket = null;
      setState('disconnected');
    },
  };
}
