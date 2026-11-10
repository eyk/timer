use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, UserAttentionType, WebviewWindow};

pub fn place_startup(window: &WebviewWindow) {
    // A local development aid, deliberately absent from release builds.
    #[cfg(debug_assertions)]
    if let Ok(requested) = std::env::var("TIMER_MONITOR") {
        if let Ok(monitors) = window.available_monitors() {
            if let Some(monitor) = monitors.into_iter().find(|monitor| {
                monitor
                    .name()
                    .is_some_and(|name| name.eq_ignore_ascii_case(requested.trim()))
            }) {
                if let Ok(size) = window.outer_size() {
                    let area = monitor.work_area();
                    let _ = window.set_position(PhysicalPosition::new(
                        area.position.x + (area.size.width as i32 - size.width as i32) / 2,
                        area.position.y + (area.size.height as i32 - size.height as i32) / 2,
                    ));
                }
            }
        }
    }
    #[cfg(not(debug_assertions))]
    let _ = window;
}

/// The UI supplies its measured content dimensions; native code only applies monitor/frame limits.
pub fn fit(app: &AppHandle, desired_width: f64, desired_height: f64) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Timerfenster fehlt.")?;
    let scale = window.scale_factor().map_err(|error| error.to_string())?;
    let inner = window.inner_size().map_err(|error| error.to_string())?;
    let outer = window.outer_size().map_err(|error| error.to_string())?;
    let frame_height = f64::from(outer.height.saturating_sub(inner.height)) / scale;
    let frame_width = f64::from(outer.width.saturating_sub(inner.width)) / scale;
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());
    let (width, height) = monitor
        .as_ref()
        .map_or((desired_width, desired_height), |monitor| {
            let area = monitor.work_area();
            (
                desired_width
                    .min((f64::from(area.size.width) / scale - frame_width - 32.0).max(100.0)),
                desired_height
                    .min((f64::from(area.size.height) / scale - frame_height - 32.0).max(100.0)),
            )
        });
    if (f64::from(inner.width) / scale - width).abs() > 1.0
        || (f64::from(inner.height) / scale - height).abs() > 1.0
    {
        window
            .set_size(LogicalSize::new(width, height))
            .map_err(|error| error.to_string())?;
    }
    if let (Some(monitor), Ok(position)) = (monitor, window.outer_position()) {
        let area = monitor.work_area();
        let margin = (16.0 * scale) as i32;
        let min_x = area.position.x + margin;
        let min_y = area.position.y + margin;
        let max_x = (area.position.x + area.size.width as i32
            - ((width + frame_width) * scale) as i32
            - margin)
            .max(min_x);
        let max_y = (area.position.y + area.size.height as i32
            - ((height + frame_height) * scale) as i32
            - margin)
            .max(min_y);
        let next = PhysicalPosition::new(
            position.x.clamp(min_x, max_x),
            position.y.clamp(min_y, max_y),
        );
        if next != position {
            window
                .set_position(next)
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

pub fn style_caption(window: &WebviewWindow) {
    #[cfg(windows)]
    if let Ok(handle) = window.hwnd() {
        use windows_sys::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_CAPTION_COLOR};
        let gray: u32 = if window.theme().ok() == Some(tauri::Theme::Dark) {
            0x00252525
        } else {
            0x00e7e7e7
        };
        // Unsupported on older Windows: retain the normal native caption color.
        unsafe {
            DwmSetWindowAttribute(
                handle.0,
                DWMWA_CAPTION_COLOR as u32,
                (&gray as *const u32).cast(),
                std::mem::size_of::<u32>() as u32,
            );
        }
    }
    #[cfg(not(windows))]
    let _ = window;
}

pub fn present(app: &AppHandle, alarm: bool, focus: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Timerfenster fehlt.")?;
    window
        .set_always_on_top(alarm)
        .map_err(|error| error.to_string())?;
    window.unminimize().map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;
    if focus {
        window.set_focus().map_err(|error| error.to_string())?;
    }
    if alarm && focus {
        window
            .request_user_attention(Some(UserAttentionType::Critical))
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn dismiss(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .set_always_on_top(false)
            .map_err(|error| error.to_string())?;
        window
            .request_user_attention(None)
            .map_err(|error| error.to_string())?;
        if window.is_visible().map_err(|error| error.to_string())? {
            window.hide().map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

pub fn sound(start: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::Media::Audio::{
            PlaySoundW, SND_ASYNC, SND_LOOP, SND_MEMORY, SND_NODEFAULT,
        };
        let result = unsafe {
            if start {
                let wave = include_bytes!("../resources/alarm.wav");
                PlaySoundW(
                    wave.as_ptr().cast(),
                    std::ptr::null_mut(),
                    SND_MEMORY | SND_ASYNC | SND_LOOP | SND_NODEFAULT,
                )
            } else {
                PlaySoundW(std::ptr::null(), std::ptr::null_mut(), 0)
            }
        };
        if result == 0 {
            return Err("Windows konnte den Alarmton nicht abspielen.".into());
        }
    }
    #[cfg(not(windows))]
    let _ = start;
    Ok(())
}
