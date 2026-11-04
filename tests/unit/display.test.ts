import { describe, expect, it } from 'vitest';
import type { AuthManager } from '../../src/main/dashboard/auth';
import {
  readDisplayStatus,
  readDisplayThumbnail,
  startDisplay,
  type DisplayDeps,
} from '../../src/main/dashboard/display';
import type { RpcClient } from '../../src/main/dashboard/rpc';

const fakeAuth = {
  target: () => ({
    origin: 'https://hermes.example.com',
    basePath: '',
    displayUrl: 'https://hermes.example.com',
  }),
  current: () => ({
    connected: true,
    displayUrl: 'https://hermes.example.com',
    userId: 'user-1',
    displayName: 'Charley',
    provider: 'basic',
    expiresAt: 0,
  }),
  accessToken: () => 'token',
} as unknown as AuthManager;

interface Schema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

function makeDeps(): {
  deps: DisplayDeps;
  calls: Array<{ method: string; params: Record<string, unknown> }>;
} {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const client: RpcClient = {
    ready: { replayEpoch: 'epoch', changeEvents: true, heartbeat: true, payloadKeys: [] },
    call: async <T>(method: string, params: Record<string, unknown>, schema: Schema<T>) => {
      calls.push({ method, params });
      const parsed = schema.safeParse({});
      return parsed.success
        ? { ok: true as const, data: parsed.data }
        : {
            ok: false as const,
            error: { code: 'malformed_response' as const, message: 'shape', retriable: false },
          };
    },
    waitForEvent: async () => ({
      ok: false,
      error: { code: 'timeout', message: 'no event', retriable: false },
    }),
    respond: () => undefined,
    close: () => undefined,
  };
  return {
    calls,
    deps: {
      auth: fakeAuth,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '{"ticket":"t","ttl_seconds":30}',
      }),
      connect: async () => ({ ok: true, data: client }),
    },
  };
}

describe('display profile routing', () => {
  it('passes the explicit profile to status/thumbnail/start', async () => {
    const { deps, calls } = makeDeps();
    await readDisplayStatus(deps, 'bot-b');
    await readDisplayThumbnail(deps, 'bot-b');
    await startDisplay(deps, 'bot-b');
    expect(calls.map((entry) => entry.method)).toEqual([
      'display.status',
      'display.thumbnail',
      'display.start',
    ]);
    for (const call of calls) {
      expect(call.params).toEqual({ profile: 'bot-b' });
    }
  });

  it('omits the profile when the caller does not name one', async () => {
    const { deps, calls } = makeDeps();
    await readDisplayStatus(deps);
    await readDisplayThumbnail(deps);
    await startDisplay(deps);
    for (const call of calls) {
      expect(call.params).toEqual({});
    }
  });
});
