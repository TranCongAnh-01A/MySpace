use rusqlite::{params, Connection, Row};

use crate::error::{AppError, AppResult};
use crate::ids::DEFAULT_WORKSPACE_ID;

use super::application::InboxRepository;
use super::domain::{InboxItem, InboxStatus};

pub struct SqliteInboxRepository<'a> {
    conn: &'a Connection,
}

impl<'a> SqliteInboxRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }
}

const COLUMNS: &str =
    "id, content, status, converted_task_id, converted_note_id, processed_at, created_at";

fn map_row(row: &Row<'_>) -> rusqlite::Result<InboxItem> {
    let status: String = row.get(2)?;
    Ok(InboxItem {
        id: row.get(0)?,
        content: row.get(1)?,
        status: InboxStatus::parse(&status).ok_or_else(|| {
            rusqlite::Error::FromSqlConversionFailure(
                2,
                rusqlite::types::Type::Text,
                format!("trạng thái lạ: {status}").into(),
            )
        })?,
        converted_task_id: row.get(3)?,
        converted_note_id: row.get(4)?,
        processed_at: row.get(5)?,
        created_at: row.get(6)?,
    })
}

impl InboxRepository for SqliteInboxRepository<'_> {
    fn insert(&self, item: &InboxItem) -> AppResult<()> {
        self.conn.execute(
            "INSERT INTO inbox_items (id, workspace_id, content, status, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            params![
                item.id,
                DEFAULT_WORKSPACE_ID,
                item.content,
                item.status.as_str(),
                item.created_at
            ],
        )?;
        Ok(())
    }

    fn list(&self, status: Option<InboxStatus>) -> AppResult<Vec<InboxItem>> {
        let sql = format!(
            "SELECT {COLUMNS} FROM inbox_items
             WHERE deleted_at IS NULL AND (?1 IS NULL OR status = ?1)
             ORDER BY created_at DESC, id DESC"
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt
            .query_map(params![status.map(InboxStatus::as_str)], map_row)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(AppError::from)?;
        Ok(rows)
    }
}
