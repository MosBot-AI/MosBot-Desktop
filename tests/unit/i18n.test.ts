import { describe, expect, it } from 'vitest';
import { en, translate, zhHans } from '../../src/renderer/app/i18n';
import { formatRelativeMinutes, presenceKey } from '../../src/renderer/app/format';
import { PRESENCES } from '../../src/shared/domain';

describe('message tables', () => {
  it('ships the same keys with the same placeholders in both locales', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zhHans).sort());
    for (const key of Object.keys(zhHans) as Array<keyof typeof zhHans>) {
      const zh = zhHans[key];
      const mirror = en[key];
      expect(zh.length, key).toBeGreaterThan(0);
      expect(mirror.length, key).toBeGreaterThan(0);
      const placeholders = (text: string): string[] =>
        Array.from(text.matchAll(/\{(\w+)\}/g), (match) => match[1] ?? '').sort();
      expect(placeholders(mirror), key).toEqual(placeholders(zh));
    }
  });

  it('interpolates variables and leaves unknown placeholders untouched', () => {
    expect(translate('zh-Hans', 'chat.composer.placeholder', { name: '项目助理' })).toBe(
      '给 项目助理 发消息',
    );
    expect(translate('en', 'chat.composer.placeholder', { name: 'Ops' })).toBe('Message Ops');
    expect(translate('en', 'chat.composer.placeholder')).toBe('Message {name}');
    expect(translate('zh-Hans', 'app.unread', { count: 3 })).toBe('未读 3 条');
  });

  it('covers every presence label in both locales', () => {
    for (const presence of PRESENCES) {
      const key = presenceKey(presence);
      expect(zhHans[key].length).toBeGreaterThan(0);
      expect(en[key].length).toBeGreaterThan(0);
    }
  });
});

describe('relative time', () => {
  it('formats each bucket in both languages', () => {
    expect(formatRelativeMinutes('zh-Hans', 0)).toBe('刚刚');
    expect(formatRelativeMinutes('zh-Hans', 12)).toBe('12 分钟前');
    expect(formatRelativeMinutes('zh-Hans', 90)).toBe('2 小时前');
    expect(formatRelativeMinutes('zh-Hans', 60 * 24 * 3)).toBe('3 天前');
    expect(formatRelativeMinutes('en', 1)).toBe('just now');
    expect(formatRelativeMinutes('en', 12)).toBe('12 min ago');
    expect(formatRelativeMinutes('en', 90)).toBe('2 h ago');
    expect(formatRelativeMinutes('en', 60 * 24 * 3)).toBe('3 d ago');
  });
});
