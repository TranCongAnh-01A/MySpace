use chrono::{DateTime, SecondsFormat, Utc};

/// Đồng hồ trừu tượng để test giả lập giờ.
pub trait Clock: Send + Sync {
    fn now(&self) -> DateTime<Utc>;

    /// Giờ UTC dạng `YYYY-MM-DDTHH:MM:SS.sssZ` (so sánh chuỗi được).
    fn now_iso(&self) -> String {
        self.now().to_rfc3339_opts(SecondsFormat::Millis, true)
    }
}

pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> DateTime<Utc> {
        Utc::now()
    }
}

#[cfg(test)]
pub struct FixedClock(pub DateTime<Utc>);

#[cfg(test)]
impl Clock for FixedClock {
    fn now(&self) -> DateTime<Utc> {
        self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn iso_format_has_millis_and_z() {
        let c = FixedClock(Utc.with_ymd_and_hms(2026, 11, 26, 1, 2, 3).unwrap());
        assert_eq!(c.now_iso(), "2026-11-26T01:02:03.000Z");
    }
}
