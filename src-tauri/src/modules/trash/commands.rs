use tauri::{AppHandle, State};

use crate::clock::SystemClock;
use crate::db::Db;
use crate::error::AppResult;
use crate::modules::emit_entity_changed;
use crate::modules::settings::commands::SettingsState;

use super::application;
use super::domain::{TrashItem, TrashKind};

#[tauri::command]
pub fn trash_list(
    db: State<'_, Db>,
    settings: State<'_, SettingsState>,
) -> AppResult<Vec<TrashItem>> {
    let conn = db.lock()?;
    application::list(&conn, settings.get().trash_retention_days)
}

#[tauri::command]
pub fn trash_restore(
    app: AppHandle,
    db: State<'_, Db>,
    kind: TrashKind,
    id: String,
) -> AppResult<()> {
    {
        let mut conn = db.lock()?;
        let tx = conn.transaction()?;
        application::restore(&tx, &SystemClock, kind, &id)?;
        tx.commit()?;
    }
    let entity = match kind {
        TrashKind::Task => "task",
        TrashKind::Inbox => "inbox",
        TrashKind::Project => "project",
        TrashKind::Note => "note",
    };
    emit_entity_changed(&app, entity, vec![id]);
    if kind == TrashKind::Project {
        // Khôi phục Project kéo theo các Task bị xoá cùng lúc.
        emit_entity_changed(&app, "task", vec![]);
        emit_entity_changed(&app, "note", vec![]);
    }
    Ok(())
}

/// Xoá hẳn mọi mục trong Trash (không khôi phục được).
#[tauri::command]
pub fn trash_empty(app: AppHandle, db: State<'_, Db>) -> AppResult<()> {
    {
        let mut conn = db.lock()?;
        let tx = conn.transaction()?;
        application::empty(&tx, &SystemClock)?;
        tx.commit()?;
    }
    emit_entity_changed(&app, "task", vec![]);
    emit_entity_changed(&app, "inbox", vec![]);
    emit_entity_changed(&app, "project", vec![]);
    emit_entity_changed(&app, "note", vec![]);
    Ok(())
}
