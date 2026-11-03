import type { RemoteBot, RemoteChat, RemoteMessage, Result } from '../../shared/protocol';
import { protocolError } from '../../shared/protocol';
import type { AuthManager } from './auth';
import { connectGateway } from './rpc';
import { emptySchema } from './schemas';
import { requestJson, type TransportFetch } from './transport';

export interface BotsDeps {
  readonly auth: AuthManager;
  readonly fetchImpl: TransportFetch;
  readonly requestTimeoutMs?: number;
  readonly now?: () => number;
}

const ROSTER_RPC_TIMEOUT_MS = 30_000;
const HISTORY_LIMIT = 50;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Deployed payloads use epoch seconds; the UI wants milliseconds. */
function secondsToMillis(value: unknown): number | null {
  const seconds = num(value);
  return seconds === null ? null : Math.round(seconds * 1000);
}

/**
 * `content` is either a string or a list of parts. `inline_images=false` turns
 * image parts into `[image]`, so joining text parts keeps the transcript honest
 * without downloading attachments.
 */
export function extractMessageText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  const parts = asArray(content);
  if (parts === null) {
    return '';
  }
  const texts: string[] = [];
  for (const part of parts) {
    if (typeof part === 'string') {
      texts.push(part);
      continue;
    }
    const record = asRecord(part);
    const text = record === null ? '' : str(record['text']);
    if (text !== '') {
      texts.push(text);
    }
  }
  return texts.join('\n').trim();
}

/** Maps one `profiles.list` row; unknown/older payloads degrade to a readable row. */
export function mapProfileRow(value: unknown): RemoteBot | null {
  const row = asRecord(value);
  const profileName = str(row?.['name']);
  if (row === null || profileName === '') {
    return null;
  }
  const canonical = asRecord(row['canonical_session']);
  const lastSession = asRecord(row['last_session']);
  const workerSession = asRecord(row['worker_session']);
  const previewSource =
    str(canonical?.['preview']) || str(lastSession?.['preview']) || str(workerSession?.['preview']);
  const lastActiveCandidates = [
    secondsToMillis(canonical?.['last_active']),
    secondsToMillis(lastSession?.['last_active']),
    secondsToMillis(workerSession?.['last_active']),
  ].filter((value): value is number => value !== null);
  const displayName = str(row['display_name']) || profileName;
  return {
    profileName,
    displayName,
    description: str(row['description']),
    model: str(row['model']),
    provider: str(row['provider']),
    isDefault: row['is_default'] === true,
    summary: previewSource || str(row['description']),
    canonicalSessionId: str(canonical?.['id']) || null,
    lastActiveAt: lastActiveCandidates.length === 0 ? null : Math.max(...lastActiveCandidates),
    messageCount: num(canonical?.['message_count']) ?? num(lastSession?.['message_count']) ?? 0,
  };
}

/** Maps one stored message row; tool/system rows are skipped for the read-only transcript. */
export function mapMessageRow(value: unknown): RemoteMessage | null {
  const row = asRecord(value);
  if (row === null) {
    return null;
  }
  const role = str(row['role']);
  if (role !== 'user' && role !== 'assistant') {
    return null;
  }
  const text = extractMessageText(row['content']);
  if (text === '') {
    return null;
  }
  const id = str(row['id']);
  return {
    id: id === '' ? `${role}-${str(row['session_id'])}` : id,
    role: role === 'user' ? 'user' : 'bot',
    text,
    at: secondsToMillis(row['timestamp']) ?? 0,
  };
}

function connectionError(): Result<never> {
  return {
    ok: false,
    error: protocolError('unauthorized', 'Sign in to the Dashboard first.'),
  };
}

/** Roster for the connected Dashboard via `profiles.list {include_sessions:true}`. */
export async function listRemoteBots(deps: BotsDeps): Promise<Result<RemoteBot[]>> {
  const target = deps.auth.target();
  if (target === null || !deps.auth.current().connected) {
    return connectionError();
  }
  const connection = await connectGateway({
    fetchImpl: deps.fetchImpl,
    target,
    getAccessToken: () => deps.auth.accessToken(),
    requestTimeoutMs: deps.requestTimeoutMs ?? ROSTER_RPC_TIMEOUT_MS,
  });
  if (!connection.ok) {
    return connection;
  }
  const client = connection.data;
  try {
    const result = await client.call('profiles.list', { include_sessions: true }, emptySchema);
    if (!result.ok) {
      return result;
    }
    const profiles = asArray(asRecord(result.data)?.['profiles']) ?? [];
    const bots = profiles
      .map((row) => mapProfileRow(row))
      .filter((bot): bot is RemoteBot => bot !== null);
    return { ok: true, data: bots };
  } finally {
    client.close();
  }
}

/** Exact Bot Chat lookup plus its latest message page. */
export async function openRemoteChat(
  deps: BotsDeps,
  profileName: string,
): Promise<Result<RemoteChat>> {
  const target = deps.auth.target();
  if (target === null || !deps.auth.current().connected) {
    return connectionError();
  }
  const profile = profileName.trim();
  if (profile === '' || profile.length > 128) {
    return {
      ok: false,
      error: protocolError('invalid_url', 'A profile name is required to open a chat.'),
    };
  }
  const connection = await connectGateway({
    fetchImpl: deps.fetchImpl,
    target,
    getAccessToken: () => deps.auth.accessToken(),
    requestTimeoutMs: deps.requestTimeoutMs ?? ROSTER_RPC_TIMEOUT_MS,
  });
  if (!connection.ok) {
    return connection;
  }
  const client = connection.data;
  let storedSessionId: string | null = null;
  try {
    const lookup = await client.call(
      'session.list',
      { profile, title: 'Bot Chat', include_hidden: true },
      emptySchema,
    );
    if (!lookup.ok) {
      return lookup;
    }
    const sessions = asArray(asRecord(lookup.data)?.['sessions']) ?? [];
    const first = asRecord(sessions[0]);
    storedSessionId = str(first?.['resolved_id']) || str(first?.['id']) || null;
  } finally {
    client.close();
  }

  if (storedSessionId === null) {
    return {
      ok: true,
      data: { profileName: profile, storedSessionId: null, messages: [], hasMore: false },
    };
  }

  const history = await requestJson(
    {
      fetchImpl: deps.fetchImpl,
      target,
      ...(deps.requestTimeoutMs === undefined ? {} : { timeoutMs: deps.requestTimeoutMs }),
      getAccessToken: () => deps.auth.accessToken(),
    },
    {
      method: 'GET',
      path: `/api/sessions/${encodeURIComponent(storedSessionId)}/messages?profile=${encodeURIComponent(profile)}&limit=${HISTORY_LIMIT}&order=latest&inline_images=false`,
      authenticated: true,
      schema: emptySchema,
    },
  );
  if (!history.ok) {
    return history;
  }
  const payload = asRecord(history.data);
  const rows = asArray(payload?.['messages']) ?? [];
  const messages = rows
    .map((row) => mapMessageRow(row))
    .filter((message): message is RemoteMessage => message !== null);
  const returned = num(asRecord(payload?.['pagination'])?.['returned']) ?? messages.length;
  return {
    ok: true,
    data: {
      profileName: profile,
      storedSessionId,
      messages,
      hasMore: returned >= HISTORY_LIMIT,
    },
  };
}
