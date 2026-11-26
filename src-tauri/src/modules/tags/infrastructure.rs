use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::clock::Clock;
use crate::db::changelog::{self, ChangeOp};
use crate::error::AppResult;
use crate::ids::DEFAULT_WORKSPACE_ID;

use super::application::TagRepository;
use super::domain::Tag;

const ENTITY: &str = "tag";

pub struct SqliteTagRepository<'a> {
    conn: &'a Connection,
    clock: &'a dyn Clock,
}

impl<'a> SqliteTagRepository<'a> {
    pub fn new(conn: &'a Connection, clock: &'a dyn Clock) -> Self {
        Self { conn, clock }
    }
}

fn map_row(row: &Row<'_>) -> rusqlite::Result<Tag> {
    Ok(Tag {
        id: row.get(0)?,
        name: row.get(1)?,
        color: row.get(2)?,
    })
}

impl TagRepository for SqliteTagRepository<'_> {
    fn insert(&self, tag: &Tag) -> AppResult<()> {
        let now = self.clock.now_iso();
        self.conn.execute(
            "INSERT INTO tags (id, workspace_id, name, color, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            params![tag.id, DEFAULT_WORKSPACE_ID, tag.name, tag.color, now],
        )?;
        changelog::record(self.conn, ENTITY, &tag.id, ChangeOp::Insert, self.clock)
    }

    fn update(&self, tag: &Tag) -> AppResult<()> {
        self.conn.execute(
            "UPDATE tags SET name = ?2, color = ?3, updated_at = ?4
             WHERE id = ?1 AND deleted_at IS NULL",
            params![tag.id, tag.name, tag.color, self.clock.now_iso()],
        )?;
        changelog::record(self.conn, ENTITY, &tag.id, ChangeOp::Update, self.clock)
    }

    fn find(&self, id: &str) -> AppResult<Option<Tag>> {
        Ok(self
            .conn
            .query_row(
                "SELECT id, name, color FROM tags WHERE id = ?1 AND deleted_at IS NULL",
                [id],
                map_row,
            )
            .optional()?)
    }

    fn list(&self) -> AppResult<Vec<Tag>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, color FROM tags WHERE deleted_at IS NULL
             ORDER BY name COLLATE NOCASE, id",
        )?;
        let rows = stmt
            .query_map([], map_row)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    fn name_taken(&self, name: &str, exclude_id: Option<&str>) -> AppResult<bool> {
        // So sánh trong Rust vì SQLite NOCASE chỉ phân biệt hoa/thường của ASCII (không có "Ệ" ~ "ệ").
        let wanted = name.to_lowercase();
        let mut stmt = self.conn.prepare(
            "SELECT name FROM tags WHERE deleted_at IS NULL AND (?1 IS NULL OR id <> ?1)",
        )?;
        let names = stmt
            .query_map([exclude_id], |r| r.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(names.iter().any(|n| n.to_lowercase() == wanted))
    }

    fn soft_delete(&self, id: &str) -> AppResult<()> {
        self.conn
            .execute("DELETE FROM task_tags WHERE tag_id = ?1", [id])?;
        self.conn
            .execute("DELETE FROM note_tags WHERE tag_id = ?1", [id])?;
        self.conn.execute(
            "UPDATE tags SET deleted_at = ?2, updated_at = ?2 WHERE id = ?1",
            params![id, self.clock.now_iso()],
        )?;
        changelog::record(self.conn, ENTITY, id, ChangeOp::Delete, self.clock)
    }
}
