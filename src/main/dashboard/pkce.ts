import { createHash, randomBytes } from 'node:crypto';
import { protocolError, targetUrl, type DashboardTarget } from '../../shared/protocol';

/** RFC 7636 verifier: 32 random bytes as base64url (43 chars, within 43–128). */
export interface PkcePair {
  readonly verifier: string;
  readonly challenge: string;
}

export function createPkcePair(random: (size: number) => Buffer = randomBytes): PkcePair {
  const verifier = random(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier, 'ascii').digest('base64url');
  return { verifier, challenge };
}

export interface AuthorizeUrlOptions {
  readonly target: DashboardTarget;
  readonly provider: string;
  readonly redirectUri: string;
  readonly state: string;
  readonly challenge: string;
}

/** Builds the RFC 8252 native authorization URL on the Dashboard. */
export function buildAuthorizeUrl(options: AuthorizeUrlOptions): string {
  const url = new URL(targetUrl(options.target, '/auth/native/authorize'));
  url.searchParams.set('provider', options.provider);
  url.searchParams.set('code_challenge', options.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('redirect_uri', options.redirectUri);
  url.searchParams.set('state', options.state);
  return url.toString();
}

/** 256-bit opaque client state, compared exactly when the loopback callback lands. */
export function createClientState(random: (size: number) => Buffer = randomBytes): string {
  return random(32).toString('base64url');
}

/** Validates that a target's path prefix still resolves to a native-auth route. */
export function assertNativeAuthTarget(target: DashboardTarget): void {
  if (target.basePath.includes('/api')) {
    throw protocolError('invalid_url', 'Point the app at the Dashboard root, not an /api path.');
  }
}
