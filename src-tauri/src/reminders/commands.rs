use chrono::Utc;
use tauri::{AppHandle, State};

use crate::clock::SystemClock;
use crate::db::Db;
use crate::error::AppResult;
use crate::modules::emit_entity_changed;
use crate::modules::settings::commands::SettingsState;
use crate::modules::tasks::timectx::TimeCtx;

use super::application;
use super::domain::{MissedReminder, Reminder, ReminderSet};

fn ctx(settings: &SettingsState) -> TimeCtx {
    TimeCtx::new(&settings.get().timezone, Utc::now())
}

#[tauri::command]
pub fn reminder_set(
    app: AppHandle,
    db: State<'_, Db>,
    settings: State<'_, SettingsState>,
    input: ReminderSet,
) -> AppResult<Reminder> {
    let ctx = ctx(&settings);
    let r = {
        let mut conn = db.lock()?;
        let tx = conn.transaction()?;
        let r = application::set(&tx, &SystemClock, &ctx, &input)?;
        tx.commit()?;
        r
    };
    emit_entity_changed(&app, "reminder", vec![r.id.clone()]);
    Ok(r)
}

#[tauri::command]
pub fn reminder_list(
    db: State<'_, Db>,
    task_id: Option<String>,
    event_id: Option<String>,
) -> AppResult<Vec<Reminder>> {
    let conn = db.lock()?;
    application::list(&conn, task_id.as_deref(), event_id.as_deref())
}

#[tauri::command]
pub fn reminder_delete(app: AppHandle, db: State<'_, Db>, id: String) -> AppResult<()> {
    application::delete(&*db.lock()?, &SystemClock, &id)?;
    emit_entity_changed(&app, "reminder", vec![id]);
    Ok(())
}

#[tauri::command]
pub fn reminder_missed_list(
    db: State<'_, Db>,
    settings: State<'_, SettingsState>,
) -> AppResult<Vec<MissedReminder>> {
    application::missed_list(&*db.lock()?, &ctx(&settings))
}

#[tauri::command]
pub fn reminder_dismiss(app: AppHandle, db: State<'_, Db>, id: String) -> AppResult<()> {
    application::dismiss(&*db.lock()?, &SystemClock, &id)?;
    emit_entity_changed(&app, "reminder", vec![id]);
    Ok(())
}

#[tauri::command]
pub fn reminder_dismiss_all(app: AppHandle, db: State<'_, Db>) -> AppResult<()> {
    application::dismiss_all(&*db.lock()?, &SystemClock)?;
    emit_entity_changed(&app, "reminder", Vec::new());
    Ok(())
}
