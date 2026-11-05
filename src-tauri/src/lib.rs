mod clock;
mod controller;
mod language;
mod platform;
mod timer;

use controller::{Action, Controller};
use serde::Serialize;
use std::sync::{Condvar, Mutex, MutexGuard};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

const ENGINE_FAILURE: &str = "Timer-Steuerung ausgefallen. Bitte die App neu starten.";
const SHORTCUTS: [(&str, &str); 2] = [
    ("Ctrl+Shift+F11", "Ctrl+Shift+F11"),
    ("Ctrl+Shift+F10", "Ctrl+Shift+F10"),
];

#[derive(Default)]
struct Runtime {
    controller: Controller,
    shortcut: Option<String>,
    sound_on: bool,
    audio_retry: bool,
    native_retry: bool,
    presentation_retry: Option<(u64, f64, f64)>,
    hidden_applied: bool,
    shown_serial: u64,
    dark: bool,
    stopping: bool,
    last_tooltip: String,
    tray_visible: bool,
}

#[derive(Default)]
struct AppState {
    runtime: Mutex<Runtime>,
    changed: Condvar,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TimerView {
    id: u64,
    remaining_ms: u64,
    ringing: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    language: &'static str,
    theme: &'static str,
    timers: Vec<TimerView>,
    sampled_at_ms: u64,
    revision: u64,
    open_serial: u64,
    visible: bool,
    guard_remaining_ms: u64,
    shortcut: Option<String>,
    error: Option<String>,
}

impl AppState {
    fn lock(&self) -> MutexGuard<'_, Runtime> {
        self.runtime.lock().unwrap_or_else(|poisoned| {
            let mut state = poisoned.into_inner();
            if state.controller.failure.is_none() {
                state.controller.fail(ENGINE_FAILURE);
            }
            sync_sound(&mut state);
            state
        })
    }
}

// This non-blocking audio effect is serialized with EVERY timer mutation under the same lock.
// Window/WebView operations are deliberately never executed while holding that lock.
fn sync_sound(state: &mut Runtime) {
    sync_sound_with(state, platform::sound);
}

fn sync_sound_with(state: &mut Runtime, mut play: impl FnMut(bool) -> Result<(), String>) {
    let desired = !state.stopping && state.controller.ringing();
    if desired == state.sound_on {
        state.audio_retry = false;
        return;
    }
    state.audio_retry = match play(desired) {
        Ok(()) => {
            state.sound_on = desired;
            false
        }
        Err(error) => {
            if !state.audio_retry {
                eprintln!("Timer audio: {error}");
            }
            true
        }
    };
}

fn snapshot(state: &Runtime, now: u64) -> Snapshot {
    let c = &state.controller;
    Snapshot {
        language: language::current(),
        theme: if state.dark { "dark" } else { "light" },
        timers: c
            .timers
            .items
            .iter()
            .map(|timer| TimerView {
                id: timer.id,
                remaining_ms: timer.deadline_ms.saturating_sub(now),
                ringing: timer.ringing,
            })
            .collect(),
        sampled_at_ms: now,
        revision: c.revision,
        open_serial: c.open_serial,
        visible: c.visible,
        guard_remaining_ms: c.guard_until_ms.saturating_sub(now),
        shortcut: state.shortcut.clone(),
        error: c.failure.clone(),
    }
}

// Cache only successful effects, so a temporary failure is retried without stopping timers.
fn apply_effect<T: PartialEq>(
    applied: &mut T,
    desired: T,
    effect: impl FnOnce() -> Result<(), String>,
) -> bool {
    if *applied == desired {
        return true;
    }
    match effect() {
        Ok(()) => {
            *applied = desired;
            true
        }
        Err(error) => {
            eprintln!("Timer native effect: {error}");
            false
        }
    }
}

// All window effects run on the main thread, never under the timer mutex.
fn reconcile(app: &AppHandle, force_publish: bool) -> Result<(), String> {
    let shared = app.state::<AppState>();
    let dark = app
        .get_webview_window("main")
        .and_then(|window| window.theme().ok())
        .map(|theme| theme == tauri::Theme::Dark);
    let (data, mut tooltip, mut tray_visible, mut hidden, retrying) = {
        let mut state = shared.lock();
        if let Some(dark) = dark {
            state.dark = dark;
        }
        (
            snapshot(&state, clock::now_ms()),
            state.last_tooltip.clone(),
            state.tray_visible,
            state.hidden_applied,
            state.native_retry,
        )
    };
    let mut success = true;
    if let Some(tray) = app.tray_by_id("timer-active") {
        let text = {
            let state = shared.lock();
            timer::tooltip(&state.controller.timers.items, clock::now_ms())
        };
        success &= apply_effect(&mut tooltip, text.clone(), || {
            tray.set_tooltip(Some(text)).map_err(|e| e.to_string())
        });
        success &= apply_effect(&mut tray_visible, !data.timers.is_empty(), || {
            tray.set_visible(!data.timers.is_empty())
                .map_err(|e| e.to_string())
        });
    }
    if !data.visible {
        success &= apply_effect(&mut hidden, true, || platform::dismiss(app));
    } else {
        hidden = false;
    }
    let displayed = app.get_webview_window("main").is_some_and(|window| {
        window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false)
    });
    if force_publish || retrying || (data.visible && displayed) {
        if let Err(error) = app.emit("timer-state", &data) {
            eprintln!("Timer state delivery: {error}");
            success = false;
        }
    }
    // Show an alarm even if the renderer never completes its layout handshake.
    let fallback_serial = {
        let state = shared.lock();
        let c = &state.controller;
        (c.ringing() && c.guard_pending && clock::now_ms() >= c.guard_until_ms)
            .then_some(c.open_serial)
    };
    if let Some(serial) = fallback_serial {
        match platform::present(app, true, true) {
            Ok(()) => {
                let mut state = shared.lock();
                if state.controller.presented(serial, clock::now_ms()) {
                    state.shown_serial = serial;
                }
            }
            Err(error) => {
                eprintln!("Timer alarm fallback: {error}");
                success = false;
            }
        }
    }
    if data.error.is_some() {
        if let Err(error) = platform::present(app, false, true) {
            eprintln!("Timer failure display: {error}");
            success = false;
        }
    }
    let pending = { shared.lock().presentation_retry };
    if let Some((serial, width, height)) = pending {
        success &= present_window(app.clone(), serial, width, height).is_ok();
    }
    {
        let mut state = shared.lock();
        state.last_tooltip = tooltip;
        state.tray_visible = tray_visible;
        state.hidden_applied = hidden;
        state.native_retry = !success;
    }
    if !success && !retrying {
        shared.changed.notify_one();
    }
    Ok(())
}

fn report_failure(app: &AppHandle, message: &str) {
    let shared = app.state::<AppState>();
    {
        let mut state = shared.lock();
        state.controller.fail(message);
        sync_sound(&mut state);
    }
    // One best-effort visible failure report, not a silent worker death or a retry loop.
    let _ = reconcile(app, true);
}

fn post_reconcile(app: &AppHandle, force: bool) {
    let handle = app.clone();
    if app
        .run_on_main_thread(move || {
            let _ = reconcile(&handle, force);
        })
        .is_err()
    {
        let shared = app.state::<AppState>();
        shared.lock().native_retry = true;
        shared.changed.notify_one();
    }
}

fn change(app: &AppHandle, action: Action) -> Result<Snapshot, String> {
    let shared = app.state::<AppState>();
    let result = {
        let mut state = shared.lock();
        let result = state.controller.apply(action, clock::now_ms());
        sync_sound(&mut state);
        result
    };
    shared.changed.notify_one();
    let _ = reconcile(app, true);
    result?;
    let data = snapshot(&shared.lock(), clock::now_ms());
    Ok(data)
}

fn post_action(app: &AppHandle, action: Action) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let _ = change(&handle, action);
    });
}

#[tauri::command]
fn get_state(app: AppHandle) -> Result<Snapshot, String> {
    change(&app, Action::Tick)
}

#[tauri::command]
fn start_timer(app: AppHandle, minutes: u16) -> Result<Snapshot, String> {
    change(&app, Action::Start(minutes))
}

#[tauri::command]
fn acknowledge(app: AppHandle) -> Result<Snapshot, String> {
    change(&app, Action::Acknowledge)
}

#[tauri::command]
fn cancel_timer(app: AppHandle, id: u64) -> Result<Snapshot, String> {
    change(&app, Action::Cancel(id))
}

#[tauri::command]
fn hide_window(app: AppHandle) -> Result<Snapshot, String> {
    change(&app, Action::Close)
}

#[tauri::command]
fn present_window(app: AppHandle, open_serial: u64, width: f64, height: f64) -> Result<(), String> {
    if !width.is_finite()
        || !height.is_finite()
        || !(100.0..=10000.0).contains(&width)
        || !(100.0..=100000.0).contains(&height)
    {
        return Err("Ungültige Fenstergröße.".into());
    }
    let shared = app.state::<AppState>();
    let (alarm, focus) = {
        let mut state = shared.lock();
        if !state.controller.visible || state.controller.open_serial != open_serial {
            if state
                .presentation_retry
                .is_some_and(|request| request.0 == open_serial)
            {
                state.presentation_retry = None;
            }
            return Ok(());
        }
        (
            state.controller.ringing(),
            state.shown_serial != open_serial,
        )
    };
    let sizing = platform::fit(&app, width, height);
    let showing = platform::present(&app, alarm, focus);
    if showing.is_ok() {
        let mut state = shared.lock();
        if state.controller.presented(open_serial, clock::now_ms()) {
            state.shown_serial = open_serial;
        }
    }
    let result = sizing.and(showing);
    let mut state = shared.lock();
    if let Err(error) = result {
        eprintln!("Timer window presentation: {error}");
        let first_failure = state.presentation_retry.is_none();
        state.presentation_retry = Some((open_serial, width, height));
        drop(state);
        if first_failure {
            shared.changed.notify_one();
        }
        return Err(error);
    }
    state.presentation_retry = None;
    Ok(())
}

#[tauri::command]
fn quit_app(app: AppHandle, state: State<AppState>) {
    {
        let mut data = state.lock();
        data.stopping = true;
        sync_sound(&mut data);
    }
    state.changed.notify_one();
    app.exit(0);
}

fn worker(app: &AppHandle) {
    let shared = app.state::<AppState>();
    loop {
        let (revision, expired) = {
            let mut state = shared.lock();
            if state.stopping {
                return;
            }
            if state.controller.failure.is_some() {
                drop(state);
                post_reconcile(app, true);
                return;
            }
            let expired = state
                .controller
                .apply(Action::Tick, clock::now_ms())
                .unwrap_or(false);
            sync_sound(&mut state);
            (state.controller.revision, expired)
        };
        post_reconcile(app, expired);
        let state = shared.lock();
        if state.stopping {
            return;
        }
        if state.controller.failure.is_some() {
            drop(state);
            post_reconcile(app, true);
            return;
        }
        // Avoid losing a command's wake between releasing the state and entering the wait.
        if state.controller.revision != revision {
            continue;
        }
        let wait = state.controller.next_wait_ms(clock::now_ms());
        let wait = if state.audio_retry
            || state.native_retry
            || state.presentation_retry.is_some()
            || state.controller.guard_pending
        {
            Some(wait.unwrap_or(1000).min(1000))
        } else {
            wait
        };
        match wait {
            Some(ms) => {
                if shared
                    .changed
                    .wait_timeout(state, Duration::from_millis(ms))
                    .is_err()
                {
                    panic!("timer state poisoned while waiting");
                }
            }
            None => {
                if shared.changed.wait(state).is_err() {
                    panic!("timer state poisoned while waiting");
                }
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            post_action(app, Action::Open)
        }))
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            get_state,
            start_timer,
            acknowledge,
            cancel_timer,
            hide_window,
            present_window,
            quit_app
        ])
        .setup(|app| {
            use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
            let tray = TrayIconBuilder::with_id("timer-active")
                .icon(app.default_window_icon().expect("App icon missing").clone())
                .tooltip("Eyk Timer")
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                    ) {
                        post_action(tray.app_handle(), Action::Open);
                    }
                })
                .build(app)?;
            tray.set_visible(false)?;
            if let Some(window) = app.get_webview_window("main") {
                platform::place_startup(&window);
                platform::style_caption(&window);
                window.set_icon(app.default_window_icon().expect("App icon missing").clone())?;
            }
            use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(|app, _, event| {
                        if event.state() == ShortcutState::Pressed {
                            post_action(app, Action::Open);
                        }
                    })
                    .build(),
            )?;
            for (keys, label) in SHORTCUTS {
                if app.global_shortcut().register(keys).is_ok() {
                    app.state::<AppState>().lock().shortcut = Some(label.into());
                    break;
                }
            }
            let handle = app.handle().clone();
            std::thread::Builder::new()
                .name("timer-clock".into())
                .spawn(move || {
                    if std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| worker(&handle)))
                        .is_err()
                    {
                        let report = handle.clone();
                        let _ = handle
                            .run_on_main_thread(move || report_failure(&report, ENGINE_FAILURE));
                    }
                })?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::ThemeChanged(_) = event {
                if let Some(view) = window.app_handle().get_webview_window(window.label()) {
                    platform::style_caption(&view);
                }
                post_reconcile(window.app_handle(), true);
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let app = window.app_handle();
                if app.state::<AppState>().lock().controller.failure.is_some() {
                    app.exit(0);
                } else {
                    post_action(app, Action::Close);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("Timer konnte nicht gestartet werden.")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                let shared = app.state::<AppState>();
                {
                    let mut state = shared.lock();
                    state.stopping = true;
                    sync_sound(&mut state);
                }
                shared.changed.notify_one();
            }
        });
}

#[cfg(test)]
mod runtime_tests {
    use super::*;

    #[test]
    fn audio_effects_use_current_state_and_never_replay_a_stale_alarm() {
        let mut state = Runtime::default();
        let mut calls = Vec::new();
        state.controller.apply(Action::Start(1), 0).unwrap();
        state.controller.apply(Action::Tick, 60_000).unwrap();
        sync_sound_with(&mut state, |on| {
            calls.push(on);
            Ok(())
        });
        state
            .controller
            .presented(state.controller.open_serial, 60_000);
        state.controller.apply(Action::Acknowledge, 60_750).unwrap();
        sync_sound_with(&mut state, |on| {
            calls.push(on);
            Ok(())
        });
        // A late reconcile cannot replay a captured sound-on effect after acknowledgement.
        sync_sound_with(&mut state, |on| {
            calls.push(on);
            Ok(())
        });
        assert_eq!(calls, [true, false]);
        assert!(!state.sound_on);
    }

    #[test]
    fn audio_failure_preserves_visual_alarm_other_timers_and_recovers() {
        let mut state = Runtime::default();
        state.controller.apply(Action::Start(1), 0).unwrap();
        state.controller.apply(Action::Start(2), 0).unwrap();
        state.controller.apply(Action::Tick, 60_000).unwrap();
        sync_sound_with(&mut state, |_| Err("device disconnected".into()));
        assert!(state.controller.failure.is_none());
        assert!(state.controller.visible && state.controller.ringing());
        assert!(state.audio_retry && !state.sound_on);
        state.controller.apply(Action::Tick, 120_000).unwrap();
        assert!(state.controller.timers.items.iter().all(|t| t.ringing));
        sync_sound_with(&mut state, |_| Ok(()));
        assert!(state.sound_on && !state.audio_retry);
        state
            .controller
            .presented(state.controller.open_serial, 120_000);
        state
            .controller
            .apply(Action::Acknowledge, 120_750)
            .unwrap();
        sync_sound_with(&mut state, |_| Err("stop failed".into()));
        assert!(state.audio_retry && state.sound_on);
        sync_sound_with(&mut state, |_| Ok(()));
        assert!(!state.sound_on && !state.audio_retry);
    }

    #[test]
    fn failed_native_effect_is_retried_and_successful_effect_is_not_repeated() {
        let mut applied = false;
        assert!(!apply_effect(&mut applied, true, || Err(
            "tray unavailable".into()
        )));
        assert!(!applied);
        assert!(apply_effect(&mut applied, true, || Ok(())));
        assert!(applied);
        assert!(apply_effect(&mut applied, true, || panic!(
            "redundant effect"
        )));
    }

    #[test]
    fn poisoned_state_is_reported_without_erasing_existing_timers() {
        let shared = std::sync::Arc::new(AppState::default());
        let worker = shared.clone();
        let failed = std::thread::spawn(move || {
            let mut state = worker.runtime.lock().unwrap();
            state.controller.apply(Action::Start(5), 0).unwrap();
            panic!("injected worker failure");
        })
        .join();
        assert!(failed.is_err());
        let state = shared.lock();
        assert!(state.controller.visible);
        assert!(state.controller.failure.is_some());
        assert_eq!(state.controller.timers.items.len(), 1);
        assert!(!state.controller.ringing());
    }

    #[test]
    fn production_capabilities_do_not_grant_e2e_inspection_or_dragging() {
        let production: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
        assert_eq!(
            production["permissions"],
            serde_json::json!(["core:event:allow-listen", "core:event:allow-unlisten"])
        );
        let base: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert_eq!(
            base["app"]["security"]["capabilities"],
            serde_json::json!(["main"])
        );
        let test: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.e2e.conf.json")).unwrap();
        let permissions = test["app"]["security"]["capabilities"][0]["permissions"]
            .as_array()
            .unwrap();
        for required in [
            "core:window:allow-is-visible",
            "core:window:allow-current-monitor",
            "core:window:allow-set-theme",
            "core:app:allow-identifier",
        ] {
            assert!(permissions.iter().any(|value| value == required));
        }
    }
}

#[cfg(all(test, windows))]
mod keyboard_tests {
    use super::SHORTCUTS;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        GetKeyboardLayout, GetKeyboardLayoutList, LoadKeyboardLayoutW, UnloadKeyboardLayout,
        VkKeyScanExW, KLF_NOTELLSHELL,
    };

    #[test]
    fn shortcuts_avoid_altgr_text_input_and_debugger_reserved_f12() {
        for (keys, _) in SHORTCUTS {
            assert!(!(keys.contains("Ctrl") && keys.contains("Alt")));
            assert!(!keys.contains("F12"));
        }
    }

    #[test]
    fn original_ctrl_alt_t_conflicts_with_turkish_lira_without_changing_active_layout() {
        unsafe {
            let active = GetKeyboardLayout(0);
            let count = GetKeyboardLayoutList(0, std::ptr::null_mut());
            let mut existing = vec![std::ptr::null_mut(); count as usize];
            GetKeyboardLayoutList(count, existing.as_mut_ptr());
            let id: Vec<u16> = "0000041F\0".encode_utf16().collect();
            let layout = LoadKeyboardLayoutW(id.as_ptr(), KLF_NOTELLSHELL);
            assert!(!layout.is_null(), "Turkish keyboard layout unavailable");
            struct Loaded(windows_sys::Win32::UI::Input::KeyboardAndMouse::HKL, bool);
            impl Drop for Loaded {
                fn drop(&mut self) {
                    if self.1 {
                        unsafe {
                            UnloadKeyboardLayout(self.0);
                        }
                    }
                }
            }
            let _loaded = Loaded(layout, !existing.contains(&layout));
            let mapped = VkKeyScanExW('₺' as u16, layout) as u16;
            assert_eq!(mapped & 0xff, b'T' as u16);
            assert_eq!(mapped >> 8, 6, "Ctrl+Alt is AltGr for this character");
            assert_eq!(GetKeyboardLayout(0), active);
        }
    }
}
