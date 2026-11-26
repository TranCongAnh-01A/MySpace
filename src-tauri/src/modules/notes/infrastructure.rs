use rusqlite::types::Value as SqlValue;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Row};

use crate::clock::Clock;
use crate::db::changelog::{self, ChangeOp};
use crate::error::AppResult;
use crate::ids::DEFAULT_WORKSPACE_ID;
use crate::modules::search::infrastructure::{self as search, SearchKind};

use super::application::{NewNote, NoteRepository};
use super::domain::{excerpt, Note, NoteFilter, NoteSort, NoteSummary};

pub struct SqliteNoteRepository<'a> {
    conn: &'a Connection,
    clock: &'a dyn Clock,
}

impl<'a> SqliteNoteRepository<'a> {
    pub fn new(conn: &'a Connection, clock: &'a dyn Clock) -> Self {
        Self { conn, clock }
    }

    fn record(&self, id: &str, op: ChangeOp) -> AppResult<()> {
        changelog::record(self.conn, "note", id, op, self.clock)
    }

    fn ids(&self, sql: &str, id: &str) -> AppResult<Vec<String>> {
        Ok(self
            .conn
            .prepare(sql)?
            .query_map([id], |r| r.get(0))?
            .collect::<Result<Vec<String>, _>>()?)
    }
}

fn map_note(row: &Row<'_>) -> rusqlite::Result<Note> {
    Ok(Note {
        id: row.get(0)?,
        project_id: row.get(1)?,
        parent_note_id: row.get(2)?,
        title: row.get(3)?,
        content_json: row.get(4)?,
        version: row.get::<_, i64>(5)?.unsigned_abs(),
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
        deleted_at: row.get(8)?,
        task_ids: Vec::new(),
        tag_ids: Vec::new(),
    })
}

const NOTE_COLUMNS: &str = "id, project_id, parent_note_id, title, content_json, version,
    created_at, updated_at, deleted_at";

/// Danh sách `NoteSummary` theo bộ lọc, giới hạn `limit` dòng nếu có.
pub fn list_summaries(
    conn: &Connection,
    filter: &NoteFilter,
    limit: Option<usize>,
) -> AppResult<Vec<NoteSummary>> {
    let trashed = filter.trashed.unwrap_or(false);
    let mut conds = vec![if trashed {
        "n.deleted_at IS NOT NULL".to_string()
    } else {
        "n.deleted_at IS NULL".to_string()
    }];
    let mut args: Vec<SqlValue> = Vec::new();
    match &filter.project_id {
        Some(p) => {
            args.push(SqlValue::Text(p.clone()));
            conds.push(format!("n.project_id = ?{}", args.len()));
        }
        None if !trashed => conds.push(
            "(n.project_id IS NULL OR n.project_id NOT IN
               (SELECT id FROM projects WHERE archived_at IS NOT NULL))"
                .to_string(),
        ),
        None => {}
    }
    if let Some(t) = &filter.task_id {
        args.push(SqlValue::Text(t.clone()));
        conds.push(format!(
            "EXISTS (SELECT 1 FROM note_tasks x WHERE x.note_id = n.id AND x.task_id = ?{})",
            args.len()
        ));
    }
    if let Some(t) = &filter.tag_id {
        args.push(SqlValue::Text(t.clone()));
        conds.push(format!(
            "EXISTS (SELECT 1 FROM note_tags x WHERE x.note_id = n.id AND x.tag_id = ?{})",
            args.len()
        ));
    }
    let order = match filter.sort.unwrap_or(NoteSort::Updated) {
        NoteSort::Updated => "n.updated_at DESC, n.id DESC",
        NoteSort::Title => "n.title COLLATE NOCASE, n.id",
        NoteSort::Created => "n.created_at DESC, n.id DESC",
    };
    let limit_sql = limit.map(|l| format!(" LIMIT {l}")).unwrap_or_default();
    let sql = format!(
        "SELECT n.id, n.title, n.project_id, n.updated_at, n.search_text FROM notes n
         WHERE {} ORDER BY {order}{limit_sql}",
        conds.join(" AND ")
    );
    let rows = conn
        .prepare(&sql)?
        .query_map(params_from_iter(args), |r| {
            let text: String = r.get(4)?;
            Ok(NoteSummary {
                id: r.get(0)?,
                title: r.get(1)?,
                project_id: r.get(2)?,
                updated_at: r.get(3)?,
                excerpt: excerpt(&text),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// 5 Note cập nhật gần nhất (của một Project, hoặc của toàn bộ), không lấy Note đã xoá.
pub fn recent(conn: &Connection, project_id: Option<&str>) -> AppResult<Vec<NoteSummary>> {
    let filter = NoteFilter {
        project_id: project_id.map(Into::into),
        ..Default::default()
    };
    list_summaries(conn, &filter, Some(5))
}

/// Id Note chưa xoá liên kết với Task.
pub fn note_ids_of_task(conn: &Connection, task_id: &str) -> AppResult<Vec<String>> {
    Ok(conn
        .prepare(
            "SELECT n.id FROM notes n JOIN note_tasks nt ON nt.note_id = n.id
             WHERE nt.task_id = ?1 AND n.deleted_at IS NULL
             ORDER BY n.updated_at DESC, n.id DESC",
        )?
        .query_map([task_id], |r| r.get(0))?
        .collect::<Result<Vec<String>, _>>()?)
}

impl NoteRepository for SqliteNoteRepository<'_> {
    fn insert(&self, n: &NewNote) -> AppResult<()> {
        self.conn.execute(
            "INSERT INTO notes (id, workspace_id, project_id, parent_note_id, title,
                content_json, search_text, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
            params![
                n.id,
                DEFAULT_WORKSPACE_ID,
                n.project_id,
                n.parent_note_id,
                n.title,
                n.content_json,
                n.search_text,
                n.created_at
            ],
        )?;
        search::index(self.conn, SearchKind::Note, &n.id, &n.title, &n.search_text)?;
        self.record(&n.id, ChangeOp::Insert)
    }

    fn find(&self, id: &str) -> AppResult<Option<Note>> {
        let sql = format!("SELECT {NOTE_COLUMNS} FROM notes WHERE id = ?1 AND deleted_at IS NULL");
        let Some(mut note) = self.conn.query_row(&sql, [id], map_note).optional()? else {
            return Ok(None);
        };
        note.task_ids = self.ids(
            "SELECT nt.task_id FROM note_tasks nt JOIN tasks t ON t.id = nt.task_id
             WHERE nt.note_id = ?1 AND t.deleted_at IS NULL ORDER BY nt.task_id",
            id,
        )?;
        note.tag_ids = self.ids(
            "SELECT tag_id FROM note_tags WHERE note_id = ?1 ORDER BY tag_id",
            id,
        )?;
        Ok(Some(note))
    }

    fn list(&self, filter: &NoteFilter) -> AppResult<Vec<NoteSummary>> {
        list_summaries(self.conn, filter, None)
    }

    fn save_content(
        &self,
        id: &str,
        title: &str,
        content_json: &str,
        search_text: &str,
    ) -> AppResult<()> {
        self.conn.execute(
            "UPDATE notes SET title = ?2, content_json = ?3, search_text = ?4,
                version = version + 1, updated_at = ?5
             WHERE id = ?1 AND deleted_at IS NULL",
            params![id, title, content_json, search_text, self.clock.now_iso()],
        )?;
        search::index(self.conn, SearchKind::Note, id, title, search_text)?;
        self.record(id, ChangeOp::Update)
    }

    fn set_location(
        &self,
        id: &str,
        project_id: Option<&str>,
        parent_note_id: Option<&str>,
    ) -> AppResult<()> {
        self.conn.execute(
            "UPDATE notes SET project_id = ?2, parent_note_id = ?3,
                version = version + 1, updated_at = ?4
             WHERE id = ?1 AND deleted_at IS NULL",
            params![id, project_id, parent_note_id, self.clock.now_iso()],
        )?;
        self.record(id, ChangeOp::Update)
    }

    fn soft_delete(&self, id: &str) -> AppResult<()> {
        let now = self.clock.now_iso();
        self.conn.execute(
            "UPDATE notes SET deleted_at = ?2, version = version + 1, updated_at = ?2
             WHERE id = ?1 AND deleted_at IS NULL",
            params![id, now],
        )?;
        search::remove(self.conn, SearchKind::Note, id)?;
        self.record(id, ChangeOp::Delete)
    }

    fn link_task(&self, note_id: &str, task_id: &str) -> AppResult<()> {
        self.conn.execute(
            "INSERT OR IGNORE INTO note_tasks (note_id, task_id) VALUES (?1, ?2)",
            params![note_id, task_id],
        )?;
        self.record(note_id, ChangeOp::Update)
    }

    fn unlink_task(&self, note_id: &str, task_id: &str) -> AppResult<()> {
        self.conn.execute(
            "DELETE FROM note_tasks WHERE note_id = ?1 AND task_id = ?2",
            params![note_id, task_id],
        )?;
        self.record(note_id, ChangeOp::Update)
    }

    fn replace_tags(&self, note_id: &str, tag_ids: &[String]) -> AppResult<()> {
        self.conn
            .execute("DELETE FROM note_tags WHERE note_id = ?1", [note_id])?;
        for tag in tag_ids {
            self.conn.execute(
                "INSERT INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
                params![note_id, tag],
            )?;
        }
        self.record(note_id, ChangeOp::Update)
    }

    fn existing_tag_ids(&self, ids: &[String]) -> AppResult<Vec<String>> {
        let mut found = Vec::new();
        let mut stmt = self
            .conn
            .prepare("SELECT id FROM tags WHERE id = ?1 AND deleted_at IS NULL")?;
        for id in ids {
            if let Some(f) = stmt.query_row([id], |r| r.get(0)).optional()? {
                found.push(f);
            }
        }
        Ok(found)
    }

    fn project_is_active(&self, id: &str) -> AppResult<bool> {
        let n: i64 = self.conn.query_row(
            "SELECT count(*) FROM projects
             WHERE id = ?1 AND deleted_at IS NULL AND archived_at IS NULL",
            [id],
            |r| r.get(0),
        )?;
        Ok(n > 0)
    }

    fn task_exists(&self, id: &str) -> AppResult<bool> {
        let n: i64 = self.conn.query_row(
            "SELECT count(*) FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
            [id],
            |r| r.get(0),
        )?;
        Ok(n > 0)
    }

    fn parent_of(&self, id: &str) -> AppResult<Option<Option<String>>> {
        Ok(self
            .conn
            .query_row(
                "SELECT parent_note_id FROM notes WHERE id = ?1",
                [id],
                |r| r.get::<_, Option<String>>(0),
            )
            .optional()?)
    }
}

// ---------- API cho module Trash, Projects, Search và Demo (dùng trực tiếp trên Connection) ----------

/// Note đã xoá mềm, mới xoá trước: `(id, title, deleted_at)`.
pub fn list_deleted(conn: &Connection) -> AppResult<Vec<(String, String, String)>> {
    Ok(conn
        .prepare(
            "SELECT id, title, deleted_at FROM notes WHERE deleted_at IS NOT NULL
             ORDER BY deleted_at DESC, id DESC",
        )?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
        .collect::<Result<Vec<_>, _>>()?)
}

fn restore_one(conn: &Connection, id: &str, now: &str, clock: &dyn Clock) -> AppResult<()> {
    conn.execute(
        "UPDATE notes SET deleted_at = NULL, version = version + 1, updated_at = ?2,
            project_id = CASE WHEN project_id IN (SELECT id FROM projects WHERE deleted_at IS NOT NULL)
                              THEN NULL ELSE project_id END
         WHERE id = ?1",
        params![id, now],
    )?;
    let (title, text): (String, String) = conn.query_row(
        "SELECT title, search_text FROM notes WHERE id = ?1",
        [id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    search::index(conn, SearchKind::Note, id, &title, &text)?;
    changelog::record(conn, "note", id, ChangeOp::Update, clock)
}

/// Khôi phục Note; Project đã xoá thì tách ra. `false` nếu Note không nằm trong Trash.
pub fn restore(conn: &Connection, id: &str, clock: &dyn Clock) -> AppResult<bool> {
    let deleted: Option<String> = conn
        .query_row(
            "SELECT deleted_at FROM notes WHERE id = ?1 AND deleted_at IS NOT NULL",
            [id],
            |r| r.get(0),
        )
        .optional()?;
    if deleted.is_none() {
        return Ok(false);
    }
    restore_one(conn, id, &clock.now_iso(), clock)?;
    Ok(true)
}

/// Xoá mềm Note chưa xoá của Project với mốc `now` (dùng cho `project_delete` `WithChildren`).
pub fn soft_delete_for_project(
    conn: &Connection,
    project_id: &str,
    now: &str,
    clock: &dyn Clock,
) -> AppResult<()> {
    let ids: Vec<String> = conn
        .prepare("SELECT id FROM notes WHERE project_id = ?1 AND deleted_at IS NULL")?
        .query_map([project_id], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    conn.execute(
        "UPDATE notes SET deleted_at = ?2, version = version + 1, updated_at = ?2
         WHERE project_id = ?1 AND deleted_at IS NULL",
        params![project_id, now],
    )?;
    for id in &ids {
        search::remove(conn, SearchKind::Note, id)?;
        changelog::record(conn, "note", id, ChangeOp::Delete, clock)?;
    }
    Ok(())
}

/// Khôi phục Note của Project bị xoá đúng mốc `stamp` (cùng lúc với Project).
pub fn restore_for_project(
    conn: &Connection,
    project_id: &str,
    stamp: &str,
    now: &str,
    clock: &dyn Clock,
) -> AppResult<()> {
    let ids: Vec<String> = conn
        .prepare("SELECT id FROM notes WHERE project_id = ?1 AND deleted_at = ?2")?
        .query_map(params![project_id, stamp], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    for id in &ids {
        restore_one(conn, id, now, clock)?;
    }
    Ok(())
}

/// Xoá cứng mọi Note đã xoá mềm của Project (khi purge Project).
pub fn purge_deleted_of_project(conn: &Connection, project_id: &str) -> AppResult<()> {
    let ids: Vec<String> = conn
        .prepare("SELECT id FROM notes WHERE project_id = ?1 AND deleted_at IS NOT NULL")?
        .query_map([project_id], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    for id in &ids {
        purge(conn, id)?;
    }
    Ok(())
}

/// Xoá cứng Note: Note con mất cha, mục Inbox đã chuyển thành Note này bị xoá theo
/// (`note_tags`, `note_tasks` xoá theo ON DELETE CASCADE).
pub fn purge(conn: &Connection, id: &str) -> AppResult<()> {
    let inbox_ids: Vec<String> = conn
        .prepare("SELECT id FROM inbox_items WHERE converted_note_id = ?1")?
        .query_map([id], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    for inbox_id in &inbox_ids {
        search::remove(conn, SearchKind::Inbox, inbox_id)?;
    }
    conn.execute("DELETE FROM inbox_items WHERE converted_note_id = ?1", [id])?;
    conn.execute(
        "UPDATE notes SET parent_note_id = NULL WHERE parent_note_id = ?1",
        [id],
    )?;
    conn.execute("DELETE FROM notes WHERE id = ?1", [id])?;
    search::remove(conn, SearchKind::Note, id)?;
    Ok(())
}

/// Id Note đã xoá mềm trước `cutoff_iso`.
pub fn deleted_before(conn: &Connection, cutoff_iso: &str) -> AppResult<Vec<String>> {
    Ok(conn
        .prepare("SELECT id FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < ?1")?
        .query_map([cutoff_iso], |r| r.get(0))?
        .collect::<Result<Vec<_>, _>>()?)
}
