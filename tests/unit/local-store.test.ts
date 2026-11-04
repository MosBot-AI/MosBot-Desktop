import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocalStore } from '../../src/main/local/store';
import type { LocalState } from '../../src/shared/protocol';

const directories: string[] = [];

function tempFile(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'mosbot-local-'));
  directories.push(directory);
  return path.join(directory, 'local-state.json');
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function sample(): LocalState {
  return {
    version: 2,
    connections: {
      'https://hermes.example.com': {
        selectedProfile: 'project-bot',
        drafts: { 'project-bot': 'unfinished message' },
        inspector: { open: true, tab: 'library', width: 380 },
        organization: {
          pinned: ['project-bot'],
          sections: [{ id: 'product', title: '产品', botIds: ['project-bot'], collapsed: false }],
        },
      },
    },
    preferences: { theme: 'dark', language: 'en' },
  };
}

describe('local state store', () => {
  it('round-trips a valid document and keeps a backup of the previous version', () => {
    const file = tempFile();
    const store = createLocalStore(file);
    expect(store.load()).toBeNull();
    expect(store.save(sample())).toEqual({ ok: true });
    expect(store.load()).toEqual(sample());
    store.save({ ...sample(), preferences: { theme: 'light', language: 'zh-Hans' } });
    expect(JSON.parse(readFileSync(`${file}.bak`, 'utf8'))).toEqual(sample());
    expect(store.load()?.preferences.theme).toBe('light');
  });

  it('migrates a version 1 document by adding an empty organization', () => {
    const file = tempFile();
    writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        connections: {
          fixture: {
            selectedProfile: 'bot-project',
            drafts: { 'bot-project': 'draft' },
            inspector: { open: false, tab: 'details', width: 360 },
          },
        },
        preferences: { theme: 'light', language: 'zh-Hans' },
      }),
    );
    const loaded = createLocalStore(file).load();
    expect(loaded?.version).toBe(2);
    expect(loaded?.connections['fixture']?.organization).toEqual({
      pinned: [],
      sections: [],
    });
    expect(loaded?.connections['fixture']?.drafts).toEqual({ 'bot-project': 'draft' });
  });

  it('sanitises oversized or malformed drafts instead of trusting them', () => {
    const file = tempFile();
    writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        connections: {
          fixture: {
            selectedProfile: 42,
            drafts: { ok: 'text', empty: '', long: 'x'.repeat(30_000), bad: 7 },
            inspector: { open: 'yes', tab: 'nope', width: 'wide' },
          },
        },
        preferences: { theme: 'purple', language: 'fr' },
      }),
    );
    const loaded = createLocalStore(file).load();
    expect(loaded?.connections['fixture']?.selectedProfile).toBeNull();
    expect(loaded?.connections['fixture']?.drafts).toEqual({ ok: 'text' });
    expect(loaded?.connections['fixture']?.inspector).toEqual({
      open: false,
      tab: 'details',
      width: 360,
    });
    expect(loaded?.preferences).toEqual({ theme: 'system', language: 'zh-Hans' });
  });

  it('refuses to overwrite a newer schema and reports a reason', () => {
    const file = tempFile();
    writeFileSync(file, JSON.stringify({ version: 3, anything: true }));
    const store = createLocalStore(file);
    expect(store.load()).toBeNull();
    expect(store.save(sample())).toEqual({ ok: false, reason: 'newer-schema' });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ version: 3, anything: true });
  });

  it('treats a corrupt file as empty, keeps it aside and does not crash', () => {
    const file = tempFile();
    writeFileSync(file, '{ not json');
    const store = createLocalStore(file);
    expect(store.load()).toBeNull();
    expect(store.save(sample())).toEqual({ ok: true });
    // The unreadable document is preserved for recovery, not dropped.
    expect(readFileSync(`${file}.corrupt`, 'utf8')).toBe('{ not json');
    expect(store.load()).toEqual(sample());
  });

  it('falls back to the last good backup when the main document is corrupt', () => {
    const file = tempFile();
    const store = createLocalStore(file);
    store.save(sample());
    store.save(sample());
    writeFileSync(file, '{"version":2,"connections":');
    expect(store.load()).toEqual(sample());
    // The corrupt main file stays untouched until the next successful save.
    expect(readFileSync(file, 'utf8')).toBe('{"version":2,"connections":');
  });

  it('falls back to the backup when the main document belongs to a newer schema', () => {
    const file = tempFile();
    const store = createLocalStore(file);
    store.save(sample());
    store.save(sample());
    writeFileSync(file, JSON.stringify({ version: 99, connections: {} }));
    expect(store.load()).toEqual(sample());
    expect(store.save(sample())).toEqual({ ok: false, reason: 'newer-schema' });
  });
});
