use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub enum TrashKind {
    Task,
    Inbox,
    Project,
    Note,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct TrashItem {
    pub kind: TrashKind,
    pub id: String,
    pub title: String,
    pub deleted_at: String,
    /// Thời điểm mục bị xoá hẳn: `deletedAt` + `trashRetentionDays`.
    pub purge_at: String,
}
