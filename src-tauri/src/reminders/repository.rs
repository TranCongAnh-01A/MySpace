//! SQL cho bảng `reminders` (dùng trực tiếp trên Connection, cùng transaction của use case).

use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::clock::Clock;
use crate::db::changelog::{self, ChangeOp};
use crate::error::AppResult;
use crate::ids;
use crate::modules::tasks::timectx::TimeCtx;

use super::domain::{event_anchor, task_anchor, trigger_from_offset, Reminder, ReminderStatus};

const SELECT: &str = "SELECT r.id, r.task_id, r.event_id, r.trigger_at, r.offset_minutes,
    r.status, r.sent_at FROM reminders r";

fn map(row: &Row<'_>) -> rusqlite::Result<Reminder> {
    let status: String = row.get(5)?;
    Ok(Reminder {
        id: row.get(0)?,
        task_id: row.get(1)?,
        event_id: row.get(2)?,
        trigger_at: row.get(3)?,
        offset_minutes: row
            .get::<_, Option<i64>>(4)?
            .map(|v| v.unsigned_abs() as u32),
        status: ReminderStatus::parse(&status).unwrap_or(ReminderStatus::Missed),
        sent_at: row.get(6)?,
    })
}

pub fn insert(
    conn: &Connection,
    clock: &dyn Clock,
    task_id: Option<&str>,
    event_id: Option<&str>,
    trigger_at: &str,
    offset: Option<u32>,
) -> AppResult<Reminder> {
    let id = ids::new_id();
    let now = clock.now_iso();
    conn.execute(
        "INSERT INTO reminders (id, task_id, event_id, trigger_at, offset_minutes, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![id, task_id, event_id, trigger_at, offset, now],
    )?;
    changelog::record(conn, "reminder", &id, ChangeOp::Insert, clock)?;
    Ok(get(conn, &id)?.expect("vừa chèn"))
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Option<Reminder>> {
    let sql = format!("{SELECT} WHERE r.id = ?1 AND r.deleted_at IS NULL");
    Ok(conn.query_row(&sql, [id], map).optional()?)
}

/// Mọi trạng thái, sắp theo `trigger_at`. Không lọc thì trả tất cả.
pub fn list(
    conn: &Connection,
    task_id: Option<&str>,
    event_id: Option<&str>,
) -> AppResult<Vec<Reminder>> {
    let sql = format!(
        "{SELECT} WHERE r.deleted_at IS NULL
           AND (?1 IS NULL OR r.task_id = ?1) AND (?2 IS NULL OR r.event_id = ?2)
         ORDER BY r.trigger_at, r.id"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map(params![task_id, event_id], map)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn delete_hard(conn: &Connection, id: &str, clock: &dyn Clock) -> AppResult<bool> {
    let n = conn.execute("DELETE FROM reminders WHERE id = ?1", [id])?;
    if n > 0 {
        changelog::record(conn, "reminder", id, ChangeOp::Delete, clock)?;
    }
    Ok(n > 0)
}

/// Đổi trạng thái `from` → `to`; trả `true` khi đúng một dòng được cập nhật.
pub fn set_status(
    conn: &Connection,
    clock: &dyn Clock,
    id: &str,
    from: ReminderStatus,
    to: ReminderStatus,
) -> AppResult<bool> {
    let now = clock.now_iso();
    let sent_at = (to == ReminderStatus::Sent).then(|| now.clone());
    let n = conn.execute(
        "UPDATE reminders SET status = ?3, sent_at = COALESCE(?4, sent_at), updated_at = ?5
         WHERE id = ?1 AND status = ?2 AND deleted_at IS NULL",
        params![id, from.as_str(), to.as_str(), sent_at, now],
    )?;
    if n > 0 {
        changelog::record(conn, "reminder", id, ChangeOp::Update, clock)?;
    }
    Ok(n > 0)
}

/// Lần nhắc `Pending` gần nhất; bỏ bản ghi đã xoá và nguồn (Task/Event) đã xoá.
pub fn next_pending(conn: &Connection) -> AppResult<Option<Reminder>> {
    let sql = format!(
        "{SELECT}
         LEFT JOIN tasks t ON t.id = r.task_id
         LEFT JOIN events e ON e.id = r.event_id
         WHERE r.status = 'Pending' AND r.deleted_at IS NULL
           AND (r.task_id IS NULL OR t.deleted_at IS NULL)
           AND (r.event_id IS NULL OR e.deleted_at IS NULL)
         ORDER BY r.trigger_at, r.id LIMIT 1"
    );
    Ok(conn.query_row(&sql, [], map).optional()?)
}

/// Tiêu đề và mốc gốc (UTC) của nguồn một lần nhắc.
pub fn source_info(
    conn: &Connection,
    r: &Reminder,
    ctx: &TimeCtx,
) -> AppResult<Option<(String, Option<String>)>> {
    if let Some(id) = &r.task_id {
        let row = conn
            .query_row(
                "SELECT title, due_date, due_at FROM tasks WHERE id = ?1",
                [id],
                |x| {
                    Ok((
                        x.get::<_, String>(0)?,
                        x.get::<_, Option<String>>(1)?,
                        x.get::<_, Option<String>>(2)?,
                    ))
                },
            )
            .optional()?;
        return Ok(row.map(|(t, d, a)| (t, task_anchor(d.as_deref(), a.as_deref(), ctx))));
    }
    if let Some(id) = &r.event_id {
        let row = conn
            .query_row(
                "SELECT title, start_at, start_date FROM events WHERE id = ?1",
                [id],
                |x| {
                    Ok((
                        x.get::<_, String>(0)?,
                        x.get::<_, Option<String>>(1)?,
                        x.get::<_, Option<String>>(2)?,
                    ))
                },
            )
            .optional()?;
        return Ok(row.map(|(t, a, d)| (t, event_anchor(a.as_deref(), d.as_deref(), ctx))));
    }
    Ok(None)
}

/// Reminder `Missed`, mới nhất trước; bỏ nguồn đã xoá.
pub fn missed(conn: &Connection) -> AppResult<Vec<Reminder>> {
    let sql = format!(
        "{SELECT}
         LEFT JOIN tasks t ON t.id = r.task_id
         LEFT JOIN events e ON e.id = r.event_id
         WHERE r.status = 'Missed' AND r.deleted_at IS NULL
           AND (r.task_id IS NULL OR t.deleted_at IS NULL)
           AND (r.event_id IS NULL OR e.deleted_at IS NULL)
         ORDER BY r.trigger_at DESC, r.id DESC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], map)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// `Missed` → `Dismissed` cho một reminder (`id`) hoặc tất cả (`None`).
pub fn dismiss_missed(conn: &Connection, clock: &dyn Clock, id: Option<&str>) -> AppResult<()> {
    conn.execute(
        "UPDATE reminders SET status = 'Dismissed', updated_at = ?2
         WHERE status = 'Missed' AND deleted_at IS NULL AND (?1 IS NULL OR id = ?1)",
        params![id, clock.now_iso()],
    )?;
    Ok(())
}

// ---------- Đồng bộ theo Task / Event ----------

/// Tính lại `trigger_at` của reminder `Pending` có offset; mất mốc gốc thì xoá cứng chúng.
fn recompute(
    conn: &Connection,
    clock: &dyn Clock,
    column: &str,
    source_id: &str,
    anchor: Option<String>,
) -> AppResult<()> {
    let sql = format!(
        "SELECT id, offset_minutes FROM reminders
         WHERE {column} = ?1 AND status = 'Pending' AND offset_minutes IS NOT NULL
           AND deleted_at IS NULL"
    );
    let rows: Vec<(String, u32)> = conn
        .prepare(&sql)?
        .query_map([source_id], |r| {
            Ok((r.get(0)?, r.get::<_, i64>(1)?.unsigned_abs() as u32))
        })?
        .collect::<Result<_, _>>()?;
    for (id, offset) in rows {
        match &anchor {
            Some(a) => {
                conn.execute(
                    "UPDATE reminders SET trigger_at = ?2, updated_at = ?3 WHERE id = ?1",
                    params![id, trigger_from_offset(a, offset)?, clock.now_iso()],
                )?;
                changelog::record(conn, "reminder", &id, ChangeOp::Update, clock)?;
            }
            None => {
                delete_hard(conn, &id, clock)?;
            }
        }
    }
    Ok(())
}

pub fn recompute_for_task(
    conn: &Connection,
    clock: &dyn Clock,
    ctx: &TimeCtx,
    task_id: &str,
    due_date: Option<&str>,
    due_at: Option<&str>,
) -> AppResult<()> {
    recompute(
        conn,
        clock,
        "task_id",
        task_id,
        task_anchor(due_date, due_at, ctx),
    )
}

pub fn recompute_for_event(
    conn: &Connection,
    clock: &dyn Clock,
    ctx: &TimeCtx,
    event_id: &str,
    start_at: Option<&str>,
    start_date: Option<&str>,
) -> AppResult<()> {
    recompute(
        conn,
        clock,
        "event_id",
        event_id,
        event_anchor(start_at, start_date, ctx),
    )
}

/// Task sang `Done`: reminder `Pending` thành `Dismissed`.
pub fn dismiss_pending_for_task(
    conn: &Connection,
    clock: &dyn Clock,
    task_id: &str,
) -> AppResult<()> {
    conn.execute(
        "UPDATE reminders SET status = 'Dismissed', updated_at = ?2
         WHERE task_id = ?1 AND status = 'Pending' AND deleted_at IS NULL",
        params![task_id, clock.now_iso()],
    )?;
    Ok(())
}

/// Chép reminder dạng offset từ Task cũ sang lần lặp mới (chỉ khi lần mới có mốc gốc).
pub fn copy_offsets(
    conn: &Connection,
    clock: &dyn Clock,
    ctx: &TimeCtx,
    from_task: &str,
    to_task: &str,
    due_date: Option<&str>,
    due_at: Option<&str>,
) -> AppResult<()> {
    let Some(anchor) = task_anchor(due_date, due_at, ctx) else {
        return Ok(());
    };
    let offsets: Vec<u32> = conn
        .prepare(
            "SELECT DISTINCT offset_minutes FROM reminders
             WHERE task_id = ?1 AND offset_minutes IS NOT NULL AND deleted_at IS NULL
             ORDER BY offset_minutes",
        )?
        .query_map([from_task], |r| {
            Ok(r.get::<_, i64>(0)?.unsigned_abs() as u32)
        })?
        .collect::<Result<_, _>>()?;
    for off in offsets {
        insert(
            conn,
            clock,
            Some(to_task),
            None,
            &trigger_from_offset(&anchor, off)?,
            Some(off),
        )?;
    }
    Ok(())
}

/// Xoá mềm reminder `Pending` của Task và của các Event time block, cùng mốc `now`.
pub fn soft_delete_for_task(conn: &Connection, task_id: &str, now: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE reminders SET deleted_at = ?2, updated_at = ?2
         WHERE status = 'Pending' AND deleted_at IS NULL
           AND (task_id = ?1 OR event_id IN
                (SELECT id FROM events WHERE task_id = ?1 AND deleted_at IS NULL))",
        params![task_id, now],
    )?;
    Ok(())
}

/// Khôi phục reminder đã xoá mềm đúng mốc `stamp` của Task và Event time block.
pub fn restore_for_task(conn: &Connection, task_id: &str, stamp: &str, now: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE reminders SET deleted_at = NULL, updated_at = ?3
         WHERE deleted_at = ?2
           AND (task_id = ?1 OR event_id IN (SELECT id FROM events WHERE task_id = ?1))",
        params![task_id, stamp, now],
    )?;
    Ok(())
}

pub fn soft_delete_for_event(conn: &Connection, event_id: &str, now: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE reminders SET deleted_at = ?2, updated_at = ?2
         WHERE event_id = ?1 AND status = 'Pending' AND deleted_at IS NULL",
        params![event_id, now],
    )?;
    Ok(())
}
