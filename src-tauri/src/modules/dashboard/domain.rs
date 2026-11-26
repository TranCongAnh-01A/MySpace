use serde::Serialize;
use ts_rs::TS;

use crate::modules::calendar::domain::CalendarItem;
use crate::modules::notes::domain::NoteSummary;
use crate::modules::projects::domain::ProjectProgress;
use crate::modules::tasks::domain::Task;

/// Dữ liệu trang Today.
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
    /// Event (gồm time block) chồng lên hôm nay, cả ngày xếp trước; không gồm deadline.
    pub schedule: Vec<CalendarItem>,
}
