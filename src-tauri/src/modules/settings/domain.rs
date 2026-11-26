use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::{AppError, AppResult};

pub const DEFAULT_SHORTCUT: &str = "Ctrl+Shift+Space";
pub const FALLBACK_TIMEZONE: &str = "Asia/Ho_Chi_Minh";
pub const MAX_REMINDER_MINUTES: u32 = 10_080;
pub const MAX_TRASH_DAYS: u32 = 365;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub enum Theme {
    Dark,
    Light,
    System,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub enum Language {
    #[serde(rename = "vi")]
    Vi,
    #[serde(rename = "en")]
    En,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub enum WeekStart {
    Mon,
    Sun,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub enum DateFormat {
    #[serde(rename = "DD/MM/YYYY")]
    DayMonthYear,
    #[serde(rename = "YYYY-MM-DD")]
    YearMonthDay,
    #[serde(rename = "MM/DD/YYYY")]
    MonthDayYear,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct AppSettings {
    pub theme: Theme,
    pub language: Language,
    /// Tên múi giờ IANA, VD `Asia/Ho_Chi_Minh`.
    pub timezone: String,
    pub date_format: DateFormat,
    pub week_start: WeekStart,
    pub quick_capture_shortcut: String,
    pub launch_at_startup: bool,
    pub start_hidden: bool,
    pub close_to_tray: bool,
    pub notifications_enabled: bool,
    pub default_reminder_minutes: u32,
    pub trash_retention_days: u32,
}

/// Cập nhật một phần: trường nào có mặt thì đổi, không có thì giữ nguyên.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct SettingsPatch {
    #[ts(optional)]
    pub theme: Option<Theme>,
    #[ts(optional)]
    pub language: Option<Language>,
    #[ts(optional)]
    pub timezone: Option<String>,
    #[ts(optional)]
    pub date_format: Option<DateFormat>,
    #[ts(optional)]
    pub week_start: Option<WeekStart>,
    #[ts(optional)]
    pub quick_capture_shortcut: Option<String>,
    #[ts(optional)]
    pub launch_at_startup: Option<bool>,
    #[ts(optional)]
    pub start_hidden: Option<bool>,
    #[ts(optional)]
    pub close_to_tray: Option<bool>,
    #[ts(optional)]
    pub notifications_enabled: Option<bool>,
    #[ts(optional)]
    pub default_reminder_minutes: Option<u32>,
    #[ts(optional)]
    pub trash_retention_days: Option<u32>,
}

/// Múi giờ của máy, rơi về `Asia/Ho_Chi_Minh` nếu không đọc được hoặc không hợp lệ.
pub fn system_timezone() -> String {
    match iana_time_zone::get_timezone() {
        Ok(tz) if is_valid_timezone(&tz) => tz,
        _ => FALLBACK_TIMEZONE.to_string(),
    }
}

pub fn is_valid_timezone(name: &str) -> bool {
    name.parse::<chrono_tz::Tz>().is_ok()
}

impl AppSettings {
    pub fn defaults(timezone: String) -> Self {
        Self {
            theme: Theme::System,
            language: Language::Vi,
            timezone,
            date_format: DateFormat::DayMonthYear,
            week_start: WeekStart::Mon,
            quick_capture_shortcut: DEFAULT_SHORTCUT.to_string(),
            launch_at_startup: false,
            start_hidden: true,
            close_to_tray: true,
            notifications_enabled: true,
            default_reminder_minutes: 15,
            trash_retention_days: 30,
        }
    }

    pub fn validate(&self) -> AppResult<()> {
        if !is_valid_timezone(&self.timezone) {
            return Err(AppError::validation("Múi giờ không hợp lệ"));
        }
        if self.quick_capture_shortcut.trim().is_empty() {
            return Err(AppError::validation("Phím tắt không được để trống"));
        }
        if self.default_reminder_minutes > MAX_REMINDER_MINUTES {
            return Err(AppError::validation(format!(
                "Nhắc trước tối đa {MAX_REMINDER_MINUTES} phút"
            )));
        }
        if !(1..=MAX_TRASH_DAYS).contains(&self.trash_retention_days) {
            return Err(AppError::validation(format!(
                "Thùng rác giữ từ 1 đến {MAX_TRASH_DAYS} ngày"
            )));
        }
        Ok(())
    }

    /// Áp patch lên bản sao rồi kiểm tra; không đổi `self`.
    pub fn apply(&self, patch: &SettingsPatch) -> AppResult<Self> {
        let mut s = self.clone();
        if let Some(v) = patch.theme {
            s.theme = v;
        }
        if let Some(v) = patch.language {
            s.language = v;
        }
        if let Some(v) = &patch.timezone {
            s.timezone = v.clone();
        }
        if let Some(v) = patch.date_format {
            s.date_format = v;
        }
        if let Some(v) = patch.week_start {
            s.week_start = v;
        }
        if let Some(v) = &patch.quick_capture_shortcut {
            s.quick_capture_shortcut = v.trim().to_string();
        }
        if let Some(v) = patch.launch_at_startup {
            s.launch_at_startup = v;
        }
        if let Some(v) = patch.start_hidden {
            s.start_hidden = v;
        }
        if let Some(v) = patch.close_to_tray {
            s.close_to_tray = v;
        }
        if let Some(v) = patch.notifications_enabled {
            s.notifications_enabled = v;
        }
        if let Some(v) = patch.default_reminder_minutes {
            s.default_reminder_minutes = v;
        }
        if let Some(v) = patch.trash_retention_days {
            s.trash_retention_days = v;
        }
        s.validate()?;
        Ok(s)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ErrorCode;

    fn base() -> AppSettings {
        AppSettings::defaults("Asia/Ho_Chi_Minh".into())
    }

    #[test]
    fn defaults_match_contract() {
        let s = base();
        assert_eq!(s.theme, Theme::System);
        assert_eq!(s.quick_capture_shortcut, "Ctrl+Shift+Space");
        assert_eq!(
            (s.default_reminder_minutes, s.trash_retention_days),
            (15, 30)
        );
        assert!(s.validate().is_ok());
    }

    #[test]
    fn serializes_to_contract_shape() {
        let json = serde_json::to_value(base()).unwrap();
        assert_eq!(json["language"], "vi");
        assert_eq!(json["dateFormat"], "DD/MM/YYYY");
        assert_eq!(json["weekStart"], "Mon");
        assert_eq!(json["launchAtStartup"], false);
    }

    #[test]
    fn patch_changes_only_given_fields() {
        let patch = SettingsPatch {
            theme: Some(Theme::Dark),
            ..Default::default()
        };
        let s = base().apply(&patch).unwrap();
        assert_eq!(s.theme, Theme::Dark);
        assert_eq!(
            AppSettings {
                theme: Theme::System,
                ..s
            },
            base()
        );
    }

    #[test]
    fn invalid_values_are_validation_errors() {
        let bad = [
            SettingsPatch {
                timezone: Some("Mars/Olympus".into()),
                ..Default::default()
            },
            SettingsPatch {
                default_reminder_minutes: Some(10_081),
                ..Default::default()
            },
            SettingsPatch {
                trash_retention_days: Some(0),
                ..Default::default()
            },
            SettingsPatch {
                trash_retention_days: Some(366),
                ..Default::default()
            },
            SettingsPatch {
                quick_capture_shortcut: Some("  ".into()),
                ..Default::default()
            },
        ];
        for p in bad {
            assert_eq!(base().apply(&p).unwrap_err().code, ErrorCode::Validation);
        }
    }

    #[test]
    fn boundary_values_are_accepted() {
        let p = SettingsPatch {
            default_reminder_minutes: Some(0),
            trash_retention_days: Some(365),
            timezone: Some("Europe/London".into()),
            ..Default::default()
        };
        assert!(base().apply(&p).is_ok());
    }

    #[test]
    fn system_timezone_is_valid() {
        assert!(is_valid_timezone(&system_timezone()));
    }

    #[test]
    fn patch_deserializes_partial_camel_case() {
        let p: SettingsPatch =
            serde_json::from_str(r#"{"closeToTray":false,"dateFormat":"YYYY-MM-DD"}"#).unwrap();
        assert_eq!(p.close_to_tray, Some(false));
        assert_eq!(p.date_format, Some(DateFormat::YearMonthDay));
        assert_eq!(p.theme, None);
    }
}
