use serde::Serialize;
use ts_rs::TS;

use crate::modules::projects::domain::{NoteSummary, ProjectProgress};
use crate::modules::tasks::domain::Task;

/// Dữ liệu trang Today. v0.4 sẽ thêm trường `schedule` (không đổi các trường đã có).
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct TodayView {
    /// Ngày địa phương `YYYY-MM-DD` theo múi giờ trong Settings.
    pub date: String,
    pub today: Vec<Task>,
    pub overdue: Vec<Task>,
    pub upcoming: Vec<Task>,
    pub active_projects: Vec<ProjectProgress>,
    pub recent_notes: Vec<NoteSummary>,
}
