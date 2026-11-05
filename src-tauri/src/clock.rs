/// Windows interrupt time includes sleep/hibernation but is unaffected by wall-clock changes.
pub fn now_ms() -> u64 {
    #[cfg(windows)]
    {
        let mut ticks = 0;
        unsafe { windows_sys::Win32::System::WindowsProgramming::QueryInterruptTime(&mut ticks) };
        ticks / 10_000
    }
    #[cfg(not(windows))]
    {
        // Other platforms need an explicit suspend-aware clock before being supported.
        use std::{sync::OnceLock, time::Instant};
        static START: OnceLock<Instant> = OnceLock::new();
        START.get_or_init(Instant::now).elapsed().as_millis() as u64
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn clock_is_nondecreasing() {
        let before = super::now_ms();
        std::thread::sleep(std::time::Duration::from_millis(20));
        assert!(super::now_ms() >= before);
    }
}
