import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import { DASHBOARD_CHANNELS } from '../../shared/bridge';
import {
  protocolError,
  type ChatOpenResult,
  type DashboardChatEvent,
  type RemoteGroup,
  type RemoteGroupLogPage,
  type RemoteGroupMemberInput,
  type RemoteGroupPendingAction,
  type RemoteGroupState,
  type Result,
} from '../../shared/protocol';
import type { ChatManager } from './chat';

const MAX_PROFILE_LENGTH = 128;
const MAX_STORED_ID_LENGTH = 128;
const MAX_TEXT_LENGTH = 32_000;
const MAX_ANSWER_BYTES = 8_192;

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Live-chat IPC. Only the app's top-level frame may submit prompts, stop turns or
 * answer approvals; events are pushed one-way to the same window.
 */
export function registerChatIpc(options: {
  readonly ipcMain: IpcMain;
  readonly chat: ChatManager;
  readonly getWebContents: () => WebContents | null;
  readonly isTrustedEvent: (event: IpcMainInvokeEvent) => boolean;
}): () => void {
  const { ipcMain, chat, getWebContents, isTrustedEvent } = options;

  const handle = <T>(
    channel: string,
    handler: (...args: unknown[]) => Promise<Result<T>> | Result<T>,
  ): void => {
    ipcMain.handle(channel, async (event, ...args: unknown[]): Promise<Result<T>> => {
      if (!isTrustedEvent(event)) {
        return { ok: false, error: protocolError('internal', 'Untrusted renderer request.') };
      }
      try {
        return await handler(...args);
      } catch {
        return {
          ok: false,
          error: protocolError('internal', 'The chat request failed unexpectedly.'),
        };
      }
    });
  };

  handle<ChatOpenResult>(DASHBOARD_CHANNELS.chatOpen, (profileName, storedSessionId) => {
    if (!isBoundedString(profileName, MAX_PROFILE_LENGTH)) {
      return {
        ok: false,
        error: protocolError('invalid_url', 'A profile name is required to open a chat.'),
      };
    }
    if (storedSessionId !== null && !isBoundedString(storedSessionId, MAX_STORED_ID_LENGTH)) {
      return {
        ok: false,
        error: protocolError('invalid_url', 'The stored session id is not valid.'),
      };
    }
    return chat.open(profileName, typeof storedSessionId === 'string' ? storedSessionId : null);
  });

  handle<void>(DASHBOARD_CHANNELS.chatSend, (text) => {
    if (!isBoundedString(text, MAX_TEXT_LENGTH)) {
      return { ok: false, error: protocolError('invalid_url', 'Enter a message first.') };
    }
    return chat.send(text);
  });

  handle<void>(DASHBOARD_CHANNELS.chatStop, () => chat.stop());

  handle<readonly RemoteGroup[]>(DASHBOARD_CHANNELS.chatListGroups, () => chat.listGroups());

  handle<RemoteGroupState>(DASHBOARD_CHANNELS.chatGroupState, (roomId) => {
    if (!isBoundedString(roomId, MAX_STORED_ID_LENGTH)) {
      return { ok: false, error: protocolError('invalid_url', 'A room id is required.') };
    }
    return chat.groupState(roomId);
  });

  handle<void>(DASHBOARD_CHANNELS.chatGroupSend, (roomId, threadId, text, eventId) => {
    if (!isBoundedString(roomId, MAX_STORED_ID_LENGTH)) {
      return { ok: false, error: protocolError('invalid_url', 'A room id is required.') };
    }
    if (!isBoundedString(threadId, MAX_STORED_ID_LENGTH)) {
      return { ok: false, error: protocolError('invalid_url', 'A thread id is required.') };
    }
    if (!isBoundedString(text, MAX_TEXT_LENGTH)) {
      return { ok: false, error: protocolError('invalid_url', 'Enter a message first.') };
    }
    if (!isBoundedString(eventId, MAX_STORED_ID_LENGTH)) {
      return { ok: false, error: protocolError('invalid_url', 'The event id is not valid.') };
    }
    return chat.groupSend(roomId, threadId, text, eventId);
  });

  handle<RemoteGroup>(DASHBOARD_CHANNELS.chatGroupCreate, (name, members) => {
    if (!isBoundedString(name, 120)) {
      return { ok: false, error: protocolError('invalid_url', 'A group name is required.') };
    }
    if (!Array.isArray(members) || members.length < 2 || members.length > 6) {
      return { ok: false, error: protocolError('invalid_url', 'A group needs 2-6 members.') };
    }
    const normalized: RemoteGroupMemberInput[] = [];
    for (const member of members) {
      if (!isPlainObject(member)) {
        return { ok: false, error: protocolError('invalid_url', 'A group member is not valid.') };
      }
      const memberId = member['memberId'];
      const profile = member['profile'];
      const handle = member['handle'];
      const displayName = member['displayName'];
      if (
        !isBoundedString(memberId, MAX_STORED_ID_LENGTH) ||
        !isBoundedString(profile, MAX_PROFILE_LENGTH) ||
        !isBoundedString(handle, 64) ||
        (displayName !== undefined && typeof displayName !== 'string')
      ) {
        return { ok: false, error: protocolError('invalid_url', 'A group member is not valid.') };
      }
      normalized.push({
        memberId,
        profile,
        handle,
        ...(displayName === undefined ? {} : { displayName }),
      });
    }
    return chat.groupCreate(name, normalized);
  });

  handle<void>(DASHBOARD_CHANNELS.chatGroupDisband, (roomId) => {
    if (!isBoundedString(roomId, MAX_STORED_ID_LENGTH)) {
      return { ok: false, error: protocolError('invalid_url', 'A room id is required.') };
    }
    return chat.groupDisband(roomId);
  });

  handle<void>(DASHBOARD_CHANNELS.chatGroupStop, (roomId) => {
    if (!isBoundedString(roomId, MAX_STORED_ID_LENGTH)) {
      return { ok: false, error: protocolError('invalid_url', 'A room id is required.') };
    }
    return chat.groupStop(roomId);
  });

  handle<void>(DASHBOARD_CHANNELS.chatGroupApprove, (roomId, action, choice) => {
    if (!isBoundedString(roomId, MAX_STORED_ID_LENGTH)) {
      return { ok: false, error: protocolError('invalid_url', 'A room id is required.') };
    }
    if (!isPlainObject(action)) {
      return { ok: false, error: protocolError('invalid_url', 'An approval action is required.') };
    }
    const memberId = action['memberId'];
    const taskId = action['taskId'];
    const requestId = action['requestId'];
    const executionGeneration = action['executionGeneration'];
    if (
      !isBoundedString(memberId, MAX_STORED_ID_LENGTH) ||
      !isBoundedString(taskId, MAX_STORED_ID_LENGTH) ||
      !isBoundedString(requestId, MAX_STORED_ID_LENGTH) ||
      typeof executionGeneration !== 'number' ||
      !Number.isInteger(executionGeneration) ||
      executionGeneration < 0 ||
      (choice !== 'once' && choice !== 'deny')
    ) {
      return {
        ok: false,
        error: protocolError('invalid_url', 'The approval action is not valid.'),
      };
    }
    const normalized: RemoteGroupPendingAction = {
      kind: String(action['kind'] ?? ''),
      memberId,
      taskId,
      requestId,
      executionGeneration,
    };
    return chat.groupApprove(roomId, normalized, choice);
  });

  handle<RemoteGroupLogPage>(DASHBOARD_CHANNELS.chatGroupLog, (roomId, sinceSeq, limit) => {
    if (!isBoundedString(roomId, MAX_STORED_ID_LENGTH)) {
      return { ok: false, error: protocolError('invalid_url', 'A room id is required.') };
    }
    if (typeof sinceSeq !== 'number' || !Number.isFinite(sinceSeq) || sinceSeq < 0) {
      return { ok: false, error: protocolError('invalid_url', 'The log cursor is not valid.') };
    }
    if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 1 || limit > 500) {
      return { ok: false, error: protocolError('invalid_url', 'The log limit is not valid.') };
    }
    return chat.groupLog(roomId, sinceSeq, limit);
  });

  handle<void>(DASHBOARD_CHANNELS.chatAnswer, (requestId, result) => {
    if (!isBoundedString(requestId, MAX_STORED_ID_LENGTH)) {
      return {
        ok: false,
        error: protocolError('invalid_url', 'The approval request id is not valid.'),
      };
    }
    if (!isPlainObject(result)) {
      return { ok: false, error: protocolError('invalid_url', 'The answer is not valid.') };
    }
    const serialized = JSON.stringify(result);
    if (serialized.length > MAX_ANSWER_BYTES) {
      return { ok: false, error: protocolError('invalid_url', 'The answer is too large.') };
    }
    return chat.answer(requestId, result);
  });

  const unsubscribe = chat.subscribe((event: DashboardChatEvent) => {
    const contents = getWebContents();
    if (contents === null || contents.isDestroyed()) {
      return;
    }
    contents.send(DASHBOARD_CHANNELS.chatEvent, event);
  });

  return unsubscribe;
}
