use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::clock::Clock;
use crate::db::changelog::{self, ChangeOp};
use crate::error::AppResult;
use crate::ids::DEFAULT_WORKSPACE_ID;

use super::application::AreaRepository;
use super::domain::Area;

const ENTITY: &str = "area";

pub struct SqliteAreaRepository<'a> {
    conn: &'a Connection,
    clock: &'a dyn Clock,
}

impl<'a> SqliteAreaRepository<'a> {
    pub fn new(conn: &'a Connection, clock: &'a dyn Clock) -> Self {
        Self { conn, clock }
    }
}

const COLUMNS: &str = "id, name, color, sort_key";

fn map_row(row: &Row<'_>) -> rusqlite::Result<Area> {
    Ok(Area {
        id: row.get(0)?,
        name: row.get(1)?,
        color: row.get(2)?,
        sort_key: row.get(3)?,
    })
}

impl AreaRepository for SqliteAreaRepository<'_> {
    fn insert(&self, area: &Area) -> AppResult<()> {
        let now = self.clock.now_iso();
        self.conn.execute(
            "INSERT INTO areas (id, workspace_id, name, color, sort_key, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
            params![
                area.id,
                DEFAULT_WORKSPACE_ID,
                area.name,
                area.color,
                area.sort_key,
                now
            ],
        )?;
        changelog::record(self.conn, ENTITY, &area.id, ChangeOp::Insert, self.clock)
    }

    fn update(&self, area: &Area) -> AppResult<()> {
        self.conn.execute(
            "UPDATE areas SET name = ?2, color = ?3, sort_key = ?4,
                              version = version + 1, updated_at = ?5
             WHERE id = ?1 AND deleted_at IS NULL",
            params![
                area.id,
                area.name,
                area.color,
                area.sort_key,
                self.clock.now_iso()
            ],
        )?;
        changelog::record(self.conn, ENTITY, &area.id, ChangeOp::Update, self.clock)
    }

    fn find(&self, id: &str) -> AppResult<Option<Area>> {
        let sql = format!("SELECT {COLUMNS} FROM areas WHERE id = ?1 AND deleted_at IS NULL");
        Ok(self.conn.query_row(&sql, [id], map_row).optional()?)
    }

    fn list(&self) -> AppResult<Vec<Area>> {
        let sql =
            format!("SELECT {COLUMNS} FROM areas WHERE deleted_at IS NULL ORDER BY sort_key, id");
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt
            .query_map([], map_row)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    fn last_sort_key(&self) -> AppResult<Option<String>> {
        Ok(self.conn.query_row(
            "SELECT max(sort_key) FROM areas WHERE deleted_at IS NULL",
            [],
            |r| r.get(0),
        )?)
    }

    fn adjacent_sort_key(
        &self,
        key: &str,
        exclude_id: &str,
        after: bool,
    ) -> AppResult<Option<String>> {
        let sql = if after {
            "SELECT min(sort_key) FROM areas
             WHERE deleted_at IS NULL AND id <> ?2 AND sort_key > ?1"
        } else {
            "SELECT max(sort_key) FROM areas
             WHERE deleted_at IS NULL AND id <> ?2 AND sort_key < ?1"
        };
        Ok(self
            .conn
            .query_row(sql, params![key, exclude_id], |r| r.get(0))?)
    }

    fn soft_delete(&self, id: &str) -> AppResult<()> {
        let now = self.clock.now_iso();
        // Tách Project/Task khỏi Area trước, ghi nhật ký từng dòng bị đổi.
        for (table, entity) in [("projects", "project"), ("tasks", "task")] {
            let ids: Vec<String> = {
                let mut stmt = self
                    .conn
                    .prepare(&format!("SELECT id FROM {table} WHERE area_id = ?1"))?;
                let rows = stmt
                    .query_map([id], |r| r.get(0))?
                    .collect::<Result<Vec<_>, _>>()?;
                rows
            };
            self.conn.execute(
                &format!(
                    "UPDATE {table} SET area_id = NULL, version = version + 1, updated_at = ?2
                     WHERE area_id = ?1"
                ),
                params![id, now],
            )?;
            for row_id in ids {
                changelog::record(self.conn, entity, &row_id, ChangeOp::Update, self.clock)?;
            }
        }
        self.conn.execute(
            "UPDATE areas SET deleted_at = ?2, version = version + 1, updated_at = ?2
             WHERE id = ?1 AND deleted_at IS NULL",
            params![id, now],
        )?;
        changelog::record(self.conn, ENTITY, id, ChangeOp::Delete, self.clock)
    }
}
