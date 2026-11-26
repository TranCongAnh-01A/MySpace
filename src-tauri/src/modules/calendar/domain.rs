use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::{AppError, AppResult};
use crate::modules::tasks::domain::{
    normalize_due_at, validate_date, validate_description, validate_title, Task,
};
use crate::modules::tasks::timectx::parse_date;

pub const MAX_TIMED_DAYS: i64 = 14;
pub const MAX_ALL_DAY_DAYS: i64 = 366;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct Calendar {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub color: Option<String>,
    pub is_default: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct Event {
    pub id: String,
    pub calendar_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub task_id: Option<String>,
    pub title: String,
    pub description: String,
    pub is_all_day: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub start_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub end_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub start_date: Option<String>,
    /// Tính cả ngày cuối (inclusive).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub end_date: Option<String>,
    pub version: u64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct EventCreate {
    /// Thiếu = lịch mặc định.
    #[serde(default)]
    #[ts(optional)]
    pub calendar_id: Option<String>,
    pub title: String,
    #[serde(default)]
    #[ts(optional)]
    pub description: Option<String>,
    pub is_all_day: bool,
    #[serde(default)]
    #[ts(optional)]
    pub start_at: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub end_at: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub start_date: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub end_date: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub task_id: Option<String>,
}

/// Thiếu = giữ nguyên, `null` = xoá, có giá trị = đặt. Trạng thái cuối phải hợp lệ.
#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct EventPatch {
    #[serde(default)]
    #[ts(optional)]
    pub title: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub description: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub calendar_id: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub is_all_day: Option<bool>,
    #[serde(default, with = "::serde_with::rust::double_option")]
    #[ts(optional, type = "string | null")]
    pub start_at: Option<Option<String>>,
    #[serde(default, with = "::serde_with::rust::double_option")]
    #[ts(optional, type = "string | null")]
    pub end_at: Option<Option<String>>,
    #[serde(default, with = "::serde_with::rust::double_option")]
    #[ts(optional, type = "string | null")]
    pub start_date: Option<Option<String>>,
    #[serde(default, with = "::serde_with::rust::double_option")]
    #[ts(optional, type = "string | null")]
    pub end_date: Option<Option<String>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(tag = "kind")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub enum CalendarItem {
    Event { event: Event },
    Deadline { task: Task },
}

fn non_empty(s: &Option<String>) -> Option<String> {
    s.as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn day(raw: &str) -> AppResult<NaiveDate> {
    parse_date(raw).ok_or_else(|| AppError::validation("Ngày phải có dạng YYYY-MM-DD"))
}

/// Chuẩn hoá và kiểm tra hình dạng Event (title, mô tả, giờ/ngày, độ dài tối đa).
pub fn validate_shape(e: &mut Event) -> AppResult<()> {
    e.title = validate_title(&e.title)?;
    e.description = validate_description(&e.description)?;
    if e.is_all_day {
        if e.start_at.is_some() || e.end_at.is_some() {
            return Err(AppError::validation(
                "Event cả ngày không có giờ bắt đầu/kết thúc",
            ));
        }
        let (Some(s), Some(en)) = (e.start_date.as_deref(), e.end_date.as_deref()) else {
            return Err(AppError::validation(
                "Event cả ngày cần ngày bắt đầu và ngày kết thúc",
            ));
        };
        let (s, en) = (day(&validate_date(s)?)?, day(&validate_date(en)?)?);
        if en < s {
            return Err(AppError::validation("Ngày kết thúc phải từ ngày bắt đầu"));
        }
        if (en - s).num_days() + 1 > MAX_ALL_DAY_DAYS {
            return Err(AppError::validation("Event cả ngày tối đa 366 ngày"));
        }
    } else {
        if e.start_date.is_some() || e.end_date.is_some() {
            return Err(AppError::validation(
                "Event có giờ không có ngày bắt đầu/kết thúc",
            ));
        }
        let (Some(s), Some(en)) = (e.start_at.as_deref(), e.end_at.as_deref()) else {
            return Err(AppError::validation(
                "Event có giờ cần giờ bắt đầu và giờ kết thúc",
            ));
        };
        let (s, en) = (normalize_due_at(s)?, normalize_due_at(en)?);
        if en <= s {
            return Err(AppError::validation("Giờ kết thúc phải sau giờ bắt đầu"));
        }
        let ds = chrono::DateTime::parse_from_rfc3339(&s).map_err(|_| AppError::internal("ts"))?;
        let de = chrono::DateTime::parse_from_rfc3339(&en).map_err(|_| AppError::internal("ts"))?;
        if de - ds > chrono::Duration::days(MAX_TIMED_DAYS) {
            return Err(AppError::validation("Event có giờ dài tối đa 14 ngày"));
        }
        e.start_at = Some(s);
        e.end_at = Some(en);
    }
    Ok(())
}

impl EventPatch {
    pub fn apply(&self, e: &mut Event) {
        if let Some(v) = &self.title {
            e.title.clone_from(v);
        }
        if let Some(v) = &self.description {
            e.description.clone_from(v);
        }
        if let Some(v) = &self.calendar_id {
            e.calendar_id.clone_from(v);
        }
        if let Some(v) = self.is_all_day {
            e.is_all_day = v;
        }
        if let Some(v) = &self.start_at {
            e.start_at = non_empty(v);
        }
        if let Some(v) = &self.end_at {
            e.end_at = non_empty(v);
        }
        if let Some(v) = &self.start_date {
            e.start_date = non_empty(v);
        }
        if let Some(v) = &self.end_date {
            e.end_date = non_empty(v);
        }
    }
}

impl EventCreate {
    pub fn non_empty_task_id(&self) -> Option<String> {
        non_empty(&self.task_id)
    }
    pub fn non_empty_calendar_id(&self) -> Option<String> {
        non_empty(&self.calendar_id)
    }
}
