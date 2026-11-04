import type {
  DashboardTarget,
  KanbanBoard,
  KanbanBoardSummary,
  KanbanColumn,
  KanbanTask,
  Result,
  WorkbenchMessage,
  WorkbenchSession,
  WorkbenchSessionPage,
} from '../../shared/protocol';
import { protocolError } from '../../shared/protocol';
import type { AuthManager } from './auth';
import { emptySchema } from './schemas';
import { requestJson, type TransportFetch } from './transport';

export interface WorkbenchDeps {
  readonly auth: AuthManager;
  readonly fetchImpl: TransportFetch;
  readonly requestTimeoutMs?: number;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function bool(value: unknown): boolean {
  return value === true;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function options(deps: WorkbenchDeps, target: DashboardTarget) {
  return {
    fetchImpl: deps.fetchImpl,
    target,
    ...(deps.requestTimeoutMs === undefined ? {} : { timeoutMs: deps.requestTimeoutMs }),
    getAccessToken: () => deps.auth.accessToken(),
  };
}

function requireTarget(deps: WorkbenchDeps): DashboardTarget | null {
  return deps.auth.current().connected ? deps.auth.target() : null;
}

function connectionError<T>(): Result<T> {
  return {
    ok: false,
    error: protocolError('unauthorized', 'Sign in to the Dashboard first.'),
  };
}

function mapSession(value: unknown): WorkbenchSession | null {
  const row = asRecord(value);
  if (row === null) {
    return null;
  }
  const id = str(row['session_id']) || str(row['id']) || str(row['key']);
  if (id === '') {
    return null;
  }
  return {
    id,
    title: str(row['title']),
    profile: str(row['profile']),
    updatedAt: num(row['last_active']) || num(row['updated_at']),
    messageCount: num(row['message_count']),
    pinned: bool(row['pinned']),
    archived: bool(row['archived']),
    preview: str(row['preview']) || str(row['snippet']) || str(row['last_message']),
  };
}

/** Recent sessions for one profile, with a total for "load more". */
export async function listWorkbenchSessions(
  deps: WorkbenchDeps,
  profile: string,
  offset: number,
  limit = 50,
): Promise<Result<WorkbenchSessionPage>> {
  const target = requireTarget(deps);
  if (target === null) {
    return connectionError();
  }
  // Test-only latency injection for one profile so a walkthrough can prove stale
  // session lists are discarded after a profile switch.
  const slowProfile = process.env['MOSBOT_TEST_SESSIONS_SLOW_PROFILE'];
  if (slowProfile !== undefined && slowProfile !== '' && slowProfile === profile) {
    const raw = Number.parseInt(process.env['MOSBOT_TEST_SESSIONS_DELAY_MS'] ?? '', 10);
    const delay = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 10_000) : 1_500;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  const response = await requestJson(options(deps, target), {
    method: 'GET',
    path: `/api/sessions?profile=${encodeURIComponent(profile)}&order=recent&limit=${limit}&offset=${offset}`,
    authenticated: true,
    schema: emptySchema,
  });
  if (!response.ok) {
    return response;
  }
  const record = asRecord(response.data);
  const sessions = asArray(record?.['sessions'])
    .map((row) => mapSession(row))
    .filter((session): session is WorkbenchSession => session !== null);
  const total = num(record?.['total']) || sessions.length;
  return {
    ok: true,
    data: { sessions, total, hasMore: offset + sessions.length < total },
  };
}

/** Session search (id first, then FTS5 message content). */
export async function searchWorkbenchSessions(
  deps: WorkbenchDeps,
  profile: string,
  query: string,
  limit = 30,
): Promise<Result<readonly WorkbenchSession[]>> {
  const target = requireTarget(deps);
  if (target === null) {
    return connectionError();
  }
  const trimmed = query.trim();
  if (trimmed === '') {
    return { ok: true, data: [] };
  }
  const response = await requestJson(options(deps, target), {
    method: 'GET',
    path: `/api/sessions/search?q=${encodeURIComponent(trimmed)}&profile=${encodeURIComponent(profile)}&limit=${limit}`,
    authenticated: true,
    schema: emptySchema,
  });
  if (!response.ok) {
    return response;
  }
  const rows = asArray(asRecord(response.data)?.['results']);
  return {
    ok: true,
    data: rows
      .map((row) => mapSession(row))
      .filter((session): session is WorkbenchSession => session !== null),
  };
}

/** Read-only transcript for one stored session. */
export async function readWorkbenchMessages(
  deps: WorkbenchDeps,
  profile: string,
  sessionId: string,
  offset: number,
  limit = 50,
): Promise<Result<{ messages: readonly WorkbenchMessage[]; hasMore: boolean }>> {
  const target = requireTarget(deps);
  if (target === null) {
    return connectionError();
  }
  const response = await requestJson(options(deps, target), {
    method: 'GET',
    path: `/api/sessions/${encodeURIComponent(sessionId)}/messages?profile=${encodeURIComponent(profile)}&limit=${limit}&offset=${offset}&order=latest&inline_images=false`,
    authenticated: true,
    schema: emptySchema,
  });
  if (!response.ok) {
    return response;
  }
  const record = asRecord(response.data);
  const rows = asArray(record?.['messages']);
  const messages: WorkbenchMessage[] = [];
  for (const value of rows) {
    const row = asRecord(value);
    if (row === null) {
      continue;
    }
    const role = str(row['role']);
    if (role !== 'user' && role !== 'assistant') {
      continue;
    }
    const content = row['content'];
    let text = '';
    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .map((part) =>
          asRecord(part)?.['text'] !== undefined ? str(asRecord(part)?.['text']) : '',
        )
        .filter((part) => part !== '')
        .join('\n');
    }
    if (text.trim() === '') {
      continue;
    }
    messages.push({
      id: str(row['id']) || str(row['message_id']) || `${sessionId}-${messages.length}`,
      role,
      text,
      at: num(row['timestamp']) || num(row['created_at']),
    });
  }
  const returned = num(asRecord(record?.['pagination'])?.['returned']) || messages.length;
  return { ok: true, data: { messages, hasMore: returned >= limit } };
}

/** Every board on disk plus which one is current. */
export async function listKanbanBoards(
  deps: WorkbenchDeps,
): Promise<Result<readonly KanbanBoardSummary[]>> {
  const target = requireTarget(deps);
  if (target === null) {
    return connectionError();
  }
  const response = await requestJson(options(deps, target), {
    method: 'GET',
    path: '/api/plugins/kanban/boards',
    authenticated: true,
    schema: emptySchema,
  });
  if (!response.ok) {
    return response;
  }
  const rows = asArray(asRecord(response.data)?.['boards']);
  return {
    ok: true,
    data: rows
      .map((value) => {
        const row = asRecord(value);
        const slug = str(row?.['slug']);
        if (slug === '') {
          return null;
        }
        return {
          slug,
          name: str(row?.['name']) || slug,
          isCurrent: bool(row?.['is_current']),
          total: num(row?.['total']),
        };
      })
      .filter((board): board is KanbanBoardSummary => board !== null),
  };
}

/** Read-only board snapshot grouped by workflow column. */
export async function readKanbanBoard(
  deps: WorkbenchDeps,
  board: string,
): Promise<Result<KanbanBoard>> {
  const target = requireTarget(deps);
  if (target === null) {
    return connectionError();
  }
  // Test-only latency injection: makes one board's response arrive late so a GUI
  // walkthrough can prove stale board responses are discarded.
  const slowBoard = process.env['MOSBOT_TEST_KANBAN_SLOW_BOARD'];
  if (slowBoard !== undefined && slowBoard !== '' && board === slowBoard) {
    const raw = Number.parseInt(process.env['MOSBOT_TEST_KANBAN_DELAY_MS'] ?? '', 10);
    const delay = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 10_000) : 1_500;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  const response = await requestJson(options(deps, target), {
    method: 'GET',
    path: `/api/plugins/kanban/board?board=${encodeURIComponent(board)}`,
    authenticated: true,
    schema: emptySchema,
  });
  if (!response.ok) {
    return response;
  }
  const record = asRecord(response.data);
  const columns: KanbanColumn[] = asArray(record?.['columns']).map((value) => {
    const column = asRecord(value);
    const name = str(column?.['name']);
    const tasks: KanbanTask[] = asArray(column?.['tasks']).map((taskValue) => {
      const task = asRecord(taskValue);
      return {
        id: str(task?.['id']),
        title: str(task?.['title']),
        status: str(task?.['status']),
        priority: num(task?.['priority']),
        assignee: str(task?.['assignee']),
        updatedAt: num(task?.['updated_at']),
        latestSummary: str(task?.['latest_summary']),
      };
    });
    return { name, tasks: tasks.filter((task) => task.id !== '') };
  });
  return {
    ok: true,
    data: {
      board,
      columns,
      latestEventId:
        typeof record?.['latest_event_id'] === 'number' ? record['latest_event_id'] : null,
    },
  };
}

/** Creates one task on the given board (used by the workbench Kanban page). */
export async function createKanbanTask(
  deps: WorkbenchDeps,
  board: string,
  title: string,
): Promise<Result<{ taskId: string; status: string }>> {
  const target = requireTarget(deps);
  if (target === null) {
    return connectionError();
  }
  const response = await requestJson(options(deps, target), {
    method: 'POST',
    path: `/api/plugins/kanban/tasks?board=${encodeURIComponent(board)}`,
    body: { title, triage: false },
    authenticated: true,
    schema: emptySchema,
  });
  if (!response.ok) {
    return response;
  }
  const task = asRecord(asRecord(response.data)?.['task']);
  const taskId = str(task?.['id']);
  if (taskId === '') {
    return {
      ok: false,
      error: protocolError('malformed_response', 'The Dashboard did not return the new task.'),
    };
  }
  return { ok: true, data: { taskId, status: str(task?.['status']) } };
}

/** Moves a task to another workflow status and returns the status the server stored. */
export async function setKanbanTaskStatus(
  deps: WorkbenchDeps,
  board: string,
  taskId: string,
  status: string,
): Promise<Result<{ status: string }>> {
  const target = requireTarget(deps);
  if (target === null) {
    return connectionError();
  }
  const response = await requestJson(options(deps, target), {
    method: 'PATCH',
    path: `/api/plugins/kanban/tasks/${encodeURIComponent(taskId)}?board=${encodeURIComponent(board)}`,
    body: { status },
    authenticated: true,
    schema: emptySchema,
  });
  if (!response.ok) {
    return response;
  }
  const task = asRecord(asRecord(response.data)?.['task']);
  return { ok: true, data: { status: str(task?.['status']) || status } };
}
