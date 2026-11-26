pub mod areas;
pub mod inbox;
pub mod search;
pub mod settings;
pub mod tags;
pub mod tasks;
pub mod trash;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use ts_rs::TS;

/// Payload của event `entity-changed`: frontend invalidate query theo `entity`.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct EntityChanged {
    pub entity: String,
    pub ids: Vec<String>,
}

/// Phát `entity-changed` tới mọi cửa sổ. Lỗi phát event không làm hỏng command.
pub fn emit_entity_changed(app: &AppHandle, entity: &str, ids: Vec<String>) {
    let payload = EntityChanged {
        entity: entity.to_string(),
        ids,
    };
    if let Err(e) = app.emit("entity-changed", payload) {
        tracing::warn!(entity, error = %e, "không phát được entity-changed");
    }
}
