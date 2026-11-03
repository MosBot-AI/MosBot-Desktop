import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildAuthorizeUrl,
  createPkcePair,
  assertNativeAuthTarget,
} from '../../src/main/dashboard/pkce';
import { createVault, type SafeStorageLike } from '../../src/main/dashboard/vault';
import { parseDashboardTarget } from '../../src/shared/protocol';

const directories: string[] = [];

function tempCredentialsPath(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'mosbot-vault-'));
  directories.push(directory);
  return path.join(directory, 'dashboard-credentials.json');
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fakeSafeStorage(available = true): SafeStorageLike {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plain) => Buffer.from(`enc:${plain}`, 'utf8'),
    decryptString: (encrypted) => {
      const text = encrypted.toString('utf8');
      if (!text.startsWith('enc:')) {
        throw new Error('not encrypted by this app');
      }
      return text.slice(4);
    },
  };
}

describe('PKCE', () => {
  it('derives an S256 challenge from the verifier', () => {
    const pair = createPkcePair(() => Buffer.alloc(32, 7));
    expect(pair.verifier).toHaveLength(43);
    expect(pair.challenge).toBe(
      createHash('sha256').update(pair.verifier, 'ascii').digest('base64url'),
    );
    expect(pair.verifier).not.toContain('=');
    expect(pair.challenge).not.toContain('=');
  });

  it('builds the native authorize URL with the loopback redirect and state', () => {
    const target = parseDashboardTarget('https://hermes.example.com/hermes');
    const url = new URL(
      buildAuthorizeUrl({
        target,
        provider: 'github',
        redirectUri: 'http://127.0.0.1:51234/callback',
        state: 'state-1',
        challenge: 'challenge-1',
      }),
    );
    expect(url.origin + url.pathname).toBe(
      'https://hermes.example.com/hermes/auth/native/authorize',
    );
    expect(url.searchParams.get('provider')).toBe('github');
    expect(url.searchParams.get('code_challenge')).toBe('challenge-1');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:51234/callback');
    expect(url.searchParams.get('state')).toBe('state-1');
  });

  it('rejects targets that point at an API path instead of the Dashboard root', () => {
    const target = parseDashboardTarget('https://hermes.example.com/api');
    expect(() => assertNativeAuthTarget(target)).toThrowError(
      expect.objectContaining({ code: 'invalid_url' }),
    );
  });
});

describe('credential vault', () => {
  const session = {
    target: 'https://hermes.example.com',
    refreshToken: 'rt-secret',
    provider: 'github',
    userId: 'user-1',
    displayName: 'Charley',
    expiresAt: 1_700_000_000,
  };

  it('round-trips an encrypted refresh token and clears it on sign-out', () => {
    const filePath = tempCredentialsPath();
    const vault = createVault({ filePath, safeStorage: fakeSafeStorage() });
    expect(vault.load(session.target)).toEqual({ ok: true, data: null });
    expect(vault.save(session)).toEqual({ ok: true, data: undefined });
    expect(vault.load(session.target)).toEqual({ ok: true, data: session });
    // Nothing readable sits in the file: it is base64 of encrypted content.
    expect(readFileSync(filePath, 'utf8')).not.toContain('rt-secret');
    vault.clear(session.target);
    expect(vault.load(session.target)).toEqual({ ok: true, data: null });
  });

  it('refuses to persist when secure storage is unavailable', () => {
    const vault = createVault({
      filePath: tempCredentialsPath(),
      safeStorage: fakeSafeStorage(false),
    });
    const result = vault.save(session);
    expect(result.ok ? '' : result.error.code).toBe('vault_unavailable');
  });

  it('treats a corrupt or foreign credential file as empty', () => {
    const filePath = tempCredentialsPath();
    const vault = createVault({ filePath, safeStorage: fakeSafeStorage() });
    vault.save(session);
    const raw = JSON.parse(readFileSync(filePath, 'utf8')) as {
      sessions: Record<string, string>;
    };
    raw.sessions[session.target] = Buffer.from('garbage').toString('base64');
    writeFileSync(filePath, JSON.stringify(raw));
    const result = vault.load(session.target);
    expect(result.ok ? '' : result.error.code).toBe('vault_unavailable');
  });
});
