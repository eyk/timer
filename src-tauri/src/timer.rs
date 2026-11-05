pub struct Timer {
    pub id: u64,
    pub deadline_ms: u64,
    pub ringing: bool,
}

#[derive(Default)]
pub struct Timers {
    pub items: Vec<Timer>,
    next_id: u64,
}

pub fn tooltip(items: &[Timer], now_ms: u64) -> String {
    if items.iter().any(|timer| timer.ringing) {
        return "0:00".into();
    }
    match items.iter().min_by_key(|timer| timer.deadline_ms) {
        Some(timer) => {
            let seconds = timer.deadline_ms.saturating_sub(now_ms).div_ceil(1000);
            format!("{}:{:02}", seconds / 60, seconds % 60)
        }
        None => "Timer".into(),
    }
}

impl Timers {
    pub fn start(&mut self, minutes: u16, now_ms: u64) -> Result<(), String> {
        if !(1..=999).contains(&minutes) {
            return Err("Bitte 1 bis 999 Minuten eingeben.".into());
        }
        if self.items.len() >= 10 {
            return Err("Maximal zehn Timer.".into());
        }
        self.next_id += 1;
        self.items.push(Timer {
            id: self.next_id,
            deadline_ms: now_ms + u64::from(minutes) * 60_000,
            ringing: false,
        });
        Ok(())
    }

    pub fn tick(&mut self, now_ms: u64) -> bool {
        let mut changed = false;
        for timer in &mut self.items {
            if !timer.ringing && timer.deadline_ms <= now_ms {
                timer.ringing = true;
                changed = true;
            }
        }
        changed
    }

    pub fn ringing(&self) -> bool {
        self.items.iter().any(|timer| timer.ringing)
    }

    pub fn acknowledge(&mut self) {
        self.items.retain(|timer| !timer.ringing);
    }

    pub fn cancel(&mut self, id: u64) {
        self.items.retain(|timer| timer.id != id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tooltip_uses_the_nearest_deadline_and_rounds_like_the_display() {
        let mut timers = Timers::default();
        assert_eq!(tooltip(&timers.items, 0), "Timer");
        timers.start(113, 0).unwrap();
        timers.start(5, 0).unwrap();
        assert_eq!(tooltip(&timers.items, 1), "5:00");
        assert_eq!(tooltip(&timers.items, 1_000), "4:59");
        timers.cancel(2);
        assert_eq!(tooltip(&timers.items, 1_000), "112:59");
    }

    #[test]
    fn tooltip_reports_an_alarm_until_it_is_acknowledged() {
        let mut timers = Timers::default();
        timers.start(1, 0).unwrap();
        timers.start(5, 0).unwrap();
        timers.tick(60_000);
        assert_eq!(tooltip(&timers.items, 60_000), "0:00");
        timers.acknowledge();
        assert_eq!(tooltip(&timers.items, 60_000), "4:00");
    }

    #[test]
    fn independent_deadlines_and_acknowledgement() {
        let mut timers = Timers::default();
        timers.start(1, 1_000).unwrap();
        timers.start(113, 5_000).unwrap();
        assert!(!timers.tick(60_999));
        assert!(timers.tick(61_000));
        assert!(!timers.tick(61_001));
        assert!(timers.ringing());
        timers.acknowledge();
        assert_eq!(timers.items.len(), 1);
        assert_eq!(timers.items[0].deadline_ms, 6_785_000);
        assert!(!timers.ringing());
    }

    #[test]
    fn accepts_only_one_to_999_minutes() {
        let mut timers = Timers::default();
        assert!(timers.start(0, 0).is_err());
        assert!(timers.start(1000, 0).is_err());
        timers.start(999, 0).unwrap();
        assert_eq!(timers.items[0].deadline_ms, 59_940_000);
    }

    #[test]
    fn limits_the_stack_without_changing_existing_timers() {
        let mut timers = Timers::default();
        for _ in 0..10 {
            timers.start(5, 0).unwrap();
        }
        assert!(timers.start(5, 0).is_err());
        assert_eq!(timers.items.len(), 10);
        timers.cancel(1);
        assert!(timers.start(5, 0).is_ok());
    }

    #[test]
    fn handles_simultaneous_expiry_and_cancellation() {
        let mut timers = Timers::default();
        timers.start(1, 0).unwrap();
        timers.start(1, 0).unwrap();
        timers.start(2, 0).unwrap();
        timers.cancel(3);
        assert!(timers.tick(60_000));
        assert!(timers.items.iter().all(|timer| timer.ringing));
        timers.acknowledge();
        assert!(timers.items.is_empty());
    }
}
