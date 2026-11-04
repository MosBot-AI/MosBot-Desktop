import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { connectGateway, gatewayUrl, type WebSocketLike } from '../../src/main/dashboard/rpc';
import type { TransportFetch } from '../../src/main/dashboard/transport';
import { parseDashboardTarget } from '../../src/shared/protocol';

const target = parseDashboardTarget('https://hermes.example.com/hermes');

class FakeSocket implements WebSocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  readonly sent: string[] = [];
  closed = false;

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
  }

  emit(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }

  emitReady(): void {
    this.emit({
      jsonrpc: '2.0',
      method: 'event',
      params: {
        type: 'gateway.ready',
        payload: { replay_epoch: 'epoch-1', change_events: true, heartbeat: true },
      },
    });
  }

  answer(id: number, result: unknown): void {
    this.emit({ jsonrpc: '2.0', id, result });
  }
}

function ticketFetch(): TransportFetch {
  return async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify({ ticket: 'ticket-abc', ttl_seconds: 30 }),
  });
}

async function connected(): Promise<{
  client: Awaited<ReturnType<typeof connectGateway>>;
  socket: FakeSocket;
}> {
  const socket = new FakeSocket();
  const pending = connectGateway({
    fetchImpl: ticketFetch(),
    target,
    getAccessToken: () => 'token',
    socketFactory: () => socket,
    requestTimeoutMs: 200,
    handshakeTimeoutMs: 500,
  });
  // The client attaches handlers after minting the ticket; answer gateway.ready
  // only once the socket is being listened to.
  for (let attempt = 0; attempt < 100 && socket.onmessage === null; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  socket.emitReady();
  const client = await pending;
  return { client, socket };
}

describe('gateway URL', () => {
  it('maps the dashboard origin to ws(s) with the prefix and ticket', () => {
    const url = new URL(gatewayUrl(target, 'ticket with spaces'));
    expect(url.protocol).toBe('wss:');
    expect(url.pathname).toBe('/hermes/api/ws');
    expect(url.searchParams.get('ticket')).toBe('ticket with spaces');

    const plain = parseDashboardTarget('http://127.0.0.1:9119');
    expect(gatewayUrl(plain, 't').startsWith('ws://127.0.0.1:9119/api/ws?')).toBe(true);
  });
});

describe('gateway JSON-RPC client', () => {
  it('requires gateway.ready as the first frame and records its payload', async () => {
    const { client } = await connected();
    expect(client.ok).toBe(true);
    if (!client.ok) {
      return;
    }
    expect(client.data.ready.replayEpoch).toBe('epoch-1');
    expect(client.data.ready.changeEvents).toBe(true);
    expect(client.data.ready.payloadKeys).toContain('replay_epoch');
  });

  it('resolves RPC results and validates them', async () => {
    const { client, socket } = await connected();
    expect(client.ok).toBe(true);
    if (!client.ok) {
      return;
    }
    const pending = client.data.call(
      'client.capabilities',
      { server_requests: true },
      z.object({
        server_requests: z.array(z.string()),
      }),
    );
    const frame = JSON.parse(socket.sent[0] ?? '{}') as {
      id: number;
      method: string;
      jsonrpc: string;
    };
    expect(frame.method).toBe('client.capabilities');
    expect(frame.jsonrpc).toBe('2.0');
    socket.answer(frame.id, { server_requests: ['approval', 'clarify'] });
    const result = await pending;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.server_requests).toHaveLength(2);
    }
  });

  it('surfaces RPC errors and malformed payloads as typed failures', async () => {
    const { client, socket } = await connected();
    if (!client.ok) {
      return;
    }
    const errored = client.data.call(
      'session.list',
      {},
      z.object({ sessions: z.array(z.string()) }),
    );
    const firstId = (JSON.parse(socket.sent[0] ?? '{}') as { id: number }).id;
    socket.emit({ jsonrpc: '2.0', id: firstId, error: { code: -32000, message: 'denied' } });
    const errorResult = await errored;
    expect(errorResult.ok ? '' : errorResult.error.code).toBe('http_error');
    expect(errorResult.ok ? '' : errorResult.error.serverCode).toBeUndefined();

    const malformed = client.data.call(
      'session.list',
      {},
      z.object({ sessions: z.array(z.string()) }),
    );
    const secondId = (JSON.parse(socket.sent[1] ?? '{}') as { id: number }).id;
    socket.answer(secondId, { sessions: [1, 2] });
    const malformedResult = await malformed;
    expect(malformedResult.ok ? '' : malformedResult.error.code).toBe('malformed_response');

    // A structured gateway error keeps its machine-readable code for typed UI states.
    const conflicted = client.data.call('display.lease.acquire', {}, z.object({}).passthrough());
    const thirdId = (JSON.parse(socket.sent[2] ?? '{}') as { id: number }).id;
    socket.emit({
      jsonrpc: '2.0',
      id: thirdId,
      error: {
        code: 5300,
        message: 'another viewer holds the display',
        data: { code: 'lease_conflict' },
      },
    });
    const conflictResult = await conflicted;
    expect(conflictResult.ok ? '' : conflictResult.error.code).toBe('http_error');
    expect(conflictResult.ok ? '' : conflictResult.error.serverCode).toBe('lease_conflict');
  });

  it('times out unanswered calls', async () => {
    const { client } = await connected();
    if (!client.ok) {
      return;
    }
    const result = await client.data.call('session.list', {}, z.object({}));
    expect(result.ok ? '' : result.error.code).toBe('timeout');
  });

  it('delivers typed server events to waiters', async () => {
    const { client, socket } = await connected();
    if (!client.ok) {
      return;
    }
    const waiting = client.data.waitForEvent('message.delta', 500);
    socket.emit({
      jsonrpc: '2.0',
      method: 'event',
      params: {
        type: 'message.delta',
        session_id: 'sess-1',
        seq: 7,
        payload: { text: 'hi' },
      },
    });
    const event = await waiting;
    expect(event.ok).toBe(true);
    if (event.ok) {
      expect(event.data.type).toBe('message.delta');
      expect(event.data.sessionId).toBe('sess-1');
      expect(event.data.seq).toBe(7);
    }
  });

  it('fails pending calls when the socket closes', async () => {
    const { client, socket } = await connected();
    if (!client.ok) {
      return;
    }
    const pending = client.data.call('profiles.list', {}, z.object({}));
    socket.onclose?.({ code: 1006, reason: 'gone' });
    const result = await pending;
    expect(result.ok ? '' : result.error.code).toBe('unreachable');
  });
});
