import { describe, expect, it, vi } from 'vitest';
import { createChatManager } from '../../src/main/dashboard/chat';
import type { GatewayOptions, RpcClient } from '../../src/main/dashboard/rpc';
import type { AuthManager } from '../../src/main/dashboard/auth';
import type { Result } from '../../src/shared/protocol';
import { createFixtureSeed } from '../../src/renderer/app/fixtures';
import {
  chatEventAction,
  createInitialState,
  reduceAppState,
  selectChatMessages,
  type AppState,
} from '../../src/renderer/app/store';

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

interface FakeGateway {
  readonly client: RpcClient;
  readonly calls: Array<{ method: string; params: Record<string, unknown> }>;
  readonly responses: Array<{ id: string; result: Record<string, unknown> }>;
  emit(type: string, payload: Record<string, unknown>, seq?: number): void;
  request(id: string, method: string, params: Record<string, unknown>): void;
  closeSocket(): void;
  /** Controls what the next `session.resume` reports as still-open requests. */
  setOpenRequests(requests: readonly Record<string, unknown>[]): void;
}

interface FakeReplay {
  readonly events: readonly Record<string, unknown>[];
  readonly openRequests?: readonly Record<string, unknown>[];
  readonly truncated?: boolean;
}

function createFakeGateway(options: GatewayOptions, replay?: FakeReplay): FakeGateway {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const responses: Array<{ id: string; result: Record<string, unknown> }> = [];
  let openRequests = replay?.openRequests;

  const payloadFor = (method: string): unknown => {
    if (method === 'session.create') {
      return { session_id: 'runtime-1', stored_session_id: 'stored-1' };
    }
    if (method === 'session.resume') {
      return {
        session_id: 'runtime-1',
        session_key: 'stored-1',
        ...(openRequests === undefined ? {} : { open_requests: openRequests }),
      };
    }
    if (method === 'session.list') {
      return { sessions: [] };
    }
    if (method === 'groups.list') {
      return {
        rooms: [
          {
            room_id: 'room-1',
            name: 'Design room',
            members: [{ id: 'member-1' }, { id: 'member-2' }],
            updated_at: 123,
            latest_seq: 9,
          },
        ],
        next_offset: null,
      };
    }
    if (method === 'groups.state') {
      return {
        room: {
          room_id: 'room-1',
          name: 'Design room',
          members: [{ id: 'member-1' }, { id: 'member-2' }],
          updated_at: 123,
          latest_seq: 9,
          authority_epoch: 3,
        },
        driver_status: 'running',
      };
    }
    if (method === 'groups.log') {
      return {
        events: [{ seq: 1, kind: 'room.created', created_at: 100 }],
        cursor: 1,
        latest_seq: 9,
        has_more: true,
      };
    }
    if (method === 'session.events.since' && replay !== undefined) {
      return {
        events: replay.events,
        latest_seq: 4,
        truncated: replay.truncated === true,
        epoch: 'epoch',
        open_requests: replay.openRequests ?? [],
      };
    }
    return {};
  };

  const call = async <T>(
    method: string,
    params: Record<string, unknown>,
    schema: Schema<T>,
  ): Promise<Result<T>> => {
    calls.push({ method, params });
    const parsed = schema.safeParse(payloadFor(method));
    return parsed.success
      ? { ok: true, data: parsed.data }
      : {
          ok: false,
          error: { code: 'malformed_response', message: 'shape', retriable: false },
        };
  };

  const client: RpcClient = {
    ready: {
      replayEpoch: 'epoch',
      changeEvents: true,
      heartbeat: true,
      payloadKeys: [],
    },
    call,
    waitForEvent: async () => ({
      ok: false,
      error: { code: 'timeout', message: 'no event', retriable: false },
    }),
    respond: (id, result) => {
      responses.push({ id, result });
    },
    close: () => undefined,
  };

  return {
    client,
    calls,
    responses,
    emit(type, payload, seq) {
      options.onEvent?.(type, {
        payload,
        ...(seq === undefined ? {} : { seq, session_id: 'runtime-1' }),
      });
    },
    request(id, method, params) {
      options.onRequest?.({ id, method, params });
    },
    closeSocket() {
      options.onClose?.(1006, 'test-close');
    },
    setOpenRequests(requests) {
      openRequests = requests;
    },
  };
}

describe('chat manager', () => {
  it('opens a fresh Bot Chat, claims the title and sends prompts through the live session', async () => {
    const captured: { gateway: FakeGateway | null } = { gateway: null };
    const manager = createChatManager({
      auth: fakeAuth,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '{"ticket":"t","ttl_seconds":30}',
      }),
      connect: async (options) => {
        captured.gateway = createFakeGateway(options);
        return { ok: true, data: captured.gateway.client };
      },
    });
    const events: string[] = [];
    manager.subscribe((event) => {
      events.push(event.type);
    });

    const opened = await manager.open('project-bot', null);
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }
    expect(opened.data.runtimeSessionId).toBe('runtime-1');
    expect(opened.data.storedSessionId).toBe('stored-1');
    const methods = captured.gateway?.calls.map((entry) => entry.method) ?? [];
    expect(methods).toContain('session.create');
    expect(methods).toContain('session.title');

    await manager.send('hello');
    const submit = captured.gateway?.calls.find((entry) => entry.method === 'prompt.submit');
    expect(submit?.params).toMatchObject({ session_id: 'runtime-1', text: 'hello' });

    await manager.stop();
    expect(captured.gateway?.calls.some((entry) => entry.method === 'session.interrupt')).toBe(
      true,
    );
    expect(events).toContain('connection');
    expect(events).toContain('session');
  });

  it('resumes a stored session and relays stream events plus server requests', async () => {
    const captured: { gateway: FakeGateway | null } = { gateway: null };
    const manager = createChatManager({
      auth: fakeAuth,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '{"ticket":"t","ttl_seconds":30}',
      }),
      connect: async (options) => {
        captured.gateway = createFakeGateway(options);
        return { ok: true, data: captured.gateway.client };
      },
    });
    const received: unknown[] = [];
    manager.subscribe((event) => {
      received.push(event);
    });
    const opened = await manager.open('project-bot', 'stored-1');
    expect(opened.ok).toBe(true);
    const resume = captured.gateway?.calls.find((entry) => entry.method === 'session.resume');
    expect(resume?.params).toMatchObject({ session_id: 'stored-1' });

    captured.gateway?.emit('message.start', {});
    captured.gateway?.emit('message.delta', { text: 'Hel' });
    captured.gateway?.emit('message.delta', { text: '' });
    captured.gateway?.emit('message.complete', { status: 'complete', text: 'Hello' });
    captured.gateway?.emit('error', { message: 'boom' });
    expect(received).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'turn-start' }),
        expect.objectContaining({ type: 'delta', text: 'Hel' }),
        expect.objectContaining({ type: 'turn-complete', status: 'complete', text: 'Hello' }),
        expect.objectContaining({ type: 'error', message: 'boom' }),
      ]),
    );

    captured.gateway?.request('srq-1', 'approval', { choices: ['once', 'deny'], command: 'ls' });
    captured.gateway?.request('srq-2', 'tour', {});
    expect(received).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'request',
          request: expect.objectContaining({ id: 'srq-1', method: 'approval' }),
        }),
      ]),
    );
    // Unknown prompt kinds are declined so the agent is never parked.
    expect(captured.gateway?.responses).toEqual([{ id: 'srq-2', result: { value: '' } }]);

    await manager.answer('srq-1', { choice: 'once' });
    expect(captured.gateway?.responses).toContainEqual({ id: 'srq-1', result: { choice: 'once' } });
  });

  it('reconciles a request answered in another window through session.resume', async () => {
    vi.useFakeTimers();
    try {
      const captured: { gateway: FakeGateway | null } = { gateway: null };
      const manager = createChatManager({
        auth: fakeAuth,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => '{"ticket":"t","ttl_seconds":30}',
        }),
        connect: async (options) => {
          captured.gateway = createFakeGateway(options);
          return { ok: true, data: captured.gateway.client };
        },
      });
      const received: Array<{ type?: string; requestId?: string; reason?: string }> = [];
      manager.subscribe((event) => {
        received.push(event as { type?: string; requestId?: string; reason?: string });
      });
      await manager.open('project-bot', 'stored-1');
      captured.gateway?.request('srq-remote', 'approval', {
        choices: ['deny'],
        command: 'chmod 777 x',
      });
      // Another client answered it: the request disappears from open_requests.
      captured.gateway?.setOpenRequests([]);
      await vi.advanceTimersByTimeAsync(5_100);
      expect(received).toContainEqual(
        expect.objectContaining({
          type: 'request-cancel',
          requestId: 'srq-remote',
          reason: 'resolved-elsewhere',
        }),
      );
      manager.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps pending requests when the gateway omits open_requests', async () => {
    vi.useFakeTimers();
    try {
      const captured: { gateway: FakeGateway | null } = { gateway: null };
      const manager = createChatManager({
        auth: fakeAuth,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => '{"ticket":"t","ttl_seconds":30}',
        }),
        connect: async (options) => {
          captured.gateway = createFakeGateway(options);
          return { ok: true, data: captured.gateway.client };
        },
      });
      const cancelled: string[] = [];
      manager.subscribe((event) => {
        if (event.type === 'request-cancel') {
          cancelled.push(event.requestId);
        }
      });
      await manager.open('project-bot', 'stored-1');
      captured.gateway?.request('srq-open', 'approval', { choices: ['deny'], command: 'ls' });
      // No setOpenRequests(): session.resume omits the field entirely.
      await vi.advanceTimersByTimeAsync(5_100);
      expect(cancelled).not.toContain('srq-open');
      manager.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not fold a request answered in this window into a remote receipt', async () => {
    vi.useFakeTimers();
    try {
      const captured: { gateway: FakeGateway | null } = { gateway: null };
      const manager = createChatManager({
        auth: fakeAuth,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => '{"ticket":"t","ttl_seconds":30}',
        }),
        connect: async (options) => {
          captured.gateway = createFakeGateway(options);
          return { ok: true, data: captured.gateway.client };
        },
      });
      const cancelled: string[] = [];
      manager.subscribe((event) => {
        if (event.type === 'request-cancel') {
          cancelled.push(event.requestId);
        }
      });
      await manager.open('project-bot', 'stored-1');
      captured.gateway?.request('srq-local', 'approval', { choices: ['deny'], command: 'ls' });
      await manager.answer('srq-local', { choice: 'deny' });
      captured.gateway?.setOpenRequests([]);
      await vi.advanceTimersByTimeAsync(5_100);
      expect(cancelled).not.toContain('srq-local');
      manager.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-emits connection, session and open requests when the same chat is reopened', async () => {
    const captured: { gateway: FakeGateway | null } = { gateway: null };
    const manager = createChatManager({
      auth: fakeAuth,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '{"ticket":"t","ttl_seconds":30}',
      }),
      connect: async (options) => {
        captured.gateway = createFakeGateway(options, {
          events: [],
          openRequests: [
            { id: 'srq-reopen', method: 'approval', params: { choices: ['once', 'deny'] } },
          ],
        });
        return { ok: true, data: captured.gateway.client };
      },
    });
    const received: Array<{ type: string; state?: string }> = [];
    manager.subscribe((event) => {
      received.push(event as { type: string; state?: string });
    });

    expect((await manager.open('project-bot', 'stored-1')).ok).toBe(true);
    received.length = 0;
    // A renderer reload/window reopen calls open() again while main stays connected.
    expect((await manager.open('project-bot', 'stored-1')).ok).toBe(true);
    expect(
      received.some((event) => event.type === 'connection' && event.state === 'connected'),
    ).toBe(true);
    expect(received.some((event) => event.type === 'session')).toBe(true);
    expect(
      received.some(
        (event) =>
          event.type === 'request' &&
          (event as { request?: { id?: string } }).request?.id === 'srq-reopen',
      ),
    ).toBe(true);
    manager.close();
  });

  it('does not replay the previous session cursor after switching Bots', async () => {
    const gateways: FakeGateway[] = [];
    const manager = createChatManager({
      auth: fakeAuth,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '{"ticket":"t","ttl_seconds":30}',
      }),
      connect: async (options) => {
        const gateway = createFakeGateway(
          options,
          gateways.length === 1 ? { events: [], truncated: true } : undefined,
        );
        gateways.push(gateway);
        return { ok: true, data: gateway.client };
      },
    });
    const received: Array<{ type: string; reason?: string }> = [];
    manager.subscribe((event) => {
      received.push(event as { type: string; reason?: string });
    });

    expect((await manager.open('bot-a', 'stored-a')).ok).toBe(true);
    gateways[0]?.emit('message.delta', { text: 'one' }, 7);
    await new Promise((resolve) => setTimeout(resolve, 40));

    // The second session has a truncated replay ring; using the old cursor would
    // emit history-stale and wipe freshly re-delivered requests.
    expect((await manager.open('bot-b', 'stored-b')).ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(received.some((event) => event.type === 'history-stale')).toBe(false);
    expect(gateways[1]?.calls.some((call) => call.method === 'session.events.since')).toBe(false);
    manager.close();
  });

  it('replays missed events and re-delivers open requests after a reconnect', async () => {
    const gateways: FakeGateway[] = [];
    const manager = createChatManager({
      auth: fakeAuth,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '{"ticket":"t","ttl_seconds":30}',
      }),
      connect: async (options) => {
        const gateway = createFakeGateway(
          options,
          gateways.length === 1
            ? {
                events: [
                  {
                    type: 'message.delta',
                    session_id: 'runtime-1',
                    payload: { text: 'missed' },
                    seq: 3,
                  },
                ],
                openRequests: [
                  {
                    id: 'srq-9',
                    method: 'approval',
                    params: { choices: ['once', 'deny'] },
                  },
                ],
              }
            : undefined,
        );
        gateways.push(gateway);
        return { ok: true, data: gateway.client };
      },
    });
    const received: Array<{ type: string; [key: string]: unknown }> = [];
    manager.subscribe((event) => {
      received.push(event as { type: string });
    });

    const opened = await manager.open('project-bot', 'stored-1');
    expect(opened.ok).toBe(true);
    gateways[0]?.emit('message.delta', { text: 'first' }, 1);
    // Deltas are coalesced in a 16–32 ms window, so wait for the batch boundary.
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(received.filter((event) => event.type === 'delta')).toHaveLength(1);

    gateways[0]?.closeSocket();
    await new Promise((resolve) => setTimeout(resolve, 1_300));
    expect(gateways).toHaveLength(2);
    await new Promise((resolve) => setTimeout(resolve, 40));
    const deltas = received.filter(
      (event) => event.type === 'delta' && (event as { text?: string }).text === 'missed',
    );
    expect(deltas).toHaveLength(1);
    expect(
      received.some(
        (event) =>
          event.type === 'request' &&
          (event as { request?: { id?: string } }).request?.id === 'srq-9',
      ),
    ).toBe(true);

    // A replayed sequence is never applied twice.
    gateways[1]?.emit('message.delta', { text: 'missed' }, 3);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(
      received.filter(
        (event) => event.type === 'delta' && (event as { text?: string }).text === 'missed',
      ),
    ).toHaveLength(1);
    manager.close();
  });

  it('coalesces streamed deltas into ordered batches and flushes before control events', async () => {
    const captured: { gateway: FakeGateway | null } = { gateway: null };
    const manager = createChatManager({
      auth: fakeAuth,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '{"ticket":"t","ttl_seconds":30}',
      }),
      connect: async (options) => {
        captured.gateway = createFakeGateway(options);
        return { ok: true, data: captured.gateway.client };
      },
    });
    const received: Array<{ type: string; text?: string }> = [];
    manager.subscribe((event) => {
      received.push(event as { type: string; text?: string });
    });

    const opened = await manager.open('project-bot', 'stored-1');
    expect(opened.ok).toBe(true);

    captured.gateway?.emit('message.delta', { text: 'a' });
    captured.gateway?.emit('message.delta', { text: 'b' });
    captured.gateway?.emit('message.delta', { text: 'c' });
    await new Promise((resolve) => setTimeout(resolve, 40));
    const batches = received.filter((event) => event.type === 'delta');
    expect(batches.map((event) => event.text)).toEqual(['abc']);

    // A terminal frame arrives between two batches: the pending text is delivered
    // first so the transcript can never finish before its own content.
    captured.gateway?.emit('message.delta', { text: 'd' });
    captured.gateway?.emit('message.complete', { status: 'complete', text: 'abcd' });
    const tail = received.slice(-2).map((event) => event.type);
    expect(tail).toEqual(['delta', 'turn-complete']);
    expect(received.filter((event) => event.type === 'delta').map((event) => event.text)).toEqual([
      'abc',
      'd',
    ]);
    manager.close();
  });

  it('drops a pending batch when the session switches and tags deltas with the profile', async () => {
    const gateways: FakeGateway[] = [];
    const manager = createChatManager({
      auth: fakeAuth,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '{"ticket":"t","ttl_seconds":30}',
      }),
      connect: async (options) => {
        const gateway = createFakeGateway(options);
        gateways.push(gateway);
        return { ok: true, data: gateway.client };
      },
    });
    const received: Array<{ type: string; text?: string; profile?: string }> = [];
    manager.subscribe((event) => {
      received.push(event as { type: string; text?: string; profile?: string });
    });

    expect((await manager.open('bot-a', 'stored-a')).ok).toBe(true);
    gateways[0]?.emit('message.delta', { text: 'leak' });
    // Switch while the batch is still inside the coalescing window.
    expect((await manager.open('bot-b', 'stored-b')).ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(received.filter((event) => event.type === 'delta')).toHaveLength(0);

    gateways[1]?.emit('message.delta', { text: 'ok' });
    await new Promise((resolve) => setTimeout(resolve, 40));
    const deltas = received.filter((event) => event.type === 'delta');
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({ text: 'ok', profile: 'bot-b' });
    manager.close();
  });

  it('flushes pending text when the socket closes and before interim/terminal frames', async () => {
    const captured: { gateway: FakeGateway | null } = { gateway: null };
    const manager = createChatManager({
      auth: fakeAuth,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '{"ticket":"t","ttl_seconds":30}',
      }),
      connect: async (options) => {
        captured.gateway = createFakeGateway(options);
        return { ok: true, data: captured.gateway.client };
      },
    });
    const received: Array<{ type: string; text?: string; state?: string }> = [];
    manager.subscribe((event) => {
      received.push(event as { type: string; text?: string; state?: string });
    });
    expect((await manager.open('project-bot', 'stored-1')).ok).toBe(true);

    captured.gateway?.emit('message.delta', { text: 'before-interim' });
    captured.gateway?.emit('message.interim', { text: 'hint' });
    const types = received.map((event) => event.type);
    expect(types.slice(-2)).toEqual(['delta', 'interim']);
    expect(received.filter((event) => event.type === 'delta')[0]?.text).toBe('before-interim');

    captured.gateway?.emit('message.delta', { text: 'before-close' });
    captured.gateway?.closeSocket();
    const delta = received.filter((event) => event.type === 'delta')[1];
    expect(delta?.text).toBe('before-close');
    expect(
      received.some((event) => event.type === 'connection' && event.state === 'disconnected'),
    ).toBe(true);
    manager.close();
  });
});

function buildState(): AppState {
  return createInitialState(createFixtureSeed(), {
    resolvedTheme: 'light',
    language: 'zh-Hans',
    reduceMotion: false,
  });
}

function remoteState(): AppState {
  let state = buildState();
  state = reduceAppState(state, {
    type: 'remote-ready',
    bots: [
      {
        profileName: 'default',
        displayName: 'Default',
        description: '',
        shape: null,
        color: '',
        metaRevision: 0,
        model: 'm',
        provider: 'p',
        isDefault: true,
        summary: '',
        canonicalSessionId: 'stored-1',
        lastActiveAt: null,
        messageCount: 0,
      },
    ],
  });
  state = reduceAppState(state, {
    type: 'remote-chat',
    chat: {
      profileName: 'default',
      storedSessionId: 'stored-1',
      messages: [],
      hasMore: false,
      nextOffset: 0,
    },
  });
  state = reduceAppState(state, { type: 'live-reset', profile: 'default' });
  return state;
}

describe('live session projection', () => {
  it('updates the cached remote chat when the live session is the canonical one', () => {
    let state = remoteState();
    expect(state.remote.chats['default']?.storedSessionId).toBe('stored-1');
    state = reduceAppState(state, {
      type: 'live-session',
      profile: 'default',
      storedSessionId: 'stored-canonical',
      runtimeSessionId: 'runtime-9',
    });
    expect(state.remote.chats['default']?.storedSessionId).toBe('stored-canonical');
    expect(state.live.storedSessionId).toBe('stored-canonical');
    expect(state.live.runtimeSessionId).toBe('runtime-9');
  });
});

describe('live transcript', () => {
  it('appends the optimistic user bubble and streamed bot text', () => {
    let state = remoteState();
    state = reduceAppState(state, { type: 'live-user', profile: 'default', text: 'hi', at: 1 });
    state = reduceAppState(state, { type: 'live-delta', text: 'Hel' });
    state = reduceAppState(state, { type: 'live-delta', text: 'lo' });
    const messages = selectChatMessages(state, 'default');
    expect(messages.map((message) => (message.kind === 'text' ? message.text : ''))).toEqual([
      'hi',
      'Hello',
    ]);
    expect(messages[0]?.role).toBe('user');
    state = reduceAppState(state, {
      type: 'live-complete',
      status: 'complete',
      text: '',
      error: null,
    });
    expect(state.live.phase).toBe('idle');
  });

  it('groups tool events into one collapsible work record inside the turn', () => {
    let state = remoteState();
    state = reduceAppState(state, { type: 'live-user', profile: 'default', text: 'run it', at: 1 });
    state = reduceAppState(state, { type: 'live-tool', phase: 'start', name: 'shell' });
    state = reduceAppState(state, { type: 'live-delta', text: 'Running' });
    state = reduceAppState(state, { type: 'live-tool', phase: 'complete', name: 'shell' });
    const messages = selectChatMessages(state, 'default');
    expect(messages.map((message) => message.kind)).toEqual(['text', 'work', 'text']);
    const work = messages[1];
    expect(work?.kind).toBe('work');
    if (work?.kind === 'work') {
      expect(work.steps.map((step) => step.label)).toEqual(['shell']);
    }
  });

  it('maps approval requests to cards and folds them into receipts', () => {
    let state = remoteState();
    state = reduceAppState(state, {
      type: 'live-request',
      request: {
        id: 'srq-1',
        method: 'approval',
        payload: {
          choices: ['once', 'session', 'always', 'deny'],
          command: 'ls -la',
          description: 'Run a command',
        },
      },
    });
    let messages = selectChatMessages(state, 'default');
    expect(messages[0]?.kind).toBe('approval');
    if (messages[0]?.kind === 'approval') {
      expect(messages[0].approval.actions.map((action) => action.id)).toEqual([
        'allow',
        'allow-session',
        'allow-always',
        'deny',
      ]);
      expect(messages[0].approval.resolution).toBeNull();
    }
    state = reduceAppState(state, {
      type: 'live-request-resolved',
      requestId: 'srq-1',
      receipt: 'deny',
    });
    messages = selectChatMessages(state, 'default');
    // The answered request folds into a receipt instead of disappearing.
    expect(messages[0]?.kind).toBe('approval');
    if (messages[0]?.kind === 'approval') {
      expect(messages[0].approval.resolution?.action).toBe('deny');
    }
  });

  it('folds a request settled by another window into a handled-elsewhere receipt', () => {
    let state = remoteState();
    state = reduceAppState(state, {
      type: 'live-request',
      request: {
        id: 'srq-remote',
        method: 'approval',
        payload: { choices: ['once', 'session', 'always', 'deny'], command: 'chmod 777 x' },
      },
    });
    state = reduceAppState(state, {
      type: 'live-request-cancel',
      requestId: 'srq-remote',
      reason: 'resolved-elsewhere',
    });
    const messages = selectChatMessages(state, 'default');
    expect(messages).toHaveLength(1);
    expect(messages[0]?.kind).toBe('approval');
    if (messages[0]?.kind === 'approval') {
      expect(messages[0].approval.resolution?.action).toBe('remote');
    }
  });

  it('maps clarify requests with qid-encoded options', () => {
    let state = remoteState();
    state = reduceAppState(state, {
      type: 'live-request',
      request: {
        id: 'srq-2',
        method: 'clarify',
        payload: {
          questions: [
            { qid: 'q1', question: 'Which one?', choices: ['A', 'B'], multi_select: false },
          ],
        },
      },
    });
    const messages = selectChatMessages(state, 'default');
    expect(messages[0]?.kind).toBe('clarify');
    if (messages[0]?.kind === 'clarify') {
      expect(messages[0].clarify.options).toEqual([
        { id: 'q1::A', label: 'A' },
        { id: 'q1::B', label: 'B' },
      ]);
    }
  });

  it('maps main-process events to store actions', () => {
    expect(chatEventAction({ type: 'delta', text: 'x' })).toEqual({
      type: 'live-delta',
      text: 'x',
    });
    expect(chatEventAction({ type: 'connection', state: 'reconnecting' })).toEqual({
      type: 'live-connection',
      state: 'reconnecting',
    });
    expect(
      chatEventAction({ type: 'turn-complete', status: 'interrupted', text: '', error: null }),
    ).toEqual({ type: 'live-complete', status: 'interrupted', text: '', error: null });
    expect(chatEventAction({ type: 'tool', phase: 'start', name: 'shell' })).toEqual({
      type: 'live-tool',
      phase: 'start',
      name: 'shell',
    });
  });
});

describe('chat manager groups', () => {
  it('lists hosted groups through the live gateway', async () => {
    const manager = createChatManager({
      auth: fakeAuth,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '{"ticket":"t","ttl_seconds":30}',
      }),
      connect: async (options) => ({ ok: true, data: createFakeGateway(options).client }),
    });
    const opened = await manager.open('bot-1', null);
    expect(opened.ok).toBe(true);
    const groups = await manager.listGroups();
    expect(groups).toEqual({
      ok: true,
      data: [
        {
          roomId: 'room-1',
          name: 'Design room',
          memberCount: 2,
          updatedAt: 123,
          latestSeq: 9,
        },
      ],
    });
    const state = await manager.groupState('room-1');
    expect(state).toEqual({
      ok: true,
      data: {
        roomId: 'room-1',
        name: 'Design room',
        memberCount: 2,
        latestSeq: 9,
        authorityEpoch: 3,
        updatedAt: 123,
        driverStatus: 'running',
      },
    });
    const log = await manager.groupLog('room-1', 0, 50);
    expect(log).toEqual({
      ok: true,
      data: {
        events: [{ seq: 1, kind: 'room.created', createdAt: 100 }],
        cursor: 1,
        latestSeq: 9,
        hasMore: true,
      },
    });
    manager.close();
  });
});
