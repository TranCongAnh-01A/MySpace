use chrono::{DateTime, Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::{AppError, AppResult};
use crate::modules::tasks::timectx::{iso, TimeCtx};

/// Lần nhắc trễ quá khoảng này so với `trigger_at` thì thành `Missed`, không bắn.
pub const LATE_GRACE_MINUTES: i64 = 5;
/// Giờ địa phương dùng làm "thời điểm gốc" của hạn chỉ có ngày / Event cả ngày.
pub const DEFAULT_ANCHOR_TIME: &str = "09:00:00";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub enum ReminderStatus {
    Pending,
    Sent,
    Dismissed,
    Missed,
}

impl ReminderStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "Pending",
            Self::Sent => "Sent",
            Self::Dismissed => "Dismissed",
            Self::Missed => "Missed",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        Some(match s {
            "Pending" => Self::Pending,
            "Sent" => Self::Sent,
            "Dismissed" => Self::Dismissed,
            "Missed" => Self::Missed,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct Reminder {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub task_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub event_id: Option<String>,
    pub trigger_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub offset_minutes: Option<u32>,
    pub status: ReminderStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub sent_at: Option<String>,
}

/// Đúng một trong `task_id`/`event_id`; đúng một trong `offset_minutes`/`trigger_at`.
#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct ReminderSet {
    #[serde(default)]
    #[ts(optional)]
    pub task_id: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub event_id: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub offset_minutes: Option<u32>,
    #[serde(default)]
    #[ts(optional)]
    pub trigger_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct MissedReminder {
    pub reminder: Reminder,
    pub title: String,
    /// Thời điểm gốc (hạn hoặc giờ bắt đầu), UTC.
    pub due_label_at: String,
}

/// Payload của event `reminder-fired`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct ReminderFired {
    pub reminder_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub task_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub event_id: Option<String>,
}

/// Payload của event `navigate`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct Navigate {
    pub route: String,
}

/// Mốc gốc của hạn Task: `due_at`, hoặc 09:00 địa phương của `due_date`.
pub fn task_anchor(due_date: Option<&str>, due_at: Option<&str>, ctx: &TimeCtx) -> Option<String> {
    if let Some(at) = due_at {
        return Some(at.to_string());
    }
    nine_am(due_date?, ctx)
}

/// Mốc gốc của Event: `start_at`, hoặc 09:00 địa phương của `start_date`.
pub fn event_anchor(
    start_at: Option<&str>,
    start_date: Option<&str>,
    ctx: &TimeCtx,
) -> Option<String> {
    if let Some(at) = start_at {
        return Some(at.to_string());
    }
    nine_am(start_date?, ctx)
}

fn nine_am(date: &str, ctx: &TimeCtx) -> Option<String> {
    let day = NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()?;
    ctx.utc_from_local(day, DEFAULT_ANCHOR_TIME)
}

/// `trigger_at = gốc − offset`.
pub fn trigger_from_offset(anchor: &str, offset_minutes: u32) -> AppResult<String> {
    let base = DateTime::parse_from_rfc3339(anchor)
        .map_err(|_| AppError::validation("Thời điểm gốc không hợp lệ"))?
        .with_timezone(&Utc);
    Ok(iso(base - Duration::minutes(i64::from(offset_minutes))))
}

/// Chuẩn hoá `triggerAt` do người dùng nhập về ISO UTC dạng mili giây.
pub fn normalize_trigger(at: &str) -> AppResult<String> {
    DateTime::parse_from_rfc3339(at)
        .map(|t| iso(t.with_timezone(&Utc)))
        .map_err(|_| AppError::validation("triggerAt phải là thời điểm ISO 8601"))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    /// Chưa đến giờ.
    Wait,
    Fire,
    Missed,
}

/// Quyết định cho một lần nhắc `Pending` (logic thuần, dùng đồng hồ truyền vào).
pub fn decide(trigger_at: &str, now: DateTime<Utc>, paused: bool) -> Decision {
    let Ok(trigger) = DateTime::parse_from_rfc3339(trigger_at) else {
        return Decision::Missed;
    };
    let trigger = trigger.with_timezone(&Utc);
    if trigger > now {
        Decision::Wait
    } else if paused || now - trigger > Duration::minutes(LATE_GRACE_MINUTES) {
        Decision::Missed
    } else {
        Decision::Fire
    }
}
