import { rmSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './harness';

test.describe.configure({ mode: 'serial' });

/**
 * M5 keyboard / IME / zoom / accessibility regression against the packaged app
 * and the deterministic design-slice fixtures (no Dashboard involved).
 */
test.describe('M5 keyboard, IME, zoom and accessibility', () => {
  let app: LaunchedApp;

  test.beforeAll(async () => {
    rmSync(path.resolve('.tmp/userdata-a11y'), { recursive: true, force: true });
    app = await launchApp({ userDataDir: '.tmp/userdata-a11y' });
  });

  test.afterAll(async () => {
    await app?.application.close();
  });

  const clickMenuItem = async (id: string): Promise<void> => {
    await app.application.evaluate(({ Menu }, itemId) => {
      const item = Menu.getApplicationMenu()?.getMenuItemById(itemId);
      if (item === null || item === undefined) {
        throw new Error(`Missing application menu item: ${itemId}`);
      }
      item.click();
    }, id);
  };

  const menuLabel = (id: string): Promise<string | undefined> =>
    app.application.evaluate(({ Menu }, itemId) => {
      return Menu.getApplicationMenu()?.getMenuItemById(itemId)?.label;
    }, id);

  const zoomFactor = (): Promise<number> =>
    app.application.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows()[0]?.webContents.getZoomFactor() ?? 1;
    });

  test('native menu creates a Bot and opens search with focus in the field', async () => {
    const page = app.page;

    await clickMenuItem('file-new-bot');
    const create = page.getByRole('dialog', { name: '新建 Bot' });
    await expect(create).toBeVisible();
    await expect(create.getByRole('textbox')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(create).toBeHidden();

    await clickMenuItem('file-search');
    const search = page.getByRole('dialog', { name: '搜索' });
    await expect(search).toBeVisible();
    await expect(search.getByRole('combobox')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(search).toBeHidden();
  });

  test('settings menu opens the footer menu with focus and the native menu follows the language', async () => {
    const page = app.page;

    await clickMenuItem('app-settings');
    const menu = page.getByRole('dialog', { name: '外观与语言' });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('button').first()).toBeFocused();

    await menu.getByRole('button', { name: 'English' }).click();
    await expect.poll(() => menuLabel('file-new-bot')).toBe('New Bot');
    await expect.poll(() => menuLabel('app-settings')).toBe('Settings…');

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(page.locator('#sidebar-connection')).toBeFocused();

    await page.getByRole('button', { name: 'Appearance and language' }).click();
    const englishMenu = page.getByRole('dialog', { name: 'Appearance and language' });
    await expect(englishMenu).toBeVisible();
    await englishMenu.getByRole('button', { name: '简体中文' }).click();
    await expect.poll(() => menuLabel('file-new-bot')).toBe('新建 Bot');
    await page.keyboard.press('Escape');
    await expect(englishMenu).toBeHidden();
  });

  test('view menu zooms the window and reset returns to the default scale', async () => {
    const page = app.page;
    expect(await zoomFactor()).toBeCloseTo(1, 1);

    await clickMenuItem('view-zoom-in');
    await expect.poll(zoomFactor).toBeGreaterThan(1);
    await clickMenuItem('view-zoom-in');
    await expect.poll(zoomFactor).toBeGreaterThan(1.15);

    // Zooming must not introduce horizontal overflow at the default window size.
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 1);

    await clickMenuItem('view-actual-size');
    await expect.poll(zoomFactor).toBeCloseTo(1, 1);

    await clickMenuItem('view-zoom-out');
    await expect.poll(zoomFactor).toBeLessThan(1);
    await clickMenuItem('view-actual-size');
    await expect.poll(zoomFactor).toBeCloseTo(1, 1);
  });

  test('Enter during Chinese IME composition is left to the IME; Shift+Enter inserts a newline', async () => {
    const page = app.page;
    const composer = page.getByRole('textbox', { name: /发消息|Message/ });
    const log = page.locator('[role="log"]');

    await composer.click();
    await composer.fill('第一行');
    await composer.press('Shift+Enter');
    await composer.type('第二行');
    await expect(composer).toHaveValue('第一行\n第二行');
    await composer.fill('');

    await composer.fill('中文草稿');
    const before = (await log.textContent()) ?? '';
    await page.evaluate(() => {
      const textarea = document.querySelector('textarea');
      if (textarea === null) {
        throw new Error('Composer textarea missing');
      }
      textarea.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      const enter = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(enter, 'isComposing', { value: true });
      textarea.dispatchEvent(enter);
    });
    await page.waitForTimeout(100);
    await expect(composer).toHaveValue('中文草稿');
    expect((await log.textContent()) ?? '').toBe(before);

    // Ending the composition hands the next Enter back to the composer.
    await page.evaluate(() => {
      const textarea = document.querySelector('textarea');
      textarea?.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    });
    await composer.press('Enter');
    await expect(composer).toHaveValue('');
    await expect(log).toContainText('中文草稿');
  });

  test('reduced motion preference removes the timed transitions', async () => {
    const page = app.page;
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true');
    const reduce = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--duration-press').trim(),
    );
    expect(reduce === '0ms' || reduce === '0s').toBe(true);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'false');
    const normal = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--duration-press').trim(),
    );
    expect(normal === '0ms' || normal === '0s').toBe(false);
  });

  test('every visible control has an accessible name and Tab reaches the main surfaces', async () => {
    const page = app.page;

    const unnamed = await page.evaluate(() => {
      const controls = document.querySelectorAll<HTMLElement>(
        'button, [role="button"], a[href], input:not([type="hidden"]), textarea, select',
      );
      const result: string[] = [];
      for (const element of controls) {
        if (element.closest('[aria-hidden="true"]') !== null) {
          continue;
        }
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') {
          continue;
        }
        if (
          element.getBoundingClientRect().width === 0 &&
          element.getBoundingClientRect().height === 0
        ) {
          continue;
        }
        const labelledBy = element.getAttribute('aria-labelledby');
        const labelledByText =
          labelledBy === null
            ? ''
            : labelledBy
                .split(/\s+/)
                .map((id) => document.getElementById(id)?.textContent ?? '')
                .join(' ');
        const name = [
          element.getAttribute('aria-label'),
          labelledByText,
          element.textContent,
          element.getAttribute('placeholder'),
          element.getAttribute('title'),
        ]
          .map((candidate) => candidate?.trim() ?? '')
          .find((candidate) => candidate !== '');
        if (name === undefined) {
          result.push(element.outerHTML.slice(0, 160));
        }
      }
      return result;
    });
    expect(unnamed).toEqual([]);

    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    const order: string[] = [];
    for (let step = 0; step < 40; step += 1) {
      await page.keyboard.press('Tab');
      order.push(
        await page.evaluate(() => {
          const element = document.activeElement as HTMLElement | null;
          return (
            element?.getAttribute('aria-label') ??
            element?.textContent?.trim().slice(0, 24) ??
            element?.tagName ??
            ''
          );
        }),
      );
    }
    expect(order.every((name) => name !== '')).toBe(true);
    expect(order.some((name) => name.includes('搜索') || name.includes('Search'))).toBe(true);
    expect(order.some((name) => /发消息|Message/.test(name))).toBe(true);
    expect(order.some((name) => /外观与语言|Appearance and language/.test(name))).toBe(true);
  });
});
