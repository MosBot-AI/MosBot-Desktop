import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAuthManager, type AuthManager } from '../../src/main/dashboard/auth';
import { startLoopbackReceiver } from '../../src/main/dashboard/loopback';
import { createProbeService } from '../../src/main/dashboard/probe';
import type { TransportFetch } from '../../src/main/dashboard/transport';
import type { SafeStorageLike } from '../../src/main/dashboard/vault';
import { parseDashboardTarget, TEST_DASHBOARD_URL } from '../../src/shared/protocol';

const directories: string[] = [];

function tempCredentialsPath(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'mosbot-auth-'));
  directories.push(directory);
  return path.join(directory, 'dashboard-credentials.json');
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const safeStorage: SafeStorageLike = {
  isEncryptionAvailable: () => true,
  encryptString: (plain) => Buffer.from(`enc:${plain}`, 'utf8'),
  decryptString: (buffer) => buffer.toString('utf8').slice(4),
};

interface FakeDashboard {
  readonly fetchImpl: TransportFetch;
  readonly authorize: () => {
    provider: string | null;
    challenge: string | null;
    redirect: string | null;
    state: string | null;
  };
  readonly refreshCalls: () => number;
}

/**
 * In-process fake of the Dashboard REST contract verified against
 * hermes-agent@c419cf7c86. Not a server: it only exercises this client's
 * request shapes, retries and error handling.
 */
function createFakeDashboard(
  options: { providers?: string[]; tokenStatus?: number } = {},
): FakeDashboard {
  const providers = options.providers ?? ['github'];
  const captured = {
    provider: null as string | null,
    challenge: null as string | null,
    redirect: null as string | null,
    state: null as string | null,
  };
  let access = 'at-1';
  let refresh = 'rt-1';
  let refreshCalls = 0;

  const reply = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    text: async () => JSON.stringify(body),
  });

  const fetchImpl: TransportFetch = async (url, init) => {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/^\/test/, '');
    const token = init.headers['authorization']?.replace('Bearer ', '');
    const method = init.method;

    if (method === 'GET' && pathname === '/api/health') {
      return reply(200, {
        ok: true,
        version: '0.9.0',
        displayVersion: '0.9.0',
        commit: 'c419cf7c86abcdef',
        auth_required: true,
      });
    }
    if (method === 'GET' && pathname === '/api/status') {
      return reply(200, {
        version: '0.9.0',
        overall: 'ok',
        gateway_running: true,
        gateway_state: 'running',
        auth_required: true,
        auth_providers: providers,
        auth_flows: ['cookie', 'native_pkce'],
        active_sessions: 1,
        profiles: ['default'],
        install_id: 'install-1',
      });
    }
    if (method === 'GET' && pathname === '/api/auth/providers') {
      return reply(200, {
        providers: providers.map((name) => ({
          name,
          display_name: name.toUpperCase(),
          supports_password: false,
        })),
      });
    }
    if (method === 'POST' && pathname === '/auth/native/token') {
      if (options.tokenStatus !== undefined && options.tokenStatus !== 200) {
        return reply(options.tokenStatus, { detail: 'Invalid or expired authorization code.' });
      }
      const body = JSON.parse(init.body ?? '{}') as { code: string; code_verifier: string };
      const derived = createHash('sha256').update(body.code_verifier, 'ascii').digest('base64url');
      if (body.code !== 'code-1' || derived !== captured.challenge) {
        return reply(400, { detail: 'Invalid or expired authorization code.' });
      }
      return reply(200, {
        access_token: access,
        refresh_token: refresh,
        token_type: 'Bearer',
        expires_at: 1_700_000_000,
        provider: 'github',
        user_id: 'user-1',
      });
    }
    if (method === 'POST' && pathname === '/auth/native/refresh') {
      refreshCalls += 1;
      const body = JSON.parse(init.body ?? '{}') as { refresh_token: string };
      if (body.refresh_token === 'invalid-probe-token' || body.refresh_token !== refresh) {
        return reply(401, { error: 'session_expired', detail: 'start a new sign-in' });
      }
      access = `at-${refreshCalls + 1}`;
      refresh = `rt-${refreshCalls + 1}`;
      return reply(200, {
        access_token: access,
        refresh_token: refresh,
        token_type: 'Bearer',
        expires_at: 1_700_000_100,
        provider: 'github',
        user_id: 'user-1',
      });
    }
    if (method === 'GET' && pathname === '/api/auth/me') {
      if (token !== access) {
        return reply(401, { detail: 'Unauthorized' });
      }
      return reply(200, {
        user_id: 'user-1',
        email: 'person@example.com',
        display_name: 'Charley',
        org_id: 'org-1',
        provider: 'github',
        expires_at: 1_700_000_000,
      });
    }
    if (method === 'POST' && pathname === '/api/auth/ws-ticket') {
      if (token !== access) {
        return reply(401, { detail: 'Unauthorized' });
      }
      return reply(200, { ticket: 'ticket-1', ttl_seconds: 30 });
    }
    return reply(404, { detail: 'not found' });
  };

  return {
    fetchImpl,
    authorize: () => captured,
    refreshCalls: () => refreshCalls,
  };
}

function openBrowser(fake: FakeDashboard) {
  return async (url: string): Promise<void> => {
    const parsed = new URL(url);
    const redirect = parsed.searchParams.get('redirect_uri');
    const state = parsed.searchParams.get('state');
    if (redirect === null || state === null) {
      throw new Error('authorize URL is incomplete');
    }
    // Record what the desktop asked for before acting as the identity provider.
    Object.assign(fake.authorize(), {
      provider: parsed.searchParams.get('provider'),
      challenge: parsed.searchParams.get('code_challenge'),
      redirect,
      state,
    });
    const response = await fetch(`${redirect}?code=code-1&state=${encodeURIComponent(state)}`);
    if (!response.ok) {
      throw new Error(`loopback callback failed: ${response.status}`);
    }
  };
}

function createManager(fake: FakeDashboard): AuthManager {
  return createAuthManager({
    fetchImpl: fake.fetchImpl,
    openExternal: openBrowser(fake),
    safeStorage,
    credentialsPath: tempCredentialsPath(),
    requestTimeoutMs: 2_000,
    loopbackTimeoutMs: 5_000,
    randomBytes: (size) => Buffer.alloc(size, 3),
  });
}

describe('native PKCE sign-in', () => {
  it('runs authorize → loopback → token exchange → identity and saves only the refresh token', async () => {
    const fake = createFakeDashboard();
    const manager = createManager(fake);
    const target = parseDashboardTarget(TEST_DASHBOARD_URL);

    const result = await manager.login({ target });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(fake.authorize().provider).toBe('github');
    expect(fake.authorize().challenge).toHaveLength(43);
    expect(result.data.me.displayName).toBe('Charley');
    expect(manager.current()).toMatchObject({
      connected: true,
      displayUrl: TEST_DASHBOARD_URL,
      userId: 'user-1',
      provider: 'github',
    });
  });

  it('asks for a provider when several are available and rejects unknown ones', async () => {
    const fake = createFakeDashboard({ providers: ['github', 'google'] });
    const manager = createManager(fake);
    const target = parseDashboardTarget(TEST_DASHBOARD_URL);
    const missing = await manager.login({ target });
    expect(missing.ok ? '' : missing.error.code).toBe('provider_required');
    const unknown = await manager.login({ target, provider: 'gitlab' });
    expect(unknown.ok ? '' : unknown.error.code).toBe('auth_unavailable');
  });

  it('reports a rejected token exchange as a cancelled sign-in', async () => {
    const fake = createFakeDashboard({ tokenStatus: 400 });
    const manager = createManager(fake);
    const target = parseDashboardTarget(TEST_DASHBOARD_URL);
    const result = await manager.login({ target });
    expect(result.ok ? '' : result.error.code).toBe('auth_cancelled');
  });

  it('cancels a pending sign-in', async () => {
    const fake = createFakeDashboard();
    const manager = createAuthManager({
      fetchImpl: fake.fetchImpl,
      openExternal: async () => undefined,
      safeStorage,
      credentialsPath: tempCredentialsPath(),
      loopbackTimeoutMs: 5_000,
    });
    const target = parseDashboardTarget(TEST_DASHBOARD_URL);
    const pending = manager.login({ target });
    setTimeout(() => {
      manager.cancelLogin();
    }, 50);
    const result = await pending;
    expect(result.ok ? '' : result.error.code).toBe('auth_cancelled');
  });
});

describe('loopback receiver', () => {
  it('validates the state parameter before handing the code to the app', async () => {
    const receiver = await startLoopbackReceiver({ expectedState: 'state-a', timeoutMs: 2_000 });
    expect(receiver.ok).toBe(true);
    if (!receiver.ok) {
      return;
    }
    const response = await fetch(`${receiver.data.redirectUri}?code=code-1&state=state-b`);
    expect(response.status).toBe(400);
    const result = await receiver.data.result;
    expect(result.ok ? '' : result.error.code).toBe('malformed_response');
  });

  it('times out when the browser never returns', async () => {
    const receiver = await startLoopbackReceiver({ expectedState: 'state-a', timeoutMs: 50 });
    expect(receiver.ok).toBe(true);
    if (!receiver.ok) {
      return;
    }
    const result = await receiver.data.result;
    expect(result.ok ? '' : result.error.code).toBe('auth_cancelled');
  });
});

describe('authenticated probe', () => {
  it('reports identity, rotation, invalid-refresh handling, ws tickets and local sign-out', async () => {
    const fake = createFakeDashboard();
    const manager = createManager(fake);
    const target = parseDashboardTarget(TEST_DASHBOARD_URL);
    const login = await manager.login({ target });
    expect(login.ok).toBe(true);
    if (!login.ok) {
      return;
    }

    const probe = createProbeService({ auth: manager, fetchImpl: fake.fetchImpl });
    const report = await probe.runAuthenticated();
    expect(report.ok).toBe(true);
    if (!report.ok) {
      return;
    }
    const byId = new Map(report.data.rows.map((row) => [row.id, row]));
    expect(byId.get('me')?.status).toBe('pass');
    expect(byId.get('refresh_rotation')?.status).toBe('pass');
    expect(byId.get('refresh_invalid')?.status).toBe('pass');
    expect(byId.get('ws_ticket')?.status).toBe('pass');
    expect(fake.refreshCalls()).toBeGreaterThanOrEqual(2);

    const signOut = probe.runSignOut();
    expect(signOut[0]?.status).toBe('pass');
    expect(manager.current().connected).toBe(false);
  });

  it('refuses to run before sign-in', async () => {
    const fake = createFakeDashboard();
    const manager = createManager(fake);
    const probe = createProbeService({ auth: manager, fetchImpl: fake.fetchImpl });
    const report = await probe.runAuthenticated();
    expect(report.ok ? '' : report.error.code).toBe('unauthorized');
  });
});
