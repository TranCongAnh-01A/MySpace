use tauri::{AppHandle, State};

use crate::clock::SystemClock;
use crate::db::Db;
use crate::error::AppResult;
use crate::modules::emit_entity_changed;

use super::application;
use super::domain::{Tag, TagCreate, TagPatch};
use super::infrastructure::SqliteTagRepository;

#[tauri::command]
pub fn tag_list(db: State<'_, Db>) -> AppResult<Vec<Tag>> {
    let conn = db.lock()?;
    application::list(&SqliteTagRepository::new(&conn, &SystemClock))
}

#[tauri::command]
pub fn tag_create(app: AppHandle, db: State<'_, Db>, input: TagCreate) -> AppResult<Tag> {
    let tag = {
        let mut conn = db.lock()?;
        let tx = conn.transaction()?;
        let tag = application::create(&SqliteTagRepository::new(&tx, &SystemClock), &input)?;
        tx.commit()?;
        tag
    };
    emit_entity_changed(&app, "tag", vec![tag.id.clone()]);
    Ok(tag)
}

#[tauri::command]
pub fn tag_update(
    app: AppHandle,
    db: State<'_, Db>,
    id: String,
    patch: TagPatch,
) -> AppResult<Tag> {
    let tag = {
        let mut conn = db.lock()?;
        let tx = conn.transaction()?;
        let tag = application::update(&SqliteTagRepository::new(&tx, &SystemClock), &id, &patch)?;
        tx.commit()?;
        tag
    };
    emit_entity_changed(&app, "tag", vec![tag.id.clone()]);
    Ok(tag)
}

/// Xoá mềm tag; các liên kết với Task bị gỡ nên Task cũng cần làm mới.
#[tauri::command]
pub fn tag_delete(app: AppHandle, db: State<'_, Db>, id: String) -> AppResult<()> {
    {
        let mut conn = db.lock()?;
        let tx = conn.transaction()?;
        application::delete(&SqliteTagRepository::new(&tx, &SystemClock), &id)?;
        tx.commit()?;
    }
    emit_entity_changed(&app, "tag", vec![id]);
    emit_entity_changed(&app, "task", vec![]);
    Ok(())
}
