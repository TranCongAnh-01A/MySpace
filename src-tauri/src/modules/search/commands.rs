use tauri::State;

use crate::db::Db;
use crate::error::AppResult;

use super::application::{self, SearchHit};
use super::infrastructure::SearchKind;

#[tauri::command]
pub fn search(
    db: State<'_, Db>,
    query: String,
    kinds: Option<Vec<SearchKind>>,
    limit: Option<usize>,
) -> AppResult<Vec<SearchHit>> {
    let conn = db.lock()?;
    application::search(&conn, &query, kinds.as_deref(), limit)
}
