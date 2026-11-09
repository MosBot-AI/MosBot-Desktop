import { describe, expect, it, vi } from 'vitest';
import { openPendingProfile } from '../../src/renderer/app/pending-open';
import type { RemoteBot, Result } from '../../src/shared/protocol';

function bot(profileName: string): RemoteBot {
  return {
    profileName,
    displayName: profileName,
    description: '',
    shape: null,
    color: '#c08a4e',
    metaRevision: 0,
    model: '',
    provider: '',
    isDefault: false,
    summary: '',
    canonicalSessionId: null,
    lastActiveAt: null,
    messageCount: 0,
  };
}

function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

describe('openPendingProfile', () => {
  it('selects a Bot that is already in the roster without refreshing', async () => {
    const listBots = vi.fn();
    const applyBots = vi.fn();
    const select = vi.fn();
    const opened = await openPendingProfile({
      profile: 'known-bot',
      bots: [bot('known-bot')],
      listBots,
      applyBots,
      select,
    });
    expect(opened).toBe(true);
    expect(listBots).not.toHaveBeenCalled();
    expect(applyBots).not.toHaveBeenCalled();
    expect(select).toHaveBeenCalledWith('known-bot');
  });

  it('refreshes the roster before selecting a Bot created by another client', async () => {
    const refreshed = [bot('known-bot'), bot('new-bot')];
    const listBots = vi.fn(async () => ok(refreshed));
    const applyBots = vi.fn();
    const select = vi.fn();
    const opened = await openPendingProfile({
      profile: 'new-bot',
      bots: [bot('known-bot')],
      listBots,
      applyBots,
      select,
    });
    expect(opened).toBe(true);
    expect(listBots).toHaveBeenCalledTimes(1);
    expect(applyBots).toHaveBeenCalledWith(refreshed);
    expect(select).toHaveBeenCalledWith('new-bot');
  });

  it('does not select anything when the roster refresh fails', async () => {
    const listBots = vi.fn(async (): Promise<Result<readonly RemoteBot[]>> => ({
      ok: false,
      error: { code: 'unreachable', message: 'offline', retriable: true },
    }));
    const applyBots = vi.fn();
    const select = vi.fn();
    const opened = await openPendingProfile({
      profile: 'new-bot',
      bots: [bot('known-bot')],
      listBots,
      applyBots,
      select,
    });
    expect(opened).toBe(false);
    expect(applyBots).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });

  it('does not select a profile that is still missing after the refresh', async () => {
    const listBots = vi.fn(async () => ok([bot('known-bot')]));
    const applyBots = vi.fn();
    const select = vi.fn();
    const opened = await openPendingProfile({
      profile: 'deleted-bot',
      bots: [bot('known-bot')],
      listBots,
      applyBots,
      select,
    });
    expect(opened).toBe(false);
    expect(applyBots).toHaveBeenCalledTimes(1);
    expect(select).not.toHaveBeenCalled();
  });
});
