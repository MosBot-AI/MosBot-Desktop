import type {
  ConnectionSnapshot,
  DashboardSettings,
  DashboardStatus,
  PreflightResult,
  ProtocolError,
  ProbeReport,
  RemoteBot,
  RemoteChat,
  Result,
  AppearanceInput,
  AppearanceResult,
  CreateBotInput,
  CreateBotResult,
  BotArtifact,
  BotArtifactContent,
  DisplaySnapshot,
  DisplayThumbnail,
  KanbanBoard,
  KanbanBoardSummary,
  ModelReadiness,
  WorkbenchMessage,
  WorkbenchSession,
  WorkbenchSessionPage,
} from '../../shared/protocol';
import { parseDashboardTarget, protocolError } from '../../shared/protocol';
import type { AuthManager } from './auth';
import { listRemoteBots, loadOlderRemoteChat, openRemoteChat } from './bots';
import {
  createRemoteBot,
  profileConfigUrl,
  readModelReadiness,
  renameRemoteBot,
  setProfileModel,
  setRemoteAppearance,
} from './profiles';
import { runChatProbe, runCreateBotProbe } from './probe-writes';
import { listBotArtifacts, readBotArtifact } from './artifacts';
import { readDisplayStatus, readDisplayThumbnail, startDisplay } from './display';
import {
  createKanbanTask,
  listKanbanBoards,
  listWorkbenchSessions,
  readKanbanBoard,
  readWorkbenchMessages,
  searchWorkbenchSessions,
  setKanbanTaskStatus,
} from './workbench';
import { createProbeService, type ProbeService } from './probe';
import type { TransportFetch } from './transport';

export interface DashboardService {
  /** Unauthenticated readiness probe for an address; no credentials involved. */
  preflight(address: string): Promise<Result<PreflightResult>>;
  /** Starts the RFC 8252 sign-in and returns the connected snapshot. */
  login(address: string, provider?: string): Promise<Result<ConnectionSnapshot>>;
  /** Restores a saved session without user interaction; `connected: false` when none. */
  restore(address: string): Promise<Result<ConnectionSnapshot>>;
  /** Authenticated capability probe for the current connection. */
  probe(): Promise<Result<ProbeReport>>;
  /** Step 2: gateway handshake, gateway.ready, profiles, Bot Chat query, ticket replay. */
  probeWebSocket(): Promise<Result<ProbeReport>>;
  /** Step 4 (read-only): profiles, model read, sessions paging/search, messages, cron, kanban. */
  probeWorkbench(): Promise<Result<ProbeReport>>;
  /** Step 3: dedicated profile, model config read/write, canonical Bot Chat claim, cleanup. */
  probeNewBot(): Promise<Result<ProbeReport>>;
  /** Step 4 write: dedicated Kanban board/task, status patch, cursor, cleanup. */
  probeKanbanWrite(): Promise<Result<ProbeReport>>;
  /** M1 chat: dedicated profile, real send/stream/stop through the chat manager. */
  probeChat(): Promise<Result<ProbeReport>>;
  /** M2: dedicated profile create/appearance/rename/cleanup probe. */
  probeCreateBot(): Promise<Result<ProbeReport>>;
  /** M3: workbench REST probe (sessions, search, messages, Kanban). */
  probeWorkbench(): Promise<Result<ProbeReport>>;
  /** Local sign-out plus what it verified. */
  signOut(): Result<ProbeReport>;
  /** Aborts a pending browser sign-in. */
  cancelLogin(): Result<void>;
  /** Roster for the connected Dashboard. */
  listBots(): Promise<Result<readonly RemoteBot[]>>;
  /** Read-only Bot Chat history for one profile. */
  openChat(profileName: string): Promise<Result<RemoteChat>>;
  /** One older history page of the same Bot Chat. */
  loadOlderChat(
    profileName: string,
    storedSessionId: string,
    offset: number,
  ): Promise<Result<RemoteChat>>;
  /** M2: create a fresh Bot profile, write its appearance and read readiness back. */
  createBot(input: CreateBotInput): Promise<Result<CreateBotResult>>;
  /** CAS-protected appearance write. */
  setBotAppearance(
    profileName: string,
    look: AppearanceInput,
    expectedRevision: number,
  ): Promise<Result<AppearanceResult>>;
  /** Renames a profile (REST PATCH). */
  renameBot(
    profileName: string,
    newName: string,
  ): Promise<Result<{ profile: string; displayName: string }>>;
  /** Model/authorisation readiness for one profile. */
  checkModelReady(profileName: string): Promise<Result<ModelReadiness>>;
  /** Dashboard page for configuring a Bot's model. */
  configUrl(): Result<string>;
  /** Workbench: recent sessions for one profile. */
  workbenchSessions(
    profile: string,
    offset: number,
    limit?: number,
  ): Promise<Result<WorkbenchSessionPage>>;
  /** Workbench: session search by id and message content. */
  workbenchSearch(profile: string, query: string): Promise<Result<readonly WorkbenchSession[]>>;
  /** Workbench: read-only transcript for one stored session. */
  workbenchMessages(
    profile: string,
    sessionId: string,
    offset: number,
  ): Promise<Result<{ messages: readonly WorkbenchMessage[]; hasMore: boolean }>>;
  /** Workbench: Kanban boards (plugin may be absent). */
  kanbanBoards(): Promise<Result<readonly KanbanBoardSummary[]>>;
  /** Workbench: Kanban board snapshot. */
  kanbanBoard(board: string): Promise<Result<KanbanBoard>>;
  /** Workbench: create a task on a board. */
  kanbanCreateTask(
    board: string,
    title: string,
  ): Promise<Result<{ taskId: string; status: string }>>;
  /** Workbench: move a task to another workflow status. */
  kanbanSetTaskStatus(
    board: string,
    taskId: string,
    status: string,
  ): Promise<Result<{ status: string }>>;
  /** Workbench: write the profile's model/provider and read it back. */
  setProfileModel(
    profileName: string,
    provider: string,
    model: string,
  ): Promise<Result<{ provider: string; model: string }>>;
  /** Remote computer: read-only status. */
  displayStatus(): Promise<Result<DisplaySnapshot>>;
  /** Remote computer: one preview frame (suppressed while a human holds control). */
  displayThumbnail(): Promise<Result<DisplayThumbnail>>;
  /** Remote computer: explicit wake. */
  displayStart(): Promise<Result<DisplaySnapshot>>;
  /** Library: files in the Bot Chat workspace. */
  listArtifacts(
    profile: string,
    workspace?: string | null,
  ): Promise<Result<readonly BotArtifact[]>>;
  /** Library: one artifact as a data URL (read-only). */
  readArtifact(artifactPath: string): Promise<Result<BotArtifactContent>>;
  /** Non-secret connection preferences. */
  settings(): Result<DashboardSettings>;
  saveAddress(address: string | null): Result<void>;
  status(): Promise<Result<DashboardStatus>>;
}

export interface DashboardServiceDeps {
  readonly auth: AuthManager;
  readonly fetchImpl: TransportFetch;
  readonly requestTimeoutMs?: number;
  readonly now?: () => number;
  readonly ticketExpiryCheck?: boolean;
  readonly settings?: {
    read(): DashboardSettings;
    writeLastAddress(address: string | null): void;
  };
}

function toProtocolError(error: unknown): ProtocolError {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  ) {
    return error as ProtocolError;
  }
  return protocolError('internal', 'The Dashboard request failed unexpectedly.');
}

/**
 * The IPC-facing facade. It owns parsing addresses, keeping secrets inside the
 * main process and turning failures into structured results the UI can render.
 */
function displayDeps(deps: DashboardServiceDeps) {
  return {
    auth: deps.auth,
    fetchImpl: deps.fetchImpl,
    ...(deps.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: deps.requestTimeoutMs }),
  };
}

function workbenchDeps(deps: DashboardServiceDeps) {
  return {
    auth: deps.auth,
    fetchImpl: deps.fetchImpl,
    ...(deps.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: deps.requestTimeoutMs }),
  };
}

function profileDeps(deps: DashboardServiceDeps) {
  return {
    auth: deps.auth,
    fetchImpl: deps.fetchImpl,
    ...(deps.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: deps.requestTimeoutMs }),
  };
}

export function createDashboardService(deps: DashboardServiceDeps): DashboardService {
  const now = deps.now ?? (() => Date.now());
  const probe: ProbeService = createProbeService({
    auth: deps.auth,
    fetchImpl: deps.fetchImpl,
    ...(deps.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: deps.requestTimeoutMs }),
    ...(deps.now === undefined ? {} : { now: deps.now }),
    ...(deps.ticketExpiryCheck === undefined ? {} : { ticketExpiryCheck: deps.ticketExpiryCheck }),
  });

  return {
    async preflight(address) {
      let target;
      try {
        target = parseDashboardTarget(address);
      } catch (error) {
        return { ok: false, error: toProtocolError(error) };
      }
      const preflight = await deps.auth.preflight(target);
      if (!preflight.ok) {
        return { ok: false, error: preflight.error };
      }
      const report = await probe.runPreflight(target);
      if (!report.ok) {
        return { ok: false, error: report.error };
      }
      return {
        ok: true,
        data: {
          report: report.data,
          providers: preflight.data.providers,
          health: preflight.data.health,
        },
      };
    },

    async login(address, provider) {
      let target;
      try {
        target = parseDashboardTarget(address);
      } catch (error) {
        return { ok: false, error: toProtocolError(error) };
      }
      const session = await deps.auth.login({
        target,
        ...(provider === undefined || provider === '' ? {} : { provider }),
      });
      if (!session.ok) {
        return { ok: false, error: session.error };
      }
      return { ok: true, data: deps.auth.current() };
    },

    async restore(address) {
      let target;
      try {
        target = parseDashboardTarget(address);
      } catch (error) {
        return { ok: false, error: toProtocolError(error) };
      }
      const restored = await deps.auth.restore(target);
      if (!restored.ok) {
        return { ok: false, error: restored.error };
      }
      return { ok: true, data: deps.auth.current() };
    },

    async probe() {
      const report = await probe.runAuthenticated();
      return report;
    },

    async probeWebSocket() {
      return probe.runWebSocket();
    },

    async probeWorkbench() {
      return probe.runWorkbench();
    },

    async probeNewBot() {
      return probe.runNewBot();
    },

    async probeKanbanWrite() {
      return probe.runKanbanWrite();
    },

    async createBot(input) {
      return createRemoteBot(profileDeps(deps), input);
    },

    async setBotAppearance(profileName, look, expectedRevision) {
      return setRemoteAppearance(profileDeps(deps), profileName, look, expectedRevision);
    },

    async renameBot(profileName, newName) {
      return renameRemoteBot(profileDeps(deps), profileName, newName);
    },

    async checkModelReady(profileName) {
      return readModelReadiness(profileDeps(deps), profileName);
    },

    async workbenchSessions(profile, offset, limit) {
      return listWorkbenchSessions(workbenchDeps(deps), profile, offset, limit ?? 50);
    },

    async workbenchSearch(profile, query) {
      return searchWorkbenchSessions(workbenchDeps(deps), profile, query);
    },

    async workbenchMessages(profile, sessionId, offset) {
      return readWorkbenchMessages(workbenchDeps(deps), profile, sessionId, offset);
    },

    async kanbanBoards() {
      return listKanbanBoards(workbenchDeps(deps));
    },

    async kanbanBoard(board) {
      return readKanbanBoard(workbenchDeps(deps), board);
    },

    async kanbanCreateTask(board, title) {
      return createKanbanTask(workbenchDeps(deps), board, title);
    },

    async kanbanSetTaskStatus(board, taskId, status) {
      return setKanbanTaskStatus(workbenchDeps(deps), board, taskId, status);
    },

    async setProfileModel(profileName, provider, model) {
      return setProfileModel(profileDeps(deps), profileName, provider, model);
    },

    async displayStatus() {
      return readDisplayStatus(displayDeps(deps));
    },

    async displayThumbnail() {
      return readDisplayThumbnail(displayDeps(deps));
    },

    async displayStart() {
      return startDisplay(displayDeps(deps));
    },

    async listArtifacts(profile, workspace) {
      return listBotArtifacts(displayDeps(deps), profile, workspace ?? null);
    },

    async readArtifact(artifactPath) {
      return readBotArtifact(displayDeps(deps), artifactPath);
    },

    configUrl() {
      const target = deps.auth.target();
      if (target === null || !deps.auth.current().connected) {
        return {
          ok: false,
          error: protocolError('unauthorized', 'Sign in to the Dashboard first.'),
        };
      }
      return { ok: true, data: profileConfigUrl(target) };
    },

    async probeCreateBot() {
      return runCreateBotProbe({
        auth: deps.auth,
        fetchImpl: deps.fetchImpl,
        ...(deps.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: deps.requestTimeoutMs }),
        ...(deps.now === undefined ? {} : { now: deps.now }),
      });
    },

    async probeChat() {
      return runChatProbe({
        auth: deps.auth,
        fetchImpl: deps.fetchImpl,
        ...(deps.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: deps.requestTimeoutMs }),
        ...(deps.now === undefined ? {} : { now: deps.now }),
      });
    },

    signOut() {
      const rows = probe.runSignOut();
      return {
        ok: true,
        data: { generatedAt: now(), target: deps.auth.current().displayUrl ?? '', rows },
      };
    },

    async status() {
      return { ok: true, data: { connection: deps.auth.current(), lastProbe: null } };
    },

    async listBots() {
      return listRemoteBots({
        auth: deps.auth,
        fetchImpl: deps.fetchImpl,
        ...(deps.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: deps.requestTimeoutMs }),
        ...(deps.now === undefined ? {} : { now: deps.now }),
      });
    },

    async loadOlderChat(profileName, storedSessionId, offset) {
      return loadOlderRemoteChat(
        {
          auth: deps.auth,
          fetchImpl: deps.fetchImpl,
          ...(deps.requestTimeoutMs === undefined
            ? {}
            : { requestTimeoutMs: deps.requestTimeoutMs }),
          ...(deps.now === undefined ? {} : { now: deps.now }),
        },
        profileName,
        storedSessionId,
        offset,
      );
    },

    async openChat(profileName) {
      return openRemoteChat(
        {
          auth: deps.auth,
          fetchImpl: deps.fetchImpl,
          ...(deps.requestTimeoutMs === undefined
            ? {}
            : { requestTimeoutMs: deps.requestTimeoutMs }),
          ...(deps.now === undefined ? {} : { now: deps.now }),
        },
        profileName,
      );
    },

    cancelLogin() {
      deps.auth.cancelLogin();
      return { ok: true, data: undefined };
    },

    settings() {
      return { ok: true, data: deps.settings?.read() ?? { version: 1, lastAddress: null } };
    },

    saveAddress(address) {
      if (address !== null) {
        try {
          parseDashboardTarget(address);
        } catch (error) {
          return { ok: false, error: toProtocolError(error) };
        }
      }
      deps.settings?.writeLastAddress(address);
      return { ok: true, data: undefined };
    },
  };
}
