import type { CapabilityRow, DashboardTarget, ProbeReport, Result } from '../../shared/protocol';
import { protocolError, targetUrl } from '../../shared/protocol';
import type { AuthManager } from './auth';
import { attemptGatewayConnection, connectGateway, gatewayUrl, type GatewayReady } from './rpc';
import {
  clientCapabilitiesSchema,
  healthSchema,
  meSchema,
  profilesListSchema,
  providersSchema,
  sessionExpiredSchema,
  sessionListSchema,
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
  /** Slow check: mint a ticket, wait 31 s, prove the handshake is rejected. */
  readonly ticketExpiryCheck?: boolean;
}

function describeReady(ready: GatewayReady): string {
  return [
    `replay_epoch=${ready.replayEpoch === null ? 'absent' : 'present'}`,
    `change_events=${String(ready.changeEvents)}`,
    `heartbeat=${String(ready.heartbeat)}`,
    `payload_keys=${ready.payloadKeys.join(',') || '(none)'}`,
  ].join(' · ');
}

function maskSessionId(id: string): string {
  return id.length <= 8 ? `${id.slice(0, 2)}…` : `${id.slice(0, 8)}…`;
}

export interface ProbeService {
  runPreflight(target: DashboardTarget): Promise<Result<ProbeReport>>;
  runAuthenticated(): Promise<Result<ProbeReport>>;
  runWebSocket(): Promise<Result<ProbeReport>>;
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

    async runWebSocket() {
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
      const connection = await connectGateway({
        fetchImpl: deps.fetchImpl,
        target,
        getAccessToken: () => deps.auth.accessToken(),
        ...(deps.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: deps.requestTimeoutMs }),
      });
      if (!connection.ok) {
        rows.push(row('ws_handshake', 'WS 一次性票据握手', 'fail', connection.error.message));
        return { ok: true, data: { generatedAt: now(), target: target.displayUrl, rows } };
      }
      const client = connection.data;
      try {
        rows.push(
          row(
            'ws_handshake',
            'WS 一次性票据握手',
            'pass',
            'ticket accepted · gateway.ready was the first frame',
          ),
        );
        rows.push(row('gateway_ready', 'gateway.ready 首帧', 'pass', describeReady(client.ready)));

        const capabilities = await client.call(
          'client.capabilities',
          { server_requests: true },
          clientCapabilitiesSchema,
        );
        if (capabilities.ok) {
          const requests = capabilities.data.server_requests ?? [];
          rows.push(
            row(
              'client_capabilities',
              'client.capabilities',
              'pass',
              `server_requests=${requests.length} · declines_not_shown=${String(capabilities.data.declines_not_shown)} · canonical_clarify_batch=${String(capabilities.data.canonical_clarify_batch)}`,
            ),
          );
        } else {
          rows.push(
            row('client_capabilities', 'client.capabilities', 'fail', capabilities.error.message),
          );
        }

        const profiles = await client.call(
          'profiles.list',
          { include_sessions: true },
          profilesListSchema,
        );
        let defaultProfile: string | null = null;
        if (profiles.ok) {
          const list = profiles.data.profiles;
          const defaultRow = list.find((profile) => profile.is_default === true) ?? list[0];
          defaultProfile = defaultRow?.name ?? null;
          const withCanonical = list.filter(
            (profile) =>
              profile.canonical_session !== undefined && profile.canonical_session !== null,
          ).length;
          rows.push(
            row(
              'profiles_list',
              'profiles.list {include_sessions}',
              'pass',
              `profiles=${list.length} · default=${defaultProfile === null ? 'absent' : 'present'} · canonical_session=${withCanonical} · bot_mode_protocol=${String(profiles.data.bot_mode_protocol)}`,
            ),
          );
        } else {
          rows.push(
            row(
              'profiles_list',
              'profiles.list {include_sessions}',
              'fail',
              profiles.error.message,
            ),
          );
        }

        if (defaultProfile === null) {
          rows.push(
            row('bot_chat_query', '精确 Bot Chat 查询', 'unverified', '没有可用 profile 可供查询'),
          );
        } else {
          const sessions = await client.call(
            'session.list',
            { profile: defaultProfile, title: 'Bot Chat', include_hidden: true },
            sessionListSchema,
          );
          if (sessions.ok) {
            const list = sessions.data.sessions;
            const first = list[0];
            rows.push(
              row(
                'bot_chat_query',
                '精确 Bot Chat 查询',
                'pass',
                `matches=${list.length} · first=${first === undefined ? 'none' : maskSessionId(first.id)} · resolved_id=${first?.resolved_id === undefined || first?.resolved_id === null ? 'absent' : 'present'} · message_count=${first?.message_count ?? '—'}`,
              ),
            );
          } else {
            rows.push(row('bot_chat_query', '精确 Bot Chat 查询', 'fail', sessions.error.message));
          }
        }

        // A consumed ticket must be rejected when replayed.
        const freshTicket = await requestJson(transport, {
          method: 'POST',
          path: '/api/auth/ws-ticket',
          authenticated: true,
          schema: wsTicketSchema,
        });
        if (freshTicket.ok) {
          const reuseUrl = gatewayUrl(target, freshTicket.data.ticket);
          const first = await attemptGatewayConnection(reuseUrl, 5_000, 120);
          const second = await attemptGatewayConnection(reuseUrl, 5_000, 0);
          const rejected = first.accepted && !second.accepted;
          rows.push(
            row(
              'ws_ticket_reuse',
              'ticket 重复使用拒绝',
              rejected ? 'pass' : 'fail',
              `first accepted=${String(first.accepted)} · second accepted=${String(second.accepted)} · close code=${second.code ?? '—'}`,
            ),
          );
        } else {
          rows.push(
            row('ws_ticket_reuse', 'ticket 重复使用拒绝', 'fail', freshTicket.error.message),
          );
        }

        if (deps.ticketExpiryCheck === true) {
          const expiring = await requestJson(transport, {
            method: 'POST',
            path: '/api/auth/ws-ticket',
            authenticated: true,
            schema: wsTicketSchema,
          });
          if (expiring.ok) {
            await new Promise((resolve) => setTimeout(resolve, 31_000));
            const expiredAttempt = await attemptGatewayConnection(
              gatewayUrl(target, expiring.data.ticket),
              5_000,
              0,
            );
            rows.push(
              row(
                'ws_ticket_expiry',
                'ticket 过期拒绝',
                expiredAttempt.accepted ? 'fail' : 'pass',
                `accepted=${String(expiredAttempt.accepted)} · close code=${expiredAttempt.code ?? '—'} · ttl=${expiring.data.ttlSeconds}s`,
              ),
            );
          }
        } else {
          rows.push(
            row(
              'ws_ticket_expiry',
              'ticket 过期拒绝',
              'unverified',
              '默认跳过 31 秒等待；设置 MOSBOT_PROBE_TICKET_EXPIRY=1 复验',
            ),
          );
        }

        rows.push(
          row(
            'session_resume',
            'session.resume 与首个真实 delta',
            'unverified',
            '需要一次真实 turn（M0b 第 3 步 / M1）',
          ),
        );
        rows.push(
          row('stop_turn', '停止与终态', 'unverified', '需要一次真实 turn（M0b 第 3 步 / M1）'),
        );
      } finally {
        client.close();
      }
      return { ok: true, data: { generatedAt: now(), target: target.displayUrl, rows } };
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
