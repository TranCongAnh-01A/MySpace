use chrono::{Duration, NaiveDate};
use rusqlite::Connection;

use crate::clock::Clock;
use crate::error::{AppError, AppResult, ErrorCode};
use crate::ids;
use crate::modules::tasks::application::TaskRepository;
use crate::modules::tasks::domain::Task;
use crate::modules::tasks::infrastructure::SqliteTaskRepository;
use crate::modules::tasks::timectx::{fmt_date, parse_date, TimeCtx};
use crate::reminders::repository as reminders;

use super::domain::{validate_shape, Calendar, CalendarItem, Event, EventCreate, EventPatch};
use super::infrastructure as repo;

pub fn calendar_list(conn: &Connection) -> AppResult<Vec<Calendar>> {
    repo::calendars(conn)
}

fn require(conn: &Connection, id: &str) -> AppResult<Event> {
    repo::get(conn, id)?.ok_or_else(|| AppError::new(ErrorCode::NotFound, "Không tìm thấy Event"))
}

fn check_calendar(conn: &Connection, id: &str) -> AppResult<()> {
    if repo::calendar_exists(conn, id)? {
        Ok(())
    } else {
        Err(AppError::validation("Lịch không tồn tại"))
    }
}

pub fn event_create(conn: &Connection, clock: &dyn Clock, input: &EventCreate) -> AppResult<Event> {
    let calendar_id = match input.non_empty_calendar_id() {
        Some(id) => {
            check_calendar(conn, &id)?;
            id
        }
        None => repo::default_calendar_id(conn)?,
    };
    let task_id = input.non_empty_task_id();
    if let Some(t) = &task_id {
        if !repo::task_exists(conn, t)? {
            return Err(AppError::validation("Task không tồn tại"));
        }
    }
    let now = clock.now_iso();
    let mut event = Event {
        id: ids::new_id(),
        calendar_id,
        task_id,
        title: input.title.clone(),
        description: input.description.clone().unwrap_or_default(),
        is_all_day: input.is_all_day,
        start_at: input.start_at.clone(),
        end_at: input.end_at.clone(),
        start_date: input.start_date.clone(),
        end_date: input.end_date.clone(),
        version: 1,
        created_at: now.clone(),
        updated_at: now,
    };
    validate_shape(&mut event)?;
    repo::insert(conn, clock, &event)?;
    require(conn, &event.id)
}

pub fn event_update(
    conn: &Connection,
    clock: &dyn Clock,
    ctx: &TimeCtx,
    id: &str,
    patch: &EventPatch,
    base_version: u64,
) -> AppResult<Event> {
    let mut event = require(conn, id)?;
    if event.version != base_version {
        return Err(AppError::new(
            ErrorCode::Conflict,
            "Event đã được thay đổi ở nơi khác, hãy tải lại",
        ));
    }
    let old_start = (event.start_at.clone(), event.start_date.clone());
    patch.apply(&mut event);
    if patch.calendar_id.is_some() {
        check_calendar(conn, &event.calendar_id)?;
    }
    validate_shape(&mut event)?;
    repo::save(conn, clock, &event)?;
    if old_start != (event.start_at.clone(), event.start_date.clone()) {
        reminders::recompute_for_event(
            conn,
            clock,
            ctx,
            id,
            event.start_at.as_deref(),
            event.start_date.as_deref(),
        )?;
    }
    require(conn, id)
}

/// Xoá mềm Event và Reminder `Pending` của nó.
pub fn event_delete(conn: &Connection, clock: &dyn Clock, id: &str) -> AppResult<()> {
    require(conn, id)?;
    let now = clock.now_iso();
    reminders::soft_delete_for_event(conn, id, &now)?;
    repo::soft_delete(conn, clock, id, &now)
}

/// Time block: Event có giờ gắn với Task, tiêu đề = tiêu đề Task.
pub fn schedule_block(
    conn: &Connection,
    clock: &dyn Clock,
    task_id: &str,
    start_at: &str,
    end_at: &str,
    calendar_id: Option<&str>,
) -> AppResult<Event> {
    let task = SqliteTaskRepository::new(conn, clock)
        .get(task_id)?
        .ok_or_else(|| AppError::new(ErrorCode::NotFound, "Không tìm thấy Task"))?;
    event_create(
        conn,
        clock,
        &EventCreate {
            calendar_id: calendar_id.map(str::to_string),
            title: task.title,
            description: None,
            is_all_day: false,
            start_at: Some(start_at.to_string()),
            end_at: Some(end_at.to_string()),
            task_id: Some(task_id.to_string()),
            ..Default::default()
        },
    )
}

fn midnight_key(date: &str, ctx: &TimeCtx) -> String {
    parse_date(date).map_or_else(String::new, |d| ctx.start_of_day_utc(d))
}

/// Khoá sắp xếp: (thời điểm bắt đầu, hạng). Hạng: cả ngày 0, có giờ 1, deadline 2.
fn event_sort_key(e: &Event, ctx: &TimeCtx) -> (String, u8) {
    match (&e.start_at, &e.start_date) {
        (Some(at), _) => (at.clone(), 1),
        (None, Some(d)) => (midnight_key(d, ctx), 0),
        _ => (String::new(), 1),
    }
}

fn deadline_sort_key(t: &Task, ctx: &TimeCtx) -> (String, u8) {
    match (&t.due_at, &t.due_date) {
        (Some(at), _) => (at.clone(), 2),
        (None, Some(d)) => (midnight_key(d, ctx), 2),
        _ => (String::new(), 2),
    }
}

/// Event + deadline trong khoảng ngày địa phương `[from, to]` (inclusive), sắp theo thời điểm.
pub fn range(
    conn: &Connection,
    clock: &dyn Clock,
    ctx: &TimeCtx,
    from: &str,
    to: &str,
) -> AppResult<Vec<CalendarItem>> {
    let bad = || AppError::validation("Ngày phải có dạng YYYY-MM-DD");
    let f: NaiveDate = parse_date(from).ok_or_else(bad)?;
    let t: NaiveDate = parse_date(to).ok_or_else(bad)?;
    if t < f {
        return Err(AppError::validation("`to` phải từ `from` trở đi"));
    }
    let start_utc = ctx.start_of_day_utc(f);
    let end_utc = ctx.start_of_day_utc(t + Duration::days(1));
    let (from_s, to_s) = (fmt_date(f), fmt_date(t));
    let mut items: Vec<((String, u8), CalendarItem)> = Vec::new();
    for e in repo::overlapping(conn, &from_s, &to_s, &start_utc, &end_utc)? {
        items.push((event_sort_key(&e, ctx), CalendarItem::Event { event: e }));
    }
    let tasks = SqliteTaskRepository::new(conn, clock);
    for id in repo::deadline_task_ids(conn, &from_s, &to_s, &start_utc, &end_utc)? {
        if let Some(task) = tasks.get(&id)? {
            items.push((
                deadline_sort_key(&task, ctx),
                CalendarItem::Deadline { task },
            ));
        }
    }
    items.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(items.into_iter().map(|(_, i)| i).collect())
}

/// Lịch hôm nay cho Dashboard: chỉ Event (không có deadline); cả ngày xếp trước.
pub fn today_schedule(
    conn: &Connection,
    clock: &dyn Clock,
    ctx: &TimeCtx,
) -> AppResult<Vec<CalendarItem>> {
    let day = fmt_date(ctx.today());
    let mut items: Vec<CalendarItem> = range(conn, clock, ctx, &day, &day)?
        .into_iter()
        .filter(|i| matches!(i, CalendarItem::Event { .. }))
        .collect();
    // Sắp ổn định: cả ngày trước, giữ nguyên thứ tự theo giờ bắt đầu.
    items.sort_by_key(|i| match i {
        CalendarItem::Event { event } => !event.is_all_day,
        CalendarItem::Deadline { .. } => true,
    });
    Ok(items)
}
