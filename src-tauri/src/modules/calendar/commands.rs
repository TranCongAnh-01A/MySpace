use chrono::Utc;
use tauri::{AppHandle, State};

use crate::clock::SystemClock;
use crate::db::Db;
use crate::error::AppResult;
use crate::modules::emit_entity_changed;
use crate::modules::settings::commands::SettingsState;
use crate::modules::tasks::timectx::TimeCtx;

use super::application;
use super::domain::{Calendar, CalendarItem, Event, EventCreate, EventPatch};

fn ctx(settings: &SettingsState) -> TimeCtx {
    TimeCtx::new(&settings.get().timezone, Utc::now())
}

#[tauri::command]
pub fn calendar_list(db: State<'_, Db>) -> AppResult<Vec<Calendar>> {
    application::calendar_list(&*db.lock()?)
}

#[tauri::command]
pub fn calendar_range(
    db: State<'_, Db>,
    settings: State<'_, SettingsState>,
    from: String,
    to: String,
) -> AppResult<Vec<CalendarItem>> {
    application::range(&*db.lock()?, &SystemClock, &ctx(&settings), &from, &to)
}

/// Chạy `f` trong một transaction; thành công thì commit.
fn in_tx<T>(db: &Db, f: impl FnOnce(&rusqlite::Connection) -> AppResult<T>) -> AppResult<T> {
    let mut conn = db.lock()?;
    let tx = conn.transaction()?;
    let out = f(&tx)?;
    tx.commit()?;
    Ok(out)
}

#[tauri::command]
pub fn event_create(app: AppHandle, db: State<'_, Db>, input: EventCreate) -> AppResult<Event> {
    let e = in_tx(&db, |c| application::event_create(c, &SystemClock, &input))?;
    emit_entity_changed(&app, "event", vec![e.id.clone()]);
    Ok(e)
}

#[tauri::command]
pub fn event_update(
    app: AppHandle,
    db: State<'_, Db>,
    settings: State<'_, SettingsState>,
    id: String,
    patch: EventPatch,
    base_version: u64,
) -> AppResult<Event> {
    let ctx = ctx(&settings);
    let e = in_tx(&db, |c| {
        application::event_update(c, &SystemClock, &ctx, &id, &patch, base_version)
    })?;
    emit_entity_changed(&app, "event", vec![e.id.clone()]);
    emit_entity_changed(&app, "reminder", Vec::new());
    Ok(e)
}

#[tauri::command]
pub fn event_delete(app: AppHandle, db: State<'_, Db>, id: String) -> AppResult<()> {
    in_tx(&db, |c| application::event_delete(c, &SystemClock, &id))?;
    emit_entity_changed(&app, "event", vec![id]);
    emit_entity_changed(&app, "reminder", Vec::new());
    Ok(())
}

#[tauri::command]
pub fn task_schedule_block(
    app: AppHandle,
    db: State<'_, Db>,
    task_id: String,
    start_at: String,
    end_at: String,
    calendar_id: Option<String>,
) -> AppResult<Event> {
    let e = in_tx(&db, |c| {
        application::schedule_block(
            c,
            &SystemClock,
            &task_id,
            &start_at,
            &end_at,
            calendar_id.as_deref(),
        )
    })?;
    emit_entity_changed(&app, "event", vec![e.id.clone()]);
    Ok(e)
}
