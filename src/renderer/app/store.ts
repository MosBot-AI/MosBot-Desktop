import { useSyncExternalStore } from 'react';
import type {
  ApprovalActionId,
  Artifact,
  BotProfile,
  BotSection,
  BotShape,
  ChatMessage,
  ComputerState,
  ConnectionInfo,
  InspectorTab,
  Language,
  ResolvedTheme,
  RoutineTask,
  ThemePreference,
} from '../../shared/domain';
import { botColorSwatches, normalizeColor, profileColor } from '../../shared/color';
import type {
  AuthProviderInfo,
  ConnectionSnapshot,
  DashboardChatEvent,
  ProtocolError,
  RemoteBot,
  RemoteChat,
} from '../../shared/protocol';
import { createFixtureSeed, type FixtureSeed } from './fixtures';

export interface InspectorState {
  readonly open: boolean;
  readonly tab: InspectorTab;
  readonly width: number;
  /** Narrow windows present the panel as an overlay instead of a column. */
  readonly overlay: boolean;
}

export interface SearchState {
  readonly open: boolean;
  readonly query: string;
  readonly activeIndex: number;
}

export type CreateError = 'empty' | 'duplicate' | null;

export interface CreateState {
  readonly open: boolean;
  readonly name: string;
  readonly shape: BotShape;
  readonly color: string;
  readonly error: CreateError;
}

export type ConnectionStage =
  'idle' | 'checking' | 'choose-provider' | 'awaiting-browser' | 'connected';

export interface ConnectionUiState {
  readonly open: boolean;
  readonly stage: ConnectionStage;
  readonly address: string;
  readonly providers: readonly AuthProviderInfo[];
  readonly error: ProtocolError | null;
  readonly snapshot: ConnectionSnapshot | null;
}

export interface RemoteState {
  readonly status: 'off' | 'loading' | 'ready' | 'error';
  readonly bots: readonly RemoteBot[];
  readonly chats: Readonly<Record<string, RemoteChat>>;
  readonly selectedProfile: string | null;
  readonly error: ProtocolError | null;
  readonly loadingOlder: boolean;
}

export interface LiveRequest {
  readonly id: string;
  readonly method: 'approval' | 'clarify';
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface LiveTool {
  readonly id: string;
  readonly name: string;
  readonly phase: 'start' | 'progress' | 'complete';
}

export type LiveSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'tools'; readonly tools: readonly LiveTool[] };

export interface LiveChatState {
  readonly profile: string | null;
  readonly phase: 'idle' | 'sending' | 'streaming' | 'stopped' | 'error';
  readonly connection: 'connected' | 'reconnecting' | 'disconnected';
  readonly userText: string | null;
  readonly userAt: number;
  readonly botText: string;
  readonly error: string | null;
  readonly segments: readonly LiveSegment[];
  readonly requests: readonly LiveRequest[];
  readonly receipts: Readonly<Record<string, string>>;
  readonly runtimeSessionId: string | null;
  readonly storedSessionId: string | null;
}

export interface PendingReply {
  readonly botId: string;
  readonly text: string;
}

export interface AppState {
  readonly sections: BotSection[];
  readonly bots: BotProfile[];
  readonly messages: Record<string, ChatMessage[]>;
  readonly drafts: Record<string, string>;
  readonly selectedBotId: string;
  readonly inspector: InspectorState;
  readonly search: SearchState;
  readonly create: CreateState;
  readonly theme: ThemePreference;
  readonly resolvedTheme: ResolvedTheme;
  readonly language: Language;
  readonly reduceMotion: boolean;
  readonly connection: ConnectionInfo;
  readonly computers: Record<string, ComputerState>;
  readonly artifacts: Artifact[];
  readonly routines: RoutineTask[];
  readonly footerMenuOpen: boolean;
  readonly pinnedMenuOpen: boolean;
  readonly pendingReply: PendingReply | null;
  readonly connectionUi: ConnectionUiState;
  readonly remote: RemoteState;
  readonly live: LiveChatState;
}

export type AppAction =
  | { type: 'select-bot'; botId: string }
  | { type: 'toggle-section'; sectionId: string }
  | { type: 'set-inspector-open'; open: boolean; tab?: InspectorTab }
  | { type: 'set-inspector-tab'; tab: InspectorTab }
  | { type: 'set-inspector-width'; width: number }
  | { type: 'set-inspector-overlay'; overlay: boolean }
  | { type: 'search-open' }
  | { type: 'search-close' }
  | { type: 'search-query'; query: string }
  | { type: 'search-move'; delta: number }
  | { type: 'search-activate' }
  | { type: 'create-open' }
  | { type: 'create-close' }
  | { type: 'create-name'; name: string }
  | { type: 'create-shape'; shape: BotShape }
  | { type: 'create-color'; color: string }
  | { type: 'create-submit' }
  | { type: 'set-draft'; botId: string; text: string }
  | { type: 'send-message'; botId: string; text: string; at: number }
  | { type: 'deliver-reply'; botId: string; text: string; at: number }
  | { type: 'stop-reply'; botId: string; at: number }
  | { type: 'answer-approval'; messageId: string; action: ApprovalActionId; at: number }
  | { type: 'answer-clarify'; messageId: string; optionId: string; at: number }
  | { type: 'wake-computer'; profileId: string }
  | { type: 'computer-woke'; profileId: string }
  | { type: 'set-theme'; theme: ThemePreference }
  | { type: 'resolve-theme'; resolvedTheme: ResolvedTheme }
  | { type: 'set-language'; language: Language }
  | { type: 'set-reduce-motion'; reduceMotion: boolean }
  | { type: 'set-footer-menu'; open: boolean }
  | { type: 'set-pinned-menu'; open: boolean }
  | { type: 'connection-open'; address: string }
  | { type: 'connection-close' }
  | { type: 'connection-address'; address: string }
  | { type: 'connection-stage'; stage: ConnectionStage }
  | { type: 'connection-providers'; providers: readonly AuthProviderInfo[] }
  | { type: 'connection-error'; error: ProtocolError | null }
  | { type: 'connection-snapshot'; snapshot: ConnectionSnapshot | null }
  | { type: 'remote-loading' }
  | { type: 'remote-ready'; bots: readonly RemoteBot[] }
  | { type: 'remote-error'; error: ProtocolError }
  | { type: 'remote-select'; profile: string }
  | { type: 'remote-chat'; chat: RemoteChat }
  | { type: 'remote-loading-older' }
  | { type: 'remote-chat-older'; chat: RemoteChat }
  | { type: 'remote-reset' }
  | { type: 'live-reset'; profile: string | null }
  | {
      type: 'live-session';
      profile: string;
      storedSessionId: string | null;
      runtimeSessionId: string | null;
    }
  | { type: 'live-user'; profile: string; text: string; at: number }
  | { type: 'live-phase'; phase: LiveChatState['phase'] }
  | { type: 'live-delta'; text: string }
  | { type: 'live-tool'; phase: LiveTool['phase']; name: string }
  | {
      type: 'live-complete';
      status: 'complete' | 'error' | 'interrupted';
      text: string;
      error: string | null;
    }
  | { type: 'live-connection'; state: LiveChatState['connection'] }
  | { type: 'live-request'; request: LiveRequest }
  | { type: 'live-request-cancel'; requestId: string }
  | { type: 'live-request-resolved'; requestId: string; receipt: string }
  | { type: 'live-error'; message: string };

export interface Bootstrap {
  readonly resolvedTheme: ResolvedTheme;
  readonly language: Language;
  readonly reduceMotion: boolean;
}

export const DEFAULT_INSPECTOR_WIDTH = 320;
export const MIN_INSPECTOR_WIDTH = 320;
export const MAX_INSPECTOR_WIDTH = 440;
export const MIN_NAME_LENGTH = 1;
export const MAX_NAME_LENGTH = 24;

/** Start from the green swatch closest to the MosBot lime so the dialog opens with one selected chip. */
const CREATE_COLOR_SWATCH_INDEX = 3;
const DEFAULT_CREATE_COLOR = normalizeColor(
  botColorSwatches()[CREATE_COLOR_SWATCH_INDEX] ?? 'hsl(90 68% 58%)',
  '#afe17b',
);
const DEFAULT_CREATE_SHAPE: BotShape = 'mosbot';

/** Fixture-only acknowledgement used by the design slice's local transcript. */
const FIXTURE_REPLY =
  '收到。等连接到 Dashboard 之后我会真的开始处理；现在先把要点记在这段对话里，方便你接着确认。';

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function patchBot(
  bots: readonly BotProfile[],
  botId: string,
  patch: Partial<BotProfile>,
): BotProfile[] {
  return bots.map((bot) => (bot.id === botId ? { ...bot, ...patch } : bot));
}

function setPresence(
  bots: readonly BotProfile[],
  botId: string,
  presence: BotProfile['presence'],
): BotProfile[] {
  return patchBot(bots, botId, { presence });
}

function eventMessageId(prefix: string, at: number): string {
  return `${prefix}-${at.toString(36)}`;
}

function slugFor(name: string): string {
  const trimmed = name.trim();
  const ascii = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const hash = Array.from(trimmed).reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 7);
  const suffix = hash.toString(36);
  return ascii.length >= 3 ? `${ascii.slice(0, 24)}-${suffix}` : `bot-${suffix}`;
}

function unresolvedRequests(messages: readonly ChatMessage[]): number {
  let total = 0;
  for (const message of messages) {
    if (message.kind === 'approval' && message.approval.resolution === null) {
      total += 1;
    }
    if (message.kind === 'clarify' && message.clarify.answerId === null) {
      total += 1;
    }
  }
  return total;
}

function botIdForMessage(messages: AppState['messages'], messageId: string): string | null {
  for (const [botId, list] of Object.entries(messages)) {
    if (list.some((message) => message.id === messageId)) {
      return botId;
    }
  }
  return null;
}

function refreshPresence(state: AppState, botId: string): BotProfile[] {
  const list = state.messages[botId] ?? [];
  if (unresolvedRequests(list) > 0) {
    return setPresence(state.bots, botId, 'needs-confirmation');
  }
  const current = state.bots.find((bot) => bot.id === botId);
  if (current?.presence === 'needs-confirmation') {
    return setPresence(state.bots, botId, 'idle');
  }
  return state.bots;
}

export function searchEntries(state: AppState): {
  readonly recent: BotProfile[];
  readonly matches: BotProfile[];
  readonly flat: BotProfile[];
} {
  const roster = selectRosterBots(state);
  const recent = roster
    .slice()
    .sort((a, b) => a.lastActiveMinutes - b.lastActiveMinutes)
    .slice(0, 5);
  const query = state.search.query.trim().toLowerCase();
  if (query === '') {
    return { recent, matches: [], flat: recent };
  }
  const matches = roster.filter((bot) => {
    const haystack = `${bot.name}\n${bot.summary}\n${bot.description}`.toLowerCase();
    return haystack.includes(query);
  });
  return { recent, matches, flat: matches };
}

function moveSearchIndex(state: AppState, delta: number): number {
  const { flat } = searchEntries(state);
  if (flat.length === 0) {
    return 0;
  }
  const next = state.search.activeIndex + delta;
  return ((next % flat.length) + flat.length) % flat.length;
}

export function createInitialState(seed: FixtureSeed, bootstrap: Bootstrap): AppState {
  const messages: Record<string, ChatMessage[]> = {};
  for (const [botId, list] of Object.entries(seed.messages)) {
    messages[botId] = list.slice();
  }
  return {
    sections: seed.sections.slice(),
    bots: seed.bots.slice(),
    messages,
    drafts: { ...seed.drafts },
    selectedBotId: seed.selectedBotId,
    inspector: {
      open: false,
      tab: 'details',
      width: DEFAULT_INSPECTOR_WIDTH,
      overlay: false,
    },
    search: { open: false, query: '', activeIndex: 0 },
    create: {
      open: false,
      name: '',
      shape: DEFAULT_CREATE_SHAPE,
      color: DEFAULT_CREATE_COLOR,
      error: null,
    },
    theme: 'system',
    resolvedTheme: bootstrap.resolvedTheme,
    language: bootstrap.language,
    reduceMotion: bootstrap.reduceMotion,
    connection: seed.connection,
    computers: { ...seed.computers },
    artifacts: seed.artifacts.slice(),
    routines: seed.routines.slice(),
    footerMenuOpen: false,
    pinnedMenuOpen: false,
    pendingReply: null,
    connectionUi: {
      open: false,
      stage: 'idle',
      address: '',
      providers: [],
      error: null,
      snapshot: null,
    },
    remote: {
      status: 'off',
      bots: [],
      chats: {},
      selectedProfile: null,
      error: null,
      loadingOlder: false,
    },
    live: {
      profile: null,
      phase: 'idle',
      connection: 'disconnected',
      userText: null,
      userAt: 0,
      botText: '',
      error: null,
      segments: [],
      requests: [],
      receipts: {},
      runtimeSessionId: null,
      storedSessionId: null,
    },
  };
}

export function reduceAppState(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'select-bot': {
      const remote = isRemoteRoster(state);
      const target = selectRosterBots(state).find((bot) => bot.id === action.botId);
      if (target === undefined) {
        return state;
      }
      const unchanged =
        target.id === state.selectedBotId &&
        (remote || target.unread === 0) &&
        !state.search.open &&
        !state.pinnedMenuOpen;
      if (unchanged) {
        return state;
      }
      return {
        ...state,
        selectedBotId: action.botId,
        remote: remote ? { ...state.remote, selectedProfile: action.botId } : state.remote,
        bots: remote ? state.bots : patchBot(state.bots, action.botId, { unread: 0 }),
        search: { ...state.search, open: false, query: '', activeIndex: 0 },
        pinnedMenuOpen: false,
      };
    }
    case 'toggle-section': {
      const sections = state.sections.map((section) =>
        section.id === action.sectionId ? { ...section, collapsed: !section.collapsed } : section,
      );
      return { ...state, sections };
    }
    case 'set-inspector-open': {
      const next: InspectorState = {
        ...state.inspector,
        open: action.open,
        ...(action.tab === undefined ? {} : { tab: action.tab }),
      };
      return { ...state, inspector: next };
    }
    case 'set-inspector-tab':
      return { ...state, inspector: { ...state.inspector, tab: action.tab, open: true } };
    case 'set-inspector-width': {
      const width = clamp(Math.round(action.width), MIN_INSPECTOR_WIDTH, MAX_INSPECTOR_WIDTH);
      return { ...state, inspector: { ...state.inspector, width } };
    }
    case 'set-inspector-overlay':
      return state.inspector.overlay === action.overlay
        ? state
        : { ...state, inspector: { ...state.inspector, overlay: action.overlay } };
    case 'search-open':
      return { ...state, search: { open: true, query: '', activeIndex: 0 } };
    case 'search-close':
      return { ...state, search: { open: false, query: '', activeIndex: 0 } };
    case 'search-query':
      return { ...state, search: { open: true, query: action.query, activeIndex: 0 } };
    case 'search-move':
      return {
        ...state,
        search: { ...state.search, activeIndex: moveSearchIndex(state, action.delta) },
      };
    case 'search-activate': {
      const { flat } = searchEntries(state);
      const target = flat[clamp(state.search.activeIndex, 0, Math.max(0, flat.length - 1))];
      if (target === undefined) {
        return state;
      }
      return {
        ...state,
        selectedBotId: target.id,
        bots: patchBot(state.bots, target.id, { unread: 0 }),
        search: { open: false, query: '', activeIndex: 0 },
      };
    }
    case 'create-open':
      return {
        ...state,
        create: {
          open: true,
          name: '',
          shape: DEFAULT_CREATE_SHAPE,
          color: DEFAULT_CREATE_COLOR,
          error: null,
        },
      };
    case 'create-close':
      return {
        ...state,
        create: {
          open: false,
          name: '',
          shape: DEFAULT_CREATE_SHAPE,
          color: DEFAULT_CREATE_COLOR,
          error: null,
        },
      };
    case 'create-name':
      return { ...state, create: { ...state.create, name: action.name, error: null } };
    case 'create-shape':
      return { ...state, create: { ...state.create, shape: action.shape } };
    case 'create-color':
      return { ...state, create: { ...state.create, color: action.color } };
    case 'create-submit': {
      const name = state.create.name.trim();
      if (name.length < MIN_NAME_LENGTH) {
        return { ...state, create: { ...state.create, error: 'empty' } };
      }
      if (name.length > MAX_NAME_LENGTH) {
        return { ...state, create: { ...state.create, name: name.slice(0, MAX_NAME_LENGTH) } };
      }
      const duplicate = state.bots.some(
        (bot) => bot.name.trim().toLowerCase() === name.toLowerCase(),
      );
      if (duplicate) {
        return { ...state, create: { ...state.create, error: 'duplicate' } };
      }
      const baseId = slugFor(name);
      let botId = baseId;
      let suffix = 1;
      while (state.bots.some((bot) => bot.id === botId)) {
        suffix += 1;
        botId = `${baseId}-${suffix}`;
      }
      const sectionId = state.sections[0]?.id ?? null;
      const created: BotProfile = {
        id: botId,
        name,
        shape: state.create.shape,
        color: state.create.color,
        useMosbotDefault: false,
        sectionId,
        pinnedIndex: null,
        presence: 'idle',
        unread: 0,
        summary: '',
        description: '',
        lastActiveMinutes: 0,
      };
      return {
        ...state,
        bots: [...state.bots, created],
        messages: { ...state.messages, [botId]: [] },
        drafts: { ...state.drafts, [botId]: '' },
        selectedBotId: botId,
        create: {
          open: false,
          name: '',
          shape: DEFAULT_CREATE_SHAPE,
          color: DEFAULT_CREATE_COLOR,
          error: null,
        },
      };
    }
    case 'set-draft':
      return { ...state, drafts: { ...state.drafts, [action.botId]: action.text } };
    case 'send-message': {
      const text = action.text.trim();
      if (text === '') {
        return state;
      }
      const list = state.messages[action.botId] ?? [];
      const message: ChatMessage = {
        id: eventMessageId('local-user', action.at),
        role: 'user',
        kind: 'text',
        text,
        at: action.at,
      };
      return {
        ...state,
        messages: { ...state.messages, [action.botId]: [...list, message] },
        drafts: { ...state.drafts, [action.botId]: '' },
        bots: setPresence(state.bots, action.botId, 'replying'),
        pendingReply: { botId: action.botId, text: FIXTURE_REPLY },
      };
    }
    case 'deliver-reply': {
      const list = state.messages[action.botId] ?? [];
      const message: ChatMessage = {
        id: eventMessageId('local-bot', action.at),
        role: 'bot',
        kind: 'text',
        text: action.text,
        at: action.at,
      };
      return {
        ...state,
        messages: { ...state.messages, [action.botId]: [...list, message] },
        bots: setPresence(state.bots, action.botId, 'idle'),
        pendingReply: null,
      };
    }
    case 'stop-reply': {
      if (state.pendingReply === null || state.pendingReply.botId !== action.botId) {
        return state;
      }
      const list = state.messages[action.botId] ?? [];
      const message: ChatMessage = {
        id: eventMessageId('local-stopped', action.at),
        role: 'bot',
        kind: 'stopped',
        text: '',
        at: action.at,
      };
      return {
        ...state,
        messages: { ...state.messages, [action.botId]: [...list, message] },
        bots: setPresence(state.bots, action.botId, 'idle'),
        pendingReply: null,
      };
    }
    case 'answer-approval': {
      const ownerId = botIdForMessage(state.messages, action.messageId);
      if (ownerId === null) {
        return state;
      }
      const list = state.messages[ownerId] ?? [];
      const pending = list.find(
        (message) =>
          message.id === action.messageId &&
          message.kind === 'approval' &&
          message.approval.resolution === null,
      );
      if (pending === undefined) {
        return state;
      }
      const next = list.map((message) => {
        if (message.id !== action.messageId || message.kind !== 'approval') {
          return message;
        }
        return {
          ...message,
          approval: {
            ...message.approval,
            resolution: { action: action.action, at: action.at },
          },
        };
      });
      const withMessages: AppState = {
        ...state,
        messages: { ...state.messages, [ownerId]: next },
      };
      return { ...withMessages, bots: refreshPresence(withMessages, ownerId) };
    }
    case 'answer-clarify': {
      const ownerId = botIdForMessage(state.messages, action.messageId);
      if (ownerId === null) {
        return state;
      }
      const list = state.messages[ownerId] ?? [];
      const pending = list.find(
        (message) =>
          message.id === action.messageId &&
          message.kind === 'clarify' &&
          message.clarify.answerId === null,
      );
      if (pending === undefined) {
        return state;
      }
      const next = list.map((message) => {
        if (message.id !== action.messageId || message.kind !== 'clarify') {
          return message;
        }
        return { ...message, clarify: { ...message.clarify, answerId: action.optionId } };
      });
      const withMessages: AppState = {
        ...state,
        messages: { ...state.messages, [ownerId]: next },
      };
      return { ...withMessages, bots: refreshPresence(withMessages, ownerId) };
    }
    case 'wake-computer': {
      const current = state.computers[action.profileId] ?? {
        profileId: action.profileId,
        status: 'asleep' as const,
        frameAgeSeconds: 0,
      };
      if (current.status !== 'asleep' && current.status !== 'failed') {
        return state;
      }
      return {
        ...state,
        computers: {
          ...state.computers,
          [action.profileId]: { ...current, status: 'waking' },
        },
      };
    }
    case 'computer-woke': {
      const current = state.computers[action.profileId];
      if (current === undefined || current.status !== 'waking') {
        return state;
      }
      return {
        ...state,
        computers: {
          ...state.computers,
          [action.profileId]: {
            profileId: action.profileId,
            status: 'preview',
            frameAgeSeconds: 0,
          },
        },
      };
    }
    case 'set-theme':
      return {
        ...state,
        theme: action.theme,
        resolvedTheme: action.theme === 'system' ? state.resolvedTheme : action.theme,
      };
    case 'resolve-theme':
      return state.resolvedTheme === action.resolvedTheme
        ? state
        : { ...state, resolvedTheme: action.resolvedTheme };
    case 'set-language':
      return { ...state, language: action.language };
    case 'set-reduce-motion':
      return { ...state, reduceMotion: action.reduceMotion };
    case 'connection-open':
      return {
        ...state,
        connectionUi: {
          ...state.connectionUi,
          open: true,
          address: state.connectionUi.address === '' ? action.address : state.connectionUi.address,
          stage: state.connectionUi.snapshot?.connected === true ? 'connected' : 'idle',
          error: null,
        },
        footerMenuOpen: false,
        pinnedMenuOpen: false,
      };
    case 'connection-close':
      return {
        ...state,
        connectionUi: { ...state.connectionUi, open: false, stage: 'idle', error: null },
      };
    case 'connection-address':
      return {
        ...state,
        connectionUi: { ...state.connectionUi, address: action.address, error: null },
      };
    case 'connection-stage':
      return { ...state, connectionUi: { ...state.connectionUi, stage: action.stage } };
    case 'connection-providers':
      return {
        ...state,
        connectionUi: { ...state.connectionUi, providers: action.providers },
      };
    case 'connection-error':
      return { ...state, connectionUi: { ...state.connectionUi, error: action.error } };
    case 'connection-snapshot':
      return {
        ...state,
        connectionUi: {
          ...state.connectionUi,
          snapshot: action.snapshot,
          stage: action.snapshot?.connected === true ? 'connected' : 'idle',
        },
      };
    case 'remote-loading':
      return {
        ...state,
        remote: { ...state.remote, status: 'loading', error: null },
      };
    case 'remote-ready':
      return {
        ...state,
        remote: {
          ...state.remote,
          status: state.remote.bots.length === 0 && action.bots.length === 0 ? 'off' : 'ready',
          bots: action.bots,
          error: null,
        },
      };
    case 'remote-error':
      return {
        ...state,
        remote: { ...state.remote, status: 'error', error: action.error },
      };
    case 'remote-select':
      return {
        ...state,
        selectedBotId: action.profile,
        remote: { ...state.remote, selectedProfile: action.profile },
      };
    case 'remote-chat':
      return {
        ...state,
        remote: {
          ...state.remote,
          chats: { ...state.remote.chats, [action.chat.profileName]: action.chat },
          loadingOlder: false,
        },
      };
    case 'remote-loading-older':
      return { ...state, remote: { ...state.remote, loadingOlder: true } };
    case 'remote-chat-older': {
      const existing = state.remote.chats[action.chat.profileName];
      const known = new Set((existing?.messages ?? []).map((message) => message.id));
      const older = action.chat.messages.filter((message) => !known.has(message.id));
      const merged: RemoteChat = {
        profileName: action.chat.profileName,
        storedSessionId: action.chat.storedSessionId,
        messages: [...older, ...(existing?.messages ?? [])],
        hasMore: action.chat.hasMore,
        nextOffset: action.chat.nextOffset,
      };
      return {
        ...state,
        remote: {
          ...state.remote,
          chats: { ...state.remote.chats, [action.chat.profileName]: merged },
          loadingOlder: false,
        },
      };
    }
    case 'remote-reset':
      return {
        ...state,
        remote: {
          status: 'off',
          bots: [],
          chats: {},
          selectedProfile: null,
          error: null,
          loadingOlder: false,
        },
      };
    case 'live-reset':
      return {
        ...state,
        live: {
          profile: action.profile,
          phase: 'idle',
          connection: 'reconnecting',
          userText: null,
          userAt: 0,
          botText: '',
          error: null,
          segments: [],
          requests: [],
          receipts: {},
          runtimeSessionId: null,
          storedSessionId: null,
        },
      };
    case 'live-session':
      return {
        ...state,
        live: {
          ...state.live,
          profile: action.profile,
          storedSessionId: action.storedSessionId,
          runtimeSessionId: action.runtimeSessionId,
        },
      };
    case 'live-user':
      return {
        ...state,
        live: {
          ...state.live,
          profile: action.profile,
          userText: action.text,
          userAt: action.at,
          botText: '',
          error: null,
          segments: [],
          phase: 'sending',
        },
      };
    case 'live-phase':
      return { ...state, live: { ...state.live, phase: action.phase } };
    case 'live-delta': {
      const segments = state.live.segments.slice();
      const last = segments[segments.length - 1];
      if (last !== undefined && last.kind === 'text') {
        segments[segments.length - 1] = { kind: 'text', text: last.text + action.text };
      } else {
        segments.push({ kind: 'text', text: action.text });
      }
      return {
        ...state,
        live: {
          ...state.live,
          segments,
          botText: state.live.botText + action.text,
          phase: 'streaming',
        },
      };
    }
    case 'live-tool': {
      const segments = state.live.segments.slice();
      // One work record per turn: later tool events join the existing segment
      // even when text was streamed between them.
      let toolsIndex = -1;
      for (let index = segments.length - 1; index >= 0; index -= 1) {
        if (segments[index]?.kind === 'tools') {
          toolsIndex = index;
          break;
        }
      }
      const tool: LiveTool = {
        id: `tool-${action.name}-${segments.length}`,
        name: action.name,
        phase: action.phase,
      };
      const existing = toolsIndex === -1 ? undefined : segments[toolsIndex];
      if (existing !== undefined && existing.kind === 'tools') {
        const found = existing.tools.findIndex((entry) => entry.name === action.name);
        const tools =
          found === -1
            ? [...existing.tools, tool]
            : existing.tools.map((entry, index) =>
                index === found ? { ...entry, phase: action.phase } : entry,
              );
        segments[toolsIndex] = { kind: 'tools', tools };
      } else {
        segments.push({ kind: 'tools', tools: [tool] });
      }
      return { ...state, live: { ...state.live, segments } };
    }
    case 'live-complete': {
      const finalText =
        state.live.botText === '' && action.text !== '' ? action.text : state.live.botText;
      const segments =
        state.live.segments.length === 0 && finalText !== ''
          ? ([{ kind: 'text', text: finalText }] as LiveSegment[])
          : state.live.segments;
      return {
        ...state,
        live: {
          ...state.live,
          segments,
          botText: finalText,
          phase:
            action.status === 'interrupted'
              ? 'stopped'
              : action.status === 'error'
                ? 'error'
                : 'idle',
          error: action.error,
        },
      };
    }
    case 'live-connection':
      return { ...state, live: { ...state.live, connection: action.state } };
    case 'live-request':
      return {
        ...state,
        live: {
          ...state.live,
          requests: [
            ...state.live.requests.filter((request) => request.id !== action.request.id),
            action.request,
          ],
        },
      };
    case 'live-request-cancel':
      return {
        ...state,
        live: {
          ...state.live,
          requests: state.live.requests.filter((request) => request.id !== action.requestId),
        },
      };
    case 'live-request-resolved':
      return {
        ...state,
        live: {
          ...state.live,
          requests: state.live.requests.filter((request) => request.id !== action.requestId),
          receipts: { ...state.live.receipts, [action.requestId]: action.receipt },
        },
      };
    case 'live-error':
      return {
        ...state,
        live: { ...state.live, phase: 'error', error: action.message },
      };
    case 'set-footer-menu':
      return state.footerMenuOpen === action.open && !state.pinnedMenuOpen
        ? state
        : { ...state, footerMenuOpen: action.open, pinnedMenuOpen: false };
    case 'set-pinned-menu':
      return state.pinnedMenuOpen === action.open && !state.footerMenuOpen
        ? state
        : { ...state, pinnedMenuOpen: action.open, footerMenuOpen: false };
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

export interface AppStore {
  getState(): AppState;
  subscribe(listener: () => void): () => void;
  dispatch(action: AppAction): void;
}

export function createAppStore(initial: AppState): AppStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch(action) {
      const next = reduceAppState(state, action);
      if (next === state) {
        return;
      }
      state = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

export function detectBootstrap(): Bootstrap {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return { resolvedTheme: 'light', language: 'zh-Hans', reduceMotion: false };
  }
  const dark = window.matchMedia('(prefers-color-scheme: dark)');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const language: Language = navigator.language.toLowerCase().startsWith('zh') ? 'zh-Hans' : 'en';
  return {
    resolvedTheme: dark.matches ? 'dark' : 'light',
    language,
    reduceMotion: motion.matches,
  };
}

export const appStore: AppStore = createAppStore(
  createInitialState(createFixtureSeed(), detectBootstrap()),
);

/**
 * Subscribes to the store and applies `selector` during render. The snapshot is
 * always the immutable state object itself, so React never sees a fresh array
 * on every read (selectors may allocate derived lists).
 */
export function useAppState<T>(selector: (state: AppState) => T): T {
  const state = useSyncExternalStore(appStore.subscribe, appStore.getState, appStore.getState);
  return selector(state);
}

const dispatchAction = (action: AppAction): void => {
  appStore.dispatch(action);
};

/**
 * Stable across renders: effects may list it as a dependency without
 * re-subscribing on every render (an unstable identity caused an update loop).
 */
export function useDispatch(): (action: AppAction) => void {
  return dispatchAction;
}

// --- Selectors -------------------------------------------------------------

const REMOTE_SECTION_ID = 'remote-all';

/** True when the roster comes from the connected Dashboard rather than fixtures. */
export function isRemoteRoster(state: AppState): boolean {
  return state.remote.status === 'ready' && state.remote.bots.length > 0;
}

/**
 * Maps a Dashboard profile onto the roster shape the UI already draws. Until M2
 * brings the real appearance metadata, the look is derived from the profile name.
 */
export function synthesizeRemoteBot(bot: RemoteBot, now: number): BotProfile {
  return {
    id: bot.profileName,
    name: bot.displayName,
    shape: 'blobatar',
    color: profileColor(bot.displayName) || normalizeColor('hsl(210 68% 58%)', '#4f86d6'),
    useMosbotDefault: bot.isDefault,
    sectionId: REMOTE_SECTION_ID,
    pinnedIndex: null,
    presence: 'idle',
    unread: 0,
    summary: bot.summary,
    description:
      bot.description || [bot.provider, bot.model].filter((part) => part !== '').join(' · '),
    lastActiveMinutes:
      bot.lastActiveAt === null ? 0 : Math.max(0, Math.round((now - bot.lastActiveAt) / 60_000)),
  };
}

export function selectRosterBots(state: AppState): BotProfile[] {
  return isRemoteRoster(state)
    ? state.remote.bots.map((bot) => synthesizeRemoteBot(bot, Date.now()))
    : state.bots;
}

export function selectRosterSections(state: AppState): BotSection[] {
  return isRemoteRoster(state)
    ? [{ id: REMOTE_SECTION_ID, name: 'Bots', collapsed: false, order: 0 }]
    : state.sections;
}

export function selectSelectedBot(state: AppState): BotProfile | undefined {
  const roster = selectRosterBots(state);
  return roster.find((bot) => bot.id === state.selectedBotId) ?? roster[0];
}

export function selectPinnedBots(state: AppState): BotProfile[] {
  if (isRemoteRoster(state)) {
    return selectRosterBots(state)
      .slice(0, 6)
      .map((bot, index) => ({ ...bot, pinnedIndex: index }));
  }
  return state.bots
    .filter((bot) => bot.pinnedIndex !== null)
    .slice()
    .sort((a, b) => (a.pinnedIndex ?? 0) - (b.pinnedIndex ?? 0));
}

export function selectSectionBots(state: AppState, sectionId: string): BotProfile[] {
  if (isRemoteRoster(state)) {
    return sectionId === REMOTE_SECTION_ID ? selectRosterBots(state) : [];
  }
  return state.bots.filter((bot) => bot.sectionId === sectionId);
}

function approvalChoiceAction(choice: string): ApprovalActionId | null {
  switch (choice) {
    case 'once':
      return 'allow';
    case 'session':
      return 'allow-session';
    case 'always':
      return 'allow-always';
    case 'deny':
      return 'deny';
    default:
      return null;
  }
}

function asRecordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Maps one live server request into the inline card the transcript already draws. */
function liveRequestMessage(request: LiveRequest, state: AppState): ChatMessage | null {
  const receipt = state.live.receipts[request.id] ?? null;
  if (request.method === 'approval') {
    const choices = Array.isArray(request.payload['choices'])
      ? request.payload['choices'].filter((value): value is string => typeof value === 'string')
      : ['once', 'deny'];
    const actions = choices
      .map((choice) => {
        const action = approvalChoiceAction(choice);
        return action === null
          ? null
          : { id: action, tone: choice === 'deny' ? ('danger' as const) : ('primary' as const) };
      })
      .filter(
        (action): action is { id: ApprovalActionId; tone: 'primary' | 'danger' } => action !== null,
      );
    const title =
      typeof request.payload['description'] === 'string' && request.payload['description'] !== ''
        ? (request.payload['description'] as string)
        : '需要你确认';
    const detail =
      typeof request.payload['command'] === 'string' ? (request.payload['command'] as string) : '';
    return {
      id: request.id,
      role: 'bot',
      kind: 'approval',
      at: 0,
      approval: {
        id: request.id,
        title,
        detail,
        actions,
        resolution: receipt === null ? null : { action: receipt as ApprovalActionId, at: 0 },
      },
    };
  }
  const questions = Array.isArray(request.payload['questions']) ? request.payload['questions'] : [];
  const first = asRecordOf(questions[0]);
  const qid = typeof first?.['qid'] === 'string' ? (first['qid'] as string) : 'q';
  const question =
    typeof first?.['question'] === 'string' && first['question'] !== ''
      ? (first['question'] as string)
      : '需要你确认';
  const choices = Array.isArray(first?.['choices'])
    ? (first['choices'] as unknown[]).filter((value): value is string => typeof value === 'string')
    : [];
  return {
    id: request.id,
    role: 'bot',
    kind: 'clarify',
    at: 0,
    clarify: {
      id: request.id,
      question,
      options: choices.map((choice) => ({ id: `${qid}::${choice}`, label: choice })),
      answerId: receipt,
    },
  };
}

export function selectChatMessages(state: AppState, botId: string): ChatMessage[] {
  if (!isRemoteRoster(state)) {
    return state.messages[botId] ?? [];
  }
  const chat = state.remote.chats[botId];
  const base: ChatMessage[] = (chat?.messages ?? []).map((message): ChatMessage => ({
    id: message.id,
    role: message.role,
    kind: 'text',
    text: message.text,
    at: message.at,
  }));
  if (state.live.profile !== botId) {
    return base;
  }
  const live: ChatMessage[] = [];
  if (state.live.userText !== null) {
    live.push({
      id: 'live-user',
      role: 'user',
      kind: 'text',
      text: state.live.userText,
      at: state.live.userAt,
    });
  }
  state.live.segments.forEach((segment, index) => {
    if (segment.kind === 'text') {
      if (segment.text !== '') {
        live.push({
          id: `live-text-${index}`,
          role: 'bot',
          kind: 'text',
          text: segment.text,
          at: state.live.userAt,
        });
      }
      return;
    }
    live.push({
      id: `live-work-${index}`,
      role: 'bot',
      kind: 'work',
      title: '',
      steps: segment.tools.map((tool) => ({
        id: tool.id,
        label: tool.name === '' ? 'tool' : tool.name,
        detail: '',
      })),
      at: state.live.userAt,
    });
  });
  for (const request of state.live.requests) {
    const message = liveRequestMessage(request, state);
    if (message !== null) {
      live.push(message);
    }
  }
  if (state.live.phase === 'stopped') {
    live.push({
      id: 'live-stopped',
      role: 'bot',
      kind: 'stopped',
      text: '',
      at: state.live.userAt,
    });
  }
  return [...base, ...live];
}

/** Translates one main-process chat event into a store action. */
export function chatEventAction(event: DashboardChatEvent): AppAction | null {
  switch (event.type) {
    case 'connection':
      return { type: 'live-connection', state: event.state };
    case 'session':
      return {
        type: 'live-session',
        profile: event.profile,
        storedSessionId: event.storedSessionId,
        runtimeSessionId: event.runtimeSessionId,
      };
    case 'turn-start':
      return { type: 'live-phase', phase: 'streaming' };
    case 'delta':
      return { type: 'live-delta', text: event.text };
    case 'interim':
      return { type: 'live-delta', text: event.text };
    case 'turn-complete':
      return {
        type: 'live-complete',
        status: event.status,
        text: event.text,
        error: event.error,
      };
    case 'request':
      return { type: 'live-request', request: event.request };
    case 'request-cancel':
      return { type: 'live-request-cancel', requestId: event.requestId };
    case 'error':
      return { type: 'live-error', message: event.message };
    case 'tool':
      return { type: 'live-tool', phase: event.phase, name: event.name };
    default:
      return null;
  }
}

export function selectUnresolvedCount(state: AppState): number {
  if (isRemoteRoster(state)) {
    return 0;
  }
  let total = 0;
  for (const list of Object.values(state.messages)) {
    total += unresolvedRequests(list);
  }
  return total;
}

export function selectArtifactsFor(state: AppState, profileId: string): Artifact[] {
  return state.artifacts.filter((artifact) => artifact.profileId === profileId);
}

export function selectRoutinesFor(state: AppState): RoutineTask[] {
  return state.routines;
}

export function selectComputerFor(state: AppState, profileId: string): ComputerState {
  return state.computers[profileId] ?? { profileId, status: 'asleep', frameAgeSeconds: 0 };
}

/** The Bot that owns the oldest unresolved request, used by the attention chip. */
export function selectPendingBotId(state: AppState): string | null {
  if (isRemoteRoster(state)) {
    return null;
  }
  for (const [botId, list] of Object.entries(state.messages)) {
    if (unresolvedRequests(list) > 0) {
      return botId;
    }
  }
  return null;
}

export function selectUnreadTotal(state: AppState): number {
  if (isRemoteRoster(state)) {
    return 0;
  }
  return state.bots.reduce((total, bot) => total + bot.unread, 0);
}
