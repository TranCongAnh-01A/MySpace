//! Múi giờ và "bây giờ" dùng cho mọi phép tính theo ngày (Today/Overdue/Next7, task lặp).
//! Core tự tính; frontend không gửi ngày hiện tại.

use chrono::{
    DateTime, Duration, NaiveDate, NaiveDateTime, NaiveTime, SecondsFormat, TimeZone, Utc,
};
use chrono_tz::Tz;

use crate::modules::settings::domain::FALLBACK_TIMEZONE;

#[derive(Debug, Clone, Copy)]
pub struct TimeCtx {
    pub tz: Tz,
    pub now: DateTime<Utc>,
}

pub fn iso(t: DateTime<Utc>) -> String {
    t.to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub fn fmt_date(d: NaiveDate) -> String {
    d.format("%Y-%m-%d").to_string()
}

pub fn parse_date(s: &str) -> Option<NaiveDate> {
    // `%Y-%m-%d` chấp nhận cả "2026-1-5"; ép đúng dạng chuẩn để so sánh chuỗi an toàn.
    let d = NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()?;
    (fmt_date(d) == s).then_some(d)
}

impl TimeCtx {
    /// Tên múi giờ lạ thì rơi về `Asia/Ho_Chi_Minh` (Settings đã kiểm tra nên hiếm khi xảy ra).
    pub fn new(tz_name: &str, now: DateTime<Utc>) -> Self {
        let tz = tz_name
            .parse::<Tz>()
            .or_else(|_| FALLBACK_TIMEZONE.parse::<Tz>())
            .unwrap_or(Tz::UTC);
        Self { tz, now }
    }

    pub fn now_iso(&self) -> String {
        iso(self.now)
    }

    pub fn today(&self) -> NaiveDate {
        self.now.with_timezone(&self.tz).date_naive()
    }

    /// Ngày địa phương của một mốc `due_at` (ISO UTC).
    pub fn local_date(&self, at: &str) -> Option<NaiveDate> {
        let t = DateTime::parse_from_rfc3339(at)
            .ok()?
            .with_timezone(&self.tz);
        Some(t.date_naive())
    }

    /// Giờ địa phương `HH:MM:SS` của một mốc `due_at`.
    pub fn local_time(&self, at: &str) -> Option<String> {
        let t = DateTime::parse_from_rfc3339(at)
            .ok()?
            .with_timezone(&self.tz);
        Some(t.format("%H:%M:%S").to_string())
    }

    /// 0h địa phương của `date`, đổi sang UTC dạng ISO (để so sánh với `due_at`).
    pub fn start_of_day_utc(&self, date: NaiveDate) -> String {
        let midnight = date.and_time(NaiveTime::MIN);
        iso(self.local_to_utc(midnight))
    }

    /// `date` + `HH:MM:SS` giờ địa phương → ISO UTC.
    pub fn utc_from_local(&self, date: NaiveDate, hms: &str) -> Option<String> {
        let time = NaiveTime::parse_from_str(hms, "%H:%M:%S").ok()?;
        Some(iso(self.local_to_utc(date.and_time(time))))
    }

    /// Giờ địa phương → UTC; giờ rơi vào khoảng "nhảy" của DST thì dời tới giờ hợp lệ kế tiếp.
    fn local_to_utc(&self, local: NaiveDateTime) -> DateTime<Utc> {
        let mut t = local;
        for _ in 0..3 {
            if let Some(dt) = self.tz.from_local_datetime(&t).earliest() {
                return dt.with_timezone(&Utc);
            }
            t += Duration::hours(1);
        }
        Utc.from_utc_datetime(&local)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx(h: u32, m: u32) -> TimeCtx {
        // 2026-11-26 h:m UTC; Asia/Ho_Chi_Minh = UTC+7.
        TimeCtx::new(
            "Asia/Ho_Chi_Minh",
            Utc.with_ymd_and_hms(2026, 11, 26, h, m, 0).unwrap(),
        )
    }

    #[test]
    fn today_follows_the_timezone() {
        assert_eq!(fmt_date(ctx(10, 0).today()), "2026-11-26");
        // 18:00 UTC = 01:00 ngày 27 ở Việt Nam.
        assert_eq!(fmt_date(ctx(18, 0).today()), "2026-11-27");
        let la = TimeCtx::new("America/Los_Angeles", ctx(3, 0).now);
        assert_eq!(fmt_date(la.today()), "2026-11-25");
    }

    #[test]
    fn local_date_time_and_day_bounds() {
        let c = ctx(0, 0);
        assert_eq!(
            fmt_date(c.local_date("2026-11-26T18:30:00.000Z").unwrap()),
            "2026-11-27"
        );
        assert_eq!(
            c.local_time("2026-11-26T18:30:00.000Z").unwrap(),
            "01:30:00"
        );
        let d = parse_date("2026-11-27").unwrap();
        assert_eq!(c.start_of_day_utc(d), "2026-11-26T17:00:00.000Z");
        assert_eq!(
            c.utc_from_local(d, "01:30:00").unwrap(),
            "2026-11-26T18:30:00.000Z"
        );
    }

    #[test]
    fn dst_gap_moves_forward_and_unknown_tz_falls_back() {
        let ny = TimeCtx::new("America/New_York", ctx(0, 0).now);
        // 2027-03-14 02:30 không tồn tại ở New York (nhảy 02:00 → 03:00).
        let d = parse_date("2027-03-14").unwrap();
        assert_eq!(
            ny.utc_from_local(d, "02:30:00").unwrap(),
            "2027-03-14T07:30:00.000Z"
        );
        assert_eq!(
            TimeCtx::new("không có", ctx(0, 0).now).tz,
            Tz::Asia__Ho_Chi_Minh
        );
    }

    #[test]
    fn parse_date_is_strict() {
        assert!(parse_date("2026-02-30").is_none());
        assert!(parse_date("2026-1-5").is_none());
        assert!(parse_date("26/11/2026").is_none());
        assert!(parse_date("2026-11-26").is_some());
    }
}
