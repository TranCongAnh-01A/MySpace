use tauri::{AppHandle, State};

use crate::clock::{Clock, SystemClock};
use crate::db::Db;
use crate::error::AppResult;
use crate::modules::emit_entity_changed;

use super::application;
use super::domain::{ChildMode, Project, ProjectCreate, ProjectOverview, ProjectPatch};
use super::infrastructure::SqliteProjectRepository;

/// Chạy `f` trong một transaction; thành công thì commit.
fn in_tx<T>(db: &Db, f: impl FnOnce(&SqliteProjectRepository<'_>) -> AppResult<T>) -> AppResult<T> {
    let mut conn = db.lock()?;
    let tx = conn.transaction()?;
    let out = f(&SqliteProjectRepository::new(&tx, &SystemClock))?;
    tx.commit()?;
    Ok(out)
}

#[tauri::command]
pub fn project_list(db: State<'_, Db>, archived: Option<bool>) -> AppResult<Vec<Project>> {
    let conn = db.lock()?;
    application::list(
        &SqliteProjectRepository::new(&conn, &SystemClock),
        archived == Some(true),
    )
}

#[tauri::command]
pub fn project_get_overview(db: State<'_, Db>, id: String) -> AppResult<ProjectOverview> {
    let conn = db.lock()?;
    application::get_overview(&SqliteProjectRepository::new(&conn, &SystemClock), &id)
}

#[tauri::command]
pub fn project_create(
    app: AppHandle,
    db: State<'_, Db>,
    input: ProjectCreate,
) -> AppResult<Project> {
    let project = in_tx(&db, |repo| {
        application::create(repo, &SystemClock.now_iso(), &input)
    })?;
    emit_entity_changed(&app, "project", vec![project.id.clone()]);
    Ok(project)
}

#[tauri::command]
pub fn project_update(
    app: AppHandle,
    db: State<'_, Db>,
    id: String,
    patch: ProjectPatch,
    base_version: u64,
) -> AppResult<Project> {
    let project = in_tx(&db, |repo| {
        application::update(repo, &id, &patch, base_version)
    })?;
    emit_entity_changed(&app, "project", vec![project.id.clone()]);
    Ok(project)
}

#[tauri::command]
pub fn project_reorder(
    app: AppHandle,
    db: State<'_, Db>,
    id: String,
    before_id: Option<String>,
    after_id: Option<String>,
) -> AppResult<Project> {
    let project = in_tx(&db, |repo| {
        application::reorder(repo, &id, before_id.as_deref(), after_id.as_deref())
    })?;
    emit_entity_changed(&app, "project", vec![project.id.clone()]);
    Ok(project)
}

/// Phát `project` và `task` (Task con có thể đổi theo `mode`/mốc lưu trữ).
fn emit_both(app: &AppHandle, id: String) {
    emit_entity_changed(app, "project", vec![id]);
    emit_entity_changed(app, "task", vec![]);
}

#[tauri::command]
pub fn project_archive(
    app: AppHandle,
    db: State<'_, Db>,
    id: String,
    mode: ChildMode,
) -> AppResult<()> {
    in_tx(&db, |repo| application::archive(repo, &id, mode))?;
    emit_both(&app, id);
    Ok(())
}

#[tauri::command]
pub fn project_unarchive(app: AppHandle, db: State<'_, Db>, id: String) -> AppResult<()> {
    in_tx(&db, |repo| application::unarchive(repo, &id))?;
    emit_both(&app, id);
    Ok(())
}

/// Xoá mềm: Project vào Trash.
#[tauri::command]
pub fn project_delete(
    app: AppHandle,
    db: State<'_, Db>,
    id: String,
    mode: ChildMode,
) -> AppResult<()> {
    in_tx(&db, |repo| application::delete(repo, &id, mode))?;
    emit_both(&app, id);
    Ok(())
}
