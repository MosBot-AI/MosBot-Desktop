import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { protocolError, type Result } from '../../shared/protocol';

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export interface StoredSession {
  readonly target: string;
  readonly refreshToken: string;
  readonly provider: string;
  readonly userId: string;
  readonly displayName: string;
  readonly expiresAt: number;
}

export interface Vault {
  load(target: string): Result<StoredSession | null>;
  save(session: StoredSession): Result<void>;
  clear(target: string): void;
}

interface VaultFile {
  version: 1;
  sessions: Record<string, string>;
}

/**
 * Refresh tokens live encrypted by Electron safeStorage (Keychain-backed) in the
 * app's userData. Access tokens stay in memory only. If encryption is
 * unavailable nothing is written: the app degrades to signing in each launch
 * rather than storing a bearer secret in clear text.
 */
export function createVault(options: {
  readonly filePath: string;
  readonly safeStorage: SafeStorageLike;
}): Vault {
  const { filePath, safeStorage } = options;

  const readFile = (): VaultFile => {
    try {
      if (!existsSync(filePath)) {
        return { version: 1, sessions: {} };
      }
      const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<VaultFile>;
      if (parsed.version !== 1 || typeof parsed.sessions !== 'object' || parsed.sessions === null) {
        return { version: 1, sessions: {} };
      }
      return { version: 1, sessions: { ...parsed.sessions } };
    } catch {
      return { version: 1, sessions: {} };
    }
  };

  const writeFile = (file: VaultFile): void => {
    mkdirSync(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, filePath);
  };

  return {
    load(target) {
      if (!safeStorage.isEncryptionAvailable()) {
        return {
          ok: false,
          error: protocolError(
            'vault_unavailable',
            'Secure storage is unavailable, so saved sign-ins cannot be read.',
          ),
        };
      }
      const raw = readFile().sessions[target];
      if (raw === undefined) {
        return { ok: true, data: null };
      }
      try {
        const decrypted = safeStorage.decryptString(Buffer.from(raw, 'base64'));
        const parsed = JSON.parse(decrypted) as StoredSession;
        if (
          typeof parsed.refreshToken !== 'string' ||
          typeof parsed.provider !== 'string' ||
          typeof parsed.userId !== 'string'
        ) {
          return {
            ok: false,
            error: protocolError('vault_unavailable', 'The saved sign-in is not readable.'),
          };
        }
        return { ok: true, data: parsed };
      } catch {
        return {
          ok: false,
          error: protocolError('vault_unavailable', 'The saved sign-in could not be decrypted.'),
        };
      }
    },
    save(session) {
      if (!safeStorage.isEncryptionAvailable()) {
        return {
          ok: false,
          error: protocolError(
            'vault_unavailable',
            'Secure storage is unavailable, so this sign-in cannot be remembered.',
          ),
        };
      }
      try {
        const encrypted = safeStorage.encryptString(JSON.stringify(session)).toString('base64');
        const file = readFile();
        file.sessions[session.target] = encrypted;
        writeFile(file);
        return { ok: true, data: undefined };
      } catch {
        return {
          ok: false,
          error: protocolError('vault_unavailable', 'This sign-in could not be saved securely.'),
        };
      }
    },
    clear(target) {
      const file = readFile();
      if (file.sessions[target] !== undefined) {
        delete file.sessions[target];
        try {
          writeFile(file);
        } catch {
          // Best effort: leaving an old encrypted token is preferable to crashing sign-out.
        }
      }
    },
  };
}
