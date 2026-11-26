use chrono::Utc;
use tauri::State;

use crate::clock::SystemClock;
use crate::db::Db;
use crate::error::AppResult;
use crate::modules::settings::commands::SettingsState;
use crate::modules::tasks::timectx::TimeCtx;

use super::application;
use super::domain::TodayView;

#[tauri::command]
pub fn dashboard_today(
    db: State<'_, Db>,
    settings: State<'_, SettingsState>,
) -> AppResult<TodayView> {
    let conn = db.lock()?;
    let ctx = TimeCtx::new(&settings.get().timezone, Utc::now());
    application::today(&conn, &SystemClock, &ctx)
}
