import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp } from './harness';

test.describe.configure({ mode: 'serial' });

/**
 * M5 upgrade migration: a data directory written by the previous test build
 * (local-state schema v1) must keep drafts, selection and preferences, upgrade
 * in place to v2, and recover from a corrupt document through the backup.
 */
test.describe('M5 local-state upgrade', () => {
  test('a version 1 document upgrades without losing drafts, selection or theme', async () => {
    const userData = path.resolve('.tmp/userdata-upgrade');
    rmSync(userData, { recursive: true, force: true });
    mkdirSync(userData, { recursive: true });
    writeFileSync(
      path.join(userData, 'local-state.json'),
      JSON.stringify({
        version: 1,
        connections: {
          fixture: {
            selectedProfile: 'bot-design',
            drafts: { 'bot-design': '来自上一测试版的草稿' },
            inspector: { open: false, tab: 'details', width: 360 },
          },
        },
        preferences: { theme: 'dark', language: 'zh-Hans' },
      }),
    );

    const app = await launchApp({ userDataDir: userData });
    const page = app.page;
    await expect(page.locator('#chat-nameplate')).toContainText('设计评审');
    const composer = page.getByRole('textbox', { name: /给 设计评审 发消息/ });
    await expect(composer).toHaveValue('来自上一测试版的草稿');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // The debounced save writes the upgraded schema back in place.
    await page.waitForTimeout(1_500);
    const upgraded = JSON.parse(readFileSync(path.join(userData, 'local-state.json'), 'utf8')) as {
      version: number;
      connections: Record<string, { drafts: Record<string, string>; organization: unknown }>;
    };
    expect(upgraded.version).toBe(2);
    expect(upgraded.connections['fixture']?.organization).toMatchObject({
      pinned: [],
      sections: [],
    });
    expect(upgraded.connections['fixture']?.drafts['bot-design']).toBe('来自上一测试版的草稿');
    await app.application.close();
  });

  test('a corrupt document falls back to the backup instead of showing defaults', async () => {
    const userData = path.resolve('.tmp/userdata-upgrade-recovery');
    rmSync(userData, { recursive: true, force: true });
    mkdirSync(userData, { recursive: true });
    writeFileSync(
      path.join(userData, 'local-state.json.bak'),
      JSON.stringify({
        version: 2,
        connections: {
          fixture: {
            selectedProfile: 'bot-design',
            drafts: { 'bot-design': '从备份恢复的草稿' },
            inspector: { open: false, tab: 'details', width: 360 },
            organization: { pinned: [], sections: [] },
          },
        },
        preferences: { theme: 'light', language: 'zh-Hans' },
      }),
    );
    writeFileSync(path.join(userData, 'local-state.json'), '{"version":2,"connections":');

    const app = await launchApp({ userDataDir: userData });
    const page = app.page;
    await expect(page.locator('#chat-nameplate')).toContainText('设计评审');
    const composer = page.getByRole('textbox', { name: /给 设计评审 发消息/ });
    await expect(composer).toHaveValue('从备份恢复的草稿');
    await app.application.close();
  });
});
