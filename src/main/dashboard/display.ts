import type {
  DashboardTarget,
  DisplaySnapshot,
  DisplayThumbnail,
  Result,
} from '../../shared/protocol';
import { protocolError } from '../../shared/protocol';
import type { AuthManager } from './auth';
import { connectGateway, type GatewayOptions, type RpcClient } from './rpc';
import { emptySchema } from './schemas';
import type { TransportFetch } from './transport';

export interface DisplayDeps {
  readonly auth: AuthManager;
  readonly fetchImpl: TransportFetch;
  readonly requestTimeoutMs?: number;
  readonly connect?: (options: GatewayOptions) => Promise<Result<RpcClient>>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function bool(value: unknown): boolean {
  return value === true;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function mapSnapshot(value: unknown): DisplaySnapshot {
  const record = asRecord(value);
  const lease = asRecord(record?.['lease']);
  return {
    supported: bool(record?.['supported']),
    installed: bool(record?.['installed']),
    running: bool(record?.['running']),
    geometry: str(record?.['geometry']),
    blocker: str(record?.['blocker']) || null,
    placement: str(record?.['placement']),
    lease:
      lease === null
        ? null
        : {
            holder: str(lease['holder']),
            since: num(lease['since']),
          },
  };
}

async function withClient<T>(
  deps: DisplayDeps,
  action: (client: RpcClient) => Promise<Result<T>>,
): Promise<Result<T>> {
  const target: DashboardTarget | null = deps.auth.current().connected ? deps.auth.target() : null;
  if (target === null) {
    return {
      ok: false,
      error: protocolError('unauthorized', 'Sign in to the Dashboard first.'),
    };
  }
  const connectFn = deps.connect ?? connectGateway;
  const connection = await connectFn({
    fetchImpl: deps.fetchImpl,
    target,
    getAccessToken: () => deps.auth.accessToken(),
    requestTimeoutMs: deps.requestTimeoutMs ?? 20_000,
  });
  if (!connection.ok) {
    return connection;
  }
  try {
    return await action(connection.data);
  } finally {
    connection.data.close();
  }
}

/** Read-only remote-computer status (no lease change). */
export async function readDisplayStatus(deps: DisplayDeps): Promise<Result<DisplaySnapshot>> {
  return withClient(deps, async (client) => {
    const status = await client.call('display.status', {}, emptySchema);
    return status.ok ? { ok: true, data: mapSnapshot(status.data) } : status;
  });
}

/** One JPEG frame; suppressed while a human holds the lease. */
export async function readDisplayThumbnail(deps: DisplayDeps): Promise<Result<DisplayThumbnail>> {
  return withClient(deps, async (client) => {
    const thumbnail = await client.call('display.thumbnail', {}, emptySchema);
    if (!thumbnail.ok) {
      return thumbnail;
    }
    const record = asRecord(thumbnail.data);
    return {
      ok: true,
      data: {
        dataUrl: str(record?.['data_url']) || null,
        suppressed: str(record?.['suppressed']) || null,
      },
    };
  });
}

/** Explicit wake; the caller waits for the authoritative status afterwards. */
export async function startDisplay(deps: DisplayDeps): Promise<Result<DisplaySnapshot>> {
  return withClient(deps, async (client) => {
    const started = await client.call('display.start', {}, emptySchema);
    return started.ok ? { ok: true, data: mapSnapshot(started.data) } : started;
  });
}
