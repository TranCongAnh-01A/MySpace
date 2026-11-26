use chrono::Utc;
use tauri::{AppHandle, State};

use crate::clock::SystemClock;
use crate::db::Db;
use crate::error::AppResult;
use crate::modules::emit_entity_changed;
use crate::modules::settings::commands::SettingsState;

use super::application;
use super::domain::{
    ChecklistItem, Task, TaskCreate, TaskDetail, TaskFilter, TaskPatch, TaskStatus,
    TaskStatusResult,
};
use super::infrastructure::SqliteTaskRepository;
use super::timectx::TimeCtx;

fn ctx(settings: &SettingsState) -> TimeCtx {
    TimeCtx::new(&settings.get().timezone, Utc::now())
}

/// Chạy `f` trong một transaction; thành công thì commit.
pub fn in_tx<T>(
    db: &Db,
    f: impl FnOnce(&SqliteTaskRepository<'_>) -> AppResult<T>,
) -> AppResult<T> {
    let mut conn = db.lock()?;
    let tx = conn.transaction()?;
    let out = f(&SqliteTaskRepository::new(&tx, &SystemClock))?;
    tx.commit()?;
    Ok(out)
}

#[tauri::command]
pub fn task_list(
    db: State<'_, Db>,
    settings: State<'_, SettingsState>,
    filter: TaskFilter,
) -> AppResult<Vec<Task>> {
    let conn = db.lock()?;
    application::list(
        &SqliteTaskRepository::new(&conn, &SystemClock),
        &ctx(&settings),
        &filter,
    )
}

#[tauri::command]
pub fn task_get(db: State<'_, Db>, id: String) -> AppResult<TaskDetail> {
    let conn = db.lock()?;
    application::get_detail(&SqliteTaskRepository::new(&conn, &SystemClock), &id)
}

#[tauri::command]
pub fn task_create(
    app: AppHandle,
    db: State<'_, Db>,
    settings: State<'_, SettingsState>,
    input: TaskCreate,
) -> AppResult<Task> {
    let ctx = ctx(&settings);
    let task = in_tx(&db, |repo| application::create(repo, &ctx, &input))?;
    emit_entity_changed(&app, "task", vec![task.id.clone()]);
    Ok(task)
}

#[tauri::command]
pub fn task_update(
    app: AppHandle,
    db: State<'_, Db>,
    settings: State<'_, SettingsState>,
    id: String,
    patch: TaskPatch,
    base_version: u64,
) -> AppResult<Task> {
    let ctx = ctx(&settings);
    let task = in_tx(&db, |repo| {
        application::update(repo, &ctx, &id, &patch, base_version)
    })?;
    emit_entity_changed(&app, "task", vec![task.id.clone()]);
    Ok(task)
}

fn emit_status(app: &AppHandle, result: &TaskStatusResult) {
    let mut ids = vec![result.task.id.clone()];
    ids.extend(result.next.iter().map(|t| t.id.clone()));
    emit_entity_changed(app, "task", ids);
}

#[tauri::command]
pub fn task_set_status(
    app: AppHandle,
    db: State<'_, Db>,
    settings: State<'_, SettingsState>,
    id: String,
    status: TaskStatus,
) -> AppResult<TaskStatusResult> {
    let ctx = ctx(&settings);
    let result = in_tx(&db, |repo| application::set_status(repo, &ctx, &id, status))?;
    emit_status(&app, &result);
    Ok(result)
}

#[tauri::command]
pub fn task_move(
    app: AppHandle,
    db: State<'_, Db>,
    settings: State<'_, SettingsState>,
    id: String,
    status: TaskStatus,
    before_id: Option<String>,
    after_id: Option<String>,
) -> AppResult<TaskStatusResult> {
    let ctx = ctx(&settings);
    let result = in_tx(&db, |repo| {
        application::move_task(
            repo,
            &ctx,
            &id,
            status,
            before_id.as_deref(),
            after_id.as_deref(),
        )
    })?;
    emit_status(&app, &result);
    Ok(result)
}

#[tauri::command]
pub fn task_archive(app: AppHandle, db: State<'_, Db>, id: String) -> AppResult<()> {
    in_tx(&db, |repo| application::archive(repo, &id))?;
    emit_entity_changed(&app, "task", vec![id]);
    Ok(())
}

#[tauri::command]
pub fn task_unarchive(app: AppHandle, db: State<'_, Db>, id: String) -> AppResult<()> {
    in_tx(&db, |repo| application::unarchive(repo, &id))?;
    emit_entity_changed(&app, "task", vec![id]);
    Ok(())
}

/// Xoá mềm: Task vào Trash.
#[tauri::command]
pub fn task_delete(app: AppHandle, db: State<'_, Db>, id: String) -> AppResult<()> {
    in_tx(&db, |repo| application::delete(repo, &id))?;
    emit_entity_changed(&app, "task", vec![id]);
    Ok(())
}

#[tauri::command]
pub fn task_set_tags(
    app: AppHandle,
    db: State<'_, Db>,
    settings: State<'_, SettingsState>,
    task_id: String,
    tag_ids: Vec<String>,
) -> AppResult<Task> {
    let ctx = ctx(&settings);
    let task = in_tx(&db, |repo| {
        application::set_tags(repo, &ctx, &task_id, &tag_ids)
    })?;
    emit_entity_changed(&app, "task", vec![task.id.clone()]);
    Ok(task)
}

#[tauri::command]
pub fn checklist_add(
    app: AppHandle,
    db: State<'_, Db>,
    task_id: String,
    content: String,
) -> AppResult<ChecklistItem> {
    let item = in_tx(&db, |repo| {
        application::checklist_add(repo, &task_id, &content)
    })?;
    emit_entity_changed(&app, "task", vec![task_id]);
    Ok(item)
}

#[tauri::command]
pub fn checklist_update(
    app: AppHandle,
    db: State<'_, Db>,
    id: String,
    content: String,
) -> AppResult<ChecklistItem> {
    let item = in_tx(&db, |repo| {
        application::checklist_update(repo, &id, &content)
    })?;
    emit_entity_changed(&app, "task", vec![item.task_id.clone()]);
    Ok(item)
}

#[tauri::command]
pub fn checklist_toggle(app: AppHandle, db: State<'_, Db>, id: String) -> AppResult<ChecklistItem> {
    let item = in_tx(&db, |repo| application::checklist_toggle(repo, &id))?;
    emit_entity_changed(&app, "task", vec![item.task_id.clone()]);
    Ok(item)
}

#[tauri::command]
pub fn checklist_reorder(
    app: AppHandle,
    db: State<'_, Db>,
    id: String,
    before_id: Option<String>,
    after_id: Option<String>,
) -> AppResult<ChecklistItem> {
    let item = in_tx(&db, |repo| {
        application::checklist_reorder(repo, &id, before_id.as_deref(), after_id.as_deref())
    })?;
    emit_entity_changed(&app, "task", vec![item.task_id.clone()]);
    Ok(item)
}

#[tauri::command]
pub fn checklist_delete(app: AppHandle, db: State<'_, Db>, id: String) -> AppResult<()> {
    let item = in_tx(&db, |repo| application::checklist_delete(repo, &id))?;
    emit_entity_changed(&app, "task", vec![item.task_id]);
    Ok(())
}
