import { describe, expect, it } from 'vitest';
import { extractMessageText, mapMessageRow, mapProfileRow } from '../../src/main/dashboard/bots';

describe('profile row mapping', () => {
  it('maps a deployed profiles.list row with canonical session data', () => {
    const bot = mapProfileRow({
      name: 'project-bot',
      display_name: 'Project Bot',
      description: 'Keeps notes',
      model: 'gpt-6-luna-900k',
      provider: 'openai-codex',
      is_default: false,
      canonical_session: {
        id: '20261101_101010_aaaaaa',
        resolved_id: '20261102_202020_bbbbbb',
        preview: 'latest preview',
        last_active: 1_700_000_000,
        message_count: 12,
      },
      last_session: { preview: 'newer chat', last_active: 1_700_000_500 },
    });
    expect(bot).not.toBeNull();
    expect(bot?.profileName).toBe('project-bot');
    expect(bot?.displayName).toBe('Project Bot');
    expect(bot?.summary).toBe('latest preview');
    expect(bot?.canonicalSessionId).toBe('20261101_101010_aaaaaa');
    expect(bot?.lastActiveAt).toBe(1_700_000_500_000);
    expect(bot?.messageCount).toBe(12);
    expect(bot?.isDefault).toBe(false);
  });

  it('degrades gracefully when session fields are absent', () => {
    const bot = mapProfileRow({ name: 'default', description: 'main' });
    expect(bot?.displayName).toBe('default');
    expect(bot?.summary).toBe('main');
    expect(bot?.canonicalSessionId).toBeNull();
    expect(bot?.lastActiveAt).toBeNull();
  });

  it('skips rows without a name', () => {
    expect(mapProfileRow({ display_name: 'x' })).toBeNull();
    expect(mapProfileRow(null)).toBeNull();
  });
});

describe('message row mapping', () => {
  it('joins text parts and skips image-only content', () => {
    expect(extractMessageText('hello')).toBe('hello');
    expect(
      extractMessageText([
        { type: 'text', text: 'first' },
        { type: 'image_url', image_url: { url: 'data:...' } },
        { type: 'text', text: 'second' },
      ]),
    ).toBe('first\nsecond');
    expect(extractMessageText([{ type: 'image_url' }])).toBe('');
  });

  it('maps user and assistant rows to chat messages', () => {
    const user = mapMessageRow({
      id: 'm1',
      role: 'user',
      content: 'hello',
      timestamp: 1_700_000_000,
    });
    expect(user).toEqual({ id: 'm1', role: 'user', text: 'hello', at: 1_700_000_000_000 });

    const assistant = mapMessageRow({
      id: 'm2',
      role: 'assistant',
      content: [{ type: 'text', text: 'hi' }],
      timestamp: 1_700_000_001,
    });
    expect(assistant?.role).toBe('bot');
  });

  it('skips tool, system and empty rows', () => {
    expect(mapMessageRow({ id: 'm3', role: 'tool', content: 'x' })).toBeNull();
    expect(mapMessageRow({ id: 'm4', role: 'system', content: 'x' })).toBeNull();
    expect(mapMessageRow({ id: 'm5', role: 'assistant', content: [] })).toBeNull();
    expect(mapMessageRow({ role: 'user' })).toBeNull();
  });
});
