import type { ZodType } from 'zod';
import {
  protocolError,
  targetUrl,
  type CapabilityRow,
  type DashboardTarget,
  type ProbeReport,
  type Result,
} from '../../shared/protocol';
import type { AuthManager } from './auth';
import { createChatManager, type ChatManager } from './chat';
import { connectGateway, type RpcClient } from './rpc';
import { emptySchema } from './schemas';
import type { DashboardChatEvent } from '../../shared/protocol';
import { requestJson, type TransportFetch } from './transport';

export interface WriteProbeDeps {
  readonly auth: AuthManager;
  readonly fetchImpl: TransportFetch;
  readonly requestTimeoutMs?: number;
  readonly now?: () => number;
}

const MASK_VISIBLE = 8;
const FIRST_REPLY_TIMEOUT_MS = 25_000;
/** Profile creation seeds skills on disk and can take much longer than a REST read. */
const WRITE_RPC_TIMEOUT_MS = 90_000;
const STALE_MARKER_MS = 2 * 60_000;

function row(
  id: string,
  title: string,
  status: CapabilityRow['status'],
  detail: string,
  required = true,
): CapabilityRow {
  return { id, title, status, detail, required };
}

function mask(value: string): string {
  if (value === '') {
    return '(none)';
  }
  return value.length <= MASK_VISIBLE
    ? `${value.slice(0, 2)}…`
    : `${value.slice(0, MASK_VISIBLE)}…`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function stringField(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' ? value : null;
}

function numberField(record: Record<string, unknown> | null, key: string): number | null {
  const value = record?.[key];
  return typeof value === 'number' ? value : null;
}

function dataOf(result: Result<unknown>): unknown {
  return result.ok ? result.data : null;
}

function markerFor(prefix: string, now: number): string {
  const date = new Date(now);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${prefix}-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function errorDetail(error: { message: string }): string {
  return error.message.replace(/\s+/g, ' ').slice(0, 160);
}

interface RestClient {
  get(path: string): Promise<Result<unknown>>;
  send(
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<Result<unknown>>;
}

function createRest(deps: WriteProbeDeps, target: DashboardTarget): RestClient {
  const options = {
    fetchImpl: deps.fetchImpl,
    target,
    ...(deps.requestTimeoutMs === undefined ? {} : { timeoutMs: deps.requestTimeoutMs }),
    getAccessToken: () => deps.auth.accessToken(),
  };
  return {
    get: (path) =>
      requestJson(options, { method: 'GET', path, authenticated: true, schema: emptySchema }),
    send: (method, path, body) =>
      requestJson(options, {
        method,
        path,
        authenticated: true,
        ...(body === undefined ? {} : { body }),
        schema: emptySchema,
      }),
  };
}

function rpc<T>(
  client: RpcClient,
  method: string,
  params: Record<string, unknown>,
  schema: ZodType<T>,
): Promise<Result<T>> {
  return client.call(method, params, schema);
}

/**
 * M0b step 3: create a clearly-marked dedicated profile, read back its config,
 * exercise the canonical Bot Chat title claim from two clients, attempt a first
 * reply (expected to be blocked until a model is authorised) and delete the
 * profile again. Every write targets only this run's marker object.
 */
export async function runNewBotProbe(deps: WriteProbeDeps): Promise<Result<ProbeReport>> {
  const target = deps.auth.target();
  if (target === null || !deps.auth.current().connected) {
    return {
      ok: false,
      error: protocolError('unauthorized', 'Sign in to the Dashboard before running this probe.'),
    };
  }
  const now = deps.now ?? (() => Date.now());
  const marker = markerFor('mosbot-probe', now());
  const rest = createRest(deps, target);
  const rows: CapabilityRow[] = [];

  const connect = async (): Promise<Result<RpcClient>> =>
    connectGateway({
      fetchImpl: deps.fetchImpl,
      target,
      getAccessToken: () => deps.auth.accessToken(),
      requestTimeoutMs: deps.requestTimeoutMs ?? WRITE_RPC_TIMEOUT_MS,
    });

  const clientA = await connect();
  const clientB = await connect();
  if (!clientA.ok || !clientB.ok) {
    return {
      ok: false,
      error: !clientA.ok
        ? clientA.error
        : !clientB.ok
          ? clientB.error
          : protocolError('internal', 'connect failed'),
    };
  }
  const a = clientA.data;
  const b = clientB.data;

  let profileCreated = false;
  let runtimeSessionA: string | null = null;
  let storedSessionA: string | null = null;

  try {
    // Clean up an earlier run that died before its cleanup (only our own marker shape).
    const existing = await rest.get('/api/profiles');
    const existingRows = asArray(asRecord(dataOf(existing))?.['profiles']) ?? [];
    for (const entry of existingRows) {
      const name = stringField(asRecord(entry), 'name') ?? '';
      // 12-digit markers come from the first probe build (minute precision).
      const match = /^mosbot-probe-(\d{12}|\d{14})$/.exec(name);
      if (match === null) {
        continue;
      }
      const stamp = match[1] ?? '';
      const parsed = Date.parse(
        `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:${stamp.slice(12, 14) || '00'}`,
      );
      if (Number.isFinite(parsed) && now() - parsed > STALE_MARKER_MS) {
        await rest.send('DELETE', `/api/profiles/${encodeURIComponent(name)}`);
      }
    }

    // 1) Create the dedicated profile (fresh, no inherited credentials, no CLI alias).
    const created = await rpc(
      a,
      'profiles.create',
      {
        name: marker,
        description: 'MosBot automated probe; safe to delete',
        no_skills: true,
        no_alias: true,
        mirror_credentials: false,
      },
      emptySchema,
    );
    profileCreated = created.ok;
    rows.push(
      row(
        'profile_create',
        '新建专用 profile',
        created.ok ? 'pass' : 'fail',
        created.ok
          ? `name=${marker} · model_set=${String(asRecord(created.data)?.['model_set'])} · mirrored=${JSON.stringify(asRecord(asRecord(created.data)?.['mirrored']) ?? {})}`
          : errorDetail(created.error),
      ),
    );
    if (!created.ok) {
      return { ok: true, data: { generatedAt: now(), target: target.displayUrl, rows } };
    }

    // 2) Read back the roster row and the model state.
    const profiles = await rest.get('/api/profiles');
    const roster = asArray(asRecord(profiles.ok ? profiles.data : null)?.['profiles']) ?? [];
    const profileRow =
      roster
        .map((entry) => asRecord(entry))
        .find((entry) => stringField(entry, 'name') === marker) ?? null;
    rows.push(
      row(
        'profile_readback',
        'Profile 列表回读',
        profiles.ok && profileRow !== null ? 'pass' : 'fail',
        profiles.ok
          ? `found=${profileRow !== null} · is_default=${String(profileRow?.['is_default'])} · model=${String(profileRow?.['model'] ?? '(none)')} · provider=${String(profileRow?.['provider'] ?? '(none)')} · has_env=${String(profileRow?.['has_env'])}`
          : errorDetail(profiles.error),
      ),
    );

    const modelBefore = await rest.get(`/api/model/info?profile=${encodeURIComponent(marker)}`);
    const modelBeforeRecord = asRecord(modelBefore.ok ? modelBefore.data : null);
    const providerBefore = stringField(modelBeforeRecord, 'provider') ?? '';
    const modelBeforeName = stringField(modelBeforeRecord, 'model') ?? '';
    rows.push(
      row(
        'model_readiness',
        '新 Bot 模型/授权状态',
        modelBefore.ok && (providerBefore !== '' || modelBeforeName !== '') ? 'pass' : 'unverified',
        modelBefore.ok
          ? `provider=${providerBefore === '' ? '(none)' : providerBefore} · model=${modelBeforeName === '' ? '(none)' : modelBeforeName} · 说明：新 profile 不继承凭据，未配置前不能推理`
          : errorDetail(modelBefore.error),
      ),
    );

    // 3) Model configuration write on the dedicated profile, then read back. The
    // provider/model pair comes from the current default profile so the probe does
    // not invent a route this deployment does not know.
    const referenceModel = asRecord(dataOf(await rest.get('/api/model/info')));
    const referenceProvider = stringField(referenceModel, 'provider') ?? '';
    const referenceModelName = stringField(referenceModel, 'model') ?? '';
    if (referenceProvider === '' || referenceModelName === '') {
      rows.push(
        row(
          'model_write',
          '模型配置写入并回读 /api/profiles/{name}/model',
          'unverified',
          '当前默认 profile 没有可参照的 provider/model，跳过写入',
        ),
      );
    } else {
      const modelWrite = await rest.send(
        'PUT',
        `/api/profiles/${encodeURIComponent(marker)}/model`,
        {
          provider: referenceProvider,
          model: referenceModelName,
        },
      );
      const modelAfter = await rest.get(`/api/model/info?profile=${encodeURIComponent(marker)}`);
      const modelAfterRecord = asRecord(dataOf(modelAfter));
      rows.push(
        row(
          'model_write',
          '模型配置写入并回读 /api/profiles/{name}/model',
          modelWrite.ok &&
            stringField(modelAfterRecord, 'provider') === referenceProvider &&
            stringField(modelAfterRecord, 'model') === referenceModelName
            ? 'pass'
            : 'fail',
          modelWrite.ok
            ? `written · readback provider=${String(modelAfterRecord?.['provider'] ?? '(none)')} · model=${String(modelAfterRecord?.['model'] ?? '(none)')}（凭据仍需授权，首回复另行验证）`
            : errorDetail(modelWrite.error),
        ),
      );
    }

    // 4) Canonical Bot Chat: create a hidden draft, claim the exact title, then look it up.
    const sessionCreate = await rpc(
      a,
      'session.create',
      {
        profile: marker,
        title: 'Bot Chat',
        hidden: true,
        follow_profile_config: true,
        idempotency_key: `mosbot-probe-a-${marker}`,
      },
      emptySchema,
    );
    const createRecord = asRecord(sessionCreate.ok ? sessionCreate.data : null);
    runtimeSessionA = stringField(createRecord, 'session_id');
    storedSessionA = stringField(createRecord, 'stored_session_id');
    rows.push(
      row(
        'session_create',
        '新建 Bot Chat 草稿 session.create',
        sessionCreate.ok && runtimeSessionA !== null ? 'pass' : 'fail',
        sessionCreate.ok
          ? `runtime=${mask(runtimeSessionA ?? '')} · stored=${mask(storedSessionA ?? '')} · lazy=${String(asRecord(createRecord?.['info'])?.['lazy'])}`
          : errorDetail(sessionCreate.error),
      ),
    );

    if (runtimeSessionA === null) {
      return { ok: true, data: { generatedAt: now(), target: target.displayUrl, rows } };
    }

    const titleClaim = await rpc(
      a,
      'session.title',
      {
        session_id: runtimeSessionA,
        title: 'Bot Chat',
      },
      emptySchema,
    );
    const claimRecord = asRecord(titleClaim.ok ? titleClaim.data : null);
    rows.push(
      row(
        'title_claim',
        '首次发送前认领标题 session.title',
        titleClaim.ok && claimRecord?.['pending'] !== true ? 'pass' : 'fail',
        titleClaim.ok
          ? `title=${String(claimRecord?.['title'])} · pending=${String(claimRecord?.['pending'])}`
          : errorDetail(titleClaim.error),
      ),
    );

    const canonical = await rpc(
      a,
      'session.list',
      {
        profile: marker,
        title: 'Bot Chat',
        include_hidden: true,
      },
      emptySchema,
    );
    const canonicalRows =
      asArray(asRecord(canonical.ok ? canonical.data : null)?.['sessions']) ?? [];
    const canonicalRow = asRecord(canonicalRows[0]);
    const canonicalId = stringField(canonicalRow, 'id');
    const resolvedId = stringField(canonicalRow, 'resolved_id');
    rows.push(
      row(
        'canonical_lookup',
        '精确 Bot Chat 查询与 canonical 认领',
        canonical.ok && canonicalRows.length === 1 && canonicalId === storedSessionA
          ? 'pass'
          : 'fail',
        canonical.ok
          ? `matches=${canonicalRows.length} · id=${mask(canonicalId ?? '')} · resolved_id=${mask(resolvedId ?? '')} · stored_matches=${String(canonicalId === storedSessionA)}`
          : errorDetail(canonical.error),
      ),
    );

    // 5) Second client: a candidate session that tries to claim the same title.
    const sessionCreateB = await rpc(
      b,
      'session.create',
      {
        profile: marker,
        title: 'Bot Chat',
        hidden: true,
        follow_profile_config: true,
        idempotency_key: `mosbot-probe-b-${marker}`,
      },
      emptySchema,
    );
    const runtimeSessionB = stringField(
      asRecord(sessionCreateB.ok ? sessionCreateB.data : null),
      'session_id',
    );
    if (runtimeSessionB === null) {
      rows.push(row('title_conflict', '双端标题竞争', 'fail', '第二个客户端未能创建候选会话'));
    } else {
      const conflict = await rpc(
        b,
        'session.title',
        {
          session_id: runtimeSessionB,
          title: 'Bot Chat',
        },
        emptySchema,
      );
      const conflictCode =
        !conflict.ok && conflict.error.code === 'http_error' ? 'conflict-or-error' : 'no-error';
      rows.push(
        row(
          'title_conflict',
          '双端标题竞争',
          !conflict.ok ? 'pass' : 'fail',
          !conflict.ok
            ? `second claim rejected (${conflictCode}) · ${errorDetail(conflict.error)}`
            : `second claim accepted with title ${String(asRecord(conflict.data)?.['title'])}`,
        ),
      );

      const canonicalAfter = await rpc(
        a,
        'session.list',
        {
          profile: marker,
          title: 'Bot Chat',
          include_hidden: true,
        },
        emptySchema,
      );
      const afterRows =
        asArray(asRecord(canonicalAfter.ok ? canonicalAfter.data : null)?.['sessions']) ?? [];
      const afterId = stringField(asRecord(afterRows[0]), 'id');
      rows.push(
        row(
          'canonical_after_conflict',
          '冲突后 canonical 不变',
          canonicalAfter.ok && afterRows.length === 1 && afterId === storedSessionA
            ? 'pass'
            : 'fail',
          canonicalAfter.ok
            ? `matches=${afterRows.length} · canonical=${mask(afterId ?? '')} · unchanged=${String(afterId === storedSessionA)}`
            : errorDetail(canonicalAfter.error),
        ),
      );
    }

    // 6) First real reply attempt. A fresh profile has no credentials, so this is
    // expected to fail until the model authorisation flow exists; record the real
    // error instead of pretending the new-Bot path is complete.
    const submit = await rpc(
      a,
      'prompt.submit',
      {
        session_id: runtimeSessionA,
        text: 'MosBot 自动探针：请只回复 pong。',
      },
      emptySchema,
    );
    if (!submit.ok) {
      rows.push(
        row(
          'first_reply',
          '新 Bot 首条真实回复',
          'unverified',
          `prompt.submit rejected: ${errorDetail(submit.error)} · 阻塞：新 profile 未授权模型/凭据，M0c/M2 需提供配置入口`,
        ),
      );
      rows.push(row('interrupt', '停止与终态', 'unverified', '没有真实 turn 可停止'));
    } else {
      const delta = await a.waitForEvent('message.delta', FIRST_REPLY_TIMEOUT_MS);
      rows.push(
        row(
          'first_reply',
          '新 Bot 首条真实回复',
          delta.ok ? 'pass' : 'unverified',
          delta.ok
            ? `first delta received (seq=${String(delta.data.seq)}) · 仍需确认模型授权来源`
            : `turn accepted but no delta in ${FIRST_REPLY_TIMEOUT_MS / 1000}s`,
        ),
      );
      const interrupt = await rpc(
        a,
        'session.interrupt',
        { session_id: runtimeSessionA },
        emptySchema,
      );
      rows.push(
        row(
          'interrupt',
          '停止与终态',
          interrupt.ok ? 'pass' : 'unverified',
          interrupt.ok ? 'interrupt accepted' : errorDetail(interrupt.error),
        ),
      );
    }
  } finally {
    a.close();
    b.close();
    if (profileCreated) {
      const deleted = await rest.send('DELETE', `/api/profiles/${encodeURIComponent(marker)}`);
      const after = await rest.get('/api/profiles');
      const remaining = asArray(asRecord(after.ok ? after.data : null)?.['profiles']) ?? [];
      const stillThere = remaining
        .map((entry) => asRecord(entry))
        .some((entry) => stringField(entry, 'name') === marker);
      rows.push(
        row(
          'cleanup',
          '清理专用 profile',
          deleted.ok && !stillThere ? 'pass' : 'fail',
          deleted.ok
            ? `deleted · remaining_marker=${String(stillThere)}`
            : errorDetail(deleted.error),
        ),
      );
    }
  }

  return { ok: true, data: { generatedAt: now(), target: target.displayUrl, rows } };
}

/**
 * M0b step 4 write path: a marked Kanban board and task, status patch with server
 * read-back and the event cursor moving, then deletion of both.
 */
export async function runKanbanWriteProbe(deps: WriteProbeDeps): Promise<Result<ProbeReport>> {
  const target = deps.auth.target();
  if (target === null || !deps.auth.current().connected) {
    return {
      ok: false,
      error: protocolError('unauthorized', 'Sign in to the Dashboard before running this probe.'),
    };
  }
  const now = deps.now ?? (() => Date.now());
  const marker = markerFor('mosbot-probe-board', now());
  const rest = createRest(deps, target);
  const rows: CapabilityRow[] = [];
  let boardCreated = false;
  let taskId: string | null = null;

  const boardPayload = async (): Promise<Record<string, unknown> | null> => {
    const result = await rest.get(`/api/plugins/kanban/board?board=${encodeURIComponent(marker)}`);
    return asRecord(result.ok ? result.data : null);
  };

  const countTasks = (payload: Record<string, unknown> | null): number | null => {
    const columns = asArray(payload?.['columns']);
    if (columns === null) {
      return null;
    }
    return columns.reduce<number>((total, column) => {
      const tasks = asArray(asRecord(column)?.['tasks']);
      return total + (tasks?.length ?? 0);
    }, 0);
  };

  try {
    const createdBoard = await rest.send('POST', '/api/plugins/kanban/boards', {
      slug: marker,
      name: 'MosBot Probe Board',
      description: 'Automated MosBot probe; safe to delete',
      switch: false,
    });
    boardCreated = createdBoard.ok;
    rows.push(
      row(
        'board_create',
        '新建专用 board',
        createdBoard.ok ? 'pass' : 'fail',
        createdBoard.ok
          ? `slug=${marker} · keys=${Object.keys(asRecord(createdBoard.data) ?? {})
              .slice(0, 8)
              .join(',')}`
          : errorDetail(createdBoard.error),
      ),
    );
    if (!createdBoard.ok) {
      return { ok: true, data: { generatedAt: now(), target: target.displayUrl, rows } };
    }

    const before = await boardPayload();
    const cursorBefore = numberField(before, 'latest_event_id');
    rows.push(
      row(
        'board_snapshot',
        'Board 快照与游标',
        before !== null ? 'pass' : 'fail',
        before !== null
          ? `columns=${asArray(before['columns'])?.length ?? '—'} · tasks=${String(countTasks(before))} · latest_event_id=${String(cursorBefore)}`
          : 'board snapshot unavailable',
      ),
    );

    const createdTask = await rest.send(
      'POST',
      `/api/plugins/kanban/tasks?board=${encodeURIComponent(marker)}`,
      {
        title: 'MosBot probe task',
        body: 'Automated MosBot probe; safe to delete',
        idempotency_key: `mosbot-probe-task-${marker}`,
      },
    );
    const taskRecord = asRecord(asRecord(dataOf(createdTask))?.['task']);
    taskId = stringField(taskRecord, 'id');
    rows.push(
      row(
        'task_create',
        '新建任务并回读 id',
        createdTask.ok && taskId !== null ? 'pass' : 'fail',
        createdTask.ok
          ? `id=${mask(taskId ?? '')} · status=${String(taskRecord?.['status'] ?? '—')}`
          : errorDetail(createdTask.error),
      ),
    );

    if (taskId === null) {
      return { ok: true, data: { generatedAt: now(), target: target.displayUrl, rows } };
    }

    const readback = await rest.get(
      `/api/plugins/kanban/tasks/${encodeURIComponent(taskId)}?board=${encodeURIComponent(marker)}`,
    );
    const readbackTask = asRecord(asRecord(dataOf(readback))?.['task']);
    rows.push(
      row(
        'task_readback',
        '任务详情回读',
        readback.ok && readbackTask !== null ? 'pass' : 'fail',
        readback.ok
          ? `status=${String(readbackTask?.['status'] ?? '—')} · title=${String(readbackTask?.['title'] ?? '—')}`
          : errorDetail(readback.error),
      ),
    );

    const patched = await rest.send(
      'PATCH',
      `/api/plugins/kanban/tasks/${encodeURIComponent(taskId)}?board=${encodeURIComponent(marker)}`,
      { status: 'done', summary: 'MosBot probe completed' },
    );
    const patchedTask = asRecord(asRecord(dataOf(patched))?.['task']);
    rows.push(
      row(
        'task_status_patch',
        '任务状态写入（→ done）',
        patched.ok && stringField(patchedTask, 'status') === 'done' ? 'pass' : 'fail',
        patched.ok
          ? `status=${String(patchedTask?.['status'] ?? '—')}`
          : errorDetail(patched.error),
      ),
    );

    const after = await boardPayload();
    const cursorAfter = numberField(after, 'latest_event_id');
    const cursorMoved = cursorBefore !== null && cursorAfter !== null && cursorAfter > cursorBefore;
    rows.push(
      row(
        'board_cursor',
        'Board 游标随写入推进',
        cursorMoved ? 'pass' : 'unverified',
        `before=${String(cursorBefore)} · after=${String(cursorAfter)}`,
      ),
    );
  } finally {
    if (taskId !== null) {
      await rest.send(
        'DELETE',
        `/api/plugins/kanban/tasks/${encodeURIComponent(taskId)}?board=${encodeURIComponent(marker)}`,
      );
    }
    if (boardCreated) {
      const deleted = await rest.send(
        'DELETE',
        `/api/plugins/kanban/boards/${encodeURIComponent(marker)}`,
      );
      const boards = await rest.get('/api/plugins/kanban/boards');
      const remaining = asArray(asRecord(boards.ok ? boards.data : null)?.['boards']) ?? [];
      const stillThere = remaining
        .map((entry) => asRecord(entry))
        .some((entry) => stringField(entry, 'slug') === marker);
      rows.push(
        row(
          'cleanup',
          '清理专用 board 与任务',
          deleted.ok && !stillThere ? 'pass' : 'fail',
          deleted.ok
            ? `deleted · remaining_board=${String(stillThere)}`
            : errorDetail(deleted.error),
        ),
      );
    }
  }

  return { ok: true, data: { generatedAt: now(), target: target.displayUrl, rows } };
}

export { targetUrl };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return true;
    }
    await sleep(100);
  }
  return predicate();
}

/**
 * M1 chat probe: creates a dedicated profile, opens its Bot Chat through the same
 * ChatManager the app uses, sends one prompt, waits for the streamed reply, then
 * sends a longer prompt and interrupts it. Everything is deleted afterwards.
 */
export async function runChatProbe(deps: WriteProbeDeps): Promise<Result<ProbeReport>> {
  const target = deps.auth.target();
  if (target === null || !deps.auth.current().connected) {
    return {
      ok: false,
      error: protocolError('unauthorized', 'Sign in to the Dashboard before running this probe.'),
    };
  }
  const now = deps.now ?? (() => Date.now());
  const marker = markerFor('mosbot-chat-probe', now());
  const rest = createRest(deps, target);
  const rows: CapabilityRow[] = [];
  let profileCreated = false;
  let chat: ChatManager | null = null;

  try {
    // Clean up a chat-probe profile left behind by an interrupted earlier run.
    const existing = await rest.get('/api/profiles');
    const existingRows = asArray(asRecord(dataOf(existing))?.['profiles']) ?? [];
    for (const entry of existingRows) {
      const name = stringField(asRecord(entry), 'name') ?? '';
      const match = /^mosbot-chat-probe-(\d{14})$/.exec(name);
      if (match === null) {
        continue;
      }
      const stamp = match[1] ?? '';
      const parsed = Date.parse(
        `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:${stamp.slice(12, 14)}`,
      );
      if (Number.isFinite(parsed) && now() - parsed > 2 * 60_000) {
        await rest.send('DELETE', `/api/profiles/${encodeURIComponent(name)}`);
      }
    }

    const created = await rest.send('POST', '/api/profiles', {
      name: marker,
      description: 'MosBot chat probe; safe to delete',
      no_skills: true,
    });
    profileCreated = created.ok;
    rows.push(
      row(
        'profile_create',
        '聊天探针专用 profile',
        created.ok ? 'pass' : 'fail',
        created.ok ? `name=${marker}` : errorDetail(created.error),
      ),
    );
    if (!created.ok) {
      return { ok: true, data: { generatedAt: now(), target: target.displayUrl, rows } };
    }

    const events: DashboardChatEvent[] = [];
    chat = createChatManager({
      auth: deps.auth,
      fetchImpl: deps.fetchImpl,
      ...(deps.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: deps.requestTimeoutMs }),
    });
    chat.subscribe((event) => {
      events.push(event);
    });

    const opened = await chat.open(marker, null);
    rows.push(
      row(
        'chat_open',
        '打开 Bot Chat 会话',
        opened.ok && opened.data.runtimeSessionId !== null ? 'pass' : 'fail',
        opened.ok
          ? `stored=${mask(opened.data.storedSessionId ?? '')} · runtime=${mask(opened.data.runtimeSessionId ?? '')}`
          : errorDetail(opened.error),
      ),
    );
    if (!opened.ok) {
      return { ok: true, data: { generatedAt: now(), target: target.displayUrl, rows } };
    }

    const sent = await chat.send('MosBot 自动探针：请只回复 pong。');
    rows.push(
      row(
        'chat_send',
        '发送 prompt.submit',
        sent.ok ? 'pass' : 'fail',
        sent.ok ? 'prompt accepted' : errorDetail(sent.error),
      ),
    );

    const sawDelta = await waitFor(
      () => events.some((event) => event.type === 'delta' && event.text !== ''),
      60_000,
    );
    rows.push(
      row(
        'chat_delta',
        '首个流式 delta',
        sawDelta ? 'pass' : 'unverified',
        sawDelta ? 'streamed text arrived' : 'no delta within 60s',
      ),
    );

    const completed = await waitFor(
      () => events.some((event) => event.type === 'turn-complete'),
      90_000,
    );
    const completeEvent = events.find((event) => event.type === 'turn-complete');
    rows.push(
      row(
        'chat_complete',
        '回合终态 message.complete',
        completed ? 'pass' : 'unverified',
        completed && completeEvent?.type === 'turn-complete'
          ? `status=${completeEvent.status} · error=${completeEvent.error ?? 'none'}`
          : 'no terminal event within 90s',
      ),
    );

    // Interrupt path: send a longer prompt and stop it quickly.
    events.length = 0;
    const secondSend = await chat.send('请用大约一百字介绍你自己，并列出三个要点。');
    let stoppedRequest: Result<void> | null = null;
    if (secondSend.ok) {
      await sleep(500);
      stoppedRequest = await chat.stop();
    }
    const interrupted = await waitFor(
      () =>
        events.some(
          (event) =>
            event.type === 'turn-complete' &&
            (event.status === 'interrupted' || event.status === 'error'),
        ),
      60_000,
    );
    rows.push(
      row(
        'chat_stop',
        '停止 session.interrupt',
        stoppedRequest !== null && stoppedRequest.ok && interrupted ? 'pass' : 'unverified',
        stoppedRequest !== null && stoppedRequest.ok
          ? interrupted
            ? 'turn interrupted'
            : 'stop accepted, terminal status not observed within 60s'
          : 'stop was not sent',
      ),
    );

    const chatState = chat.state();
    const approvalMode = chatState.approvalMode;
    rows.push(
      row(
        'chat_server_requests',
        'server_requests 能力声明',
        chatState.serverRequests.includes('approval') &&
          chatState.serverRequests.includes('clarify')
          ? 'pass'
          : 'unverified',
        `methods=${chatState.serverRequests.length} · approval=${chatState.serverRequests.includes('approval')} · clarify=${chatState.serverRequests.includes('clarify')}`,
      ),
    );
    rows.push(
      row(
        'chat_approval_mode',
        '会话审批模式',
        approvalMode === null ? 'unverified' : 'pass',
        approvalMode === null
          ? 'resume/create did not report approval_mode'
          : `approval_mode=${approvalMode}`,
      ),
    );

    // Approval path: ask for a shell command; the gateway should raise a server
    // request that the client answers with choice=once.
    events.length = 0;
    const approvalSend = await chat.send(
      '请用 shell 工具运行命令 echo mosbot-approval-probe，并把输出告诉我。',
    );
    const sawApproval = await waitFor(
      () => events.some((event) => event.type === 'request' && event.request.method === 'approval'),
      90_000,
    );
    const toolEvents = events.filter((event) => event.type === 'tool');
    rows.push(
      row(
        'chat_approval_tools',
        '审批触发前的工具事件',
        toolEvents.length > 0 ? 'pass' : 'unverified',
        toolEvents.length === 0
          ? 'no tool events (agent may have answered without running a command)'
          : `tool events=${toolEvents.length} · names=${toolEvents
              .map((event) => (event.type === 'tool' ? event.name : ''))
              .filter((name) => name !== '')
              .slice(0, 3)
              .join(',')}`,
      ),
    );
    const approvalEvent = events.find(
      (event) => event.type === 'request' && event.request.method === 'approval',
    );
    let answered = false;
    if (approvalEvent?.type === 'request') {
      const answer = await chat.answer(approvalEvent.request.id, { choice: 'once' });
      answered = answer.ok;
    }
    const approvalCompleted = await waitFor(
      () => events.some((event) => event.type === 'turn-complete'),
      120_000,
    );
    const approvalCompleteEvent = events.find((event) => event.type === 'turn-complete');
    rows.push(
      row(
        'chat_approval_request',
        '审批请求 approval',
        sawApproval ? 'pass' : approvalMode === 'manual' ? 'fail' : 'unverified',
        sawApproval
          ? `request raised · choices=${String(
              (approvalEvent?.type === 'request'
                ? (approvalEvent.request.payload['choices'] as unknown[])
                : []
              )?.length ?? 0,
            )}`
          : approvalSend.ok
            ? `no approval request within 90s · approval_mode=${approvalMode ?? 'unknown'}（smart/yolo 会自动放行）`
            : errorDetail(approvalSend.error),
      ),
    );
    rows.push(
      row(
        'chat_approval_answer',
        '审批回执',
        answered ? 'pass' : 'unverified',
        answered ? 'answered choice=once' : 'no request to answer',
      ),
    );
    rows.push(
      row(
        'chat_approval_turn',
        '审批后回合终态',
        approvalCompleted ? 'pass' : 'unverified',
        approvalCompleteEvent?.type === 'turn-complete'
          ? `status=${approvalCompleteEvent.status}`
          : 'no terminal event within 120s',
      ),
    );
  } finally {
    chat?.close();
    if (profileCreated) {
      const deleted = await rest.send('DELETE', `/api/profiles/${encodeURIComponent(marker)}`);
      rows.push(
        row(
          'cleanup',
          '清理聊天探针 profile',
          deleted.ok ? 'pass' : 'fail',
          deleted.ok ? 'deleted' : errorDetail(deleted.error),
        ),
      );
    }
  }

  return { ok: true, data: { generatedAt: now(), target: target.displayUrl, rows } };
}
