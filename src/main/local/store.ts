import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import type { LocalState } from '../../shared/protocol';

const MAX_DRAFTS = 500;
const MAX_DRAFT_LENGTH = 20_000;
const MAX_CONNECTIONS = 20;

function emptyState(): LocalState {
  return {
    version: 1,
    connections: {},
    preferences: { theme: 'system', language: 'zh-Hans' },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function sanitizeDrafts(value: unknown): Record<string, string> {
  const record = asRecord(value);
  if (record === null) {
    return {};
  }
  const drafts: Record<string, string> = {};
  let count = 0;
  for (const [key, raw] of Object.entries(record)) {
    if (count >= MAX_DRAFTS) {
      break;
    }
    if (typeof raw !== 'string' || raw === '' || raw.length > MAX_DRAFT_LENGTH) {
      continue;
    }
    drafts[key.slice(0, 128)] = raw;
    count += 1;
  }
  return drafts;
}

function sanitizeInspector(value: unknown): LocalState['connections'][string]['inspector'] {
  const record = asRecord(value);
  const tab = record?.['tab'];
  const width = record?.['width'];
  return {
    open: record?.['open'] === true,
    tab: tab === 'library' || tab === 'computer' ? tab : 'details',
    width: typeof width === 'number' && Number.isFinite(width) ? Math.round(width) : 360,
  };
}

/**
 * The local store is the single writer for non-secret UI state (drafts, selection,
 * preferences). Writes go through a temp file + atomic rename; a corrupt or newer
 * schema is never overwritten blindly.
 */
export function createLocalStore(filePath: string): {
  load(): LocalState | null;
  save(state: LocalState): { ok: boolean; reason?: string };
} {
  const backupPath = `${filePath}.bak`;

  const load = (): LocalState | null => {
    if (!existsSync(filePath)) {
      return null;
    }
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
      const record = asRecord(parsed);
      if (record === null || record['version'] !== 1) {
        return null;
      }
      const connections: Record<string, LocalState['connections'][string]> = {};
      const rawConnections = asRecord(record['connections']) ?? {};
      for (const [key, raw] of Object.entries(rawConnections).slice(0, MAX_CONNECTIONS)) {
        const connection = asRecord(raw);
        if (connection === null) {
          continue;
        }
        connections[key.slice(0, 256)] = {
          selectedProfile:
            typeof connection['selectedProfile'] === 'string'
              ? connection['selectedProfile'].slice(0, 128)
              : null,
          drafts: sanitizeDrafts(connection['drafts']),
          inspector: sanitizeInspector(connection['inspector']),
        };
      }
      const preferences = asRecord(record['preferences']);
      const theme = preferences?.['theme'];
      const language = preferences?.['language'];
      return {
        version: 1,
        connections,
        preferences: {
          theme: theme === 'light' || theme === 'dark' ? theme : 'system',
          language: language === 'en' ? 'en' : 'zh-Hans',
        },
      };
    } catch {
      return null;
    }
  };

  const save = (state: LocalState): { ok: boolean; reason?: string } => {
    try {
      let existingVersion: unknown = undefined;
      if (existsSync(filePath)) {
        try {
          const existing = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
          existingVersion = asRecord(existing)?.['version'];
        } catch {
          // A corrupt file has no schema to protect; replace it.
          existingVersion = undefined;
        }
      }
      if (typeof existingVersion === 'number' && existingVersion > 1) {
        return { ok: false, reason: 'newer-schema' };
      }
      mkdirSync(path.dirname(filePath), { recursive: true });
      if (existsSync(filePath) && existingVersion === 1) {
        copyFileSync(filePath, backupPath);
      }
      const temporary = `${filePath}.tmp`;
      writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
      renameSync(temporary, filePath);
      return { ok: true };
    } catch {
      return { ok: false, reason: 'write-failed' };
    }
  };

  return { load, save };
}

export { emptyState };
