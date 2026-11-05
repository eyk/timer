import { chromium, expect } from '@playwright/test';
import { spawn, execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
if (existsSync(path.join(root, '.env.local'))) loadEnvFile(path.join(root, '.env.local'));
const screenshots = process.argv.includes('--screenshots');
const language = process.env.TIMER_LANGUAGE === 'en' ? 'en' : 'de';
const output = path.join(root, screenshots ? (language === 'en' ? 'store/screenshots/en' : 'store/screenshots') : 'test-results/desktop');
const diagnostics = path.join(root, 'test-results/desktop');
await mkdir(output, { recursive: true });
await mkdir(diagnostics, { recursive: true });
await mkdir(path.join(root, 'work'), { recursive: true });
const executable = path.join(root, 'src-tauri/target/e2e/debug/timer.exe');
// Use only a binary built with tauri.e2e.conf.json: its separate identity protects personal timers.
const profile = path.join(root, 'work', `desktop-${Date.now()}`);
const port = 19222;
try {
  await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(500) });
  throw new Error(`Debugging port ${port} is already in use. Refusing to attach to another app.`);
} catch (error) {
  if (error.message.includes('already in use')) throw error;
}
const app = spawn(executable, [], {
  cwd: root, shell: false, windowsHide: true, stdio: 'ignore',
  env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`, WEBVIEW2_USER_DATA_FOLDER: profile },
});
let browser;
let page;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const command = (name, args = {}) => page.evaluate(({ name, args }) => window.__TAURI_INTERNALS__.invoke(name, args), { name, args });
const open = async (method = 'instance') => {
  if (method === 'hotkey') {
    const state = await command('get_state');
    assert.ok(state.shortcut, 'No global shortcut could be registered.');
    await new Promise((resolve, reject) => execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/capture-window.ps1'), '-ProcessId', String(app.pid), '-Action', 'Hotkey', '-Shortcut', state.shortcut], { shell: false, windowsHide: true }, (error, stdout, stderr) => error ? reject(new Error(stderr || stdout)) : resolve()));
  } else {
    const second = spawn(executable, [], { cwd: root, shell: false, windowsHide: true, stdio: 'ignore' });
    await new Promise((resolve, reject) => { second.on('error', reject); second.on('exit', resolve); });
  }
  await expect.poll(() => command('plugin:window|is_visible', { label: 'main' })).toBe(true);
  await expect(page.locator('#minutes')).toBeFocused();
};
const capture = async (name, dark = false) => {
  if (!screenshots) return;
  await new Promise((resolve, reject) => execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/capture-window.ps1'), '-ProcessId', String(app.pid), '-Output', path.join(output, dark ? name.replace('.png','-dark.png') : name), ...(name === '02-countdowns.png' ? ['-WindowOutput', path.join(root, 'website/assets', 'timer-' + language + (dark ? '-dark' : '') + '.png')] : [])], { shell: false, windowsHide: true }, (error, stdout, stderr) => error ? reject(new Error(stderr || stdout)) : resolve()));
};
const closeWindow = () => new Promise((resolve, reject) => execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/capture-window.ps1'), '-ProcessId', String(app.pid), '-Action', 'Close'], { shell: false, windowsHide: true }, (error, stdout, stderr) => error ? reject(new Error(stderr || stdout)) : resolve()));
try {
  await expect.poll(async () => {
    if (app.exitCode !== null) throw new Error(`Test app exited (${app.exitCode}). Check the isolated test build.`);
    try { return (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(500) })).ok; }
    catch { return false; }
  }, { timeout: 20000 }).toBe(true);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  page = browser.contexts()[0].pages()[0];
  await page.waitForFunction(() => Boolean(window.__TAURI_INTERNALS__?.invoke), null, { timeout: 20000 });
  const identity = await command('plugin:app|identifier');
  assert.equal(identity, 'io.github.eyk.timer.e2e', 'Refusing to operate on a non-test app.');
  const productionCapabilities = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(root, 'src-tauri/capabilities/default.json'), 'utf8'));
  assert.deepEqual(productionCapabilities.permissions, ['core:event:allow-listen', 'core:event:allow-unlisten']);
  await command('plugin:window|is_visible', { label: 'main' });
  await command('plugin:window|current_monitor', { label: 'main' });
  await assert.rejects(() => command('plugin:path|resolve_directory', { directory: 1, path: '' }), /not allowed|denied|permission/i);
  console.log('PASS: E2E-only inspection APIs work; unrelated core APIs remain denied and production grants only event subscription.');
  for (const [theme, background] of [['light', 'rgb(247, 247, 247)'], ['dark', 'rgb(27, 27, 27)']]) {
    await command('plugin:window|set_theme', { label: 'main', value: theme });
    assert.equal((await command('get_state')).theme, theme);
    await expect(page.locator('.app')).toHaveCSS('background-color', background);
  }
  await command('plugin:window|set_theme', { label: 'main', value: null });
  await command('get_state');
  console.log('PASS: native theme changes reach the actual WebView content; system theme restored.');

  if (screenshots) { await page.emulateMedia({ reducedMotion: 'reduce' }); await command('plugin:window|set_theme', { label: 'main', value: 'light' }); await command('get_state'); }
  await expect(page.locator('#minutes')).toBeFocused();
  await expect(page.locator('#minutes')).toHaveValue('');
  const { version } = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(root, 'package.json'), 'utf8'));
  await expect(page.locator('footer')).toContainText(version);
  if (process.env.TIMER_MONITOR) {
    const monitor = await command('plugin:window|current_monitor', { label: 'main' });
    assert.equal(monitor.name.toLowerCase(), process.env.TIMER_MONITOR.toLowerCase());
  }
  await page.keyboard.type('19');
  await capture('01-minutes.png');
  await page.keyboard.press('Enter');
  await expect.poll(() => command('plugin:window|is_visible', { label: 'main' })).toBe(false);
  await open('hotkey');
  await expect(page.locator('.timer-card')).toHaveCount(1);
  await expect(page.locator('#minutes')).toHaveValue('');
  await capture('02-countdown.png');
  await page.keyboard.type('113');
  await page.keyboard.press('Enter');
  await open();
  await expect(page.locator('.timer-card')).toHaveCount(2);
  await page.evaluate(() => { Date.now = () => 0; });
  await expect(page.locator('.timer-card time').last()).toHaveText(/11[23]:[0-5][0-9]/);
  if (screenshots) {
    // Freeze only incoming view snapshots while capturing the same real countdown
    // in both native themes. The engine and all personal timers keep running.
    const captured = await command('get_state');
    await page.evaluate(state => {
      window.capturedTimerState = state;
      const callbacks = window.__TAURI_INTERNALS__.callbacks;
      const saved = new Map(callbacks);
      for (const [id, callback] of saved) callbacks.set(id, data => {
        if (data?.event !== 'timer-state') return callback(data);
        if (data.payload.theme !== window.capturedTimerState.theme) {
          window.capturedTimerState = { ...window.capturedTimerState, theme: data.payload.theme };
          return callback({ ...data, payload: window.capturedTimerState });
        }
      });
      window.restoreTimerSnapshots = () => { for (const [id, callback] of saved) if (callbacks.has(id)) callbacks.set(id, callback); };
    }, captured);
    try {
      await capture('02-countdowns.png');
      await command('plugin:window|set_theme', { label: 'main', value: 'dark' });
      const darkState = await command('get_state');
      assert.equal(darkState.theme, 'dark');
      await expect(page.locator('.app')).toHaveCSS('background-color', 'rgb(27, 27, 27)');
      await capture('02-countdowns.png', true);
      await command('plugin:window|set_theme', { label: 'main', value: null });
    } finally { await page.evaluate(() => window.restoreTimerSnapshots()); }
  }
  const state = await command('get_state');
  await command('cancel_timer', { id: state.timers[1].id });
  await expect(page.locator('.timer-card')).toHaveCount(1);
  await closeWindow();
  await expect.poll(() => command('plugin:window|is_visible', { label: 'main' })).toBe(false);
  assert.equal((await command('get_state')).timers.length, 1);
  await open();
  await page.keyboard.type('1');
  await page.keyboard.press('Enter');
  await sleep(8000);
  await command('start_timer', { minutes: 1 });
  // Hold the real presentation command to reproduce a busy UI without a product test hook.
  await page.evaluate(() => {
    const nativeFetch = window.fetch;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const hold = { blocked: false, released: false, release: () => { hold.released = true; release(); } };
    window.timerPresentation = hold;
    const delayedFetch = async (...args) => {
      const url = new URL(args[0] instanceof Request ? args[0].url : String(args[0]));
      if (url.hostname === 'ipc.localhost' && url.pathname === '/present_window' && !hold.released) {
        hold.blocked = true; await gate;
      }
      return nativeFetch.apply(window, args);
    };
    // Tauri's invoke property is immutable; its documented custom-protocol transport uses fetch.
    window.fetch = delayedFetch;
    if (window.fetch !== delayedFetch) throw new Error('Cannot install the native presentation gate.');
  });
  console.log('PASS: native focus, Enter-to-hide, single-instance reopening, cancellation and close-to-hide. Waiting for real background expiry.');
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 65000 });
  await expect(page.getByRole('alert')).toHaveText('0:00');
  await expect.poll(() => page.evaluate(() => window.timerPresentation.blocked)).toBe(true);
  assert.equal(await command('plugin:window|is_visible', { label: 'main' }), false);
  // Before any presentation, neither a close nor a click may consume the alarm.
  const unseenClose = await command('hide_window');
  assert.equal(unseenClose.visible, true);
  assert.ok(unseenClose.timers.some(timer => timer.ringing));
  const early = await command('acknowledge');
  assert.equal(early.visible, true);
  assert.ok(early.timers.some(timer => timer.ringing));
  assert.equal(await command('plugin:window|is_visible', { label: 'main' }), false);
  // Even without the renderer handshake the native fallback must show the window.
  await expect.poll(() => command('plugin:window|is_visible', { label: 'main' })).toBe(true);
  await page.evaluate(() => window.timerPresentation.release());
  await expect.poll(() => command('plugin:window|is_visible', { label: 'main' })).toBe(true);
  console.log('PASS: protected acknowledgement before presentation and native alarm fallback without renderer handshake.');
  const beforeStart = await command('get_state');
  await command('start_timer', { minutes: 90 });
  assert.equal(await command('plugin:window|is_visible', { label: 'main' }), true);
  const withNewTimer = await command('get_state');
  assert.equal(withNewTimer.timers.length, beforeStart.timers.length + 1);
  await command('cancel_timer', { id: withNewTimer.timers.at(-1).id });
  await capture('03-alarm.png');
  const guarded = await command('get_state');
  await sleep(guarded.guardRemainingMs + 30);
  await page.keyboard.press('Enter');
  await expect.poll(() => command('plugin:window|is_visible', { label: 'main' })).toBe(false);
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 10000 });
  const closingAlarm = await command('get_state');
  await sleep(closingAlarm.guardRemainingMs + 30);
  await closeWindow();
  await expect.poll(() => command('plugin:window|is_visible', { label: 'main' })).toBe(false);
  const remaining = await command('get_state');
  assert.equal(remaining.timers.length, 1);
  assert.equal(remaining.timers[0].id, state.timers[0].id);
  await open();
  await page.locator('.cancel').click();
  await expect(page.locator('.timer-card')).toHaveCount(0);
  console.log('PASS: guarded Enter, new timer during alarm, and native close acknowledgement preserve independent timers across two real expiries.');
} catch (error) {
  if (page) await page.screenshot({ path: path.join(diagnostics, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  if (page) await command('quit_app').catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (app.exitCode === null) app.kill();
}
