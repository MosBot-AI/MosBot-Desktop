import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { LOCAL_CHANNELS } from '../../shared/bridge';
import { protocolError, type LocalState, type Result } from '../../shared/protocol';
import { createLocalStore } from './store';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isLocalState(value: unknown): value is LocalState {
  const record = asRecord(value);
  return (
    record !== null &&
    record['version'] === 2 &&
    asRecord(record['connections']) !== null &&
    asRecord(record['preferences']) !== null
  );
}

/**
 * Local-state IPC. Only the app's own top-level frame may read or replace the
 * versioned JSON; payload size and shape are bounded here, and the store writes
 * atomically with a backup of the previous version.
 */
export function registerLocalIpc(options: {
  readonly ipcMain: IpcMain;
  readonly filePath: string;
  readonly isTrustedEvent: (event: IpcMainInvokeEvent) => boolean;
}): void {
  const store = createLocalStore(options.filePath);

  options.ipcMain.handle(LOCAL_CHANNELS.load, (event): Result<LocalState | null> => {
    if (!options.isTrustedEvent(event)) {
      return { ok: false, error: protocolError('internal', 'Untrusted renderer request.') };
    }
    try {
      return { ok: true, data: store.load() };
    } catch {
      return { ok: true, data: null };
    }
  });

  options.ipcMain.handle(LOCAL_CHANNELS.save, (event, state: unknown): Result<void> => {
    if (!options.isTrustedEvent(event)) {
      return { ok: false, error: protocolError('internal', 'Untrusted renderer request.') };
    }
    if (!isLocalState(state)) {
      return { ok: false, error: protocolError('invalid_url', 'The local state is not valid.') };
    }
    let serialized: string;
    try {
      serialized = JSON.stringify(state);
    } catch {
      return { ok: false, error: protocolError('invalid_url', 'The local state is not valid.') };
    }
    if (serialized.length > 2 * 1024 * 1024) {
      return { ok: false, error: protocolError('invalid_url', 'The local state is too large.') };
    }
    const saved = store.save(state);
    return saved.ok
      ? { ok: true, data: undefined }
      : {
          ok: false,
          error: protocolError(
            'internal',
            saved.reason === 'newer-schema'
              ? 'A newer version of MosBot wrote this file; refusing to overwrite it.'
              : 'The local state could not be saved.',
          ),
        };
  });
}
