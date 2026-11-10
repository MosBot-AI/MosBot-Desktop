import { z } from 'zod';
import type {
  AuthMePayload,
  AuthProviderInfo,
  AuthProvidersPayload,
  HealthPayload,
  StatusPayload,
  TokenBundle,
  WsTicketPayload,
} from '../../shared/protocol';

/**
 * Runtime validation for every Dashboard REST payload. Unknown extra keys are
 * tolerated (servers grow fields); the shapes this client consumes are checked
 * so a different deployment cannot silently feed the UI the wrong data.
 */

const healthObject = z.object({
  ok: z.boolean(),
  version: z.string(),
  displayVersion: z.string(),
  commit: z.string(),
  auth_required: z.boolean(),
});

export const healthSchema = healthObject.transform((value): HealthPayload => ({
  ok: value.ok,
  version: value.version,
  displayVersion: value.displayVersion,
  commit: value.commit,
  authRequired: value.auth_required,
}));

const statusObject = z
  .object({
    version: z.string().optional(),
    overall: z.string().optional(),
    gateway_running: z.boolean().optional(),
    gateway_state: z.string().nullish(),
    auth_required: z.boolean().optional(),
    auth_providers: z.array(z.string()).optional(),
    auth_flows: z.array(z.string()).optional(),
    active_sessions: z.number().optional(),
    profiles: z.array(z.string()).optional(),
  })
  .catchall(z.unknown());

export const statusSchema = statusObject.transform((value): StatusPayload => ({
  version: value.version ?? null,
  overall: value.overall ?? null,
  gatewayRunning: value.gateway_running ?? null,
  gatewayState: value.gateway_state ?? null,
  authRequired: value.auth_required ?? null,
  authProviders: value.auth_providers ?? [],
  authFlows: value.auth_flows ?? [],
  activeSessions: value.active_sessions ?? null,
  profiles: value.profiles ?? [],
  presentKeys: Object.keys(value).sort(),
}));

const providerObject = z.object({
  name: z.string(),
  display_name: z.string(),
  supports_password: z.boolean().optional(),
});

export const providersSchema = z
  .object({ providers: z.array(providerObject) })
  .transform((value): AuthProvidersPayload => ({
    providers: value.providers.map((provider): AuthProviderInfo => ({
      name: provider.name,
      displayName: provider.display_name,
      supportsPassword: provider.supports_password ?? false,
    })),
  }));

const meObject = z.object({
  user_id: z.string(),
  email: z.string().optional(),
  display_name: z.string().optional(),
  org_id: z.string().optional(),
  provider: z.string(),
  expires_at: z.number().optional(),
});

export const meSchema = meObject.transform((value): AuthMePayload => ({
  userId: value.user_id,
  email: value.email ?? '',
  displayName: value.display_name ?? '',
  orgId: value.org_id ?? '',
  provider: value.provider,
  expiresAt: value.expires_at ?? 0,
}));

const tokenObject = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  token_type: z.string(),
  expires_at: z.number(),
  provider: z.string(),
  user_id: z.string(),
});

export const tokenSchema = tokenObject.transform((value): TokenBundle => ({
  accessToken: value.access_token,
  refreshToken: value.refresh_token,
  tokenType: value.token_type,
  expiresAt: value.expires_at,
  provider: value.provider,
  userId: value.user_id,
}));

const wsTicketObject = z.object({
  ticket: z.string(),
  ttl_seconds: z.number(),
});

export const wsTicketSchema = wsTicketObject.transform((value): WsTicketPayload => ({
  ticket: value.ticket,
  ttlSeconds: value.ttl_seconds,
}));

const profileRowSchema = z
  .object({
    name: z.string(),
    is_default: z.boolean().optional(),
    display_name: z.string().optional(),
    canonical_session: z.unknown().optional(),
    last_session: z.unknown().optional(),
  })
  .catchall(z.unknown());

export const profilesListSchema = z
  .object({
    profiles: z.array(profileRowSchema),
    bot_mode_protocol: z.boolean().optional(),
    install_id: z.string().optional(),
  })
  .catchall(z.unknown());

const sessionRowSchema = z
  .object({
    id: z.string(),
    resolved_id: z.string().nullish(),
    title: z.string().optional(),
    message_count: z.number().optional(),
  })
  .catchall(z.unknown());

export const sessionListSchema = z
  .object({ sessions: z.array(sessionRowSchema) })
  .catchall(z.unknown());

export const clientCapabilitiesSchema = z
  .object({
    server_requests: z.array(z.string()).optional(),
    declines_not_shown: z.boolean().optional(),
    canonical_clarify_batch: z.boolean().optional(),
  })
  .catchall(z.unknown());

/** `{error: "session_expired"}` body of a rejected native refresh. */
export const sessionExpiredSchema = z.object({ error: z.string() });

const groupMemberSchema = z
  .object({
    member_id: z.string(),
    profile: z.string(),
    display_name: z.string().optional(),
  })
  .catchall(z.unknown());

const groupRowSchema = z
  .object({
    room_id: z.string(),
    name: z.string(),
    members: z.array(groupMemberSchema).optional(),
    updated_at: z.number().optional(),
    latest_seq: z.number().optional(),
  })
  .catchall(z.unknown());

/** `groups.list` response; the hosted-room plugin may be absent on older deployments. */
export const groupListSchema = z
  .object({
    rooms: z.array(groupRowSchema),
    next_offset: z.number().nullish(),
  })
  .catchall(z.unknown());

const groupStateRoomSchema = groupRowSchema.extend({
  authority_epoch: z.number().optional(),
});

export const groupStateSchema = z
  .object({
    room: groupStateRoomSchema,
    driver_status: z.unknown().optional(),
  })
  .catchall(z.unknown());

const groupEventSchema = z
  .object({
    seq: z.number(),
    kind: z.string(),
    created_at: z.number().optional(),
    payload: z.unknown().optional(),
  })
  .catchall(z.unknown());

export const groupLogSchema = z
  .object({
    events: z.array(groupEventSchema),
    cursor: z.number().optional(),
    latest_seq: z.number().optional(),
    has_more: z.boolean().optional(),
  })
  .catchall(z.unknown());

export const emptySchema = z.unknown();
