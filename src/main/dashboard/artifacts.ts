import type {
  BotArtifact,
  BotArtifactContent,
  DashboardTarget,
  Result,
} from '../../shared/protocol';
import { protocolError } from '../../shared/protocol';
import type { AuthManager } from './auth';
import { listRemoteBots } from './bots';
import type { GatewayOptions, RpcClient } from './rpc';
import { emptySchema } from './schemas';
import { requestJson, type TransportFetch } from './transport';

export interface ArtifactDeps {
  readonly auth: AuthManager;
  readonly fetchImpl: TransportFetch;
  readonly requestTimeoutMs?: number;
  readonly connect?: (options: GatewayOptions) => Promise<Result<RpcClient>>;
}

const MAX_LISTED = 200;

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function bool(value: unknown): boolean {
  return value === true;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function requireTarget(deps: ArtifactDeps): DashboardTarget | null {
  return deps.auth.current().connected ? deps.auth.target() : null;
}

function connectionError<T>(): Result<T> {
  return { ok: false, error: protocolError('unauthorized', 'Sign in to the Dashboard first.') };
}

function restOptions(deps: ArtifactDeps, target: DashboardTarget) {
  return {
    fetchImpl: deps.fetchImpl,
    target,
    ...(deps.requestTimeoutMs === undefined ? {} : { timeoutMs: deps.requestTimeoutMs }),
    getAccessToken: () => deps.auth.accessToken(),
  };
}

function kindFor(name: string, mime: string): BotArtifact['kind'] {
  if (mime.startsWith('image/')) {
    return 'image';
  }
  if (mime === 'application/pdf') {
    return 'pdf';
  }
  const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  if (
    ['txt', 'md', 'json', 'csv', 'log', 'yaml', 'yml', 'ts', 'tsx', 'js', 'py'].includes(extension)
  ) {
    return 'text';
  }
  return 'other';
}

/** The Bot Chat's workspace directory, used as the artifact root. */
async function botWorkspace(deps: ArtifactDeps, profile: string): Promise<Result<string | null>> {
  const target = requireTarget(deps);
  if (target === null) {
    return connectionError();
  }
  const bots = await listRemoteBots({
    auth: deps.auth,
    fetchImpl: deps.fetchImpl,
    ...(deps.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: deps.requestTimeoutMs }),
  });
  if (!bots.ok) {
    return bots;
  }
  const bot = bots.data.find((entry) => entry.profileName === profile);
  if (bot?.canonicalSessionId === null || bot?.canonicalSessionId === undefined) {
    return { ok: true, data: null };
  }
  const sessions = await requestJson(restOptions(deps, target), {
    method: 'GET',
    path: `/api/sessions?profile=${encodeURIComponent(profile)}&order=recent&limit=50&offset=0`,
    authenticated: true,
    schema: emptySchema,
  });
  if (!sessions.ok) {
    return sessions;
  }
  const rows = asArray(asRecord(sessions.data)?.['sessions']);
  for (const value of rows) {
    const row = asRecord(value);
    const id = str(row?.['session_id']) || str(row?.['id']);
    if (id === bot.canonicalSessionId) {
      const cwd = str(row?.['cwd']);
      return { ok: true, data: cwd === '' ? null : cwd };
    }
  }
  return { ok: true, data: null };
}

/** Files in the Bot Chat workspace, newest first, capped for a bounded payload. */
export async function listBotArtifacts(
  deps: ArtifactDeps,
  profile: string,
  workspacePath?: string | null,
): Promise<Result<readonly BotArtifact[]>> {
  const target = requireTarget(deps);
  if (target === null) {
    return connectionError();
  }
  let workspace = workspacePath ?? null;
  if (workspace === null) {
    const resolved = await botWorkspace(deps, profile);
    if (!resolved.ok) {
      return resolved;
    }
    workspace = resolved.data;
  }
  if (workspace === null) {
    return { ok: true, data: [] };
  }
  const listing = await requestJson(restOptions(deps, target), {
    method: 'GET',
    path: `/api/files?path=${encodeURIComponent(workspace)}`,
    authenticated: true,
    schema: emptySchema,
  });
  if (!listing.ok) {
    return listing;
  }
  const entries = asArray(asRecord(listing.data)?.['entries']);
  const artifacts: BotArtifact[] = [];
  for (const value of entries) {
    const entry = asRecord(value);
    if (entry === null || bool(entry['is_directory'])) {
      continue;
    }
    const path = str(entry['path']);
    const name = str(entry['name']);
    if (path === '' || name === '') {
      continue;
    }
    const mime = str(entry['mime_type']) || 'application/octet-stream';
    artifacts.push({
      name,
      path,
      size: num(entry['size']),
      mimeType: mime,
      kind: kindFor(name, mime),
      modifiedAt: num(entry['modified_at']),
    });
    if (artifacts.length >= MAX_LISTED) {
      break;
    }
  }
  artifacts.sort((left, right) => right.modifiedAt - left.modifiedAt);
  return { ok: true, data: artifacts };
}

/** Reads one artifact as a data URL plus its metadata (read-only). */
export async function readBotArtifact(
  deps: ArtifactDeps,
  artifactPath: string,
): Promise<Result<BotArtifactContent>> {
  const target = requireTarget(deps);
  if (target === null) {
    return connectionError();
  }
  const read = await requestJson(restOptions(deps, target), {
    method: 'GET',
    path: `/api/files/read?path=${encodeURIComponent(artifactPath)}`,
    authenticated: true,
    schema: emptySchema,
  });
  if (!read.ok) {
    return read;
  }
  const record = asRecord(read.data);
  return {
    ok: true,
    data: {
      name: str(record?.['name']),
      path: str(record?.['path']) || artifactPath,
      size: num(record?.['size']),
      mimeType: str(record?.['mime_type']) || 'application/octet-stream',
      dataUrl: str(record?.['data_url']),
    },
  };
}
