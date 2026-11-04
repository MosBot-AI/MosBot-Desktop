import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPendingWatcher } from '../../src/main/dashboard/pending';
import type { RpcClient } from '../../src/main/dashboard/rpc';
import type { AuthManager } from '../../src/main/dashboard/auth';
import type { DashboardPendingEvent } from '../../src/shared/protocol';
import type { ZodType } from 'zod';

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

interface FakeState {
  waiting: boolean;
}

function createFakeGateway(state: FakeState): RpcClient {
  const payloadFor = (method: string): unknown => {
    if (method === 'profiles.list') {
      return {
        profiles: [
          {
            name: 'project-bot',
            display_name: 'Project Bot',
            canonical_session: { id: 'stored-1' },
          },
        ],
      };
    }
    if (method === 'session.active_list') {
      return {
        sessions: [
          {
            id: 'runtime-1',
            session_key: 'stored-1',
            status: state.waiting ? 'waiting' : 'idle',
          },
        ],
      };
    }
    if (method === 'session.activate') {
      return {
        session_id: 'runtime-1',
        open_requests: [
          {
            id: 'srq-1',
            method: 'approval',
            params: { description: 'Run a command', choices: ['once', 'deny'] },
          },
        ],
      };
    }
    return {};
  };
  return {
    ready: { replayEpoch: 'epoch', changeEvents: true, heartbeat: true, payloadKeys: [] },
    call: async <T>(method: string, _params: Record<string, unknown>, schema: ZodType<T>) => {
      const parsed = schema.safeParse(payloadFor(method));
      return parsed.success
        ? ({ ok: true as const, data: parsed.data } as const)
        : ({
            ok: false as const,
            error: { code: 'malformed_response', message: 'shape', retriable: false },
          } as const);
    },
    waitForEvent: async () => ({
      ok: false,
      error: { code: 'timeout', message: 'none', retriable: false },
    }),
    respond: () => undefined,
    close: () => undefined,
  };
}

describe('pending request watcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('discovers waiting Bot Chats, notifies once and removes settled requests', async () => {
    const state: FakeState = { waiting: true };
    const events: DashboardPendingEvent[] = [];
    const notifications: string[] = [];
    const watcher = createPendingWatcher({
      auth: fakeAuth,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '{"ticket":"t","ttl_seconds":30}',
      }),
      notify: (notification) => {
        notifications.push(notification.requestId);
      },
      onEvent: (event) => {
        events.push(event);
      },
      connect: async () => ({ ok: true, data: createFakeGateway(state) }),
    });

    watcher.start();
    await vi.advanceTimersByTimeAsync(0);
    for (let index = 0; index < 10; index += 1) {
      await Promise.resolve();
    }

    expect(events).toContainEqual({
      type: 'add',
      requestId: 'srq-1',
      profile: 'project-bot',
      method: 'approval',
      title: 'Run a command',
    });
    expect(notifications).toEqual(['srq-1']);

    state.waiting = false;
    await vi.advanceTimersByTimeAsync(5_000);
    for (let index = 0; index < 10; index += 1) {
      await Promise.resolve();
    }
    expect(events).toContainEqual({ type: 'remove', requestId: 'srq-1' });

    watcher.stop();
  });

  it('does nothing while signed out', async () => {
    const events: DashboardPendingEvent[] = [];
    const watcher = createPendingWatcher({
      auth: {
        target: () => null,
        current: () => ({ connected: false }),
        accessToken: () => null,
      } as unknown as AuthManager,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '{}',
      }),
      notify: () => undefined,
      onEvent: (event) => {
        events.push(event);
      },
      connect: async () => {
        throw new Error('should not connect while signed out');
      },
    });
    watcher.start();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(events).toHaveLength(0);
    watcher.stop();
  });
});
