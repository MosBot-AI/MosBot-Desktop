import { rmSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp } from './harness';

const USER_DATA = '.tmp/userdata-persistence';

test.describe.configure({ mode: 'serial' });

/**
 * Local state persistence in the real packaged app: a draft and the selected Bot
 * survive a full quit and relaunch (no Dashboard connection needed).
 */
test('draft and selected Bot survive a restart', async () => {
  rmSync(path.resolve(USER_DATA), { recursive: true, force: true });

  const first = await launchApp({ userDataDir: USER_DATA });
  const firstPage = first.page;
  await firstPage.locator('button[title^="设计评审 · "]').click();
  await expect(firstPage.locator('#chat-nameplate')).toContainText('设计评审');
  const composer = firstPage.getByRole('textbox', { name: /给 设计评审 发消息/ });
  await composer.fill('重启后还要在的草稿');
  // Persist debounce is 600 ms; wait past it before quitting.
  await firstPage.waitForTimeout(1_000);
  await first.application.close();

  const second = await launchApp({ userDataDir: USER_DATA });
  const secondPage = second.page;
  await expect(secondPage.locator('#chat-nameplate')).toContainText('设计评审');
  const restored = secondPage.getByRole('textbox', { name: /给 设计评审 发消息/ });
  await expect(restored).toHaveValue('重启后还要在的草稿');
  await second.application.close();
});
