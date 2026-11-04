import { describe, expect, it } from 'vitest';
import { mapFileEntry } from '../../src/main/dashboard/artifacts';
import { artifactErrorKey } from '../../src/renderer/features/inspector/artifactError';
import { protocolError } from '../../src/shared/protocol';

describe('artifact file entry mapping', () => {
  it('maps the deployment shape (mtime seconds, mime null) and keeps newest ordering data', () => {
    const artifact = mapFileEntry({
      name: 'report.md',
      path: '/workspace/report.md',
      is_directory: false,
      size: 24,
      mtime: 1_763_000_000.5,
      mime_type: null,
    });
    expect(artifact).not.toBeNull();
    expect(artifact).toMatchObject({
      name: 'report.md',
      path: '/workspace/report.md',
      size: 24,
      mimeType: 'application/octet-stream',
      kind: 'text',
      modifiedAt: 1_763_000_000_500,
    });
    expect(artifact?.brokenLink).toBeUndefined();
  });

  it('prefers modified_at milliseconds when a build reports them', () => {
    expect(
      mapFileEntry({
        name: 'a.txt',
        path: '/w/a.txt',
        modified_at: 1_763_000_000_000,
        mtime: 1_700_000_000,
      })?.modifiedAt,
    ).toBe(1_763_000_000_000);
  });

  it('marks dangling symlinks as broken and skips directories or unnamed entries', () => {
    expect(
      mapFileEntry({
        name: 'gone.txt',
        path: '/w/gone.txt',
        is_directory: false,
        broken_link: true,
        size: null,
        mtime: null,
        mime_type: null,
      }),
    ).toMatchObject({ brokenLink: true, size: 0, kind: 'text' });
    expect(mapFileEntry({ name: 'dir', path: '/w/dir', is_directory: true })).toBeNull();
    expect(mapFileEntry({ name: '', path: '/w/x' })).toBeNull();
    expect(mapFileEntry(null)).toBeNull();
  });

  it('maps artifact failures to specific messages', () => {
    expect(artifactErrorKey(protocolError('session_expired', 'expired'))).toBe(
      'inspector.library.error.session',
    );
    expect(artifactErrorKey(protocolError('http_error', 'gone', { httpStatus: 404 }))).toBe(
      'inspector.library.error.notFound',
    );
    expect(artifactErrorKey(protocolError('unauthorized', 'denied', { httpStatus: 403 }))).toBe(
      'inspector.library.error.denied',
    );
    expect(artifactErrorKey(protocolError('http_error', 'large', { httpStatus: 413 }))).toBe(
      'inspector.library.error.tooLarge',
    );
    expect(artifactErrorKey(protocolError('unauthorized', 'sign in'))).toBe(
      'inspector.library.error.signIn',
    );
    expect(artifactErrorKey(protocolError('http_error', 'server', { httpStatus: 500 }))).toBe(
      'inspector.library.remote.error',
    );
  });
});
