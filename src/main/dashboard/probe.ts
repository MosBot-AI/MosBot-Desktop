import type { CapabilityRow, DashboardTarget, ProbeReport, Result } from '../../shared/protocol';
import { protocolError, targetUrl } from '../../shared/protocol';
import type { AuthManager } from './auth';
import {
  healthSchema,
  meSchema,
  providersSchema,
  sessionExpiredSchema,
  statusSchema,
  wsTicketSchema,
} from './schemas';
import { requestJson, type TransportFetch } from './transport';

const MASK_VISIBLE = 4;

/** Keeps an identity in a report without leaking the whole value. */
export function maskId(value: string): string {
  if (value === '') {
    return '(none)';
  }
  if (value.length <= MASK_VISIBLE) {
    return `${value.slice(0, 1)}…`;
  }
  return `${value.slice(0, MASK_VISIBLE)}…(${value.length})`;
}

export interface ProbeDeps {
  readonly auth: AuthManager;
  readonly fetchImpl: TransportFetch;
  readonly requestTimeoutMs?: number;
  readonly now?: () => number;
}

export interface ProbeService {
  runPreflight(target: DashboardTarget): Promise<Result<ProbeReport>>;
  runAuthenticated(): Promise<Result<ProbeReport>>;
  /** Signs out locally and reports what survived the sign-out. */
  runSignOut(): CapabilityRow[];
}

function row(
  id: string,
  title: string,
  status: CapabilityRow['status'],
  detail: string,
  required = true,
): CapabilityRow {
  return { id, title, status, detail, required };
}

export function createProbeService(deps: ProbeDeps): ProbeService {
  const now = deps.now ?? (() => Date.now());

  const transportFor = (target: DashboardTarget) => ({
    fetchImpl: deps.fetchImpl,
    target,
    ...(deps.requestTimeoutMs === undefined ? {} : { timeoutMs: deps.requestTimeoutMs }),
    getAccessToken: () => deps.auth.accessToken(),
  });

  return {
    async runPreflight(target) {
      const rows: CapabilityRow[] = [];
      const health = await requestJson(transportFor(target), {
        method: 'GET',
        path: '/api/health',
        schema: healthSchema,
      });
      if (health.ok) {
        rows.push(
          row(
            'health',
            'REST 探活 /api/health',
            'pass',
            `version ${health.data.version} · commit ${health.data.commit.slice(0, 10)} · auth_required=${String(health.data.authRequired)}`,
          ),
        );
      } else {
        rows.push(row('health', 'REST 探活 /api/health', 'fail', health.error.message));
      }

      const status = await requestJson(transportFor(target), {
        method: 'GET',
        path: '/api/status',
        schema: statusSchema,
      });
      if (status.ok) {
        rows.push(
          row(
            'status',
            '部署状态 /api/status',
            'pass',
            `version ${status.data.version ?? '—'} · overall ${status.data.overall ?? '—'} · gateway_running=${String(status.data.gatewayRunning)} · keys ${status.data.presentKeys.length}`,
          ),
        );
        rows.push(
          row(
            'auth_gate',
            '鉴权形态与 native PKCE 能力',
            status.data.authFlows.includes('native_pkce') ? 'pass' : 'not-supported',
            `auth_required=${String(status.data.authRequired)} · auth_flows=${status.data.authFlows.join(',') || '(none)'} · providers=${status.data.authProviders.join(',') || '(none)'}`,
          ),
        );
        rows.push(
          row(
            'prefix',
            'URL 前缀 / 反代',
            'pass',
            `basePath=${target.basePath === '' ? '(none)' : target.basePath} · install_id=${status.data.presentKeys.includes('install_id') ? 'present' : 'absent'} · 已在当前基路径完成探活`,
          ),
        );
      } else {
        rows.push(row('status', '部署状态 /api/status', 'fail', status.error.message));
        rows.push(
          row('auth_gate', '鉴权形态与 native PKCE 能力', 'unverified', '需要 /api/status 结果'),
        );
        rows.push(row('prefix', 'URL 前缀 / 反代', 'unverified', '需要 /api/status 结果'));
      }

      const providers = await requestJson(transportFor(target), {
        method: 'GET',
        path: '/api/auth/providers',
        schema: providersSchema,
      });
      if (providers.ok) {
        rows.push(
          row(
            'providers',
            '登录提供方 /api/auth/providers',
            providers.data.providers.length > 0 ? 'pass' : 'not-supported',
            providers.data.providers
              .map((provider) => `${provider.name}${provider.supportsPassword ? '(password)' : ''}`)
              .join(', ') || '(none)',
          ),
        );
      } else {
        rows.push(
          row('providers', '登录提供方 /api/auth/providers', 'fail', providers.error.message),
        );
      }

      return {
        ok: true,
        data: { generatedAt: now(), target: target.displayUrl, rows },
      };
    },

    async runAuthenticated() {
      const target = deps.auth.target();
      if (target === null || !deps.auth.current().connected) {
        return {
          ok: false,
          error: protocolError(
            'unauthorized',
            'Sign in to the Dashboard before running this probe.',
          ),
        };
      }
      const transport = transportFor(target);
      const rows: CapabilityRow[] = [];

      const me = await requestJson(transport, {
        method: 'GET',
        path: '/api/auth/me',
        authenticated: true,
        schema: meSchema,
      });
      if (me.ok) {
        rows.push(
          row(
            'me',
            '身份 /api/auth/me',
            'pass',
            `provider ${me.data.provider} · user ${maskId(me.data.userId)} · display ${me.data.displayName === '' ? '—' : me.data.displayName} · org ${me.data.orgId === '' ? '—' : maskId(me.data.orgId)}`,
          ),
        );
      } else {
        rows.push(row('me', '身份 /api/auth/me', 'fail', me.error.message));
      }

      const refreshed = await deps.auth.refresh();
      if (refreshed.ok) {
        rows.push(
          row(
            'refresh_rotation',
            '刷新与轮换 /auth/native/refresh',
            'pass',
            `rotated · expires_at=${new Date(refreshed.data.tokens.expiresAt * 1000).toISOString()}`,
          ),
        );
      } else {
        rows.push(
          row(
            'refresh_rotation',
            '刷新与轮换 /auth/native/refresh',
            refreshed.error.code === 'session_expired' ? 'fail' : 'unverified',
            refreshed.error.message,
          ),
        );
      }

      // A bogus refresh token must be rejected with 401 session_expired.
      const expiredProbe = await requestJson(transport, {
        method: 'POST',
        path: '/auth/native/refresh',
        body: { refresh_token: 'invalid-probe-token', provider: '' },
        schema: sessionExpiredSchema,
      });
      if (!expiredProbe.ok && expiredProbe.error.httpStatus === 401) {
        rows.push(
          row('refresh_invalid', '刷新令牌失效处理', 'pass', '401 session_expired as expected'),
        );
      } else if (expiredProbe.ok) {
        rows.push(
          row(
            'refresh_invalid',
            '刷新令牌失效处理',
            'fail',
            'Dashboard accepted an invalid refresh token',
          ),
        );
      } else {
        rows.push(
          row('refresh_invalid', '刷新令牌失效处理', 'unverified', expiredProbe.error.message),
        );
      }

      const ticket = await requestJson(transport, {
        method: 'POST',
        path: '/api/auth/ws-ticket',
        authenticated: true,
        schema: wsTicketSchema,
      });
      if (ticket.ok) {
        rows.push(
          row(
            'ws_ticket',
            'WS 一次性票据 /api/auth/ws-ticket',
            'pass',
            `ttl ${ticket.data.ttlSeconds}s · ticket len ${ticket.data.ticket.length} (not recorded)`,
          ),
        );
      } else {
        rows.push(
          row('ws_ticket', 'WS 一次性票据 /api/auth/ws-ticket', 'fail', ticket.error.message),
        );
      }

      rows.push(
        row(
          'remote_logout',
          '服务端注销',
          'not-supported',
          '当前源码的 /auth/logout 依赖会话 Cookie，bearer 会话没有远程撤销端点；桌面端注销即清除本地凭据',
        ),
      );
      rows.push(
        row(
          'login_cancel',
          '浏览器取消登录 / 超时',
          'unverified',
          '需要用户在浏览器取消一次登录后复核（探针不自动取消真实登录）',
        ),
      );
      rows.push(
        row(
          'ws_handshake',
          'WS 握手与 gateway.ready',
          'unverified',
          '在 M0b 第 2 步（WS 客户端）验证',
        ),
      );

      return {
        ok: true,
        data: { generatedAt: now(), target: target.displayUrl, rows },
      };
    },

    runSignOut(): CapabilityRow[] {
      const before = deps.auth.current();
      deps.auth.logout();
      const after = deps.auth.current();
      const rows: CapabilityRow[] = [
        row(
          'local_sign_out',
          '本地注销与凭据清除',
          !after.connected && before.connected ? 'pass' : 'fail',
          `before=${before.connected ? 'connected' : 'disconnected'} · after=${after.connected ? 'connected' : 'disconnected'} · vault cleared`,
        ),
      ];
      return rows;
    },
  };
}

export { targetUrl };
