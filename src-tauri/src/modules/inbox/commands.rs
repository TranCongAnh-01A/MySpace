use chrono::Utc;
use tauri::{AppHandle, State};

use crate::clock::SystemClock;
use crate::db::Db;
use crate::error::AppResult;
use crate::modules::emit_entity_changed;
use crate::modules::settings::commands::SettingsState;
use crate::modules::tasks::domain::{Task, TaskCreate};
use crate::modules::tasks::infrastructure::SqliteTaskRepository;
use crate::modules::tasks::timectx::TimeCtx;

use super::application;
use super::domain::{InboxItem, InboxStatus};
use super::infrastructure::SqliteInboxRepository;

#[tauri::command]
pub fn inbox_list(db: State<'_, Db>, status: Option<InboxStatus>) -> AppResult<Vec<InboxItem>> {
    let conn = db.lock()?;
    application::list(&SqliteInboxRepository::new(&conn, &SystemClock), status)
}

#[tauri::command]
pub fn inbox_create(app: AppHandle, db: State<'_, Db>, content: String) -> AppResult<InboxItem> {
    let item = {
        let mut conn = db.lock()?;
        let tx = conn.transaction()?;
        let item = application::create(
            &SqliteInboxRepository::new(&tx, &SystemClock),
            &SystemClock,
            &content,
        )?;
        tx.commit()?;
        item
    };
    emit_entity_changed(&app, "inbox", vec![item.id.clone()]);
    Ok(item)
}

#[tauri::command]
pub fn inbox_update(
    app: AppHandle,
    db: State<'_, Db>,
    id: String,
    content: String,
) -> AppResult<InboxItem> {
    let item = {
        let mut conn = db.lock()?;
        let tx = conn.transaction()?;
        let item = application::update(
            &SqliteInboxRepository::new(&tx, &SystemClock),
            &id,
            &content,
        )?;
        tx.commit()?;
        item
    };
    emit_entity_changed(&app, "inbox", vec![item.id.clone()]);
    Ok(item)
}

/// Xoá mềm: mục vào Trash.
#[tauri::command]
pub fn inbox_delete(app: AppHandle, db: State<'_, Db>, id: String) -> AppResult<()> {
    {
        let mut conn = db.lock()?;
        let tx = conn.transaction()?;
        application::delete(&SqliteInboxRepository::new(&tx, &SystemClock), &id)?;
        tx.commit()?;
    }
    emit_entity_changed(&app, "inbox", vec![id]);
    Ok(())
}

#[tauri::command]
pub fn inbox_convert_to_task(
    app: AppHandle,
    db: State<'_, Db>,
    settings: State<'_, SettingsState>,
    id: String,
    task: TaskCreate,
) -> AppResult<Task> {
    let ctx = TimeCtx::new(&settings.get().timezone, Utc::now());
    let created = {
        let mut conn = db.lock()?;
        let tx = conn.transaction()?;
        let created = application::convert_to_task(
            &SqliteInboxRepository::new(&tx, &SystemClock),
            &SqliteTaskRepository::new(&tx, &SystemClock),
            &ctx,
            &id,
            &task,
        )?;
        tx.commit()?;
        created
    };
    emit_entity_changed(&app, "inbox", vec![id]);
    emit_entity_changed(&app, "task", vec![created.id.clone()]);
    Ok(created)
}
