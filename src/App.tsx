import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { acknowledge, cancelTimer, countdown, getState, presentWindow, quit, startTimer, subscribe } from './backend';
import type { TimerState } from './backend';
import { contentSize } from './layout';
import { messages, preferredLanguage, shortcutLabel } from './i18n';
import { version } from '../package.json';

export default function App() {
  const [state, setState] = useState<TimerState | null>(null);
  const language = state?.language ?? preferredLanguage(navigator.languages);
  const text = messages(language);
  document.documentElement.lang = language;
  document.documentElement.dataset.theme = state?.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const [minutes, setMinutes] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const main = useRef<HTMLElement>(null);
  const latest = useRef<TimerState | null>(null);
  const submitLock = useRef(false);
  const measured = useRef('');
  const alarm = Boolean(!state?.error && state?.timers.some(timer => timer.ringing));
  const active = state?.timers.filter(timer => !timer.ringing) ?? [];

  const focusInput = useCallback(() => { input.current?.focus({ preventScroll: true }); }, []);
  const accept = useCallback((next: TimerState) => {
    const previous = latest.current;
    if (previous && (next.revision < previous.revision || (next.revision === previous.revision && next.sampledAtMs < previous.sampledAtMs))) return;
    latest.current = next;
    if (!previous || next.openSerial !== previous.openSerial) { setMinutes(''); setError(''); }
    setState(next);
  }, []);

  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    void (async () => {
      const unlisten = await subscribe(next => { if (!disposed) accept(next); });
      if (disposed) { unlisten(); return; }
      stop = unlisten;
      const next = await getState();
      if (!disposed) accept(next);
    })().catch(() => { if (!disposed) setError(text.load); });
    const onFocus = () => { if (latest.current?.visible) focusInput(); };
    window.addEventListener('focus', onFocus);
    return () => { disposed = true; stop?.(); window.removeEventListener('focus', onFocus); };
  }, [accept, focusInput, text.load]);

  const openSerial = state?.openSerial;
  const visible = state?.visible;
  useLayoutEffect(() => {
    if (!visible || !main.current) return;
    const measure = () => {
      if (!main.current) return;
      const size = contentSize(main.current);
      const key = String(openSerial) + ':' + alarm + ':' + size.width + ':' + size.height
        + ':' + innerWidth + ':' + innerHeight + ':' + devicePixelRatio;
      if (key === measured.current) return;
      measured.current = key;
      void presentWindow(openSerial!, size.width, size.height).catch(() => {});
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const element of main.current.querySelectorAll('.workspace, footer, .digit-measure')) observer.observe(element);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [visible, openSerial, active.length, alarm, error, state?.error]);

  useLayoutEffect(() => { if (visible && !alarm) focusInput(); }, [visible, openSerial, alarm, focusInput]);

  const confirmAlarm = useCallback(async () => {
    if (submitLock.current) return;
    submitLock.current = true;
    try { accept(await acknowledge()); }
    catch { setError(text.confirm); }
    finally { submitLock.current = false; }
  }, [accept, text.confirm]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === 'q') { event.preventDefault(); void quit(); }
      else if (event.key === 'Escape' || (alarm && event.key === 'Enter')) {
        event.preventDefault();
        if (!event.repeat) void confirmAlarm();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [alarm, confirmAlarm]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitLock.current || !/^[0-9]{1,3}$/.test(minutes) || Number(minutes) === 0) return;
    if ((latest.current?.timers.length ?? 0) >= 10) { setError(text.limit); return; }
    submitLock.current = true;
    setError('');
    try { accept(await startTimer(Number(minutes))); }
    catch { setError(text.start); }
    finally { submitLock.current = false; }
  }

  if (state && !visible) return <main className="rest" aria-label={text.hidden} />;
  if (!state) return error ? <p role="status">{error}</p> : null;
  return <main ref={main} className={alarm ? 'app is-ringing' : 'app'}>
    <span className="digit-measure" aria-hidden="true">999:59</span>
    <div className="workspace">
      {alarm ? <section className="alarm" role="alert" aria-label={text.expired} onPointerDown={() => void confirmAlarm()}><time>0:00</time></section> : <>
        {active.length > 0 && <section className="running" aria-label={text.running}>
          {active.map(timer => <div className="timer-card" key={timer.id}>
            <button className="cancel" aria-label={text.cancelLabel} onMouseDown={event => event.preventDefault()} onClick={() => {
              void cancelTimer(timer.id).then(next => { accept(next); focusInput(); }).catch(() => setError(text.cancel));
            }}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg></button>
            <time>{countdown(timer.remainingMs)}</time>
          </div>)}
        </section>}
        <form className="entry" onSubmit={submit}>
          <input id="minutes" ref={input} value={minutes} autoFocus inputMode="numeric" type="text"
            disabled={Boolean(state.error)} autoComplete="off" spellCheck={false} maxLength={3} pattern="[0-9]{1,3}" enterKeyHint="go"
            aria-label={text.minutes} data-empty={!minutes} style={{ width: 'calc(' + Math.max(1, minutes.length) + 'ch + 2px)' }}
            onChange={event => setMinutes(event.target.value.replace(/[^0-9]/g, '').slice(0, 3))} />
        </form>
      </>}
      {(state.error || error) && <p className="error" role="status">{state.error ? text.engine : error}</p>}
    </div>
    <footer><span>{text.version} {version}</span>{state.shortcut && <span>{text.open} <kbd>{shortcutLabel(state.shortcut, language)}</kbd></span>}</footer>
  </main>;
}
