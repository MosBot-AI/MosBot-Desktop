import type {
  AuthMePayload,
  AuthProviderInfo,
  ConnectionSnapshot,
  DashboardTarget,
  Failure,
  HealthPayload,
  Result,
  TokenBundle,
} from '../../shared/protocol';
import { protocolError, targetUrl } from '../../shared/protocol';
import { startLoopbackReceiver, type LoopbackReceiver } from './loopback';
import {
  assertNativeAuthTarget,
  buildAuthorizeUrl,
  createClientState,
  createPkcePair,
} from './pkce';
import { healthSchema, meSchema, providersSchema, tokenSchema } from './schemas';
import { requestJson, type TransportFetch } from './transport';
import { createVault, type SafeStorageLike } from './vault';

export interface AuthDeps {
  readonly fetchImpl: TransportFetch;
  readonly openExternal: (url: string) => Promise<void>;
  readonly safeStorage: SafeStorageLike;
  readonly credentialsPath: string;
  readonly now?: () => number;
  readonly requestTimeoutMs?: number;
  readonly loopbackTimeoutMs?: number;
  readonly randomBytes?: (size: number) => Buffer;
}

export interface AuthSession {
  readonly target: DashboardTarget;
  readonly tokens: TokenBundle;
  readonly me: AuthMePayload;
}

export interface PreflightInfo {
  readonly health: HealthPayload;
  readonly providers: readonly AuthProviderInfo[];
}

export interface LoginOptions {
  readonly target: DashboardTarget;
  readonly provider?: string;
}

export interface AuthManager {
  preflight(target: DashboardTarget): Promise<Result<PreflightInfo>>;
  login(options: LoginOptions): Promise<Result<AuthSession>>;
  restore(target: DashboardTarget): Promise<Result<AuthSession | null>>;
  refresh(): Promise<Result<AuthSession>>;
  logout(): void;
  cancelLogin(): void;
  current(): ConnectionSnapshot;
  target(): DashboardTarget | null;
  accessToken(): string | null;
}

const DISCONNECTED: ConnectionSnapshot = {
  connected: false,
  displayUrl: null,
  userId: null,
  displayName: null,
  provider: null,
  expiresAt: null,
};

/**
 * Owns the Dashboard bearer session for one connection: PKCE sign-in through the
 * system browser, memory-only access tokens, safeStorage persisted refresh token,
 * single-flight refresh and a clean sign-out.
 */
export function createAuthManager(deps: AuthDeps): AuthManager {
  const vault = createVault({ filePath: deps.credentialsPath, safeStorage: deps.safeStorage });
  const randomBytes = deps.randomBytes;
  let target: DashboardTarget | null = null;
  let tokens: TokenBundle | null = null;
  let me: AuthMePayload | null = null;
  let activeReceiver: LoopbackReceiver | null = null;
  let refreshing: Promise<Result<AuthSession>> | null = null;

  const transportFor = (at: DashboardTarget) => ({
    fetchImpl: deps.fetchImpl,
    target: at,
    ...(deps.requestTimeoutMs === undefined ? {} : { timeoutMs: deps.requestTimeoutMs }),
    getAccessToken: () => tokens?.accessToken ?? null,
  });

  const snapshot = (): ConnectionSnapshot => {
    if (target === null || tokens === null) {
      return DISCONNECTED;
    }
    return {
      connected: true,
      displayUrl: target.displayUrl,
      userId: me?.userId ?? tokens.userId,
      displayName: me?.displayName ?? null,
      provider: me?.provider ?? tokens.provider,
      expiresAt: tokens.expiresAt,
    };
  };

  const loadMe = async (at: DashboardTarget): Promise<Result<AuthMePayload>> => {
    const result = await requestJson(transportFor(at), {
      method: 'GET',
      path: '/api/auth/me',
      authenticated: true,
      schema: meSchema,
    });
    return result;
  };

  /** Exchange a refresh token, persist the rotated one and refresh the identity. */
  const performRefresh = async (): Promise<Result<AuthSession>> => {
    if (target === null) {
      return {
        ok: false,
        error: protocolError('unauthorized', 'Not connected to a Dashboard.'),
      };
    }
    const stored = vault.load(target.displayUrl);
    const refreshToken = stored.ok ? (stored.data?.refreshToken ?? null) : null;
    if (refreshToken === null) {
      return {
        ok: false,
        error: protocolError('session_expired', 'The saved sign-in has expired. Sign in again.'),
      };
    }
    const refreshed = await requestJson(transportFor(target), {
      method: 'POST',
      path: '/auth/native/refresh',
      body: { refresh_token: refreshToken, provider: me?.provider ?? '' },
      schema: tokenSchema,
    });
    if (!refreshed.ok) {
      vault.clear(target.displayUrl);
      tokens = null;
      return {
        ok: false,
        error:
          refreshed.error.httpStatus === 401
            ? protocolError('session_expired', 'The Dashboard session expired. Sign in again.')
            : refreshed.error,
      };
    }
    const next = refreshed.data;
    tokens = next;
    const meResult = await loadMe(target);
    if (!meResult.ok) {
      return { ok: false, error: meResult.error };
    }
    me = meResult.data;
    const saved = vault.save({
      target: target.displayUrl,
      refreshToken: next.refreshToken,
      provider: next.provider,
      userId: next.userId,
      displayName: me.displayName,
      expiresAt: next.expiresAt,
    });
    if (!saved.ok) {
      return { ok: false, error: saved.error };
    }
    return { ok: true, data: { target, tokens: next, me } };
  };

  return {
    async preflight(at) {
      const health = await requestJson(
        { ...transportFor(at) },
        {
          method: 'GET',
          path: '/api/health',
          schema: healthSchema,
        },
      );
      if (!health.ok) {
        return health as Result<PreflightInfo>;
      }
      const providers = await requestJson(
        { ...transportFor(at) },
        {
          method: 'GET',
          path: '/api/auth/providers',
          schema: providersSchema,
        },
      );
      if (!providers.ok) {
        return providers as Result<PreflightInfo>;
      }
      return {
        ok: true,
        data: { health: health.data, providers: providers.data.providers },
      };
    },

    async login(options) {
      const at = options.target;
      try {
        assertNativeAuthTarget(at);
      } catch (error) {
        return { ok: false, error: error as ReturnType<typeof protocolError> };
      }
      const preflight = await this.preflight(at);
      if (!preflight.ok) {
        return { ok: false, error: preflight.error };
      }
      const providers = preflight.data.providers;
      if (providers.length === 0) {
        return {
          ok: false,
          error: protocolError(
            'auth_unavailable',
            'This Dashboard offers no browser sign-in. Ask the operator which credentials it accepts.',
          ),
        };
      }
      const providerName =
        options.provider ?? (providers.length === 1 ? (providers[0]?.name ?? '') : '');
      if (providerName === '') {
        return {
          ok: false,
          error: protocolError(
            'provider_required',
            `Choose a sign-in provider: ${providers.map((provider) => provider.name).join(', ')}.`,
          ),
        };
      }
      if (!providers.some((provider) => provider.name === providerName)) {
        return {
          ok: false,
          error: protocolError('auth_unavailable', `Unknown sign-in provider "${providerName}".`),
        };
      }

      const pkce = createPkcePair(randomBytes);
      const state = createClientState(randomBytes);
      const loopback = await startLoopbackReceiver({
        expectedState: state,
        ...(deps.loopbackTimeoutMs === undefined ? {} : { timeoutMs: deps.loopbackTimeoutMs }),
      });
      if (!loopback.ok) {
        return { ok: false, error: loopback.error };
      }
      const receiver = loopback.data;
      activeReceiver = receiver;

      try {
        const authorizeUrl = buildAuthorizeUrl({
          target: at,
          provider: providerName,
          redirectUri: receiver.redirectUri,
          state,
          challenge: pkce.challenge,
        });
        try {
          await deps.openExternal(authorizeUrl);
        } catch {
          return {
            ok: false,
            error: protocolError('internal', 'The system browser could not be opened.'),
          };
        }

        const callback = await receiver.result;
        if (!callback.ok) {
          return { ok: false, error: callback.error };
        }

        const exchanged = await requestJson(transportFor(at), {
          method: 'POST',
          path: '/auth/native/token',
          body: { code: callback.data.code, code_verifier: pkce.verifier },
          schema: tokenSchema,
        });
        if (!exchanged.ok) {
          return {
            ok: false,
            error:
              exchanged.error.httpStatus === 400
                ? protocolError(
                    'auth_cancelled',
                    'Sign-in was not accepted by the Dashboard. Try again.',
                  )
                : exchanged.error,
          };
        }
        target = at;
        tokens = exchanged.data;
        const meResult = await loadMe(at);
        if (!meResult.ok) {
          tokens = null;
          return { ok: false, error: meResult.error };
        }
        me = meResult.data;
        const saved = vault.save({
          target: at.displayUrl,
          refreshToken: tokens.refreshToken,
          provider: tokens.provider,
          userId: tokens.userId,
          displayName: me.displayName,
          expiresAt: tokens.expiresAt,
        });
        if (!saved.ok) {
          return { ok: false, error: saved.error };
        }
        return { ok: true, data: { target: at, tokens, me } };
      } finally {
        activeReceiver = null;
        receiver.close();
      }
    },

    async restore(at) {
      target = at;
      me = null;
      tokens = null;
      const stored = vault.load(at.displayUrl);
      if (!stored.ok) {
        return stored as Result<AuthSession | null>;
      }
      if (stored.data === null) {
        return { ok: true, data: null };
      }
      const refreshed = await performRefresh();
      if (!refreshed.ok) {
        return { ok: false, error: refreshed.error };
      }
      return { ok: true, data: refreshed.data };
    },

    refresh() {
      if (refreshing !== null) {
        return refreshing;
      }
      refreshing = performRefresh().finally(() => {
        refreshing = null;
      });
      return refreshing;
    },

    logout() {
      activeReceiver?.close();
      activeReceiver = null;
      if (target !== null) {
        vault.clear(target.displayUrl);
      }
      tokens = null;
      me = null;
      target = null;
    },

    cancelLogin() {
      activeReceiver?.close();
      activeReceiver = null;
    },

    current: snapshot,
    target: () => target,
    accessToken: () => tokens?.accessToken ?? null,
  };
}

export { targetUrl };
export type { LoopbackReceiver };
export type { Failure, HealthPayload };
