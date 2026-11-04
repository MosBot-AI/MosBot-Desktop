import { rmSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, packagedAppPath, resizeWindow, type LaunchedApp } from './harness';

test.describe.configure({ mode: 'serial' });

/**
 * M0a acceptance: the real Electron window, keyboard-driven, against the
 * deterministic design-slice fixtures. Run `pnpm package` first (the npm script
 * `pnpm test:e2e` does it for you).
 */
test.describe('M0a design slice', () => {
  let app: LaunchedApp;

  test.beforeAll(async () => {
    expect(packagedAppPath()).toBeTruthy();
    // Start from a clean profile: local state (drafts, selection) persists now.
    rmSync(path.resolve('.tmp/userdata-e2e'), { recursive: true, force: true });
    app = await launchApp();
  });

  test.afterAll(async () => {
    await app?.application.close();
  });

  test('default window shows roster, nameplate and six pinned faces', async () => {
    const page = app.page;
    const size = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    expect(size.width).toBeGreaterThanOrEqual(960);
    expect(size.height).toBeGreaterThanOrEqual(700);

    await expect(page.locator('aside').first()).toBeVisible();
    await expect(page.locator('#chat-nameplate')).toContainText('项目助理');
    await expect(page.getByRole('region', { name: '常用' })).toBeVisible();
    // Six slots plus the "all pinned" entry.
    await expect(page.getByRole('region', { name: '常用' }).getByRole('button')).toHaveCount(7);
    await expect(page.getByRole('button', { name: '搜索' })).toBeVisible();
    await expect(page.getByRole('button', { name: '新建 Bot' })).toBeVisible();
  });

  test('collapses a section and keeps the count readable', async () => {
    const page = app.page;
    const header = page.getByRole('button', { name: /日常/ });
    await expect(header).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByText('语音转写员')).toBeHidden();
    await header.click();
    await expect(header).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('语音转写员')).toBeVisible();
    await header.click();
    await expect(header).toHaveAttribute('aria-expanded', 'false');
  });

  test('selects a Bot from the pinned grid and answers its approval', async () => {
    const page = app.page;
    await page.locator('button[title^="设计评审 · "]').click();
    await expect(page.locator('#chat-nameplate')).toContainText('设计评审');
    const transcript = page.getByRole('log', { name: '设计评审' });
    await expect(transcript.getByText('需要你确认')).toBeVisible();
    await transcript.getByRole('button', { name: '拒绝' }).click();
    await expect(transcript.getByText('已拒绝')).toBeVisible();
    await expect(transcript.getByText('需要你确认')).toBeHidden();
  });

  test('sends with Enter, shows Stop, and keeps a stopped receipt', async () => {
    const page = app.page;
    await page.locator('button[title^="项目助理与资料整理专员（华东区第二组） · "]').click();
    const composer = page.getByRole('textbox', { name: /给 项目助理/ });
    await composer.click();
    await composer.fill('帮我看一下今天的待办。');
    await composer.press('Enter');
    await expect(page.getByText('帮我看一下今天的待办。')).toBeVisible();
    await expect(page.getByRole('button', { name: '停止' })).toBeVisible();
    await page.getByRole('button', { name: '停止' }).click();
    await expect(page.getByText('已停止')).toBeVisible();
    await expect(page.getByRole('button', { name: '停止' })).toHaveCount(0);
  });

  test('opens search with the keyboard, filters and jumps to the Bot', async () => {
    const page = app.page;
    await page.keyboard.press('Meta+k');
    const input = page.locator('#search-input');
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
    await input.fill('设计');
    await expect(page.getByRole('option', { name: /设计评审/ })).toBeVisible();
    await input.press('Enter');
    await expect(page.locator('#chat-nameplate')).toContainText('设计评审');
    await expect(input).toHaveCount(0);
  });

  test('creates a Bot from the live-preview dialog and selects it', async () => {
    const page = app.page;
    await page.getByRole('button', { name: '新建 Bot' }).click();
    const dialog = page.locator('#create-bot-dialog');
    await expect(dialog).toBeVisible();
    const nameInput = page.locator('#create-name');
    await nameInput.fill('联调测试 Bot');
    const submit = dialog.getByRole('button', { name: '创建' });
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('#chat-nameplate')).toContainText('联调测试 Bot');
    await expect(page.locator('aside').getByRole('button', { name: /联调测试 Bot/ })).toBeVisible();
  });

  test('opens details, wakes the computer and returns focus on close', async () => {
    const page = app.page;
    await page.locator('button[title^="项目助理与资料整理专员（华东区第二组） · "]').click();
    await page.locator('#chat-nameplate').click();
    const panel = page.locator('#inspector-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByRole('tab', { name: '电脑' })).toBeVisible();
    await page.getByRole('tab', { name: '电脑' }).click();
    await page.getByRole('button', { name: '唤醒电脑' }).click();
    await expect(page.getByText('正在唤醒…')).toBeVisible();
    await expect(page.getByText('预览中')).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: '关闭详情' }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.locator('#chat-nameplate')).toBeFocused();
  });

  test('switches theme and language from the footer menu', async () => {
    const page = app.page;
    const menu = page.getByRole('button', { name: '外观与语言' });
    await menu.click();
    await page.getByRole('button', { name: '深色' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await menu.click();
    await menu.click();
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.locator('aside').first()).toHaveAttribute('aria-label', 'Bot list');
    await expect(page.getByRole('button', { name: 'Search' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Appearance and language' }).click();
    await page.getByRole('button', { name: '简体中文' }).click();
    await page.getByRole('button', { name: '浅色' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.keyboard.press('Escape');
  });

  test('opens the connection dialog, validates the address and restores focus', async () => {
    const page = app.page;
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '外观与语言' }).click();
    await page.getByRole('button', { name: '连接 Dashboard…' }).click();
    const dialog = page.getByRole('dialog', { name: '连接 Dashboard' });
    await expect(dialog).toBeVisible();
    const address = page.locator('#connection-address');
    await expect(address).toBeFocused();
    await address.fill('not a url');
    await dialog.getByRole('button', { name: '连接', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('地址不是有效的 URL');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('#sidebar-connection')).toBeFocused();
  });

  test('uses the overlay details panel and the empty chat in a narrow window', async () => {
    const page = app.page;
    await resizeWindow(app.application, 720, 500);
    await expect.poll(async () => page.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(740);
    await page.locator('#chat-nameplate').click();
    await expect(page.locator('#inspector-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#inspector-panel')).toHaveCount(0);

    await page.keyboard.press('Meta+k');
    const input = page.locator('#search-input');
    await input.fill('语音');
    await input.press('Enter');
    await expect(page.getByText('还没有消息')).toBeVisible();
    await expect(page.getByText('给 语音转写员 发第一条消息，开始一段对话。')).toBeVisible();

    await resizeWindow(app.application, 1000, 760);
  });
});
