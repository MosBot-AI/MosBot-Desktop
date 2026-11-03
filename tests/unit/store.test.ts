import { describe, expect, it } from 'vitest';
import { createFixtureSeed } from '../../src/renderer/app/fixtures';
import {
  createAppStore,
  createInitialState,
  reduceAppState,
  searchEntries,
  selectChatMessages,
  selectPendingBotId,
  selectPinnedBots,
  selectUnresolvedCount,
  type AppState,
} from '../../src/renderer/app/store';

function build(): AppState {
  return createInitialState(createFixtureSeed(), {
    resolvedTheme: 'light',
    language: 'zh-Hans',
    reduceMotion: false,
  });
}

describe('fixtures', () => {
  it('covers every M0a state: two sections, six pinned slots, long name, empty chat, long reply, offline Bot, pending approval, sleeping computer', () => {
    const seed = createFixtureSeed();
    expect(seed.sections).toHaveLength(2);
    expect(seed.bots.filter((bot) => bot.pinnedIndex !== null)).toHaveLength(6);
    expect(seed.bots.some((bot) => bot.name.length >= 12)).toBe(true);
    expect(Object.values(seed.messages).some((list) => list.length === 0)).toBe(true);
    const longReply = Object.values(seed.messages)
      .flat()
      .find(
        (message) =>
          message.kind === 'text' &&
          message.text.length > 150 &&
          message.text.includes('\n\n') &&
          message.text.includes('```'),
      );
    expect(longReply).toBeDefined();
    expect(seed.bots.some((bot) => bot.presence === 'offline')).toBe(true);
    expect(
      Object.values(seed.messages).some((list) =>
        list.some((message) => message.kind === 'approval'),
      ),
    ).toBe(true);
    expect(Object.values(seed.computers).some((item) => item.status === 'asleep')).toBe(true);
  });

  it('is deterministic', () => {
    expect(createFixtureSeed()).toEqual(createFixtureSeed());
  });
});

describe('roster store', () => {
  it('selects a Bot, clears its unread count and closes search', () => {
    const state = build();
    const searchOpen = reduceAppState(state, { type: 'search-open' });
    const next = reduceAppState(searchOpen, { type: 'select-bot', botId: 'bot-project' });
    expect(next.selectedBotId).toBe('bot-project');
    expect(next.bots.find((bot) => bot.id === 'bot-project')?.unread).toBe(0);
    expect(next.search.open).toBe(false);
  });

  it('collapses and expands a section', () => {
    const state = build();
    const collapsed = reduceAppState(state, { type: 'toggle-section', sectionId: 'sec-daily' });
    expect(collapsed.sections.find((section) => section.id === 'sec-daily')?.collapsed).toBe(false);
    const expanded = reduceAppState(collapsed, { type: 'toggle-section', sectionId: 'sec-daily' });
    expect(expanded.sections.find((section) => section.id === 'sec-daily')?.collapsed).toBe(true);
  });

  it('keeps pinned slots sorted', () => {
    const pinned = selectPinnedBots(build());
    expect(pinned.map((bot) => bot.pinnedIndex)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('chat store', () => {
  it('sends a message, marks replying, then delivers the reply', () => {
    const state = build();
    const sent = reduceAppState(state, {
      type: 'send-message',
      botId: 'bot-ops',
      text: '  看一下例行任务  ',
      at: 1_000,
    });
    expect(selectChatMessages(sent, 'bot-ops')).toHaveLength(1);
    expect(selectChatMessages(sent, 'bot-ops')[0]?.kind).toBe('text');
    expect(sent.drafts['bot-ops']).toBe('');
    expect(sent.pendingReply?.botId).toBe('bot-ops');
    expect(sent.bots.find((bot) => bot.id === 'bot-ops')?.presence).toBe('replying');

    const delivered = reduceAppState(sent, {
      type: 'deliver-reply',
      botId: 'bot-ops',
      text: '都正常。',
      at: 2_000,
    });
    expect(selectChatMessages(delivered, 'bot-ops')).toHaveLength(2);
    expect(delivered.pendingReply).toBeNull();
    expect(delivered.bots.find((bot) => bot.id === 'bot-ops')?.presence).toBe('idle');
  });

  it('stops a pending reply and keeps the transcript', () => {
    const state = build();
    const sent = reduceAppState(state, {
      type: 'send-message',
      botId: 'bot-weekly',
      text: '先停一下',
      at: 3_000,
    });
    const stopped = reduceAppState(sent, { type: 'stop-reply', botId: 'bot-weekly', at: 3_500 });
    const messages = selectChatMessages(stopped, 'bot-weekly');
    expect(messages).toHaveLength(2);
    expect(messages[1]?.kind).toBe('stopped');
    expect(stopped.pendingReply).toBeNull();
  });

  it('answers an approval once and folds it into a receipt', () => {
    const state = build();
    expect(selectUnresolvedCount(state)).toBeGreaterThan(0);
    const answered = reduceAppState(state, {
      type: 'answer-approval',
      messageId: 'msg-p-5',
      action: 'allow',
      at: 4_000,
    });
    const approval = selectChatMessages(answered, 'bot-project').find(
      (message) => message.id === 'msg-p-5',
    );
    expect(approval?.kind).toBe('approval');
    if (approval?.kind === 'approval') {
      expect(approval.approval.resolution?.action).toBe('allow');
    }
    expect(selectUnresolvedCount(answered)).toBeLessThan(selectUnresolvedCount(state));

    const again = reduceAppState(answered, {
      type: 'answer-approval',
      messageId: 'msg-p-5',
      action: 'deny',
      at: 5_000,
    });
    expect(again).toBe(answered);
  });

  it('prefers the Bot that owns pending requests', () => {
    expect(selectPendingBotId(build())).toBe('bot-project');
  });
});

describe('create Bot', () => {
  it('creates, selects and isolates a new Bot', () => {
    const open = reduceAppState(build(), { type: 'create-open' });
    const named = reduceAppState(open, { type: 'create-name', name: '  测试 Bot  ' });
    const shaped = reduceAppState(named, { type: 'create-shape', shape: 'cloud' });
    const created = reduceAppState(shaped, { type: 'create-submit' });

    expect(created.create.open).toBe(false);
    expect(created.selectedBotId).toMatch(/^bot-/);
    expect(
      created.bots.some(
        (bot) =>
          bot.name === '测试 Bot' && bot.shape === 'cloud' && bot.id === created.selectedBotId,
      ),
    ).toBe(true);
    expect(selectChatMessages(created, created.selectedBotId)).toHaveLength(0);
  });

  it('rejects an empty name and a duplicate name', () => {
    const empty = reduceAppState(reduceAppState(build(), { type: 'create-open' }), {
      type: 'create-submit',
    });
    expect(empty.create.error).toBe('empty');

    const duplicate = reduceAppState(
      reduceAppState(reduceAppState(build(), { type: 'create-open' }), {
        type: 'create-name',
        name: 'MosBot',
      }),
      { type: 'create-submit' },
    );
    expect(duplicate.create.error).toBe('duplicate');
    expect(duplicate.bots).toHaveLength(build().bots.length);
  });
});

describe('search', () => {
  it('filters by name and summary, lists recent on empty query', () => {
    const state = build();
    const recent = searchEntries(state);
    expect(recent.matches).toHaveLength(0);
    expect(recent.flat.length).toBeGreaterThan(0);

    const filtered = searchEntries({
      ...state,
      search: { open: true, query: '评审', activeIndex: 0 },
    });
    expect(filtered.matches.some((bot) => bot.name === '设计评审')).toBe(true);
    expect(filtered.matches.some((bot) => bot.name === '运行看板')).toBe(false);
  });

  it('wraps the keyboard selection and activates the highlighted Bot', () => {
    const opened = reduceAppState(build(), { type: 'search-open' });
    const moved = reduceAppState(opened, { type: 'search-move', delta: -1 });
    const total = searchEntries(opened).flat.length;
    expect(moved.search.activeIndex).toBe(total - 1);

    const activated = reduceAppState(moved, { type: 'search-activate' });
    expect(activated.search.open).toBe(false);
    expect(activated.selectedBotId).toBe(
      activated.bots.some((bot) => bot.id === activated.selectedBotId)
        ? activated.selectedBotId
        : '',
    );
  });
});

describe('inspector and computer', () => {
  it('clamps the panel width and toggles the overlay mode', () => {
    const state = build();
    const wide = reduceAppState(state, { type: 'set-inspector-width', width: 5_000 });
    expect(wide.inspector.width).toBe(440);
    const narrow = reduceAppState(wide, { type: 'set-inspector-width', width: 10 });
    expect(narrow.inspector.width).toBe(320);
    const overlay = reduceAppState(narrow, { type: 'set-inspector-overlay', overlay: true });
    expect(overlay.inspector.overlay).toBe(true);
  });

  it('wakes a sleeping computer through the waking state', () => {
    const waking = reduceAppState(build(), { type: 'wake-computer', profileId: 'bot-project' });
    expect(waking.computers['bot-project']?.status).toBe('waking');
    const woke = reduceAppState(waking, { type: 'computer-woke', profileId: 'bot-project' });
    expect(woke.computers['bot-project']?.status).toBe('preview');
    expect(reduceAppState(woke, { type: 'wake-computer', profileId: 'bot-project' })).toBe(woke);
  });
});

describe('appearance', () => {
  it('resolves explicit themes and keeps the system value for system preference', () => {
    const state = build();
    const dark = reduceAppState(state, { type: 'set-theme', theme: 'dark' });
    expect(dark.theme).toBe('dark');
    expect(dark.resolvedTheme).toBe('dark');
    const system = reduceAppState(dark, { type: 'set-theme', theme: 'system' });
    expect(system.theme).toBe('system');
    expect(system.resolvedTheme).toBe('dark');
  });

  it('switches language without touching drafts or the transcript', () => {
    const state = build();
    const next = reduceAppState(state, { type: 'set-language', language: 'en' });
    expect(next.language).toBe('en');
    expect(next.drafts).toEqual(state.drafts);
    expect(next.messages['bot-project']).toEqual(state.messages['bot-project']);
  });
});

describe('store subscriptions', () => {
  it('notifies subscribers only when the state changes', () => {
    const store = createAppStore(build());
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    store.dispatch({ type: 'select-bot', botId: 'bot-project' });
    store.dispatch({ type: 'select-bot', botId: 'bot-project' });
    expect(calls).toBe(1);
    unsubscribe();
    store.dispatch({ type: 'select-bot', botId: 'bot-design' });
    expect(calls).toBe(1);
  });
});
