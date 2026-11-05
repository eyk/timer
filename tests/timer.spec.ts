import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.locator('#minutes')).toBeFocused();
}

async function reopen(page: Page) {
  await expect(page.locator('.rest')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('textbox', { name: 'Minuten' })).toBeFocused();
}

async function inputCenter(page: Page) {
  const input = await page.getByRole('textbox', { name: 'Minuten' }).boundingBox();
  const form = await page.locator('.entry').boundingBox();
  expect(Math.abs(input!.x + input!.width / 2 - form!.x - form!.width / 2)).toBeLessThan(1);
  return input!;
}

test('native titlebar is not duplicated; empty caret sits half a digit right of center and numbers stay centered', async ({ page }) => {
  await openApp(page);
  const input = page.getByRole('textbox', { name: 'Minuten' });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('');
  await expect(page.getByRole('button')).toHaveCount(0);
  await expect(page.locator('footer')).toHaveText(`Version ${version}`);
  await expect(page.locator('header')).toHaveText('Timer');
  const empty = await inputCenter(page);
  expect(empty.width).toBeGreaterThan(40);
  expect(empty.width).toBeLessThan(65);
  await expect(input).toHaveCSS('text-align', 'right');
  for (const digit of ['1', '3', '5']) {
    await page.keyboard.type(digit);
    await inputCenter(page);
    await expect(input).toHaveCSS('text-align', 'center');
  }
  await page.keyboard.type('6');
  await expect(input).toHaveValue('135');
});

test('reopening grows the window and shows equal-sized centered countdown cards', async ({ page }) => {
  await openApp(page);
  const initial = await page.locator('main').boundingBox();
  await page.keyboard.type('113');
  await page.keyboard.press('Enter');
  await reopen(page);
  const first = await page.locator('main').boundingBox();
  expect(first!.height).toBeGreaterThan(initial!.height);
  const input = page.getByRole('textbox', { name: 'Minuten' });
  await expect(input).toHaveValue('');
  await expect(page.locator('.timer-card time')).toHaveText(/11[23]:[0-5][0-9]/);
  const inputFont = await input.evaluate(el => getComputedStyle(el).fontSize);
  await expect(page.locator('.timer-card time')).toHaveCSS('font-size', inputFont);
  const card = await page.locator('.timer-card').boundingBox();
  const time = await page.locator('.timer-card time').boundingBox();
  expect(Math.abs(card!.x + card!.width / 2 - time!.x - time!.width / 2)).toBeLessThan(1);
  await page.keyboard.type('13');
  await page.keyboard.press('Enter');
  await reopen(page);
  await expect(page.locator('.timer-card')).toHaveCount(2);
  expect((await page.locator('main').boundingBox())!.height).toBeGreaterThan(first!.height);
  await expect(input).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Timer abbrechen' })).toHaveCount(2);
  await page.getByRole('button', { name: 'Timer abbrechen' }).first().click();
  await expect(page.locator('.timer-card')).toHaveCount(1);
  await expect(input).toBeFocused();
});

test('no intermediate timer card is rendered on Enter; alarm acknowledgement preserves other timers', async ({ page }) => {
  await page.clock.install();
  await openApp(page);
  await page.evaluate(() => {
    const counts: number[] = [];
    (window as unknown as { cardCounts: number[] }).cardCounts = counts;
    new MutationObserver(() => counts.push(document.querySelectorAll('.timer-card').length)).observe(document.getElementById('root')!, { childList: true, subtree: true });
  });
  await page.keyboard.type('1');
  await page.keyboard.press('Enter');
  await expect(page.locator('.rest')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { cardCounts: number[] }).cardCounts)).not.toContain(1);
  await reopen(page);
  await page.keyboard.type('90');
  await page.keyboard.press('Enter');
  await page.clock.fastForward(60_500);
  await expect(page.getByRole('alert')).toHaveText('0:00');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toBeVisible();
  await page.clock.fastForward(800);
  await page.keyboard.press('Enter');
  await reopen(page);
  await expect(page.locator('.timer-card')).toHaveCount(1);
  await expect(page.locator('.timer-card time')).toHaveText(/8[89]:[0-5][0-9]/);
});

test('calendar corrections do not change the remaining-time display', async ({ page }) => {
  // Freeze elapsed time before opening the app so host load cannot consume an extra second.
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
  await openApp(page);
  await page.keyboard.type('5');
  await page.keyboard.press('Enter');
  await reopen(page);
  await expect(page.locator('.timer-card time')).toHaveText('5:00');
  await page.clock.setSystemTime(new Date('2035-01-01T12:00:00Z'));
  await page.clock.fastForward(1000);
  await expect(page.locator('.timer-card time')).toHaveText('4:59');
  await page.clock.setSystemTime(new Date('2020-01-01T12:00:00Z'));
  await page.clock.fastForward(1000);
  await expect(page.locator('.timer-card time')).toHaveText('4:58');
});

test('idle and hidden views do not keep rendering; reopening gets fresh remaining time', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('#minutes')).toBeFocused();
  const renders = () => page.evaluate(() => (window as unknown as { timerRenderCount: number }).timerRenderCount);
  await page.waitForTimeout(100);
  const idle = await renders();
  await page.waitForTimeout(1300);
  expect(await renders()).toBe(idle);
  await page.keyboard.type('5');
  await page.keyboard.press('Enter');
  await expect(page.locator('.rest')).toBeVisible();
  const hidden = await renders();
  await page.waitForTimeout(1300);
  expect(await renders()).toBe(hidden);
  await reopen(page);
  await expect(page.locator('.timer-card time')).toHaveText(/4:5[78]/);
});

test('measured layout adapts to larger fonts without clipping the input or countdown', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 1100 });
  await openApp(page);
  await page.keyboard.type('999');
  await page.keyboard.press('Enter');
  await reopen(page);
  for (const size of [16, 20, 24, 32]) {
    await page.evaluate(value => { document.documentElement.style.fontSize = value + 'px'; }, size);
    // ResizeObserver/native sizing is asynchronous. Read one consistent frame and
    // wait for the required geometry, rather than accepting the previous height.
    await expect.poll(() => page.evaluate(minimumHeight => {
      const card = document.querySelector('.timer-card')!.getBoundingClientRect();
      const digits = document.querySelector('.timer-card time')!.getBoundingClientRect();
      const field = document.querySelector('#minutes')!.getBoundingClientRect();
      const app = document.querySelector('.app')!.getBoundingClientRect();
      return app.height > minimumHeight && digits.left >= card.left
        && digits.right <= card.right && field.bottom < app.bottom;
    }, size * 20)).toBe(true);
  }
});

test('ten timers fit a scrollable stack without pushing the input out of the window', async ({ page }) => {
  await openApp(page);
  for (let index = 0; index < 10; index++) {
    await page.keyboard.type('999');
    await page.keyboard.press('Enter');
    await reopen(page);
  }
  await expect(page.locator('.timer-card')).toHaveCount(10);
  const input = page.getByRole('textbox', { name: 'Minuten' });
  await expect(input).toBeFocused();
  const main = await page.locator('main').boundingBox();
  const bounds = await input.boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThan(main!.y + main!.height);
  const dimensions = await page.locator('.running').evaluate(el => ({ visible: el.clientHeight, content: el.scrollHeight }));
  expect(dimensions.content).toBeGreaterThan(dimensions.visible);
  await page.keyboard.type('5');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText('Maximal zehn Timer.');
  await expect(page.locator('.timer-card')).toHaveCount(10);
});


test('held Enter and Escape never acknowledge an alarm; one fresh Escape still does', async ({ page }) => {
  await page.clock.install();
  await openApp(page);
  await page.keyboard.type('1');
  await page.keyboard.press('Enter');
  await page.clock.fastForward(60_000);
  await expect(page.getByRole('alert')).toHaveText('0:00');
  await page.clock.fastForward(800);
  await page.evaluate(() => {
    const target = window as unknown as {
      __TAURI_INTERNALS__: { invoke: (...args: unknown[]) => unknown };
      acknowledgementCount: number;
    };
    const invoke = target.__TAURI_INTERNALS__.invoke;
    target.acknowledgementCount = 0;
    target.__TAURI_INTERNALS__.invoke = (...args) => {
      if (args[0] === 'acknowledge') target.acknowledgementCount++;
      return invoke(...args);
    };
  });
  for (const key of ['Enter', 'Escape']) {
    await page.evaluate(value => window.dispatchEvent(new KeyboardEvent('keydown', { key: value, repeat: true, bubbles: true, cancelable: true })), key);
    await expect(page.getByRole('alert')).toBeVisible();
  }
  expect(await page.evaluate(() => (window as unknown as { acknowledgementCount: number }).acknowledgementCount)).toBe(0);
  await page.keyboard.press('Escape');
  await reopen(page);
  expect(await page.evaluate(() => (window as unknown as { acknowledgementCount: number }).acknowledgementCount)).toBe(1);
  await expect(page.locator('.timer-card')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.rest')).toBeVisible();
});


test('alarm clicks are guarded immediately after presentation and work after the guard', async ({ page }) => {
  await page.clock.install();
  await openApp(page);
  await page.keyboard.type('1');
  await page.keyboard.press('Enter');
  await page.clock.fastForward(60_000);
  const alarm = page.getByRole('alert');
  await expect(alarm).toBeVisible();
  await alarm.dispatchEvent('pointerdown');
  await expect(alarm).toBeVisible();
  await page.clock.fastForward(800);
  await alarm.dispatchEvent('pointerdown');
  await expect(page.locator('.rest')).toBeVisible();
});


test.describe('English and fallback', () => {
  test.use({ locale: 'en-US' });
  test('English labels preserve immediate keyboard interaction', async ({ page }) => {
    await openApp(page);
    await expect(page.getByRole('textbox', {name:'Minutes'})).toBeFocused();
    await page.keyboard.type('19'); await page.keyboard.press('Enter');
    await expect(page.locator('.rest')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('textbox', {name:'Minutes'})).toBeFocused();
    await expect(page.getByRole('button', {name:'Cancel timer'})).toHaveCount(1);
    await expect(page.locator('html')).toHaveAttribute('lang','en');
  });
});


test('system color preference updates the timer without a theme control', async ({ page }) => {
  await page.emulateMedia({colorScheme:'light'}); await openApp(page);
  await expect(page.locator('.app')).toHaveCSS('background-color','rgb(247, 247, 247)');
  await page.keyboard.type('19');await page.keyboard.press('Enter');await reopen(page);
  await page.emulateMedia({colorScheme:'dark'});
  await expect(page.locator('.app')).toHaveCSS('background-color','rgb(27, 27, 27)');
  await expect(page.locator('.timer-card')).toHaveCSS('background-color','rgb(43, 43, 43)');
  await expect(page.locator('#minutes')).toBeFocused();
  await expect(page.getByRole('button')).toHaveCount(1);
  await page.emulateMedia({colorScheme:'light'});
  await expect(page.locator('.app')).toHaveCSS('background-color','rgb(247, 247, 247)');
});
