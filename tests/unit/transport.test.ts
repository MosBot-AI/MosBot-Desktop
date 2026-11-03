import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { requestJson, type TransportFetch } from '../../src/main/dashboard/transport';
import { parseDashboardTarget } from '../../src/shared/protocol';

const target = parseDashboardTarget('https://hermes.example.com/hermes');
const payloadSchema = z.object({ value: z.number() });

interface Reply {
  status: number;
  body: string;
  loopForever?: boolean;
}

function fakeFetch(
  reply: Reply | ((url: string, init: { signal: AbortSignal }) => Reply),
): TransportFetch {
  return async (url, init) => {
    const resolved = typeof reply === 'function' ? reply(url, init) : reply;
    if (resolved.loopForever === true) {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    }
    return {
      ok: resolved.status >= 200 && resolved.status < 300,
      status: resolved.status,
      statusText: String(resolved.status),
      text: async () => resolved.body,
    };
  };
}

describe('dashboard REST transport', () => {
  it('resolves prefixed paths, sends bearer auth and validates the payload', async () => {
    const calls: Array<{ url: string; init: { method: string; headers: Record<string, string> } }> =
      [];
    const transport: TransportFetch = async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({ value: 7 }),
      };
    };
    const result = await requestJson(
      { fetchImpl: transport, target, getAccessToken: () => 'token-1' },
      { method: 'GET', path: '/api/auth/me', authenticated: true, schema: payloadSchema },
    );
    expect(result).toEqual({ ok: true, data: { value: 7 } });
    expect(calls[0]?.url).toBe('https://hermes.example.com/hermes/api/auth/me');
    expect(calls[0]?.init.headers['authorization']).toBe('Bearer token-1');
    expect(calls[0]?.init.method).toBe('GET');
  });

  it('refuses authenticated calls without a token', async () => {
    const result = await requestJson(
      { fetchImpl: fakeFetch({ status: 200, body: '{"value":1}' }), target },
      { method: 'GET', path: '/api/auth/me', authenticated: true, schema: payloadSchema },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unauthorized');
    }
  });

  it('classifies status codes', async () => {
    const unauthorized = await requestJson(
      { fetchImpl: fakeFetch({ status: 401, body: '{}' }), target },
      { method: 'GET', path: '/api/auth/me', schema: payloadSchema },
    );
    expect(unauthorized.ok ? '' : unauthorized.error.code).toBe('session_expired');

    const serverError = await requestJson(
      { fetchImpl: fakeFetch({ status: 503, body: '{}' }), target },
      { method: 'GET', path: '/api/status', schema: payloadSchema },
    );
    expect(serverError.ok ? '' : serverError.error.code).toBe('http_error');
    expect(serverError.ok ? false : serverError.error.retriable).toBe(true);
  });

  it('classifies network failure, timeout and malformed payloads', async () => {
    const unreachable = await requestJson(
      {
        fetchImpl: async () => {
          throw new TypeError('network down');
        },
        target,
      },
      { method: 'GET', path: '/api/health', schema: payloadSchema },
    );
    expect(unreachable.ok ? '' : unreachable.error.code).toBe('unreachable');

    const timedOut = await requestJson(
      { fetchImpl: fakeFetch({ status: 200, body: '', loopForever: true }), target, timeoutMs: 20 },
      { method: 'GET', path: '/api/health', schema: payloadSchema },
    );
    expect(timedOut.ok ? '' : timedOut.error.code).toBe('timeout');

    const notJson = await requestJson(
      { fetchImpl: fakeFetch({ status: 200, body: 'not json' }), target },
      { method: 'GET', path: '/api/health', schema: payloadSchema },
    );
    expect(notJson.ok ? '' : notJson.error.code).toBe('malformed_response');

    const wrongShape = await requestJson(
      { fetchImpl: fakeFetch({ status: 200, body: '{"value":"seven"}' }), target },
      { method: 'GET', path: '/api/health', schema: payloadSchema },
    );
    expect(wrongShape.ok ? '' : wrongShape.error.code).toBe('malformed_response');
  });

  it('never follows redirects and caps the response size', async () => {
    let redirect: string | undefined;
    const transport: TransportFetch = async (_url, init) => {
      redirect = init.redirect;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({ value: 1 }),
      };
    };
    await requestJson(
      { fetchImpl: transport, target },
      {
        method: 'GET',
        path: '/api/health',
        schema: payloadSchema,
      },
    );
    expect(redirect).toBe('manual');

    const tooLarge = await requestJson(
      { fetchImpl: fakeFetch({ status: 200, body: 'x'.repeat(64) }), target, maxBytes: 10 },
      { method: 'GET', path: '/api/health', schema: payloadSchema },
    );
    expect(tooLarge.ok ? '' : tooLarge.error.code).toBe('malformed_response');
  });
});
