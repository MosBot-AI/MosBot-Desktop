import type {
  AppearanceInput,
  AppearanceResult,
  CreateBotInput,
  CreateBotResult,
  DashboardTarget,
  ModelReadiness,
  RemoteBot,
  Result,
} from '../../shared/protocol';
import { protocolError } from '../../shared/protocol';
import type { AuthManager } from './auth';
import { mapProfileRow } from './bots';
import { connectGateway, type GatewayOptions, type RpcClient } from './rpc';
import { emptySchema } from './schemas';
import { requestJson, type TransportFetch } from './transport';

export interface ProfileDeps {
  readonly auth: AuthManager;
  readonly fetchImpl: TransportFetch;
  readonly requestTimeoutMs?: number;
  readonly connect?: (options: GatewayOptions) => Promise<Result<RpcClient>>;
}

const RPC_TIMEOUT_MS = 60_000;
const META_KEY = 'hermes-bots';

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function connectionError<T>(): Result<T> {
  return {
    ok: false,
    error: protocolError('unauthorized', 'Sign in to the Dashboard first.'),
  };
}

function requireTarget(deps: ProfileDeps): DashboardTarget | null {
  return deps.auth.current().connected ? deps.auth.target() : null;
}

async function connect(deps: ProfileDeps, target: DashboardTarget): Promise<Result<RpcClient>> {
  const connectFn = deps.connect ?? connectGateway;
  return connectFn({
    fetchImpl: deps.fetchImpl,
    target,
    getAccessToken: () => deps.auth.accessToken(),
    requestTimeoutMs: deps.requestTimeoutMs ?? RPC_TIMEOUT_MS,
  });
}

function restOptions(deps: ProfileDeps, target: DashboardTarget) {
  return {
    fetchImpl: deps.fetchImpl,
    target,
    ...(deps.requestTimeoutMs === undefined ? {} : { timeoutMs: deps.requestTimeoutMs }),
    getAccessToken: () => deps.auth.accessToken(),
  };
}

/** The Dashboard page where a Bot's model/authorisation is configured. */
export function profileConfigUrl(target: DashboardTarget): string {
  return `${target.displayUrl}/profiles`;
}

/** Roster reads can lag a just-written profile.yaml by a poll cycle; retry briefly. */
async function readRosterBotEventually(
  deps: ProfileDeps,
  profileName: string,
  accept: (bot: RemoteBot) => boolean,
  attempts = 6,
  delayMs = 250,
): Promise<Result<RemoteBot | null>> {
  let last: Result<RemoteBot | null> = { ok: true, data: null };
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await readRosterBot(deps, profileName);
    if (!last.ok || (last.data !== null && accept(last.data))) {
      return last;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }
  return last;
}

/**
 * Reads one roster row through the gateway's `profiles.list` (the REST list does
 * not carry `ui_meta`, so appearance must come from the WS projection).
 */
export async function readRosterBot(
  deps: ProfileDeps,
  profileName: string,
): Promise<Result<RemoteBot | null>> {
  const target = requireTarget(deps);
  if (target === null) {
    return connectionError();
  }
  const connection = await connect(deps, target);
  if (!connection.ok) {
    return connection;
  }
  const client = connection.data;
  try {
    const profiles = await client.call('profiles.list', { include_sessions: true }, emptySchema);
    if (!profiles.ok) {
      return profiles;
    }
    const rows = Array.isArray(asRecord(profiles.data)?.['profiles'])
      ? (asRecord(profiles.data)?.['profiles'] as unknown[])
      : [];
    for (const row of rows) {
      const bot = mapProfileRow(row);
      if (bot !== null && bot.profileName === profileName) {
        return { ok: true, data: bot };
      }
    }
    return { ok: true, data: null };
  } finally {
    client.close();
  }
}

/** Model/authorisation readiness for one profile (`/api/model/info`). */
export async function readModelReadiness(
  deps: ProfileDeps,
  profileName: string,
): Promise<Result<ModelReadiness>> {
  const target = requireTarget(deps);
  if (target === null) {
    return connectionError();
  }
  const info = await requestJson(restOptions(deps, target), {
    method: 'GET',
    path: `/api/model/info?profile=${encodeURIComponent(profileName)}`,
    authenticated: true,
    schema: emptySchema,
  });
  if (!info.ok) {
    return info;
  }
  const record = asRecord(info.data);
  const provider = str(record?.['provider']);
  const model = str(record?.['model']);
  return { ok: true, data: { ready: provider !== '' && model !== '', provider, model } };
}

/**
 * M2 create flow: a fresh profile (no inherited credentials), then the appearance
 * CAS write, then read the roster row and model readiness back. A rejected CAS is
 * reported as a conflict with the current revision so the UI can retry.
 */
export async function createRemoteBot(
  deps: ProfileDeps,
  input: CreateBotInput,
): Promise<Result<CreateBotResult>> {
  const target = requireTarget(deps);
  if (target === null) {
    return connectionError();
  }
  const name = input.name.trim();
  if (name === '' || name.length > 64) {
    return { ok: false, error: protocolError('invalid_url', 'A Bot name is required.') };
  }
  const connection = await connect(deps, target);
  if (!connection.ok) {
    return connection;
  }
  const client = connection.data;
  let appearanceApplied = true;
  let appearanceRevision = 0;
  try {
    const created = await client.call(
      'profiles.create',
      {
        name,
        ...(input.description === undefined ? {} : { description: input.description }),
        no_skills: true,
        no_alias: true,
        mirror_credentials: false,
      },
      emptySchema,
    );
    if (!created.ok) {
      return created;
    }

    if (input.shape !== undefined && input.color !== undefined) {
      const appearance = await client.call(
        'profiles.configure',
        {
          name,
          ui_meta: {
            [META_KEY]: {
              title: name,
              shape: input.shape,
              color: input.color,
              custom: true,
            },
          },
          ui_meta_expected_revisions: { [META_KEY]: 0 },
        },
        emptySchema,
      );
      if (!appearance.ok) {
        appearanceApplied = false;
      } else {
        const applied = asRecord(asRecord(appearance.data)?.['applied']);
        appearanceApplied = applied?.['ui_meta'] === true;
        const revisions = asRecord(applied?.['ui_meta_revisions']);
        const revision = revisions?.[META_KEY];
        if (typeof revision === 'number' && Number.isInteger(revision)) {
          appearanceRevision = revision;
        }
      }
    }
  } finally {
    client.close();
  }

  const roster = await readRosterBotEventually(
    deps,
    name,
    (bot) =>
      bot.metaRevision >= appearanceRevision &&
      (input.shape === undefined || bot.shape === input.shape) &&
      (input.color === undefined || bot.color.toLowerCase() === input.color.toLowerCase()),
  );
  if (!roster.ok) {
    return roster;
  }
  if (roster.data === null) {
    return {
      ok: false,
      error: protocolError('malformed_response', 'The new Bot did not appear in the roster.'),
    };
  }
  const model = await readModelReadiness(deps, name);
  if (!model.ok) {
    return model;
  }
  // The roster read can still lag the profile.yaml write; the configure response
  // already proved the CAS revision, so merge what we just wrote into the row.
  const bot: RemoteBot = {
    ...roster.data,
    shape: input.shape ?? roster.data.shape,
    color: input.color ?? roster.data.color,
    metaRevision: Math.max(roster.data.metaRevision, appearanceRevision),
  };
  return {
    ok: true,
    data: {
      bot,
      modelReady: model.data.ready,
      configUrl: profileConfigUrl(target),
      appearanceApplied,
    },
  };
}

/** Writes shape/colour/display title through the CAS-protected `ui_meta`. */
export async function setRemoteAppearance(
  deps: ProfileDeps,
  profileName: string,
  look: AppearanceInput,
  expectedRevision: number,
): Promise<Result<AppearanceResult>> {
  const target = requireTarget(deps);
  if (target === null) {
    return connectionError();
  }
  const connection = await connect(deps, target);
  if (!connection.ok) {
    return connection;
  }
  const client = connection.data;
  try {
    const configured = await client.call(
      'profiles.configure',
      {
        name: profileName,
        ui_meta: {
          [META_KEY]: {
            ...(look.title === undefined ? {} : { title: look.title }),
            shape: look.shape,
            color: look.color,
            custom: true,
          },
        },
        ui_meta_expected_revisions: { [META_KEY]: expectedRevision },
      },
      emptySchema,
    );
    if (!configured.ok) {
      return configured;
    }
    const applied = asRecord(asRecord(configured.data)?.['applied']);
    const conflicts = asRecord(applied?.['ui_meta_conflicts']);
    const revisions = asRecord(applied?.['ui_meta_revisions']);
    const revision = revisions?.[META_KEY];
    if (conflicts !== null && conflicts[META_KEY] !== undefined) {
      const actual = asRecord(conflicts[META_KEY])?.['actual'];
      return {
        ok: false,
        error: protocolError(
          'conflict',
          `The Bot appearance changed elsewhere (now revision ${typeof actual === 'number' ? actual : 'unknown'}).`,
          { retriable: true },
        ),
      };
    }
    if (applied?.['ui_meta'] !== true) {
      return {
        ok: false,
        error: protocolError('internal', 'The Dashboard did not apply the appearance change.'),
      };
    }
    return {
      ok: true,
      data: {
        revision: typeof revision === 'number' ? revision : expectedRevision + 1,
      },
    };
  } finally {
    client.close();
  }
}

/** Renames a profile through the REST endpoint (stops a running gateway first). */
export async function renameRemoteBot(
  deps: ProfileDeps,
  profileName: string,
  newName: string,
): Promise<Result<{ profile: string; displayName: string }>> {
  const target = requireTarget(deps);
  if (target === null) {
    return connectionError();
  }
  const name = newName.trim();
  if (name === '' || name.length > 64) {
    return { ok: false, error: protocolError('invalid_url', 'A new name is required.') };
  }
  const renamed = await requestJson(restOptions(deps, target), {
    method: 'PATCH',
    path: `/api/profiles/${encodeURIComponent(profileName)}`,
    body: { new_name: name },
    authenticated: true,
    schema: emptySchema,
  });
  if (!renamed.ok) {
    return renamed;
  }
  const record = asRecord(renamed.data);
  return {
    ok: true,
    data: {
      profile: str(record?.['name']) || name,
      displayName: str(record?.['display_name']) || name,
    },
  };
}

/** Writes the profile's model/provider (Dashboard `PUT /api/profiles/{name}/model`). */
export async function setProfileModel(
  deps: ProfileDeps,
  profileName: string,
  provider: string,
  model: string,
): Promise<Result<{ provider: string; model: string }>> {
  const target = requireTarget(deps);
  if (target === null) {
    return connectionError();
  }
  const written = await requestJson(restOptions(deps, target), {
    method: 'PUT',
    path: `/api/profiles/${encodeURIComponent(profileName)}/model`,
    body: { provider, model },
    authenticated: true,
    schema: emptySchema,
  });
  if (!written.ok) {
    return written;
  }
  const record = asRecord(written.data);
  return {
    ok: true,
    data: {
      provider: str(record?.['provider']) || provider,
      model: str(record?.['model']) || model,
    },
  };
}
