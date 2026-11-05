import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface TimerItem { id: number; remainingMs: number; ringing: boolean }
export interface TimerState {
  language: import('./i18n').Language;
  timers: TimerItem[];
  sampledAtMs: number; // Native elapsed-clock reference, not a Unix/calendar timestamp.
  revision: number;
  openSerial: number;
  visible: boolean;
  guardRemainingMs: number;
  shortcut: string | null;
  error: string | null;
}

export const getState = () => invoke<TimerState>('get_state');
export const startTimer = (minutes: number) => invoke<TimerState>('start_timer', { minutes });
export const acknowledge = () => invoke<TimerState>('acknowledge');
export const cancelTimer = (id: number) => invoke<TimerState>('cancel_timer', { id });
export const hideWindow = () => invoke<TimerState>('hide_window');
export const quit = () => invoke('quit_app');
export const presentWindow = (openSerial: number, width: number, height: number) => invoke('present_window', { openSerial, width, height });
export const subscribe = (callback: (state: TimerState) => void) => listen<TimerState>('timer-state', event => callback(event.payload));

export function countdown(remainingMs: number): string {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  return String(Math.floor(seconds / 60)) + ':' + String(seconds % 60).padStart(2, '0');
}
