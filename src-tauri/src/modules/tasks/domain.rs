use chrono::DateTime;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::{AppError, AppResult};
use crate::reminders::domain::Reminder;

use super::timectx::{iso, parse_date, TimeCtx};

pub const MAX_TITLE_CHARS: usize = 500;
pub const MAX_DESCRIPTION_CHARS: usize = 20_000;
pub const MAX_ESTIMATED_MINUTES: u32 = 10_080;
pub const MAX_CHECKLIST_CHARS: usize = 500;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub enum TaskStatus {
    Todo,
    InProgress,
    Review,
    Done,
}

impl TaskStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Todo => "Todo",
            Self::InProgress => "InProgress",
            Self::Review => "Review",
            Self::Done => "Done",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        [Self::Todo, Self::InProgress, Self::Review, Self::Done]
            .into_iter()
            .find(|v| v.as_str() == s)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub enum Priority {
    Urgent,
    High,
    Medium,
    Low,
}

impl Priority {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Urgent => "Urgent",
            Self::High => "High",
            Self::Medium => "Medium",
            Self::Low => "Low",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        [Self::Urgent, Self::High, Self::Medium, Self::Low]
            .into_iter()
            .find(|v| v.as_str() == s)
    }

    /// Nhỏ hơn = quan trọng hơn.
    pub fn rank(self) -> u8 {
        match self {
            Self::Urgent => 0,
            Self::High => 1,
            Self::Medium => 2,
            Self::Low => 3,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub enum Weekday {
    Mo,
    Tu,
    We,
    Th,
    Fr,
    Sa,
    Su,
}

impl Weekday {
    const ALL: [Self; 7] = [
        Self::Mo,
        Self::Tu,
        Self::We,
        Self::Th,
        Self::Fr,
        Self::Sa,
        Self::Su,
    ];

    /// Thứ Hai = 0 … Chủ nhật = 6.
    pub fn index(self) -> u8 {
        match self {
            Self::Mo => 0,
            Self::Tu => 1,
            Self::We => 2,
            Self::Th => 3,
            Self::Fr => 4,
            Self::Sa => 5,
            Self::Su => 6,
        }
    }

    pub fn as_str(self) -> &'static str {
        ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"][usize::from(self.index())]
    }

    pub fn parse(s: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|w| w.as_str() == s)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub enum Frequency {
    Daily,
    Weekly,
    Monthly,
}

impl Frequency {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Daily => "Daily",
            Self::Weekly => "Weekly",
            Self::Monthly => "Monthly",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        [Self::Daily, Self::Weekly, Self::Monthly]
            .into_iter()
            .find(|v| v.as_str() == s)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct Recurrence {
    pub frequency: Frequency,
    pub interval: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub by_weekday: Option<Vec<Weekday>>,
}

impl Recurrence {
    /// Chuẩn hoá: `byWeekday` chỉ dùng với `Weekly`, danh sách rỗng coi như không có.
    pub fn validated(mut self) -> AppResult<Self> {
        if !(1..=365).contains(&self.interval) {
            return Err(AppError::validation("Chu kỳ lặp từ 1 đến 365"));
        }
        if self.by_weekday.as_ref().is_some_and(Vec::is_empty) {
            self.by_weekday = None;
        }
        if self.by_weekday.is_some() && self.frequency != Frequency::Weekly {
            return Err(AppError::validation(
                "Chỉ lặp theo thứ khi tần suất là hằng tuần",
            ));
        }
        Ok(self)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct Task {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub area_id: Option<String>,
    pub title: String,
    pub description: String,
    pub status: TaskStatus,
    pub priority: Priority,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub start_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub due_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub due_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub estimated_minutes: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub completed_at: Option<String>,
    pub sort_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub recurrence: Option<Recurrence>,
    pub tag_ids: Vec<String>,
    pub checklist_done: u32,
    pub checklist_total: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub archived_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub deleted_at: Option<String>,
    #[ts(type = "number")]
    pub version: u64,
    pub created_at: String,
    pub updated_at: String,
    // Nội bộ, không ra IPC.
    #[serde(skip)]
    #[ts(skip)]
    pub previous_status: Option<TaskStatus>,
    #[serde(skip)]
    #[ts(skip)]
    pub series_id: Option<String>,
    #[serde(skip)]
    #[ts(skip)]
    pub occurrence_date: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct ChecklistItem {
    pub id: String,
    pub task_id: String,
    pub content: String,
    pub is_done: bool,
    pub sort_key: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct TaskDetail {
    pub task: Task,
    pub checklist: Vec<ChecklistItem>,
    /// Rỗng tới v0.5 (Notes).
    pub note_ids: Vec<String>,
    pub reminders: Vec<Reminder>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct TaskStatusResult {
    pub task: Task,
    /// Lần lặp tiếp theo vừa được sinh (nếu có).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub next: Option<Task>,
}

#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct TaskCreate {
    pub title: String,
    #[serde(default)]
    #[ts(optional)]
    pub description: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub project_id: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub area_id: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub status: Option<TaskStatus>,
    #[serde(default)]
    #[ts(optional)]
    pub priority: Option<Priority>,
    #[serde(default)]
    #[ts(optional)]
    pub start_date: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub due_date: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub due_at: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub estimated_minutes: Option<u32>,
    #[serde(default)]
    #[ts(optional)]
    pub tag_ids: Option<Vec<String>>,
    #[serde(default)]
    #[ts(optional)]
    pub recurrence: Option<Recurrence>,
}

/// Trường xoá được: thiếu = giữ nguyên, `null` = xoá, có giá trị = đặt.
#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct TaskPatch {
    #[serde(default)]
    #[ts(optional)]
    pub title: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub description: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub priority: Option<Priority>,
    #[serde(default, with = "::serde_with::rust::double_option")]
    #[ts(optional, type = "string | null")]
    pub project_id: Option<Option<String>>,
    #[serde(default, with = "::serde_with::rust::double_option")]
    #[ts(optional, type = "string | null")]
    pub area_id: Option<Option<String>>,
    #[serde(default, with = "::serde_with::rust::double_option")]
    #[ts(optional, type = "string | null")]
    pub start_date: Option<Option<String>>,
    #[serde(default, with = "::serde_with::rust::double_option")]
    #[ts(optional, type = "string | null")]
    pub due_date: Option<Option<String>>,
    #[serde(default, with = "::serde_with::rust::double_option")]
    #[ts(optional, type = "string | null")]
    pub due_at: Option<Option<String>>,
    #[serde(default, with = "::serde_with::rust::double_option")]
    #[ts(optional, type = "number | null")]
    pub estimated_minutes: Option<Option<u32>>,
    #[serde(default, with = "::serde_with::rust::double_option")]
    #[ts(optional = nullable, as = "Option<Recurrence>")]
    pub recurrence: Option<Option<Recurrence>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub enum DueFilter {
    Today,
    Overdue,
    Next7,
    None,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub enum TaskSort {
    Manual,
    DueDate,
    Priority,
    Created,
}

#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct TaskFilter {
    #[serde(default)]
    #[ts(optional)]
    pub status: Option<Vec<TaskStatus>>,
    #[serde(default)]
    #[ts(optional)]
    pub priority: Option<Vec<Priority>>,
    #[serde(default)]
    #[ts(optional)]
    pub project_id: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub area_id: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub tag_id: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub due: Option<DueFilter>,
    /// `true` = chỉ Task đã lưu trữ; mặc định chỉ Task chưa lưu trữ.
    #[serde(default)]
    #[ts(optional)]
    pub archived: Option<bool>,
    #[serde(default)]
    #[ts(optional)]
    pub sort: Option<TaskSort>,
}

// ---------- Kiểm tra ----------

pub fn validate_title(raw: &str) -> AppResult<String> {
    let t = raw.trim();
    if t.is_empty() {
        return Err(AppError::validation("Tiêu đề không được để trống"));
    }
    if t.chars().count() > MAX_TITLE_CHARS {
        return Err(AppError::validation(format!(
            "Tiêu đề tối đa {MAX_TITLE_CHARS} ký tự"
        )));
    }
    Ok(t.to_string())
}

pub fn validate_description(raw: &str) -> AppResult<String> {
    if raw.chars().count() > MAX_DESCRIPTION_CHARS {
        return Err(AppError::validation(format!(
            "Mô tả tối đa {MAX_DESCRIPTION_CHARS} ký tự"
        )));
    }
    Ok(raw.to_string())
}

pub fn validate_estimated(minutes: u32) -> AppResult<u32> {
    if !(1..=MAX_ESTIMATED_MINUTES).contains(&minutes) {
        return Err(AppError::validation(format!(
            "Thời lượng ước tính từ 1 đến {MAX_ESTIMATED_MINUTES} phút"
        )));
    }
    Ok(minutes)
}

pub fn validate_date(raw: &str) -> AppResult<String> {
    parse_date(raw.trim())
        .map(|_| raw.trim().to_string())
        .ok_or_else(|| AppError::validation("Ngày phải có dạng YYYY-MM-DD"))
}

/// Chuẩn hoá mốc giờ về ISO UTC có mili-giây (so sánh chuỗi được).
pub fn normalize_due_at(raw: &str) -> AppResult<String> {
    DateTime::parse_from_rfc3339(raw.trim())
        .map(|t| iso(t.with_timezone(&chrono::Utc)))
        .map_err(|_| AppError::validation("Giờ hạn phải có dạng ISO 8601, VD 2026-11-26T09:00:00Z"))
}

pub fn validate_checklist_content(raw: &str) -> AppResult<String> {
    let c = raw.trim();
    if c.is_empty() {
        return Err(AppError::validation(
            "Nội dung checklist không được để trống",
        ));
    }
    if c.chars().count() > MAX_CHECKLIST_CHARS {
        return Err(AppError::validation(format!(
            "Checklist tối đa {MAX_CHECKLIST_CHARS} ký tự"
        )));
    }
    Ok(c.to_string())
}

impl Task {
    /// Ngày của hạn (theo múi giờ địa phương nếu hạn có giờ).
    pub fn due_day(&self, ctx: &TimeCtx) -> Option<String> {
        match (&self.due_date, &self.due_at) {
            (Some(d), _) => Some(d.clone()),
            (None, Some(at)) => ctx.local_date(at).map(super::timectx::fmt_date),
            _ => None,
        }
    }

    /// Các ràng buộc giữa các trường (sau khi đã áp patch).
    pub fn validate_shape(&self, ctx: &TimeCtx) -> AppResult<()> {
        if self.due_date.is_some() && self.due_at.is_some() {
            return Err(AppError::validation(
                "Chỉ được đặt hạn theo ngày hoặc theo giờ, không cả hai",
            ));
        }
        if self.project_id.is_some() && self.area_id.is_some() {
            return Err(AppError::validation(
                "Task thuộc Project dùng Area của Project, không đặt cả hai",
            ));
        }
        if let (Some(start), Some(due)) = (&self.start_date, self.due_day(ctx)) {
            if *start > due {
                return Err(AppError::validation(
                    "Ngày bắt đầu phải trước hoặc bằng hạn",
                ));
            }
        }
        if self.recurrence.is_some() && self.due_day(ctx).is_none() {
            return Err(AppError::validation("Task lặp cần có hạn"));
        }
        Ok(())
    }

    /// Đổi trạng thái theo quy tắc: sang Done thì đặt `completed_at` và nhớ trạng thái trước;
    /// rời Done thì xoá `completed_at`. Trả `false` nếu không có gì đổi.
    pub fn set_status(&mut self, new: TaskStatus, now_iso: &str) -> bool {
        if self.status == new {
            return false;
        }
        if new == TaskStatus::Done {
            self.previous_status = Some(self.status);
            self.completed_at = Some(now_iso.to_string());
        } else if self.status == TaskStatus::Done {
            self.completed_at = None;
        }
        self.status = new;
        true
    }
}

#[cfg(test)]
pub fn sample_task(id: &str) -> Task {
    Task {
        id: id.into(),
        project_id: None,
        area_id: None,
        title: "T".into(),
        description: String::new(),
        status: TaskStatus::Todo,
        priority: Priority::Medium,
        start_date: None,
        due_date: None,
        due_at: None,
        estimated_minutes: None,
        completed_at: None,
        sort_key: "V".into(),
        recurrence: None,
        tag_ids: vec![],
        checklist_done: 0,
        checklist_total: 0,
        archived_at: None,
        deleted_at: None,
        version: 1,
        created_at: "t".into(),
        updated_at: "t".into(),
        previous_status: None,
        series_id: None,
        occurrence_date: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{TimeZone, Utc};

    fn ctx() -> TimeCtx {
        TimeCtx::new(
            "Asia/Ho_Chi_Minh",
            Utc.with_ymd_and_hms(2026, 11, 26, 3, 0, 0).unwrap(),
        )
    }

    #[test]
    fn done_and_reopen_rules() {
        let mut t = sample_task("1");
        t.status = TaskStatus::Review;
        assert!(t.set_status(TaskStatus::Done, "now"));
        assert_eq!(t.completed_at.as_deref(), Some("now"));
        assert_eq!(t.previous_status, Some(TaskStatus::Review));
        // Mở lại về trạng thái được truyền vào; previous_status giữ làm gợi ý.
        assert!(t.set_status(TaskStatus::InProgress, "later"));
        assert_eq!(t.completed_at, None);
        assert_eq!(t.previous_status, Some(TaskStatus::Review));
        assert!(!t.set_status(TaskStatus::InProgress, "later"));
        // Todo → Done → Todo.
        let mut u = sample_task("2");
        u.set_status(TaskStatus::Done, "a");
        assert_eq!(u.previous_status, Some(TaskStatus::Todo));
        u.set_status(TaskStatus::Todo, "b");
        assert!(u.completed_at.is_none());
    }

    #[test]
    fn shape_rules() {
        let c = ctx();
        let mut t = sample_task("1");
        assert!(t.validate_shape(&c).is_ok());
        t.due_date = Some("2026-12-01".into());
        t.due_at = Some("2026-12-01T01:00:00.000Z".into());
        assert!(t.validate_shape(&c).is_err());
        t.due_at = None;
        t.project_id = Some("p".into());
        t.area_id = Some("a".into());
        assert!(t.validate_shape(&c).is_err());
        t.area_id = None;
        t.start_date = Some("2026-12-02".into());
        assert!(t.validate_shape(&c).is_err());
        t.start_date = Some("2026-12-01".into());
        assert!(t.validate_shape(&c).is_ok());
        // Hạn theo giờ so với ngày địa phương: 20:00 UTC ngày 30/11 = 03:00 ngày 1/12 ở VN.
        t.due_date = None;
        t.due_at = Some("2026-11-30T20:00:00.000Z".into());
        assert_eq!(t.due_day(&c).as_deref(), Some("2026-12-01"));
        assert!(t.validate_shape(&c).is_ok());
        t.recurrence = Some(Recurrence {
            frequency: Frequency::Daily,
            interval: 1,
            by_weekday: None,
        });
        assert!(t.validate_shape(&c).is_ok());
        t.due_at = None;
        assert!(t.validate_shape(&c).is_err(), "Task lặp cần có hạn");
    }

    #[test]
    fn field_validators() {
        assert!(validate_title("  ").is_err());
        assert!(validate_title(&"a".repeat(500)).is_ok());
        assert!(validate_title(&"a".repeat(501)).is_err());
        assert!(validate_description(&"a".repeat(20_000)).is_ok());
        assert!(validate_description(&"a".repeat(20_001)).is_err());
        assert!(validate_estimated(0).is_err());
        assert!(validate_estimated(1).is_ok());
        assert!(validate_estimated(10_080).is_ok());
        assert!(validate_estimated(10_081).is_err());
        assert!(validate_date("2026-02-29").is_err());
        assert!(validate_date("2028-02-29").is_ok());
        assert_eq!(
            normalize_due_at("2026-11-26T16:00:00+07:00").unwrap(),
            "2026-11-26T09:00:00.000Z"
        );
        assert!(normalize_due_at("mai").is_err());
        assert!(validate_checklist_content(&"a".repeat(501)).is_err());
    }

    #[test]
    fn recurrence_validation() {
        let mk = |f, i, by: Option<Vec<Weekday>>| Recurrence {
            frequency: f,
            interval: i,
            by_weekday: by,
        };
        assert!(mk(Frequency::Daily, 0, None).validated().is_err());
        assert!(mk(Frequency::Daily, 366, None).validated().is_err());
        assert!(mk(Frequency::Daily, 1, Some(vec![Weekday::Mo]))
            .validated()
            .is_err());
        let r = mk(Frequency::Weekly, 1, Some(vec![])).validated().unwrap();
        assert_eq!(r.by_weekday, None);
    }

    #[test]
    fn patch_distinguishes_missing_null_and_value() {
        let p: TaskPatch = serde_json::from_str(r#"{"title":"x"}"#).unwrap();
        assert_eq!(p.due_date, None);
        let p: TaskPatch = serde_json::from_str(r#"{"dueDate":null,"projectId":"p"}"#).unwrap();
        assert_eq!(p.due_date, Some(None));
        assert_eq!(p.project_id, Some(Some("p".to_string())));
        let p: TaskPatch = serde_json::from_str(r#"{"recurrence":null}"#).unwrap();
        assert_eq!(p.recurrence, Some(None));
    }

    #[test]
    fn task_serializes_to_contract_shape() {
        let json = serde_json::to_value(sample_task("1")).unwrap();
        assert!(json.get("projectId").is_none());
        assert!(json.get("previousStatus").is_none());
        assert_eq!(json["tagIds"], serde_json::json!([]));
        assert_eq!(json["checklistTotal"], 0);
        assert_eq!(json["version"], 1);
    }
}
