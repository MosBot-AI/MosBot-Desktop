import type { CronJob, DashboardTarget, Result } from '../../shared/protocol';
import { protocolError } from '../../shared/protocol';
import type { AuthManager } from './auth';
import { emptySchema } from './schemas';
import { requestJson, type TransportFetch } from './transport';

export interface CronDeps {
  readonly auth: AuthManager;
  readonly fetchImpl: TransportFetch;
  readonly requestTimeoutMs?: number;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Read-only cron job overview for the details column. */
export async function listCronJobs(
  deps: CronDeps,
  profile: string,
): Promise<Result<readonly CronJob[]>> {
  const target: DashboardTarget | null = deps.auth.current().connected ? deps.auth.target() : null;
  if (target === null) {
    return {
      ok: false,
      error: protocolError('unauthorized', 'Sign in to the Dashboard first.'),
    };
  }
  const response = await requestJson(
    {
      fetchImpl: deps.fetchImpl,
      target,
      ...(deps.requestTimeoutMs === undefined ? {} : { timeoutMs: deps.requestTimeoutMs }),
      getAccessToken: () => deps.auth.accessToken(),
    },
    {
      method: 'GET',
      path: `/api/cron/jobs?profile=${encodeURIComponent(profile)}`,
      authenticated: true,
      schema: emptySchema,
    },
  );
  if (!response.ok) {
    return response;
  }
  const rows = Array.isArray(asRecord(response.data)?.['jobs'])
    ? (asRecord(response.data)?.['jobs'] as unknown[])
    : [];
  const jobs: CronJob[] = [];
  for (const value of rows) {
    const row = asRecord(value);
    if (row === null) {
      continue;
    }
    const id = str(row['id']) || str(row['name']);
    if (id === '') {
      continue;
    }
    jobs.push({
      id,
      name: str(row['name']) || str(row['title']) || id,
      schedule: str(row['schedule']) || str(row['cron']),
      enabled: row['enabled'] !== false,
      lastRunAt: num(row['last_run_at']) ?? num(row['last_run']),
    });
  }
  return { ok: true, data: jobs };
}
