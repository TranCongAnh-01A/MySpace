use tauri::{AppHandle, State};

use crate::clock::SystemClock;
use crate::db::Db;
use crate::error::AppResult;
use crate::modules::emit_entity_changed;

use super::application;
use super::domain::{Area, AreaCreate, AreaPatch};
use super::infrastructure::SqliteAreaRepository;

#[tauri::command]
pub fn area_list(db: State<'_, Db>) -> AppResult<Vec<Area>> {
    let conn = db.lock()?;
    application::list(&SqliteAreaRepository::new(&conn, &SystemClock))
}

#[tauri::command]
pub fn area_create(app: AppHandle, db: State<'_, Db>, input: AreaCreate) -> AppResult<Area> {
    let area = {
        let mut conn = db.lock()?;
        let tx = conn.transaction()?;
        let area = application::create(&SqliteAreaRepository::new(&tx, &SystemClock), &input)?;
        tx.commit()?;
        area
    };
    emit_entity_changed(&app, "area", vec![area.id.clone()]);
    Ok(area)
}

#[tauri::command]
pub fn area_update(
    app: AppHandle,
    db: State<'_, Db>,
    id: String,
    patch: AreaPatch,
) -> AppResult<Area> {
    let area = {
        let mut conn = db.lock()?;
        let tx = conn.transaction()?;
        let area = application::update(&SqliteAreaRepository::new(&tx, &SystemClock), &id, &patch)?;
        tx.commit()?;
        area
    };
    emit_entity_changed(&app, "area", vec![area.id.clone()]);
    Ok(area)
}

#[tauri::command]
pub fn area_reorder(
    app: AppHandle,
    db: State<'_, Db>,
    id: String,
    before_id: Option<String>,
    after_id: Option<String>,
) -> AppResult<Area> {
    let area = {
        let mut conn = db.lock()?;
        let tx = conn.transaction()?;
        let area = application::reorder(
            &SqliteAreaRepository::new(&tx, &SystemClock),
            &id,
            before_id.as_deref(),
            after_id.as_deref(),
        )?;
        tx.commit()?;
        area
    };
    emit_entity_changed(&app, "area", vec![area.id.clone()]);
    Ok(area)
}

/// Xoá mềm Area; Project/Task đang trỏ tới được tách ra trong cùng transaction.
#[tauri::command]
pub fn area_delete(app: AppHandle, db: State<'_, Db>, id: String) -> AppResult<()> {
    {
        let mut conn = db.lock()?;
        let tx = conn.transaction()?;
        application::delete(&SqliteAreaRepository::new(&tx, &SystemClock), &id)?;
        tx.commit()?;
    }
    emit_entity_changed(&app, "area", vec![id]);
    Ok(())
}
