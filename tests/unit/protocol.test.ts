import { describe, expect, it } from 'vitest';
import {
  isLoopbackHostname,
  parseDashboardTarget,
  protocolError,
  targetUrl,
  TEST_DASHBOARD_URL,
} from '../../src/shared/protocol';

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return (error as { code?: string }).code ?? 'no-code';
  }
  return 'no-throw';
}

describe('dashboard target policy', () => {
  it('accepts https with a reverse-proxy prefix and normalises trailing slashes', () => {
    const target = parseDashboardTarget('https://hermes.example.com:8443/hermes/');
    expect(target.origin).toBe('https://hermes.example.com:8443');
    expect(target.basePath).toBe('/hermes');
    expect(target.displayUrl).toBe('https://hermes.example.com:8443/hermes');
    expect(targetUrl(target, '/api/health')).toBe(
      'https://hermes.example.com:8443/hermes/api/health',
    );
  });

  it('allows the exact test deployment and loopback over plain http only', () => {
    expect(parseDashboardTarget(TEST_DASHBOARD_URL).origin).toBe(TEST_DASHBOARD_URL);
    expect(parseDashboardTarget('http://127.0.0.1:9119').origin).toBe('http://127.0.0.1:9119');
    expect(parseDashboardTarget('http://[::1]:9119').origin).toBe('http://[::1]:9119');
    expect(parseDashboardTarget('http://localhost:9119').origin).toBe('http://localhost:9119');
    expect(isLoopbackHostname('127.0.0.1')).toBe(true);
  });

  it('rejects everything else over plain http', () => {
    expect(codeOf(() => parseDashboardTarget('http://192.168.2.172:9119'))).toBe('insecure_url');
    expect(codeOf(() => parseDashboardTarget('http://10.0.0.5:9119'))).toBe('insecure_url');
  });

  it('rejects malformed, credentialed, query and fragment addresses', () => {
    expect(codeOf(() => parseDashboardTarget(''))).toBe('invalid_url');
    expect(codeOf(() => parseDashboardTarget('hermes.local'))).toBe('invalid_url');
    expect(codeOf(() => parseDashboardTarget('ftp://hermes.local'))).toBe('invalid_url');
    expect(codeOf(() => parseDashboardTarget('https://user:pass@hermes.local'))).toBe(
      'invalid_url',
    );
    expect(codeOf(() => parseDashboardTarget('https://hermes.local?x=1'))).toBe('invalid_url');
    expect(codeOf(() => parseDashboardTarget('https://hermes.local#x'))).toBe('invalid_url');
    expect(codeOf(() => parseDashboardTarget('https://hermes.local/../admin'))).toBe('invalid_url');
  });

  it('requires protocol paths to be absolute', () => {
    const target = parseDashboardTarget(TEST_DASHBOARD_URL);
    expect(codeOf(() => targetUrl(target, 'api/health'))).toBe('internal');
  });

  it('keeps protocol errors structured', () => {
    const error = protocolError('timeout', 'slow', { retriable: true });
    expect(error).toEqual({ code: 'timeout', message: 'slow', retriable: true });
  });
});
