use crate::timer::Timers;

pub const INPUT_GUARD_MS: u64 = 750;

#[derive(Clone, Copy)]
pub enum Action {
    Open,
    Start(u16),
    Cancel(u64),
    Acknowledge,
    Close,
    Tick,
}

pub struct Controller {
    pub timers: Timers,
    pub visible: bool,
    pub open_serial: u64,
    pub revision: u64,
    pub guard_until_ms: u64,
    pub guard_pending: bool,
    pub failure: Option<String>,
}

impl Default for Controller {
    fn default() -> Self {
        Self {
            timers: Timers::default(),
            visible: true,
            open_serial: 1,
            revision: 0,
            guard_until_ms: 0,
            guard_pending: false,
            failure: None,
        }
    }
}

impl Controller {
    pub fn ringing(&self) -> bool {
        self.failure.is_none() && self.timers.ringing()
    }

    fn advance(&mut self, now: u64) -> bool {
        let was_ringing = self.ringing();
        if !self.timers.tick(now) {
            return false;
        }
        self.visible = true;
        self.revision += 1;
        if !was_ringing {
            self.open_serial += 1;
            self.guard_until_ms = now.saturating_add(INPUT_GUARD_MS);
            self.guard_pending = true;
        }
        true
    }

    pub fn apply(&mut self, action: Action, now: u64) -> Result<bool, String> {
        if let Some(error) = &self.failure {
            return Err(error.clone());
        }
        let expired = self.advance(now);
        match action {
            Action::Tick => return Ok(expired),
            Action::Open => {
                self.visible = true;
                self.open_serial += 1;
            }
            Action::Start(minutes) => {
                self.timers.start(minutes, now)?;
                // Starting another timer must never hide an already due alarm.
                self.visible = self.ringing();
            }
            Action::Cancel(id) => self.timers.cancel(id),
            Action::Acknowledge => {
                if self.ringing() && (self.guard_pending || now < self.guard_until_ms) {
                    return Ok(expired);
                }
                self.timers.acknowledge();
                self.visible = false;
            }
            Action::Close => {
                // A close from the old view must not consume an alarm not yet presented.
                if self.ringing() && (self.guard_pending || now < self.guard_until_ms) {
                    return Ok(expired);
                }
                self.timers.acknowledge();
                self.visible = false;
            }
        }
        if !self.ringing() {
            self.guard_until_ms = 0;
            self.guard_pending = false;
        }
        self.revision += 1;
        Ok(true)
    }

    /// Sleep indefinitely when idle/ringing; otherwise wake on the next display-second boundary.
    pub fn next_wait_ms(&self, now: u64) -> Option<u64> {
        if self.failure.is_some() {
            return None;
        }
        self.timers
            .items
            .iter()
            .filter(|timer| !timer.ringing)
            .min_by_key(|timer| timer.deadline_ms)
            .map(|timer| {
                let remaining = timer.deadline_ms.saturating_sub(now);
                if remaining == 0 {
                    0
                } else {
                    let fraction = remaining % 1000;
                    if fraction == 0 {
                        1000
                    } else {
                        fraction
                    }
                }
            })
    }

    /// Arm the keyboard guard when the alarm really becomes visible, even after a busy UI thread.
    pub fn presented(&mut self, open_serial: u64, now: u64) -> bool {
        if !self.visible || self.open_serial != open_serial {
            return false;
        }
        if self.guard_pending && self.ringing() {
            self.guard_until_ms = now.saturating_add(INPUT_GUARD_MS);
            self.guard_pending = false;
        }
        true
    }

    pub fn fail(&mut self, message: &str) {
        self.failure = Some(message.into());
        self.visible = true;
        self.open_serial += 1;
        self.revision += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expiry_then_acknowledge_cannot_leave_a_ghost_alarm() {
        let mut c = Controller::default();
        c.apply(Action::Start(1), 0).unwrap();
        c.apply(Action::Tick, 60_000).unwrap();
        assert!(c.ringing());
        c.presented(c.open_serial, 60_000);
        c.apply(Action::Acknowledge, 60_750).unwrap();
        c.apply(Action::Tick, 60_751).unwrap();
        assert!(!c.ringing());
        assert!(!c.visible);
        assert!(c.timers.items.is_empty());
    }

    #[test]
    fn close_after_presentation_cannot_restart_sound() {
        let mut c = Controller::default();
        c.apply(Action::Start(1), 0).unwrap();
        c.apply(Action::Tick, 60_000).unwrap();
        c.presented(c.open_serial, 60_000);
        c.apply(Action::Close, 60_750).unwrap();
        c.apply(Action::Tick, 60_001).unwrap();
        assert!(!c.visible && !c.ringing());
    }

    #[test]
    fn closing_before_alarm_presentation_never_loses_a_newly_due_timer() {
        for worker_first in [false, true] {
            let mut c = Controller::default();
            c.apply(Action::Start(1), 0).unwrap();
            c.apply(Action::Start(90), 0).unwrap();
            c.apply(Action::Open, 59_000).unwrap();
            if worker_first {
                c.apply(Action::Tick, 60_000).unwrap();
            }
            c.apply(Action::Close, 60_000).unwrap();
            assert!(c.visible && c.ringing() && c.guard_pending);
            assert_eq!(c.timers.items.len(), 2);
            // Even a long UI delay must not turn a close into unseen acknowledgement.
            c.apply(Action::Close, 65_000).unwrap();
            assert!(c.visible && c.ringing());
            c.presented(c.open_serial, 65_000);
            c.apply(Action::Close, 65_750).unwrap();
            assert!(!c.visible && !c.ringing());
            assert_eq!(c.timers.items.len(), 1);
            assert_eq!(c.timers.items[0].deadline_ms, 5_400_000);
        }
    }

    #[test]
    fn ordinary_close_without_an_alarm_still_hides_and_preserves_running_timers() {
        let mut c = Controller::default();
        c.apply(Action::Start(90), 0).unwrap();
        c.apply(Action::Open, 100).unwrap();
        c.apply(Action::Close, 200).unwrap();
        assert!(!c.visible && !c.ringing());
        assert_eq!(c.timers.items.len(), 1);
    }

    #[test]
    fn late_presentation_from_another_thread_cannot_arm_the_new_alarm_guard() {
        use std::sync::{Arc, Barrier, Mutex};
        let shared = Arc::new(Mutex::new(Controller::default()));
        let before_expiry = Arc::new(Barrier::new(2));
        let after_expiry = Arc::new(Barrier::new(2));
        let old_serial = {
            let mut c = shared.lock().unwrap();
            c.apply(Action::Start(1), 0).unwrap();
            c.apply(Action::Open, 59_000).unwrap();
            c.open_serial
        };
        let worker = {
            let shared = shared.clone();
            let before = before_expiry.clone();
            let after = after_expiry.clone();
            std::thread::spawn(move || {
                before.wait();
                shared.lock().unwrap().apply(Action::Tick, 60_000).unwrap();
                after.wait();
            })
        };
        // Reproduce expiry after the UI's initial state check, during native window work.
        before_expiry.wait();
        after_expiry.wait();
        worker.join().unwrap();
        let mut c = shared.lock().unwrap();
        assert!(!c.presented(old_serial, 61_000));
        assert!(c.guard_pending);
        c.apply(Action::Acknowledge, 65_000).unwrap();
        assert!(c.visible && c.ringing());
        let serial = c.open_serial;
        assert!(c.presented(serial, 66_000));
        assert_eq!(c.guard_until_ms, 66_000 + INPUT_GUARD_MS);
        let until = c.guard_until_ms;
        assert!(!c.presented(old_serial, 66_001));
        assert_eq!(c.guard_until_ms, until);
        c.apply(Action::Acknowledge, until - 1).unwrap();
        assert!(c.ringing());
        c.apply(Action::Acknowledge, until).unwrap();
        assert!(!c.visible && !c.ringing());
        assert!(!c.presented(serial, until + 1));
    }

    #[test]
    fn starting_at_or_after_expiry_keeps_the_alarm_visible() {
        for worker_first in [false, true] {
            let mut c = Controller::default();
            c.apply(Action::Start(1), 0).unwrap();
            if worker_first {
                c.apply(Action::Tick, 60_000).unwrap();
            }
            c.apply(Action::Start(90), 60_000).unwrap();
            c.apply(Action::Tick, 60_001).unwrap();
            assert!(c.visible && c.ringing());
            assert_eq!(c.timers.items.len(), 2);
        }
    }

    #[test]
    fn close_acknowledges_only_expired_timers() {
        let mut c = Controller::default();
        c.apply(Action::Start(1), 0).unwrap();
        c.apply(Action::Start(90), 0).unwrap();
        c.apply(Action::Tick, 60_000).unwrap();
        c.presented(c.open_serial, 60_000);
        c.apply(Action::Close, 60_750).unwrap();
        assert!(!c.visible && !c.ringing());
        assert_eq!(c.timers.items.len(), 1);
        assert_eq!(c.timers.items[0].deadline_ms, 5_400_000);
    }

    #[test]
    fn keyboard_guard_rejects_inherited_enter_but_then_accepts_one_press() {
        let mut c = Controller::default();
        c.apply(Action::Start(1), 0).unwrap();
        c.apply(Action::Tick, 60_000).unwrap();
        c.apply(Action::Acknowledge, 61_000).unwrap();
        assert!(c.visible && c.ringing());
        c.presented(c.open_serial, 65_000);
        c.apply(Action::Acknowledge, 65_001).unwrap();
        assert!(c.visible && c.ringing());
        c.apply(Action::Acknowledge, 65_000 + INPUT_GUARD_MS)
            .unwrap();
        assert!(!c.visible && !c.ringing());
    }

    #[test]
    fn every_acknowledgement_path_respects_the_same_guard() {
        for action in [Action::Close, Action::Acknowledge] {
            let mut c = Controller::default();
            c.apply(Action::Start(1), 0).unwrap();
            c.apply(Action::Tick, 60_000).unwrap();
            c.apply(action, 61_000).unwrap();
            assert!(c.ringing());
            c.presented(c.open_serial, 62_000);
            c.apply(action, 62_749).unwrap();
            assert!(c.visible && c.ringing());
            c.apply(action, 62_750).unwrap();
            assert!(!c.visible && !c.ringing());
        }
    }

    #[test]
    fn worker_sleeps_when_idle_and_aligns_to_remaining_seconds() {
        let mut c = Controller::default();
        assert_eq!(c.next_wait_ms(0), None);
        c.apply(Action::Start(1), 123).unwrap();
        assert_eq!(c.next_wait_ms(123), Some(1000));
        assert_eq!(c.next_wait_ms(500), Some(623));
        assert_eq!(c.next_wait_ms(60_000), Some(123));
        c.apply(Action::Tick, 60_123).unwrap();
        assert_eq!(c.next_wait_ms(60_123), None);
    }

    #[test]
    fn later_timer_boundaries_do_not_cause_extra_worker_wakeups() {
        let mut c = Controller::default();
        c.apply(Action::Start(90), 23).unwrap();
        c.apply(Action::Start(1), 123).unwrap();
        assert_eq!(c.next_wait_ms(123), Some(1000));
        assert_eq!(c.next_wait_ms(500), Some(623));
    }

    #[test]
    fn another_expiry_does_not_steal_keyboard_focus_again() {
        let mut c = Controller::default();
        c.apply(Action::Start(1), 0).unwrap();
        c.apply(Action::Start(1), 5000).unwrap();
        c.apply(Action::Tick, 60_000).unwrap();
        c.presented(c.open_serial, 60_000);
        let serial = c.open_serial;
        c.apply(Action::Tick, 65_000).unwrap();
        assert_eq!(c.open_serial, serial);
        assert!(!c.guard_pending);
        assert_eq!(c.guard_until_ms, 60_000 + INPUT_GUARD_MS);
    }

    #[test]
    fn sleep_elapsed_time_expires_once_and_needs_no_calendar_clock() {
        let mut c = Controller::default();
        c.apply(Action::Start(5), 1000).unwrap();
        assert!(!c.apply(Action::Tick, 20_000).unwrap());
        assert!(c.apply(Action::Tick, 301_000).unwrap());
        assert!(!c.apply(Action::Tick, 400_000).unwrap());
        assert!(c.ringing());
    }

    #[test]
    fn failure_is_visible_preserves_timers_and_stops_alarm_and_scheduler() {
        let mut c = Controller::default();
        c.apply(Action::Start(1), 0).unwrap();
        c.apply(Action::Tick, 60_000).unwrap();
        c.fail("worker failed");
        assert!(c.visible && !c.ringing());
        assert_eq!(c.next_wait_ms(60_000), None);
        assert!(c.apply(Action::Start(5), 60_001).is_err());
        assert_eq!(c.timers.items.len(), 1);
    }
}
