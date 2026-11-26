use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::clock::Clock;
use crate::db::changelog::{self, ChangeOp};
use crate::error::{AppError, AppResult};
use crate::ids::DEFAULT_WORKSPACE_ID;
use crate::modules::search::infrastructure::{self as search, SearchKind};

use super::application::InboxRepository;
use super::domain::{InboxItem, InboxStatus};

pub struct SqliteInboxRepository<'a> {
    conn: &'a Connection,
    clock: &'a dyn Clock,
}

impl<'a> SqliteInboxRepository<'a> {
    pub fn new(conn: &'a Connection, clock: &'a dyn Clock) -> Self {
        Self { conn, clock }
    }

    fn record(&self, id: &str, op: ChangeOp) -> AppResult<()> {
        changelog::record(self.conn, "inbox", id, op, self.clock)
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
        search::index(self.conn, SearchKind::Inbox, &item.id, &item.content, "")?;
        self.record(&item.id, ChangeOp::Insert)
    }

    fn find(&self, id: &str) -> AppResult<Option<InboxItem>> {
        let sql = format!("SELECT {COLUMNS} FROM inbox_items WHERE id = ?1 AND deleted_at IS NULL");
        Ok(self.conn.query_row(&sql, [id], map_row).optional()?)
    }

    fn update_content(&self, id: &str, content: &str) -> AppResult<()> {
        self.conn.execute(
            "UPDATE inbox_items SET content = ?2, version = version + 1, updated_at = ?3
             WHERE id = ?1 AND deleted_at IS NULL",
            params![id, content, self.clock.now_iso()],
        )?;
        search::index(self.conn, SearchKind::Inbox, id, content, "")?;
        self.record(id, ChangeOp::Update)
    }

    fn soft_delete(&self, id: &str) -> AppResult<()> {
        let now = self.clock.now_iso();
        self.conn.execute(
            "UPDATE inbox_items SET deleted_at = ?2, version = version + 1, updated_at = ?2
             WHERE id = ?1 AND deleted_at IS NULL",
            params![id, now],
        )?;
        search::remove(self.conn, SearchKind::Inbox, id)?;
        self.record(id, ChangeOp::Delete)
    }

    fn mark_processed(&self, id: &str, task_id: &str) -> AppResult<()> {
        let now = self.clock.now_iso();
        self.conn.execute(
            "UPDATE inbox_items SET status = 'Processed', converted_task_id = ?2,
                processed_at = ?3, version = version + 1, updated_at = ?3
             WHERE id = ?1 AND deleted_at IS NULL",
            params![id, task_id, now],
        )?;
        search::remove(self.conn, SearchKind::Inbox, id)?;
        self.record(id, ChangeOp::Update)
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

// ---------- API cho module Trash (dùng trực tiếp trên Connection) ----------

/// Mục Inbox đã xoá mềm, mới xoá trước: `(id, content, deleted_at)`.
pub fn list_deleted(conn: &Connection) -> AppResult<Vec<(String, String, String)>> {
    let mut stmt = conn.prepare(
        "SELECT id, content, deleted_at FROM inbox_items WHERE deleted_at IS NOT NULL
         ORDER BY deleted_at DESC, id DESC",
    )?;
    let rows = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Khôi phục mục Inbox; mục còn `Open` thì index lại.
pub fn restore(conn: &Connection, id: &str, clock: &dyn Clock) -> AppResult<bool> {
    let changed = conn.execute(
        "UPDATE inbox_items SET deleted_at = NULL, version = version + 1, updated_at = ?2
         WHERE id = ?1 AND deleted_at IS NOT NULL",
        params![id, clock.now_iso()],
    )?;
    if changed == 0 {
        return Ok(false);
    }
    let (content, status): (String, String) = conn.query_row(
        "SELECT content, status FROM inbox_items WHERE id = ?1",
        [id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    if status == "Open" {
        search::index(conn, SearchKind::Inbox, id, &content, "")?;
    }
    changelog::record(conn, "inbox", id, ChangeOp::Update, clock)?;
    Ok(true)
}

pub fn purge(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM inbox_items WHERE id = ?1", [id])?;
    search::remove(conn, SearchKind::Inbox, id)?;
    Ok(())
}

pub fn deleted_before(conn: &Connection, cutoff_iso: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn
        .prepare("SELECT id FROM inbox_items WHERE deleted_at IS NOT NULL AND deleted_at < ?1")?;
    let rows = stmt
        .query_map([cutoff_iso], |r| r.get(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}
