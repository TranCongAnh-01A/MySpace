use tauri::{AppHandle, State};

use crate::clock::SystemClock;
use crate::db::Db;
use crate::error::AppResult;
use crate::modules::emit_entity_changed;

use super::application;
use super::domain::{InboxItem, InboxStatus};
use super::infrastructure::SqliteInboxRepository;

#[tauri::command]
pub fn inbox_list(db: State<'_, Db>, status: Option<InboxStatus>) -> AppResult<Vec<InboxItem>> {
    let conn = db.lock()?;
    application::list(&SqliteInboxRepository::new(&conn), status)
}

#[tauri::command]
pub fn inbox_create(app: AppHandle, db: State<'_, Db>, content: String) -> AppResult<InboxItem> {
    let item = {
        let conn = db.lock()?;
        application::create(&SqliteInboxRepository::new(&conn), &SystemClock, &content)?
    };
    emit_entity_changed(&app, "inbox", vec![item.id.clone()]);
    Ok(item)
}
