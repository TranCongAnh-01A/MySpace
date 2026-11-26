use std::collections::HashSet;

use rusqlite::Connection;

use crate::clock::Clock;
use crate::error::AppResult;
use crate::modules::calendar::application as calendar;
use crate::modules::projects::application as projects;
use crate::modules::projects::domain::ProjectStatus;
use crate::modules::projects::infrastructure::SqliteProjectRepository;
use crate::modules::tasks::application as tasks;
use crate::modules::tasks::domain::{DueFilter, Task, TaskFilter, TaskSort, TaskStatus};
use crate::modules::tasks::infrastructure::SqliteTaskRepository;
use crate::modules::tasks::timectx::{fmt_date, TimeCtx};

use super::domain::TodayView;

pub const MAX_OVERDUE: usize = 50;
pub const MAX_UPCOMING: usize = 20;

const OPEN: [TaskStatus; 3] = [TaskStatus::Todo, TaskStatus::InProgress, TaskStatus::Review];

/// Task chưa `Done` theo bộ lọc hạn, bỏ Task thuộc Project đã lưu trữ.
fn open_tasks(
    repo: &SqliteTaskRepository<'_>,
    ctx: &TimeCtx,
    due: DueFilter,
    sort: TaskSort,
    archived_projects: &HashSet<String>,
) -> AppResult<Vec<Task>> {
    let filter = TaskFilter {
        status: Some(OPEN.to_vec()),
        due: Some(due),
        sort: Some(sort),
        ..Default::default()
    };
    Ok(tasks::list(repo, ctx, &filter)?
        .into_iter()
        .filter(|t| {
            t.project_id
                .as_ref()
                .map_or(true, |p| !archived_projects.contains(p))
        })
        .collect())
}

pub fn today(conn: &Connection, clock: &dyn Clock, ctx: &TimeCtx) -> AppResult<TodayView> {
    let task_repo = SqliteTaskRepository::new(conn, clock);
    let project_repo = SqliteProjectRepository::new(conn, clock);

    let archived: HashSet<String> = projects::list(&project_repo, true)?
        .into_iter()
        .map(|p| p.id)
        .collect();

    let mut today = open_tasks(
        &task_repo,
        ctx,
        DueFilter::Today,
        TaskSort::Priority,
        &archived,
    )?;
    // Có giờ trước (theo giờ), rồi tới Task cả ngày theo ưu tiên.
    today.sort_by(|a, b| {
        (
            a.due_at.is_none(),
            &a.due_at,
            a.priority.rank(),
            &a.sort_key,
        )
            .cmp(&(
                b.due_at.is_none(),
                &b.due_at,
                b.priority.rank(),
                &b.sort_key,
            ))
    });

    let mut overdue = open_tasks(
        &task_repo,
        ctx,
        DueFilter::Overdue,
        TaskSort::DueDate,
        &archived,
    )?;
    overdue.truncate(MAX_OVERDUE);

    let mut upcoming = open_tasks(
        &task_repo,
        ctx,
        DueFilter::Next7,
        TaskSort::DueDate,
        &archived,
    )?;
    upcoming.truncate(MAX_UPCOMING);

    let mut active_projects = Vec::new();
    for p in projects::list(&project_repo, false)? {
        if p.status == ProjectStatus::Active {
            active_projects.push(projects::progress(&project_repo, &p)?);
        }
    }

    Ok(TodayView {
        date: fmt_date(ctx.today()),
        today,
        overdue,
        upcoming,
        active_projects,
        recent_notes: Vec::new(), // Note có từ v0.5
        schedule: calendar::today_schedule(conn, clock, ctx)?,
    })
}

#[cfg(test)]
#[path = "application_tests.rs"]
mod tests;
