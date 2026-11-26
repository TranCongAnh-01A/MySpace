use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::{AppError, AppResult};
use crate::modules::areas::domain::validate_color;
pub use crate::modules::notes::domain::NoteSummary;
use crate::modules::tasks::domain::validate_date;

pub const MAX_NAME_CHARS: usize = 100;
pub const MAX_DESCRIPTION_CHARS: usize = 20_000;
pub const MAX_ICON_CHARS: usize = 40;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub enum ProjectStatus {
    Planned,
    Active,
    OnHold,
    Completed,
}

impl ProjectStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Planned => "Planned",
            Self::Active => "Active",
            Self::OnHold => "OnHold",
            Self::Completed => "Completed",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        [Self::Planned, Self::Active, Self::OnHold, Self::Completed]
            .into_iter()
            .find(|v| v.as_str() == s)
    }
}

/// Cách xử lý Task (và Note) của Project khi lưu trữ/xoá Project.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub enum ChildMode {
    /// Lưu trữ/xoá cả Task con cùng Project.
    WithChildren,
    /// Giữ Task, tách khỏi Project (Task nhận Area của Project nếu chưa có Area).
    Detach,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct Project {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub area_id: Option<String>,
    pub name: String,
    pub description: String,
    pub status: ProjectStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub start_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub target_date: Option<String>,
    pub sort_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub archived_at: Option<String>,
    #[ts(type = "number")]
    pub version: u64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct ProjectCreate {
    pub name: String,
    #[serde(default)]
    #[ts(optional)]
    pub description: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub area_id: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub status: Option<ProjectStatus>,
    #[serde(default)]
    #[ts(optional)]
    pub color: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub icon: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub start_date: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub target_date: Option<String>,
}

/// Trường xoá được: thiếu = giữ nguyên, `null` = xoá, có giá trị = đặt.
#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct ProjectPatch {
    #[serde(default)]
    #[ts(optional)]
    pub name: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub description: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub status: Option<ProjectStatus>,
    #[serde(default, with = "::serde_with::rust::double_option")]
    #[ts(optional, type = "string | null")]
    pub area_id: Option<Option<String>>,
    #[serde(default, with = "::serde_with::rust::double_option")]
    #[ts(optional, type = "string | null")]
    pub color: Option<Option<String>>,
    #[serde(default, with = "::serde_with::rust::double_option")]
    #[ts(optional, type = "string | null")]
    pub icon: Option<Option<String>>,
    #[serde(default, with = "::serde_with::rust::double_option")]
    #[ts(optional, type = "string | null")]
    pub start_date: Option<Option<String>>,
    #[serde(default, with = "::serde_with::rust::double_option")]
    #[ts(optional, type = "string | null")]
    pub target_date: Option<Option<String>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct ProjectProgress {
    pub project_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub color: Option<String>,
    pub done: u32,
    pub total: u32,
    /// Làm tròn 0–100; không có khi `total = 0`.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub percent: Option<u32>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct StatusCounts {
    pub todo: u32,
    pub in_progress: u32,
    pub review: u32,
    pub done: u32,
}

impl StatusCounts {
    pub fn total(&self) -> u32 {
        self.todo + self.in_progress + self.review + self.done
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct ProjectOverview {
    pub project: Project,
    pub progress: ProjectProgress,
    pub counts: StatusCounts,
    pub recent_notes: Vec<NoteSummary>,
}

// ---------- Kiểm tra ----------

pub fn validate_name(raw: &str) -> AppResult<String> {
    let name = raw.trim();
    if name.is_empty() {
        return Err(AppError::validation("Tên Project không được để trống"));
    }
    if name.chars().count() > MAX_NAME_CHARS {
        return Err(AppError::validation(format!(
            "Tên Project tối đa {MAX_NAME_CHARS} ký tự"
        )));
    }
    Ok(name.to_string())
}

pub fn validate_description(raw: &str) -> AppResult<String> {
    if raw.chars().count() > MAX_DESCRIPTION_CHARS {
        return Err(AppError::validation(format!(
            "Mô tả tối đa {MAX_DESCRIPTION_CHARS} ký tự"
        )));
    }
    Ok(raw.to_string())
}

/// Tên icon lucide: chỉ `[a-z0-9-]`, tối đa 40 ký tự. Chuỗi rỗng = không có icon.
pub fn validate_icon(raw: &str) -> AppResult<Option<String>> {
    let icon = raw.trim();
    if icon.is_empty() {
        return Ok(None);
    }
    let ok = icon.chars().count() <= MAX_ICON_CHARS
        && icon
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if !ok {
        return Err(AppError::validation(
            "Icon chỉ gồm a-z, 0-9, dấu gạch ngang (tối đa 40 ký tự)",
        ));
    }
    Ok(Some(icon.to_string()))
}

fn opt_date(raw: &Option<String>) -> AppResult<Option<String>> {
    match raw.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(s) => validate_date(s).map(Some),
        None => Ok(None),
    }
}

fn non_empty(raw: &Option<String>) -> Option<String> {
    raw.as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

impl Project {
    /// `area_id` chưa được kiểm tra tồn tại (việc của tầng application).
    pub fn new(
        id: String,
        input: &ProjectCreate,
        sort_key: String,
        now: String,
    ) -> AppResult<Self> {
        let project = Self {
            id,
            area_id: non_empty(&input.area_id),
            name: validate_name(&input.name)?,
            description: validate_description(input.description.as_deref().unwrap_or(""))?,
            status: input.status.unwrap_or(ProjectStatus::Active),
            color: input
                .color
                .as_deref()
                .map(validate_color)
                .transpose()?
                .flatten(),
            icon: input
                .icon
                .as_deref()
                .map(validate_icon)
                .transpose()?
                .flatten(),
            start_date: opt_date(&input.start_date)?,
            target_date: opt_date(&input.target_date)?,
            sort_key,
            archived_at: None,
            version: 1,
            created_at: now.clone(),
            updated_at: now,
        };
        project.validate_dates()?;
        Ok(project)
    }

    fn validate_dates(&self) -> AppResult<()> {
        if let (Some(s), Some(t)) = (&self.start_date, &self.target_date) {
            if t < s {
                return Err(AppError::validation(
                    "Ngày mục tiêu không được trước ngày bắt đầu",
                ));
            }
        }
        Ok(())
    }

    /// Áp patch; lỗi thì để nguyên Project.
    pub fn apply(&mut self, patch: &ProjectPatch) -> AppResult<()> {
        let mut next = self.clone();
        if let Some(v) = &patch.name {
            next.name = validate_name(v)?;
        }
        if let Some(v) = &patch.description {
            next.description = validate_description(v)?;
        }
        if let Some(v) = patch.status {
            next.status = v;
        }
        if let Some(v) = &patch.area_id {
            next.area_id = non_empty(v);
        }
        if let Some(v) = &patch.color {
            next.color = v.as_deref().map(validate_color).transpose()?.flatten();
        }
        if let Some(v) = &patch.icon {
            next.icon = v.as_deref().map(validate_icon).transpose()?.flatten();
        }
        if let Some(v) = &patch.start_date {
            next.start_date = opt_date(v)?;
        }
        if let Some(v) = &patch.target_date {
            next.target_date = opt_date(v)?;
        }
        next.validate_dates()?;
        *self = next;
        Ok(())
    }
}

impl ProjectProgress {
    pub fn new(project: &Project, done: u32, total: u32) -> Self {
        Self {
            project_id: project.id.clone(),
            name: project.name.clone(),
            color: project.color.clone(),
            done,
            total,
            // round(done * 100 / total) bằng số nguyên; .5 làm tròn lên.
            percent: (total > 0).then(|| (done * 200 + total) / (total * 2)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ErrorCode;

    fn input(name: &str) -> ProjectCreate {
        ProjectCreate {
            name: name.into(),
            ..Default::default()
        }
    }

    fn mk(i: &ProjectCreate) -> AppResult<Project> {
        Project::new("1".into(), i, "V".into(), "t".into())
    }

    #[test]
    fn validates_name_description_color_icon() {
        assert_eq!(mk(&input("  GG  ")).unwrap().name, "GG");
        for bad in ["", "  "] {
            assert_eq!(mk(&input(bad)).unwrap_err().code, ErrorCode::Validation);
        }
        assert!(mk(&input(&"a".repeat(100))).is_ok());
        assert!(mk(&input(&"a".repeat(101))).is_err());
        let mut i = input("a");
        i.description = Some("x".repeat(20_001));
        assert!(mk(&i).is_err());
        i.description = Some("x".repeat(20_000));
        assert!(mk(&i).is_ok());
        let mut i = input("a");
        i.color = Some("#A08BDF".into());
        i.icon = Some("gamepad-2".into());
        let p = mk(&i).unwrap();
        assert_eq!(p.color.as_deref(), Some("#A08BDF"));
        assert_eq!(p.icon.as_deref(), Some("gamepad-2"));
        for bad in ["Game", "a b", "a_b", &"a".repeat(41)] {
            i.icon = Some(bad.into());
            assert!(mk(&i).is_err(), "{bad}");
        }
        i.icon = None;
        i.color = Some("red".into());
        assert!(mk(&i).is_err());
    }

    #[test]
    fn target_date_cannot_precede_start_date() {
        let mut i = input("a");
        i.start_date = Some("2026-11-10".into());
        i.target_date = Some("2026-11-09".into());
        assert_eq!(mk(&i).unwrap_err().code, ErrorCode::Validation);
        i.target_date = Some("2026-11-10".into());
        assert!(mk(&i).is_ok());
        i.target_date = Some("11/10".into());
        assert!(mk(&i).is_err());
    }

    #[test]
    fn patch_is_three_state_and_atomic() {
        let mut i = input("a");
        i.color = Some("#112233".into());
        i.icon = Some("star".into());
        i.start_date = Some("2026-11-01".into());
        let mut p = mk(&i).unwrap();
        let patch: ProjectPatch =
            serde_json::from_str(r#"{"name":"b","color":null,"targetDate":"2026-12-01"}"#).unwrap();
        p.apply(&patch).unwrap();
        assert_eq!(p.name, "b");
        assert_eq!(p.color, None, "null = xoá");
        assert_eq!(p.icon.as_deref(), Some("star"), "thiếu = giữ nguyên");
        assert_eq!(p.target_date.as_deref(), Some("2026-12-01"));
        // Patch lỗi thì không đổi gì.
        let before = p.clone();
        let bad: ProjectPatch =
            serde_json::from_str(r#"{"name":"c","targetDate":"2026-10-01"}"#).unwrap();
        assert!(p.apply(&bad).is_err());
        assert_eq!(p, before);
    }

    #[test]
    fn percent_rounds_and_is_absent_without_tasks() {
        let p = mk(&input("a")).unwrap();
        assert_eq!(ProjectProgress::new(&p, 0, 0).percent, None);
        assert_eq!(ProjectProgress::new(&p, 26, 40).percent, Some(65));
        assert_eq!(ProjectProgress::new(&p, 1, 3).percent, Some(33));
        assert_eq!(ProjectProgress::new(&p, 2, 3).percent, Some(67));
        assert_eq!(ProjectProgress::new(&p, 3, 3).percent, Some(100));
        assert_eq!(ProjectProgress::new(&p, 0, 5).percent, Some(0));
    }
}
