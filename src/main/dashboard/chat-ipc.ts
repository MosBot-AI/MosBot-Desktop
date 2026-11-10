import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import { DASHBOARD_CHANNELS } from '../../shared/bridge';
import {
  protocolError,
  type ChatOpenResult,
  type DashboardChatEvent,
  type RemoteGroup,
  type RemoteGroupLogPage,
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
