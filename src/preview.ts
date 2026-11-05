// Development-only browser adapter. This module is never part of a release bundle.
import { mockIPC } from '@tauri-apps/api/mocks';
import { emit } from '@tauri-apps/api/event';
import { preferredLanguage } from './i18n';
import type { TimerState } from './backend';

type PreviewTimer = { id: number; deadline: number; ringing: boolean };
let timers: PreviewTimer[] = [];
let nextId = 0;
let visible = true;
let openSerial = 1;
let revision = 0;
let guardUntil = 0;
let guardPending = false;
let scheduled: ReturnType<typeof setTimeout> | undefined;
const now = () => performance.now();
document.body.classList.add('browser-preview');
const header = document.createElement('header');
header.className = 'preview-titlebar';
header.innerHTML = '<img src="/timer.svg" alt=""><span>Eyk Timer</span>';
document.body.append(header);

function snapshot(): TimerState {
  const sampledAtMs = now();
  return {
    timers: timers.map(timer => ({ id: timer.id, remainingMs: Math.max(0, timer.deadline - sampledAtMs), ringing: timer.ringing })),
    language: preferredLanguage(navigator.languages), sampledAtMs, revision, openSerial, visible, guardRemainingMs: Math.max(0, guardUntil - sampledAtMs), shortcut: null, error: null,
  };
}
function advance() {
  const ringing = timers.some(timer => timer.ringing);
  let changed = false;
  for (const timer of timers) {
    if (!timer.ringing && timer.deadline <= now()) { timer.ringing = true; changed = true; }
  }
  if (changed) {
    visible = true; revision++;
    if (!ringing) { openSerial++; guardPending = true; }
  }
}
function publish() {
  header.hidden = !visible;
  void emit('timer-state', snapshot());
  clearTimeout(scheduled);
  const remaining = timers.filter(timer => !timer.ringing).map(timer => Math.max(0, timer.deadline - now()));
  if (remaining.length) {
    const until = Math.min(...remaining);
    const delay = visible ? Math.min(until, until % 1000 || 1000) : until;
    scheduled = setTimeout(() => { advance(); publish(); }, Math.max(1, delay));
  }
}
mockIPC((command, payload) => {
  const args = payload as Record<string, number | boolean>;
  advance();
  switch (command) {
    case 'get_state': return snapshot();
    case 'present_window': {
      if (Number(args.openSerial) !== openSerial || !visible) return;
      if (guardPending) { guardUntil = now() + 750; guardPending = false; }
      const width = Math.min(Number(args.width), innerWidth);
      document.body.style.setProperty('--preview-width', String(width) + 'px');
      document.body.style.setProperty('--preview-height', String(Math.min(Number(args.height), innerHeight - 64)) + 'px');
      header.style.position = 'fixed';
      header.style.left = String((innerWidth - width) / 2) + 'px';
      header.style.top = String((innerHeight - Math.min(Number(args.height), innerHeight - 64)) / 2) + 'px';
      header.style.width = String(width) + 'px';
      return;
    }
    case 'start_timer': {
      const minutes = Number(args.minutes);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 999 || timers.length >= 10) throw Error('Invalid preview timer');
      timers.push({ id: ++nextId, deadline: now() + minutes * 60_000, ringing: false });
      visible = timers.some(timer => timer.ringing); break;
    }
    case 'cancel_timer': timers = timers.filter(timer => timer.id !== args.id); break;
    case 'acknowledge':
      if (guardPending || now() < guardUntil) return snapshot();
      timers = timers.filter(timer => !timer.ringing); visible = false; break;
    case 'hide_window':
      if (guardPending || now() < guardUntil) return snapshot();
      timers = timers.filter(timer => !timer.ringing); visible = false; break;
    case 'quit_app': timers = []; visible = false; break;
    default: throw Error('Unexpected preview command: ' + command);
  }
  if (!timers.some(timer => timer.ringing)) { guardPending = false; guardUntil = 0; }
  revision++; publish(); return snapshot();
}, { shouldMockEvents: true });
const reopen = () => { if (!visible) { advance(); visible = true; openSerial++; revision++; publish(); } };
window.addEventListener('focus', reopen);
document.addEventListener('pointerdown', event => { if ((event.target as Element).closest('.rest')) reopen(); });
