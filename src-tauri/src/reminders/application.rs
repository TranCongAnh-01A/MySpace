use rusqlite::Connection;

use crate::clock::Clock;
use crate::error::{AppError, AppResult, ErrorCode};
use crate::modules::calendar::infrastructure as events;
use crate::modules::tasks::application::TaskRepository;
use crate::modules::tasks::infrastructure::SqliteTaskRepository;
use crate::modules::tasks::timectx::TimeCtx;

use super::domain::{
    event_anchor, normalize_trigger, task_anchor, trigger_from_offset, MissedReminder, Reminder,
    ReminderSet,
};
use super::repository as repo;

fn anchor_for(
    conn: &Connection,
    clock: &dyn Clock,
    ctx: &TimeCtx,
    task_id: Option<&str>,
    event_id: Option<&str>,
) -> AppResult<Option<String>> {
    if let Some(id) = task_id {
        let task = SqliteTaskRepository::new(conn, clock)
            .get(id)?
            .ok_or_else(|| AppError::new(ErrorCode::NotFound, "Không tìm thấy Task"))?;
        return Ok(task_anchor(
            task.due_date.as_deref(),
            task.due_at.as_deref(),
            ctx,
        ));
    }
    let id = event_id.unwrap_or_default();
    let event = events::get(conn, id)?
        .ok_or_else(|| AppError::new(ErrorCode::NotFound, "Không tìm thấy Event"))?;
    Ok(event_anchor(
        event.start_at.as_deref(),
        event.start_date.as_deref(),
        ctx,
    ))
}

pub fn set(
    conn: &Connection,
    clock: &dyn Clock,
    ctx: &TimeCtx,
    input: &ReminderSet,
) -> AppResult<Reminder> {
    let task_id = input.task_id.as_deref().filter(|s| !s.is_empty());
    let event_id = input.event_id.as_deref().filter(|s| !s.is_empty());
    if task_id.is_some() == event_id.is_some() {
        return Err(AppError::validation("Cần đúng một trong taskId/eventId"));
    }
    if input.offset_minutes.is_some() == input.trigger_at.is_some() {
        return Err(AppError::validation(
            "Cần đúng một trong offsetMinutes/triggerAt",
        ));
    }
    let anchor = anchor_for(conn, clock, ctx, task_id, event_id)?;
    let trigger = match (input.offset_minutes, &input.trigger_at) {
        (Some(off), _) => {
            let a = anchor.ok_or_else(|| {
                AppError::validation("Chưa có hạn / giờ bắt đầu để tính thời điểm nhắc")
            })?;
            trigger_from_offset(&a, off)?
        }
        (None, Some(at)) => normalize_trigger(at)?,
        (None, None) => unreachable!("đã kiểm tra ở trên"),
    };
    repo::insert(
        conn,
        clock,
        task_id,
        event_id,
        &trigger,
        input.offset_minutes,
    )
}

pub fn list(
    conn: &Connection,
    task_id: Option<&str>,
    event_id: Option<&str>,
) -> AppResult<Vec<Reminder>> {
    repo::list(conn, task_id, event_id)
}

pub fn delete(conn: &Connection, clock: &dyn Clock, id: &str) -> AppResult<()> {
    if repo::delete_hard(conn, id, clock)? {
        Ok(())
    } else {
        Err(AppError::new(
            ErrorCode::NotFound,
            "Không tìm thấy lần nhắc",
        ))
    }
}

pub fn missed_list(conn: &Connection, ctx: &TimeCtx) -> AppResult<Vec<MissedReminder>> {
    let mut out = Vec::new();
    for reminder in repo::missed(conn)? {
        if let Some((title, anchor)) = repo::source_info(conn, &reminder, ctx)? {
            let due_label_at = anchor.unwrap_or_else(|| reminder.trigger_at.clone());
            out.push(MissedReminder {
                reminder,
                title,
                due_label_at,
            });
        }
    }
    Ok(out)
}

pub fn dismiss(conn: &Connection, clock: &dyn Clock, id: &str) -> AppResult<()> {
    repo::dismiss_missed(conn, clock, Some(id))
}

pub fn dismiss_all(conn: &Connection, clock: &dyn Clock) -> AppResult<()> {
    repo::dismiss_missed(conn, clock, None)
}
