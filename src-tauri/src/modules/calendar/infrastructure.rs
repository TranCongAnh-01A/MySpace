//! SQL cho `calendars` và `events`.

use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::clock::Clock;
use crate::db::changelog::{self, ChangeOp};
use crate::error::{AppError, AppResult};

use super::domain::{Calendar, Event};

const EVENT_COLS: &str = "e.id, e.calendar_id, e.task_id, e.title, e.description, e.is_all_day,
    e.start_at, e.end_at, e.start_date, e.end_date, e.version, e.created_at, e.updated_at";

fn map_event(r: &Row<'_>) -> rusqlite::Result<Event> {
    Ok(Event {
        id: r.get(0)?,
        calendar_id: r.get(1)?,
        task_id: r.get(2)?,
        title: r.get(3)?,
        description: r.get(4)?,
        is_all_day: r.get::<_, i64>(5)? != 0,
        start_at: r.get(6)?,
        end_at: r.get(7)?,
        start_date: r.get(8)?,
        end_date: r.get(9)?,
        version: r.get::<_, i64>(10)?.unsigned_abs(),
        created_at: r.get(11)?,
        updated_at: r.get(12)?,
    })
}

pub fn calendars(conn: &Connection) -> AppResult<Vec<Calendar>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, color, is_default FROM calendars WHERE deleted_at IS NULL
         ORDER BY is_default DESC, name, id",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Calendar {
                id: r.get(0)?,
                name: r.get(1)?,
                color: r.get(2)?,
                is_default: r.get::<_, i64>(3)? != 0,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn default_calendar_id(conn: &Connection) -> AppResult<String> {
    conn.query_row(
        "SELECT id FROM calendars WHERE is_default = 1 AND deleted_at IS NULL LIMIT 1",
        [],
        |r| r.get(0),
    )
    .optional()?
    .ok_or_else(|| AppError::internal("Không có lịch mặc định"))
}

pub fn calendar_exists(conn: &Connection, id: &str) -> AppResult<bool> {
    Ok(conn
        .query_row(
            "SELECT 1 FROM calendars WHERE id = ?1 AND deleted_at IS NULL",
            [id],
            |_| Ok(()),
        )
        .optional()?
        .is_some())
}

pub fn task_exists(conn: &Connection, id: &str) -> AppResult<bool> {
    Ok(conn
        .query_row(
            "SELECT 1 FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
            [id],
            |_| Ok(()),
        )
        .optional()?
        .is_some())
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Option<Event>> {
    let sql = format!("SELECT {EVENT_COLS} FROM events e WHERE e.id = ?1 AND e.deleted_at IS NULL");
    Ok(conn.query_row(&sql, [id], map_event).optional()?)
}

pub fn insert(conn: &Connection, clock: &dyn Clock, e: &Event) -> AppResult<()> {
    conn.execute(
        "INSERT INTO events (id, calendar_id, task_id, title, description, is_all_day,
            start_at, end_at, start_date, end_date, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
        params![
            e.id,
            e.calendar_id,
            e.task_id,
            e.title,
            e.description,
            e.is_all_day,
            e.start_at,
            e.end_at,
            e.start_date,
            e.end_date,
            clock.now_iso()
        ],
    )?;
    changelog::record(conn, "event", &e.id, ChangeOp::Insert, clock)
}

pub fn save(conn: &Connection, clock: &dyn Clock, e: &Event) -> AppResult<()> {
    conn.execute(
        "UPDATE events SET calendar_id = ?2, title = ?3, description = ?4, is_all_day = ?5,
            start_at = ?6, end_at = ?7, start_date = ?8, end_date = ?9,
            version = version + 1, updated_at = ?10
         WHERE id = ?1 AND deleted_at IS NULL",
        params![
            e.id,
            e.calendar_id,
            e.title,
            e.description,
            e.is_all_day,
            e.start_at,
            e.end_at,
            e.start_date,
            e.end_date,
            clock.now_iso()
        ],
    )?;
    changelog::record(conn, "event", &e.id, ChangeOp::Update, clock)
}

pub fn soft_delete(conn: &Connection, clock: &dyn Clock, id: &str, now: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE events SET deleted_at = ?2, updated_at = ?2, version = version + 1
         WHERE id = ?1 AND deleted_at IS NULL",
        params![id, now],
    )?;
    changelog::record(conn, "event", id, ChangeOp::Delete, clock)
}

/// Event chồng lên khoảng; bỏ Event time block của Task đã xoá.
pub fn overlapping(
    conn: &Connection,
    from_date: &str,
    to_date: &str,
    start_utc: &str,
    end_utc: &str,
) -> AppResult<Vec<Event>> {
    let sql = format!(
        "SELECT {EVENT_COLS} FROM events e LEFT JOIN tasks t ON t.id = e.task_id
         WHERE e.deleted_at IS NULL AND (e.task_id IS NULL OR t.deleted_at IS NULL)
           AND ((e.is_all_day = 0 AND e.start_at < ?4 AND e.end_at > ?3)
             OR (e.is_all_day = 1 AND e.start_date <= ?2 AND e.end_date >= ?1))"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map(params![from_date, to_date, start_utc, end_utc], map_event)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Id Task chưa xoá, chưa lưu trữ, không thuộc Project đã lưu trữ/xoá, có hạn trong khoảng.
pub fn deadline_task_ids(
    conn: &Connection,
    from_date: &str,
    to_date: &str,
    start_utc: &str,
    end_utc: &str,
) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT t.id FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
         WHERE t.deleted_at IS NULL AND t.archived_at IS NULL
           AND (t.project_id IS NULL OR (p.archived_at IS NULL AND p.deleted_at IS NULL))
           AND ((t.due_date >= ?1 AND t.due_date <= ?2)
             OR (t.due_at >= ?3 AND t.due_at < ?4))",
    )?;
    let rows = stmt
        .query_map(params![from_date, to_date, start_utc, end_utc], |r| {
            r.get::<_, String>(0)
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Khôi phục Event time block của Task theo đúng mốc xoá `stamp`.
pub fn restore_for_task(conn: &Connection, task_id: &str, stamp: &str, now: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE events SET deleted_at = NULL, updated_at = ?3, version = version + 1
         WHERE task_id = ?1 AND deleted_at = ?2",
        params![task_id, stamp, now],
    )?;
    Ok(())
}

/// Xoá mềm mọi Event time block của Task cùng mốc `now`.
pub fn soft_delete_for_task(conn: &Connection, task_id: &str, now: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE events SET deleted_at = ?2, updated_at = ?2, version = version + 1
         WHERE task_id = ?1 AND deleted_at IS NULL",
        params![task_id, now],
    )?;
    Ok(())
}
