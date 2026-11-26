use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::clock::Clock;
use crate::db::changelog::{self, ChangeOp};
use crate::error::{AppError, AppResult};
use crate::ids::DEFAULT_WORKSPACE_ID;
use crate::modules::search::infrastructure::{self as search, SearchKind};
use crate::modules::tasks::infrastructure as tasks;

use super::application::ProjectRepository;
use super::domain::{ChildMode, Project, ProjectStatus, StatusCounts};

pub struct SqliteProjectRepository<'a> {
    conn: &'a Connection,
    clock: &'a dyn Clock,
}

impl<'a> SqliteProjectRepository<'a> {
    pub fn new(conn: &'a Connection, clock: &'a dyn Clock) -> Self {
        Self { conn, clock }
    }

    fn record(&self, id: &str, op: ChangeOp) -> AppResult<()> {
        changelog::record(self.conn, "project", id, op, self.clock)
    }

    fn record_tasks(&self, ids: &[String], op: ChangeOp) -> AppResult<()> {
        for id in ids {
            changelog::record(self.conn, "task", id, op, self.clock)?;
        }
        Ok(())
    }

    fn reindex(&self, p: &Project) -> AppResult<()> {
        search::index(
            self.conn,
            SearchKind::Project,
            &p.id,
            &p.name,
            &p.description,
        )
    }

    /// Id Task của Project thoả `cond` (điều kiện SQL cố định, tham số `?1` = id Project).
    fn task_ids(&self, id: &str, cond: &str) -> AppResult<Vec<String>> {
        let sql = format!("SELECT id FROM tasks WHERE project_id = ?1 AND {cond}");
        let rows = self
            .conn
            .prepare(&sql)?
            .query_map([id], |r| r.get(0))?
            .collect::<Result<Vec<String>, _>>()?;
        Ok(rows)
    }

    /// Tách Task (mọi trạng thái) và Note khỏi Project. Task chưa có Area nhận Area của Project.
    fn detach_children(&self, id: &str, area_id: Option<&str>, now: &str) -> AppResult<()> {
        let ids = self.task_ids(id, "1 = 1")?;
        self.conn.execute(
            "UPDATE tasks SET project_id = NULL, area_id = COALESCE(area_id, ?2),
                version = version + 1, updated_at = ?3
             WHERE project_id = ?1",
            params![id, area_id, now],
        )?;
        self.record_tasks(&ids, ChangeOp::Update)?;
        detach_notes(self.conn, id, now)
    }
}

fn detach_notes(conn: &Connection, id: &str, now: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE notes SET project_id = NULL, version = version + 1, updated_at = ?2
         WHERE project_id = ?1",
        params![id, now],
    )?;
    Ok(())
}

fn map_write_err(e: rusqlite::Error) -> AppError {
    if let rusqlite::Error::SqliteFailure(f, _) = &e {
        if f.extended_code == 787 {
            return AppError::validation("Area không tồn tại");
        }
    }
    AppError::from(e)
}

const COLUMNS: &str = "id, area_id, name, description, status, color, icon, start_date,
    target_date, sort_key, archived_at, version, created_at, updated_at";

fn map_row(row: &Row<'_>) -> rusqlite::Result<Project> {
    let status: String = row.get(4)?;
    Ok(Project {
        id: row.get(0)?,
        area_id: row.get(1)?,
        name: row.get(2)?,
        description: row.get(3)?,
        status: ProjectStatus::parse(&status).ok_or_else(|| {
            rusqlite::Error::FromSqlConversionFailure(
                4,
                rusqlite::types::Type::Text,
                format!("trạng thái Project lạ: {status}").into(),
            )
        })?,
        color: row.get(5)?,
        icon: row.get(6)?,
        start_date: row.get(7)?,
        target_date: row.get(8)?,
        sort_key: row.get(9)?,
        archived_at: row.get(10)?,
        version: row.get::<_, i64>(11)?.unsigned_abs(),
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

impl ProjectRepository for SqliteProjectRepository<'_> {
    fn insert(&self, p: &Project) -> AppResult<()> {
        self.conn
            .execute(
                "INSERT INTO projects (id, workspace_id, area_id, name, description, status,
                    color, icon, start_date, target_date, sort_key, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)",
                params![
                    p.id,
                    DEFAULT_WORKSPACE_ID,
                    p.area_id,
                    p.name,
                    p.description,
                    p.status.as_str(),
                    p.color,
                    p.icon,
                    p.start_date,
                    p.target_date,
                    p.sort_key,
                    self.clock.now_iso()
                ],
            )
            .map_err(map_write_err)?;
        self.reindex(p)?;
        self.record(&p.id, ChangeOp::Insert)
    }

    fn save(&self, p: &Project) -> AppResult<()> {
        self.conn
            .execute(
                "UPDATE projects SET area_id = ?2, name = ?3, description = ?4, status = ?5,
                    color = ?6, icon = ?7, start_date = ?8, target_date = ?9, sort_key = ?10,
                    version = version + 1, updated_at = ?11
                 WHERE id = ?1 AND deleted_at IS NULL",
                params![
                    p.id,
                    p.area_id,
                    p.name,
                    p.description,
                    p.status.as_str(),
                    p.color,
                    p.icon,
                    p.start_date,
                    p.target_date,
                    p.sort_key,
                    self.clock.now_iso()
                ],
            )
            .map_err(map_write_err)?;
        self.reindex(p)?;
        self.record(&p.id, ChangeOp::Update)
    }

    fn find(&self, id: &str) -> AppResult<Option<Project>> {
        let sql = format!("SELECT {COLUMNS} FROM projects WHERE id = ?1 AND deleted_at IS NULL");
        Ok(self.conn.query_row(&sql, [id], map_row).optional()?)
    }

    fn list(&self, archived: bool) -> AppResult<Vec<Project>> {
        let cond = if archived {
            "archived_at IS NOT NULL"
        } else {
            "archived_at IS NULL"
        };
        let sql = format!(
            "SELECT {COLUMNS} FROM projects WHERE deleted_at IS NULL AND {cond}
             ORDER BY sort_key, id"
        );
        let rows = self
            .conn
            .prepare(&sql)?
            .query_map([], map_row)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    fn last_sort_key(&self) -> AppResult<Option<String>> {
        Ok(self.conn.query_row(
            "SELECT max(sort_key) FROM projects WHERE deleted_at IS NULL",
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
            "SELECT min(sort_key) FROM projects
             WHERE deleted_at IS NULL AND id <> ?2 AND sort_key > ?1"
        } else {
            "SELECT max(sort_key) FROM projects
             WHERE deleted_at IS NULL AND id <> ?2 AND sort_key < ?1"
        };
        Ok(self
            .conn
            .query_row(sql, params![key, exclude_id], |r| r.get(0))?)
    }

    fn area_exists(&self, id: &str) -> AppResult<bool> {
        let n: i64 = self.conn.query_row(
            "SELECT count(*) FROM areas WHERE id = ?1 AND deleted_at IS NULL",
            [id],
            |r| r.get(0),
        )?;
        Ok(n > 0)
    }

    fn counts(&self, id: &str) -> AppResult<StatusCounts> {
        let mut stmt = self.conn.prepare(
            "SELECT status, count(*) FROM tasks
             WHERE project_id = ?1 AND archived_at IS NULL AND deleted_at IS NULL
             GROUP BY status",
        )?;
        let rows = stmt
            .query_map([id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, u32>(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;
        let mut counts = StatusCounts::default();
        for (status, n) in rows {
            match status.as_str() {
                "Todo" => counts.todo = n,
                "InProgress" => counts.in_progress = n,
                "Review" => counts.review = n,
                "Done" => counts.done = n,
                _ => {}
            }
        }
        Ok(counts)
    }

    fn archive(&self, id: &str, mode: ChildMode) -> AppResult<()> {
        let now = self.clock.now_iso();
        let area: Option<String> =
            self.conn
                .query_row("SELECT area_id FROM projects WHERE id = ?1", [id], |r| {
                    r.get(0)
                })?;
        match mode {
            ChildMode::WithChildren => {
                let cond = "archived_at IS NULL AND deleted_at IS NULL";
                let ids = self.task_ids(id, cond)?;
                self.conn.execute(
                    &format!(
                        "UPDATE tasks SET archived_at = ?2, version = version + 1, updated_at = ?2
                         WHERE project_id = ?1 AND {cond}"
                    ),
                    params![id, now],
                )?;
                self.record_tasks(&ids, ChangeOp::Update)?;
            }
            ChildMode::Detach => self.detach_children(id, area.as_deref(), &now)?,
        }
        self.conn.execute(
            "UPDATE projects SET archived_at = ?2, version = version + 1, updated_at = ?2
             WHERE id = ?1 AND deleted_at IS NULL",
            params![id, now],
        )?;
        self.record(id, ChangeOp::Update)
    }

    fn unarchive(&self, id: &str) -> AppResult<()> {
        let now = self.clock.now_iso();
        let stamp: Option<String> = self.conn.query_row(
            "SELECT archived_at FROM projects WHERE id = ?1",
            [id],
            |r| r.get(0),
        )?;
        if let Some(stamp) = stamp {
            let ids: Vec<String> = self
                .conn
                .prepare(
                    "SELECT id FROM tasks
                     WHERE project_id = ?1 AND archived_at = ?2 AND deleted_at IS NULL",
                )?
                .query_map(params![id, stamp], |r| r.get(0))?
                .collect::<Result<_, _>>()?;
            self.conn.execute(
                "UPDATE tasks SET archived_at = NULL, version = version + 1, updated_at = ?3
                 WHERE project_id = ?1 AND archived_at = ?2 AND deleted_at IS NULL",
                params![id, stamp, now],
            )?;
            self.record_tasks(&ids, ChangeOp::Update)?;
        }
        self.conn.execute(
            "UPDATE projects SET archived_at = NULL, version = version + 1, updated_at = ?2
             WHERE id = ?1 AND deleted_at IS NULL",
            params![id, now],
        )?;
        self.record(id, ChangeOp::Update)
    }

    fn soft_delete(&self, id: &str, mode: ChildMode) -> AppResult<()> {
        let now = self.clock.now_iso();
        let area: Option<String> =
            self.conn
                .query_row("SELECT area_id FROM projects WHERE id = ?1", [id], |r| {
                    r.get(0)
                })?;
        match mode {
            ChildMode::WithChildren => {
                let ids = self.task_ids(id, "deleted_at IS NULL")?;
                self.conn.execute(
                    "UPDATE tasks SET deleted_at = ?2, version = version + 1, updated_at = ?2
                     WHERE project_id = ?1 AND deleted_at IS NULL",
                    params![id, now],
                )?;
                for task_id in &ids {
                    search::remove(self.conn, SearchKind::Task, task_id)?;
                }
                self.record_tasks(&ids, ChangeOp::Delete)?;
            }
            ChildMode::Detach => self.detach_children(id, area.as_deref(), &now)?,
        }
        self.conn.execute(
            "UPDATE projects SET deleted_at = ?2, version = version + 1, updated_at = ?2
             WHERE id = ?1 AND deleted_at IS NULL",
            params![id, now],
        )?;
        search::remove(self.conn, SearchKind::Project, id)?;
        self.record(id, ChangeOp::Delete)
    }
}

// ---------- API cho module Trash, Search và Demo (dùng trực tiếp trên Connection) ----------

/// Project đã xoá mềm, mới xoá trước: `(id, name, deleted_at)`.
pub fn list_deleted(conn: &Connection) -> AppResult<Vec<(String, String, String)>> {
    let rows = conn
        .prepare(
            "SELECT id, name, deleted_at FROM projects WHERE deleted_at IS NOT NULL
             ORDER BY deleted_at DESC, id DESC",
        )?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Khôi phục Project cùng các Task bị xoá đúng mốc với nó. Area đã xoá thì tách ra.
pub fn restore(conn: &Connection, id: &str, clock: &dyn Clock) -> AppResult<bool> {
    let stamp: Option<String> = conn
        .query_row(
            "SELECT deleted_at FROM projects WHERE id = ?1 AND deleted_at IS NOT NULL",
            [id],
            |r| r.get(0),
        )
        .optional()?;
    let Some(stamp) = stamp else {
        return Ok(false);
    };
    let now = clock.now_iso();
    let task_ids: Vec<String> = conn
        .prepare("SELECT id FROM tasks WHERE project_id = ?1 AND deleted_at = ?2")?
        .query_map(params![id, stamp], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    conn.execute(
        "UPDATE tasks SET deleted_at = NULL, version = version + 1, updated_at = ?3
         WHERE project_id = ?1 AND deleted_at = ?2",
        params![id, stamp, now],
    )?;
    for task_id in &task_ids {
        let (title, description): (String, String) = conn.query_row(
            "SELECT title, description FROM tasks WHERE id = ?1",
            [task_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        search::index(conn, SearchKind::Task, task_id, &title, &description)?;
        changelog::record(conn, "task", task_id, ChangeOp::Update, clock)?;
    }
    conn.execute(
        "UPDATE projects SET deleted_at = NULL, version = version + 1, updated_at = ?2,
            area_id = CASE WHEN area_id IN (SELECT id FROM areas WHERE deleted_at IS NOT NULL)
                           THEN NULL ELSE area_id END
         WHERE id = ?1",
        params![id, now],
    )?;
    let (name, description): (String, String) = conn.query_row(
        "SELECT name, description FROM projects WHERE id = ?1",
        [id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    search::index(conn, SearchKind::Project, id, &name, &description)?;
    changelog::record(conn, "project", id, ChangeOp::Update, clock)?;
    Ok(true)
}

/// Xoá cứng Project: purge Task còn trỏ tới nó, tách Note, rồi xoá dòng Project.
pub fn purge(conn: &Connection, id: &str, clock: &dyn Clock) -> AppResult<()> {
    let task_ids: Vec<String> = conn
        .prepare("SELECT id FROM tasks WHERE project_id = ?1")?
        .query_map([id], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    for task_id in &task_ids {
        tasks::purge(conn, task_id)?;
    }
    detach_notes(conn, id, &clock.now_iso())?;
    search::remove(conn, SearchKind::Project, id)?;
    // milestones xoá theo ON DELETE CASCADE.
    conn.execute("DELETE FROM projects WHERE id = ?1", [id])?;
    Ok(())
}

/// Id Project đã xoá mềm trước `cutoff_iso`.
pub fn deleted_before(conn: &Connection, cutoff_iso: &str) -> AppResult<Vec<String>> {
    let rows = conn
        .prepare("SELECT id FROM projects WHERE deleted_at IS NOT NULL AND deleted_at < ?1")?
        .query_map([cutoff_iso], |r| r.get(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Có Project (chưa xoá) nào có tên bắt đầu bằng `prefix` không (chỉ `seed_demo_data` dùng).
#[cfg(debug_assertions)]
pub fn name_starts_with(conn: &Connection, prefix: &str) -> AppResult<bool> {
    let n: i64 = conn.query_row(
        "SELECT count(*) FROM projects WHERE deleted_at IS NULL AND instr(name, ?1) = 1",
        [prefix],
        |r| r.get(0),
    )?;
    Ok(n > 0)
}
