import type { ZodType } from 'zod';
import {
  protocolError,
  targetUrl,
  type DashboardTarget,
  type Failure,
  type Result,
} from '../../shared/protocol';

/** The subset of `session.fetch` this transport needs (fakeable in tests). */
export interface TransportFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  text(): Promise<string>;
}

export type TransportFetch = (
  url: string,
  init: {
    readonly method: string;
    readonly headers: Record<string, string>;
    readonly body?: string;
    readonly redirect: 'manual';
    readonly signal: AbortSignal;
  },
) => Promise<TransportFetchResponse>;

export interface TransportOptions {
  readonly fetchImpl: TransportFetch;
  readonly target: DashboardTarget;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
  /** Bearer token for authenticated calls; read per request so refresh applies. */
  readonly getAccessToken?: () => string | null;
}

export interface JsonRequest<T> {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly body?: unknown;
  readonly authenticated?: boolean;
  readonly schema: ZodType<T>;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;

function failure<T>(result: Failure<unknown>): Failure<T> {
  return result as Failure<T>;
}

/**
 * A small JSON-fetch layer for the Dashboard REST API: explicit timeouts,
 * manual redirects (never follow an auth redirect to an unknown origin),
 * bounded response size, bearer auth and zod validation of every payload.
 */
export async function requestJson<T>(
  options: TransportOptions,
  request: JsonRequest<T>,
): Promise<Result<T>> {
  const url = targetUrl(options.target, request.path);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const headers: Record<string, string> = { accept: 'application/json' };
  if (request.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (request.authenticated === true) {
    const token = options.getAccessToken?.() ?? null;
    if (token === null) {
      clearTimeout(timer);
      return {
        ok: false,
        error: protocolError('unauthorized', 'Not signed in to this Dashboard.'),
      } as Failure<T>;
    }
    headers['authorization'] = `Bearer ${token}`;
  }

  let response: TransportFetchResponse;
  try {
    response = await options.fetchImpl(url, {
      method: request.method,
      headers,
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      redirect: 'manual',
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    if (controller.signal.aborted) {
      return {
        ok: false,
        error: protocolError('timeout', `The Dashboard did not answer within ${timeoutMs} ms.`, {
          retriable: true,
        }),
      } as Failure<T>;
    }
    return {
      ok: false,
      error: protocolError(
        'unreachable',
        `Could not reach the Dashboard: ${error instanceof Error ? error.message : 'network error'}.`,
        { retriable: true },
      ),
    } as Failure<T>;
  } finally {
    clearTimeout(timer);
  }

  let text: string;
  try {
    text = await response.text();
  } catch {
    return {
      ok: false,
      error: protocolError('malformed_response', 'The Dashboard response could not be read.'),
    } as Failure<T>;
  }

  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    return {
      ok: false,
      error: protocolError('malformed_response', 'The Dashboard response was unexpectedly large.'),
    } as Failure<T>;
  }

  if (!response.ok) {
    const status = response.status;
    const sessionExpired = status === 401 || status === 403;
    const code = sessionExpired
      ? status === 401
        ? 'session_expired'
        : 'unauthorized'
      : status >= 500
        ? 'http_error'
        : 'http_error';
    return {
      ok: false,
      error: protocolError(code, `${request.method} ${request.path} returned ${status}.`, {
        retriable: status >= 500 || status === 429,
        httpStatus: status,
      }),
    } as Failure<T>;
  }

  let payload: unknown;
  try {
    payload = text === '' ? null : (JSON.parse(text) as unknown);
  } catch {
    return failure({
      ok: false,
      error: protocolError('malformed_response', `${request.path} did not return JSON.`),
    });
  }

  const parsed = request.schema.safeParse(payload);
  if (!parsed.success) {
    return failure({
      ok: false,
      error: protocolError(
        'malformed_response',
        `${request.path} returned a payload this build does not understand.`,
      ),
    });
  }
  return { ok: true, data: parsed.data };
}
