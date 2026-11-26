//! Tính ngày của lần lặp tiếp theo (hàm thuần, không đụng DB).

use chrono::{Datelike, Duration, NaiveDate};

use super::domain::{Frequency, Recurrence};

fn days_in_month(year: i32, month: u32) -> u32 {
    let (y, m) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    NaiveDate::from_ymd_opt(y, m, 1)
        .and_then(|d| d.pred_opt())
        .map_or(28, |d| d.day())
}

/// Ngày lần lặp tiếp theo sau `current`. `anchor` là ngày của lần đầu tiên: tháng ngắn bị kẹp
/// xuống ngày cuối tháng nhưng tháng sau vẫn quay về ngày gốc (31/1 → 28/2 → 31/3).
pub fn next_occurrence(rec: &Recurrence, anchor: NaiveDate, current: NaiveDate) -> NaiveDate {
    let interval = i64::from(rec.interval.max(1));
    match rec.frequency {
        Frequency::Daily => current + Duration::days(interval),
        Frequency::Weekly => {
            let mut days: Vec<i64> = rec
                .by_weekday
                .iter()
                .flatten()
                .map(|w| i64::from(w.index()))
                .collect();
            days.sort_unstable();
            days.dedup();
            if days.is_empty() {
                return current + Duration::days(7 * interval);
            }
            let today = i64::from(current.weekday().num_days_from_monday());
            if let Some(&d) = days.iter().find(|&&d| d > today) {
                return current + Duration::days(d - today);
            }
            // Hết tuần: nhảy `interval` tuần rồi lấy ngày đầu tiên trong danh sách.
            let monday = current - Duration::days(today);
            monday + Duration::days(7 * interval + days[0])
        }
        Frequency::Monthly => {
            let months = i64::from(current.year()) * 12 + i64::from(current.month0()) + interval;
            let year = i32::try_from(months.div_euclid(12)).unwrap_or(current.year());
            let month = u32::try_from(months.rem_euclid(12)).unwrap_or(0) + 1;
            let day = anchor.day().min(days_in_month(year, month));
            NaiveDate::from_ymd_opt(year, month, day).unwrap_or(current)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::tasks::domain::Weekday::{Fr, Mo, Su, We};

    fn d(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    fn rec(
        frequency: Frequency,
        interval: u32,
        by: Option<Vec<crate::modules::tasks::domain::Weekday>>,
    ) -> Recurrence {
        Recurrence {
            frequency,
            interval,
            by_weekday: by,
        }
    }

    #[test]
    fn daily() {
        let r = rec(Frequency::Daily, 1, None);
        assert_eq!(
            next_occurrence(&r, d("2026-11-26"), d("2026-11-26")),
            d("2026-11-27")
        );
        assert_eq!(
            next_occurrence(&r, d("2026-12-31"), d("2026-12-31")),
            d("2027-01-01")
        );
        let r3 = rec(Frequency::Daily, 3, None);
        assert_eq!(
            next_occurrence(&r3, d("2026-02-27"), d("2026-02-27")),
            d("2026-03-02")
        );
        // Năm nhuận: 28/2/2028 → 29/2/2028.
        assert_eq!(
            next_occurrence(&r, d("2028-02-28"), d("2028-02-28")),
            d("2028-02-29")
        );
    }

    #[test]
    fn weekly_without_weekdays_adds_whole_weeks() {
        let r = rec(Frequency::Weekly, 2, None);
        assert_eq!(
            next_occurrence(&r, d("2026-11-26"), d("2026-11-26")),
            d("2026-12-10")
        );
    }

    #[test]
    fn weekly_with_weekdays() {
        // 2026-11-23 là thứ Hai.
        let r = rec(Frequency::Weekly, 1, Some(vec![Mo, We, Fr]));
        assert_eq!(
            next_occurrence(&r, d("2026-11-23"), d("2026-11-23")),
            d("2026-11-25")
        ); // Mo → We
        assert_eq!(
            next_occurrence(&r, d("2026-11-23"), d("2026-11-25")),
            d("2026-11-27")
        ); // We → Fr
        assert_eq!(
            next_occurrence(&r, d("2026-11-23"), d("2026-11-27")),
            d("2026-11-30")
        ); // Fr → Mo tuần sau
           // Giữa các ngày được chọn (thứ Năm) → thứ Sáu cùng tuần.
        assert_eq!(
            next_occurrence(&r, d("2026-11-23"), d("2026-11-26")),
            d("2026-11-27")
        );
        // Cách 2 tuần: hết tuần thì nhảy 2 tuần, lấy ngày đầu tiên.
        let r2 = rec(Frequency::Weekly, 2, Some(vec![Mo, Fr]));
        assert_eq!(
            next_occurrence(&r2, d("2026-11-23"), d("2026-11-27")),
            d("2026-12-07")
        );
        // Chủ nhật là ngày cuối tuần; danh sách không theo thứ tự vẫn đúng.
        let r3 = rec(Frequency::Weekly, 1, Some(vec![Su, Mo]));
        assert_eq!(
            next_occurrence(&r3, d("2026-11-23"), d("2026-11-29")),
            d("2026-11-30")
        );
        assert_eq!(
            next_occurrence(&r3, d("2026-11-23"), d("2026-11-23")),
            d("2026-11-29")
        );
    }

    #[test]
    fn monthly_clamps_but_returns_to_anchor_day() {
        let r = rec(Frequency::Monthly, 1, None);
        let anchor = d("2027-01-31");
        let feb = next_occurrence(&r, anchor, anchor);
        assert_eq!(feb, d("2027-02-28"));
        let mar = next_occurrence(&r, anchor, feb);
        assert_eq!(mar, d("2027-03-31"));
        let apr = next_occurrence(&r, anchor, mar);
        assert_eq!(apr, d("2027-04-30"));
        // Năm nhuận.
        let leap = d("2028-01-31");
        assert_eq!(next_occurrence(&r, leap, leap), d("2028-02-29"));
        // Qua năm và interval > 1.
        let r2 = rec(Frequency::Monthly, 3, None);
        assert_eq!(
            next_occurrence(&r2, d("2026-11-15"), d("2026-11-15")),
            d("2027-02-15")
        );
        let r12 = rec(Frequency::Monthly, 12, None);
        assert_eq!(
            next_occurrence(&r12, d("2028-02-29"), d("2028-02-29")),
            d("2029-02-28")
        );
    }
}
