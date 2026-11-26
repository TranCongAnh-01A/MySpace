use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, State};

use crate::clock::{Clock, SystemClock};
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::modules::emit_entity_changed;

use super::application;
use super::domain::{Note, NoteCreate, NoteFilter, NoteMoveArgs, NoteSaveResult, NoteSummary};
use super::infrastructure::SqliteNoteRepository;

/// Chạy `f` trong một transaction; thành công thì commit.
fn in_tx<T>(db: &Db, f: impl FnOnce(&SqliteNoteRepository<'_>) -> AppResult<T>) -> AppResult<T> {
    let mut conn = db.lock()?;
    let tx = conn.transaction()?;
    let out = f(&SqliteNoteRepository::new(&tx, &SystemClock))?;
    tx.commit()?;
    Ok(out)
}

#[tauri::command]
pub fn note_list(db: State<'_, Db>, filter: NoteFilter) -> AppResult<Vec<NoteSummary>> {
    let conn = db.lock()?;
    application::list(&SqliteNoteRepository::new(&conn, &SystemClock), &filter)
}

#[tauri::command]
pub fn note_get(db: State<'_, Db>, id: String) -> AppResult<Note> {
    let conn = db.lock()?;
    application::get(&SqliteNoteRepository::new(&conn, &SystemClock), &id)
}

#[tauri::command]
pub fn note_create(app: AppHandle, db: State<'_, Db>, input: NoteCreate) -> AppResult<Note> {
    let note = in_tx(&db, |repo| {
        application::create(repo, &SystemClock.now_iso(), &input)
    })?;
    emit_entity_changed(&app, "note", vec![note.id.clone()]);
    if input.task_id.is_some() {
        emit_entity_changed(&app, "task", input.task_id.into_iter().collect());
    }
    Ok(note)
}

/// Chỉ phát `entity-changed` khi `title` đổi, để cửa sổ đang gõ không bị làm mới liên tục.
#[tauri::command]
pub fn note_save(
    app: AppHandle,
    db: State<'_, Db>,
    id: String,
    title: String,
    content_json: String,
    base_version: u64,
) -> AppResult<NoteSaveResult> {
    let outcome = in_tx(&db, |repo| {
        application::save(repo, &id, &title, &content_json, base_version)
    })?;
    if outcome.title_changed {
        emit_entity_changed(&app, "note", vec![id]);
    }
    Ok(outcome.result)
}

/// Ba trạng thái cho `projectId` / `parentNoteId` (thiếu = giữ, `null` = bỏ, giá trị = đặt),
/// nên đọc thẳng body JSON thay vì để Tauri tách từng tham số.
#[tauri::command]
pub fn note_move(app: AppHandle, db: State<'_, Db>, request: Request<'_>) -> AppResult<Note> {
    let InvokeBody::Json(body) = request.body() else {
        return Err(AppError::validation("Tham số note_move không hợp lệ"));
    };
    let args: NoteMoveArgs = serde_json::from_value(body.clone())
        .map_err(|_| AppError::validation("Tham số note_move không hợp lệ"))?;
    let note = in_tx(&db, |repo| {
        application::move_note(repo, &args.id, args.project_id, args.parent_note_id)
    })?;
    emit_entity_changed(&app, "note", vec![note.id.clone()]);
    Ok(note)
}

#[tauri::command]
pub fn note_delete(app: AppHandle, db: State<'_, Db>, id: String) -> AppResult<()> {
    in_tx(&db, |repo| application::delete(repo, &id))?;
    emit_entity_changed(&app, "note", vec![id]);
    Ok(())
}

#[tauri::command]
pub fn note_link_task(
    app: AppHandle,
    db: State<'_, Db>,
    note_id: String,
    task_id: String,
) -> AppResult<()> {
    in_tx(&db, |repo| application::link_task(repo, &note_id, &task_id))?;
    emit_entity_changed(&app, "note", vec![note_id]);
    emit_entity_changed(&app, "task", vec![task_id]);
    Ok(())
}

#[tauri::command]
pub fn note_unlink_task(
    app: AppHandle,
    db: State<'_, Db>,
    note_id: String,
    task_id: String,
) -> AppResult<()> {
    in_tx(&db, |repo| {
        application::unlink_task(repo, &note_id, &task_id)
    })?;
    emit_entity_changed(&app, "note", vec![note_id]);
    emit_entity_changed(&app, "task", vec![task_id]);
    Ok(())
}

#[tauri::command]
pub fn note_set_tags(
    app: AppHandle,
    db: State<'_, Db>,
    note_id: String,
    tag_ids: Vec<String>,
) -> AppResult<Note> {
    let note = in_tx(&db, |repo| application::set_tags(repo, &note_id, &tag_ids))?;
    emit_entity_changed(&app, "note", vec![note.id.clone()]);
    Ok(note)
}
