import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface DashboardSettings {
  readonly version: 1;
  /** Last Dashboard address the person connected to, if any. Never contains secrets. */
  readonly lastAddress: string | null;
}

const EMPTY: DashboardSettings = { version: 1, lastAddress: null };

/**
 * Non-secret connection preferences in the app's userData. Credentials live in the
 * separate safeStorage vault; this file only remembers where to reconnect.
 */
export function createSettingsStore(filePath: string): {
  read(): DashboardSettings;
  writeLastAddress(address: string | null): void;
} {
  const read = (): DashboardSettings => {
    try {
      if (!existsSync(filePath)) {
        return EMPTY;
      }
      const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<DashboardSettings>;
      if (parsed.version !== 1 || typeof parsed.lastAddress !== 'string') {
        return EMPTY;
      }
      return { version: 1, lastAddress: parsed.lastAddress };
    } catch {
      return EMPTY;
    }
  };

  const write = (settings: DashboardSettings): void => {
    mkdirSync(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, filePath);
  };

  return {
    read,
    writeLastAddress(address) {
      try {
        write({ version: 1, lastAddress: address });
      } catch {
        // Remembering the address is a convenience; failing to write must not block sign-in.
      }
    },
  };
}
