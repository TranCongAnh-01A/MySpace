use rusqlite::types::Value;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Row};

use crate::clock::Clock;
use crate::db::changelog::{self, ChangeOp};
use crate::error::{AppError, AppResult};
use crate::ids::DEFAULT_WORKSPACE_ID;
use crate::modules::search::infrastructure::{self as search, SearchKind};

use crate::modules::calendar::infrastructure as events;
use crate::reminders::domain::Reminder;
use crate::reminders::repository as reminders;

use super::application::{Series, SeriesTemplate, TaskRepository};
use super::domain::{
    ChecklistItem, DueFilter, Frequency, Priority, Recurrence, Task, TaskFilter, TaskSort,
    TaskStatus, Weekday,
};
use super::timectx::{fmt_date, TimeCtx};

pub struct SqliteTaskRepository<'a> {
    conn: &'a Connection,
    clock: &'a dyn Clock,
}

impl<'a> SqliteTaskRepository<'a> {
    pub fn new(conn: &'a Connection, clock: &'a dyn Clock) -> Self {
        Self { conn, clock }
    }

    fn record(&self, id: &str, op: ChangeOp) -> AppResult<()> {
        changelog::record(self.conn, "task", id, op, self.clock)
    }

    fn reindex(&self, task: &Task) -> AppResult<()> {
        search::index(
            self.conn,
            SearchKind::Task,
            &task.id,
            &task.title,
            &task.description,
        )
    }
}

/// Khoá ngoại sai (Project/Area không tồn tại) là lỗi nhập liệu, không phải lỗi DB.
fn map_write_err(e: rusqlite::Error) -> AppError {
    if let rusqlite::Error::SqliteFailure(f, _) = &e {
        if f.extended_code == 787 {
            return AppError::validation("Project hoặc Area không tồn tại");
        }
    }
    AppError::from(e)
}

const TASK_SELECT: &str = "SELECT t.id, t.project_id, t.area_id, t.title, t.description,
        t.status, t.previous_status, t.priority, t.start_date, t.due_date, t.due_at,
        t.estimated_minutes, t.completed_at, t.sort_key, t.recurrence_series_id,
        t.occurrence_date, t.archived_at, t.deleted_at, t.version, t.created_at, t.updated_at,
        r.frequency, r.interval, r.by_weekday,
        (SELECT group_concat(tag_id) FROM task_tags WHERE task_id = t.id),
        (SELECT count(*) FROM checklist_items WHERE task_id = t.id AND is_done = 1),
        (SELECT count(*) FROM checklist_items WHERE task_id = t.id)
     FROM tasks t
     LEFT JOIN recurrence_series r
            ON r.id = t.recurrence_series_id AND r.is_active = 1 AND r.deleted_at IS NULL";

fn bad(col: usize, what: &str) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        col,
        rusqlite::types::Type::Text,
        format!("giá trị lạ: {what}").into(),
    )
}

fn map_task(row: &Row<'_>) -> rusqlite::Result<Task> {
    let status: String = row.get(5)?;
    let prev: Option<String> = row.get(6)?;
    let priority: String = row.get(7)?;
    let frequency: Option<String> = row.get(21)?;
    let recurrence = match frequency {
        Some(f) => {
            let by: Option<String> = row.get(23)?;
            Some(Recurrence {
                frequency: Frequency::parse(&f).ok_or_else(|| bad(21, &f))?,
                interval: row.get(22)?,
                by_weekday: by.map(|s| s.split(',').filter_map(Weekday::parse).collect()),
            })
        }
        None => None,
    };
    let tags: Option<String> = row.get(24)?;
    let mut tag_ids: Vec<String> = tags
        .map(|s| s.split(',').map(str::to_string).collect())
        .unwrap_or_default();
    tag_ids.sort();
    Ok(Task {
        id: row.get(0)?,
        project_id: row.get(1)?,
        area_id: row.get(2)?,
        title: row.get(3)?,
        description: row.get(4)?,
        status: TaskStatus::parse(&status).ok_or_else(|| bad(5, &status))?,
        previous_status: prev.as_deref().and_then(TaskStatus::parse),
        priority: Priority::parse(&priority).ok_or_else(|| bad(7, &priority))?,
        start_date: row.get(8)?,
        due_date: row.get(9)?,
        due_at: row.get(10)?,
        estimated_minutes: row.get(11)?,
        completed_at: row.get(12)?,
        sort_key: row.get(13)?,
        series_id: row.get(14)?,
        occurrence_date: row.get(15)?,
        archived_at: row.get(16)?,
        deleted_at: row.get(17)?,
        version: row.get::<_, i64>(18)?.unsigned_abs(),
        created_at: row.get(19)?,
        updated_at: row.get(20)?,
        recurrence,
        tag_ids,
        checklist_done: row.get(25)?,
        checklist_total: row.get(26)?,
    })
}

fn map_checklist(row: &Row<'_>) -> rusqlite::Result<ChecklistItem> {
    Ok(ChecklistItem {
        id: row.get(0)?,
        task_id: row.get(1)?,
        content: row.get(2)?,
        is_done: row.get::<_, i64>(3)? != 0,
        sort_key: row.get(4)?,
    })
}

fn due_sort_key(t: &Task, ctx: &TimeCtx) -> (bool, String, bool, String) {
    let day = t.due_day(ctx);
    (
        day.is_none(),
        day.unwrap_or_default(),
        t.due_at.is_none(),
        t.due_at.clone().unwrap_or_default(),
    )
}

/// Điều kiện lọc theo hạn, tham số nối thêm vào `params`.
fn due_clause(due: DueFilter, ctx: &TimeCtx, params: &mut Vec<Value>) -> String {
    let today = ctx.today();
    let tomorrow = today.succ_opt().unwrap_or(today);
    let day8 = today + chrono::Duration::days(8);
    let text = |s: String| Value::Text(s);
    match due {
        DueFilter::Today => {
            params.extend([
                text(fmt_date(today)),
                text(ctx.start_of_day_utc(today)),
                text(ctx.start_of_day_utc(tomorrow)),
            ]);
            let n = params.len();
            format!(
                "(t.due_date = ?{} OR (t.due_at >= ?{} AND t.due_at < ?{}))",
                n - 2,
                n - 1,
                n
            )
        }
        DueFilter::Overdue => {
            params.extend([text(fmt_date(today)), text(ctx.now_iso())]);
            let n = params.len();
            format!(
                "(t.status <> 'Done' AND (t.due_date < ?{} OR t.due_at < ?{}))",
                n - 1,
                n
            )
        }
        DueFilter::Next7 => {
            params.extend([
                text(fmt_date(tomorrow)),
                text(fmt_date(today + chrono::Duration::days(7))),
                text(ctx.start_of_day_utc(tomorrow)),
                text(ctx.start_of_day_utc(day8)),
            ]);
            let n = params.len();
            format!(
                "((t.due_date >= ?{a} AND t.due_date <= ?{b}) OR (t.due_at >= ?{c} AND t.due_at < ?{d}))",
                a = n - 3,
                b = n - 2,
                c = n - 1,
                d = n
            )
        }
        DueFilter::None => "(t.due_date IS NULL AND t.due_at IS NULL)".to_string(),
    }
}

/// `project_id IS ?` theo cột Kanban: `None` = Task không thuộc Project nào.
fn column_where(project_id: Option<&str>) -> (&'static str, Value) {
    (
        "t.project_id IS ?1 AND t.status = ?2 AND t.deleted_at IS NULL AND t.archived_at IS NULL",
        project_id.map_or(Value::Null, |p| Value::Text(p.to_string())),
    )
}

impl TaskRepository for SqliteTaskRepository<'_> {
    fn insert(&self, t: &Task) -> AppResult<()> {
        let now = self.clock.now_iso();
        self.conn
            .execute(
                "INSERT INTO tasks (id, workspace_id, project_id, area_id, title, description,
                    status, previous_status, priority, start_date, due_date, due_at,
                    estimated_minutes, completed_at, sort_key, recurrence_series_id,
                    occurrence_date, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?18)",
                params![
                    t.id,
                    DEFAULT_WORKSPACE_ID,
                    t.project_id,
                    t.area_id,
                    t.title,
                    t.description,
                    t.status.as_str(),
                    t.previous_status.map(TaskStatus::as_str),
                    t.priority.as_str(),
                    t.start_date,
                    t.due_date,
                    t.due_at,
                    t.estimated_minutes,
                    t.completed_at,
                    t.sort_key,
                    t.series_id,
                    t.occurrence_date,
                    now
                ],
            )
            .map_err(map_write_err)?;
        self.reindex(t)?;
        self.record(&t.id, ChangeOp::Insert)
    }

    fn save(&self, t: &Task) -> AppResult<()> {
        self.conn
            .execute(
                "UPDATE tasks SET project_id = ?2, area_id = ?3, title = ?4, description = ?5,
                    status = ?6, previous_status = ?7, priority = ?8, start_date = ?9,
                    due_date = ?10, due_at = ?11, estimated_minutes = ?12, completed_at = ?13,
                    sort_key = ?14, recurrence_series_id = ?15, occurrence_date = ?16,
                    version = version + 1, updated_at = ?17
                 WHERE id = ?1 AND deleted_at IS NULL",
                params![
                    t.id,
                    t.project_id,
                    t.area_id,
                    t.title,
                    t.description,
                    t.status.as_str(),
                    t.previous_status.map(TaskStatus::as_str),
                    t.priority.as_str(),
                    t.start_date,
                    t.due_date,
                    t.due_at,
                    t.estimated_minutes,
                    t.completed_at,
                    t.sort_key,
                    t.series_id,
                    t.occurrence_date,
                    self.clock.now_iso()
                ],
            )
            .map_err(map_write_err)?;
        self.reindex(t)?;
        self.record(&t.id, ChangeOp::Update)
    }

    fn get(&self, id: &str) -> AppResult<Option<Task>> {
        let sql = format!("{TASK_SELECT} WHERE t.id = ?1 AND t.deleted_at IS NULL");
        Ok(self.conn.query_row(&sql, [id], map_task).optional()?)
    }

    fn list(&self, filter: &TaskFilter, ctx: &TimeCtx) -> AppResult<Vec<Task>> {
        let mut clauses = vec!["t.deleted_at IS NULL".to_string()];
        let mut params: Vec<Value> = Vec::new();
        clauses.push(if filter.archived == Some(true) {
            "t.archived_at IS NOT NULL".into()
        } else {
            "t.archived_at IS NULL".into()
        });
        // Giá trị enum là hằng của code nên nối thẳng vào SQL là an toàn.
        if let Some(list) = filter.status.as_ref().filter(|l| !l.is_empty()) {
            let items: Vec<String> = list.iter().map(|s| format!("'{}'", s.as_str())).collect();
            clauses.push(format!("t.status IN ({})", items.join(",")));
        }
        if let Some(list) = filter.priority.as_ref().filter(|l| !l.is_empty()) {
            let items: Vec<String> = list.iter().map(|s| format!("'{}'", s.as_str())).collect();
            clauses.push(format!("t.priority IN ({})", items.join(",")));
        }
        for (col, value) in [
            ("t.project_id", &filter.project_id),
            ("t.area_id", &filter.area_id),
        ] {
            if let Some(v) = value {
                params.push(Value::Text(v.clone()));
                clauses.push(format!("{col} = ?{}", params.len()));
            }
        }
        if let Some(tag) = &filter.tag_id {
            params.push(Value::Text(tag.clone()));
            clauses.push(format!(
                "EXISTS (SELECT 1 FROM task_tags x WHERE x.task_id = t.id AND x.tag_id = ?{})",
                params.len()
            ));
        }
        if let Some(due) = filter.due {
            let c = due_clause(due, ctx, &mut params);
            clauses.push(c);
        }
        let sort = filter.sort.unwrap_or(TaskSort::Manual);
        let order = match sort {
            TaskSort::Created => "t.created_at DESC, t.id DESC",
            _ => "t.sort_key, t.id",
        };
        let sql = format!(
            "{TASK_SELECT} WHERE {} ORDER BY {order}",
            clauses.join(" AND ")
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let mut tasks = stmt
            .query_map(params_from_iter(params), map_task)?
            .collect::<Result<Vec<_>, _>>()?;
        match sort {
            TaskSort::DueDate => tasks.sort_by_cached_key(|t| due_sort_key(t, ctx)),
            TaskSort::Priority => {
                tasks.sort_by_cached_key(|t| (t.priority.rank(), due_sort_key(t, ctx)));
            }
            TaskSort::Manual | TaskSort::Created => {}
        }
        Ok(tasks)
    }

    fn column_last_key(
        &self,
        project_id: Option<&str>,
        status: TaskStatus,
    ) -> AppResult<Option<String>> {
        let (cond, project) = column_where(project_id);
        let sql = format!("SELECT max(t.sort_key) FROM tasks t WHERE {cond}");
        Ok(self
            .conn
            .query_row(&sql, params![project, status.as_str()], |r| r.get(0))?)
    }

    fn column_neighbour(
        &self,
        project_id: Option<&str>,
        status: TaskStatus,
        key: &str,
        exclude_id: &str,
        after: bool,
    ) -> AppResult<Option<String>> {
        let (cond, project) = column_where(project_id);
        let (agg, cmp) = if after { ("min", ">") } else { ("max", "<") };
        let sql = format!(
            "SELECT {agg}(t.sort_key) FROM tasks t WHERE {cond} AND t.id <> ?3 AND t.sort_key {cmp} ?4"
        );
        Ok(self.conn.query_row(
            &sql,
            params![project, status.as_str(), exclude_id, key],
            |r| r.get(0),
        )?)
    }

    fn set_archived(&self, id: &str, archived: bool) -> AppResult<()> {
        let now = self.clock.now_iso();
        self.conn.execute(
            "UPDATE tasks SET archived_at = ?2, version = version + 1, updated_at = ?3
             WHERE id = ?1 AND deleted_at IS NULL",
            params![id, archived.then(|| now.clone()), now],
        )?;
        self.record(id, ChangeOp::Update)
    }

    fn soft_delete(&self, id: &str) -> AppResult<()> {
        let now = self.clock.now_iso();
        self.conn.execute(
            "UPDATE tasks SET deleted_at = ?2, version = version + 1, updated_at = ?2
             WHERE id = ?1 AND deleted_at IS NULL",
            params![id, now],
        )?;
        // Cùng mốc `now`: Event time block và Reminder `Pending` của Task / Event đó.
        reminders::soft_delete_for_task(self.conn, id, &now)?;
        events::soft_delete_for_task(self.conn, id, &now)?;
        search::remove(self.conn, SearchKind::Task, id)?;
        self.record(id, ChangeOp::Delete)
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

    fn replace_tags(&self, task_id: &str, tag_ids: &[String]) -> AppResult<()> {
        self.conn
            .execute("DELETE FROM task_tags WHERE task_id = ?1", [task_id])?;
        for tag in tag_ids {
            self.conn.execute(
                "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
                params![task_id, tag],
            )?;
        }
        Ok(())
    }

    fn note_ids(&self, task_id: &str) -> AppResult<Vec<String>> {
        crate::modules::notes::infrastructure::note_ids_of_task(self.conn, task_id)
    }

    fn checklist(&self, task_id: &str) -> AppResult<Vec<ChecklistItem>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, task_id, content, is_done, sort_key FROM checklist_items
             WHERE task_id = ?1 ORDER BY sort_key, id",
        )?;
        let rows = stmt
            .query_map([task_id], map_checklist)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    fn checklist_get(&self, id: &str) -> AppResult<Option<ChecklistItem>> {
        Ok(self
            .conn
            .query_row(
                "SELECT id, task_id, content, is_done, sort_key FROM checklist_items WHERE id = ?1",
                [id],
                map_checklist,
            )
            .optional()?)
    }

    fn checklist_insert(&self, item: &ChecklistItem) -> AppResult<()> {
        let now = self.clock.now_iso();
        self.conn.execute(
            "INSERT INTO checklist_items (id, task_id, content, is_done, sort_key, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
            params![item.id, item.task_id, item.content, item.is_done, item.sort_key, now],
        )?;
        changelog::record(
            self.conn,
            "checklist",
            &item.id,
            ChangeOp::Insert,
            self.clock,
        )
    }

    fn checklist_update(&self, item: &ChecklistItem) -> AppResult<()> {
        self.conn.execute(
            "UPDATE checklist_items SET content = ?2, is_done = ?3, sort_key = ?4, updated_at = ?5
             WHERE id = ?1",
            params![
                item.id,
                item.content,
                item.is_done,
                item.sort_key,
                self.clock.now_iso()
            ],
        )?;
        changelog::record(
            self.conn,
            "checklist",
            &item.id,
            ChangeOp::Update,
            self.clock,
        )
    }

    fn checklist_delete(&self, id: &str) -> AppResult<()> {
        self.conn
            .execute("DELETE FROM checklist_items WHERE id = ?1", [id])?;
        changelog::record(self.conn, "checklist", id, ChangeOp::Delete, self.clock)
    }

    fn checklist_last_key(&self, task_id: &str) -> AppResult<Option<String>> {
        Ok(self.conn.query_row(
            "SELECT max(sort_key) FROM checklist_items WHERE task_id = ?1",
            [task_id],
            |r| r.get(0),
        )?)
    }

    fn checklist_neighbour(
        &self,
        task_id: &str,
        key: &str,
        exclude_id: &str,
        after: bool,
    ) -> AppResult<Option<String>> {
        let (agg, cmp) = if after { ("min", ">") } else { ("max", "<") };
        let sql = format!(
            "SELECT {agg}(sort_key) FROM checklist_items
             WHERE task_id = ?1 AND id <> ?2 AND sort_key {cmp} ?3"
        );
        Ok(self
            .conn
            .query_row(&sql, params![task_id, exclude_id, key], |r| r.get(0))?)
    }

    fn series_get(&self, id: &str) -> AppResult<Option<Series>> {
        let row = self
            .conn
            .query_row(
                "SELECT frequency, interval, by_weekday, template_json, is_active
                 FROM recurrence_series WHERE id = ?1 AND deleted_at IS NULL",
                [id],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, u32>(1)?,
                        r.get::<_, Option<String>>(2)?,
                        r.get::<_, String>(3)?,
                        r.get::<_, i64>(4)?,
                    ))
                },
            )
            .optional()?;
        let Some((frequency, interval, by, template, active)) = row else {
            return Ok(None);
        };
        let template: SeriesTemplate = serde_json::from_str(&template)
            .map_err(|e| AppError::internal(format!("template lặp hỏng: {e}")))?;
        Ok(Some(Series {
            id: id.to_string(),
            recurrence: Recurrence {
                frequency: Frequency::parse(&frequency)
                    .ok_or_else(|| AppError::internal("tần suất lặp lạ"))?,
                interval,
                by_weekday: by.map(|s| s.split(',').filter_map(Weekday::parse).collect()),
            },
            is_active: active != 0,
            template,
        }))
    }

    fn series_insert(&self, s: &Series) -> AppResult<()> {
        let now = self.clock.now_iso();
        self.conn.execute(
            "INSERT INTO recurrence_series (id, workspace_id, frequency, interval, by_weekday,
                template_json, is_active, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
            params![
                s.id,
                DEFAULT_WORKSPACE_ID,
                s.recurrence.frequency.as_str(),
                s.recurrence.interval,
                weekdays_text(&s.recurrence),
                serde_json::to_string(&s.template)
                    .map_err(|e| AppError::internal(e.to_string()))?,
                s.is_active,
                now
            ],
        )?;
        Ok(())
    }

    fn series_update(&self, s: &Series) -> AppResult<()> {
        self.conn.execute(
            "UPDATE recurrence_series SET frequency = ?2, interval = ?3, by_weekday = ?4,
                template_json = ?5, is_active = ?6, updated_at = ?7
             WHERE id = ?1",
            params![
                s.id,
                s.recurrence.frequency.as_str(),
                s.recurrence.interval,
                weekdays_text(&s.recurrence),
                serde_json::to_string(&s.template)
                    .map_err(|e| AppError::internal(e.to_string()))?,
                s.is_active,
                self.clock.now_iso()
            ],
        )?;
        Ok(())
    }

    fn reminders(&self, task_id: &str) -> AppResult<Vec<Reminder>> {
        reminders::list(self.conn, Some(task_id), None)
    }

    fn reminders_recompute(&self, task: &Task, ctx: &TimeCtx) -> AppResult<()> {
        reminders::recompute_for_task(
            self.conn,
            self.clock,
            ctx,
            &task.id,
            task.due_date.as_deref(),
            task.due_at.as_deref(),
        )
    }

    fn reminders_dismiss_pending(&self, task_id: &str) -> AppResult<()> {
        reminders::dismiss_pending_for_task(self.conn, self.clock, task_id)
    }

    fn reminders_copy_offsets(&self, from_task: &str, to: &Task, ctx: &TimeCtx) -> AppResult<()> {
        reminders::copy_offsets(
            self.conn,
            self.clock,
            ctx,
            from_task,
            &to.id,
            to.due_date.as_deref(),
            to.due_at.as_deref(),
        )
    }

    fn occurrence_exists(&self, series_id: &str, date: &str) -> AppResult<bool> {
        let n: i64 = self.conn.query_row(
            "SELECT count(*) FROM tasks WHERE recurrence_series_id = ?1 AND occurrence_date = ?2",
            params![series_id, date],
            |r| r.get(0),
        )?;
        Ok(n > 0)
    }
}

fn weekdays_text(r: &Recurrence) -> Option<String> {
    r.by_weekday.as_ref().map(|days| {
        days.iter()
            .map(|d| d.as_str())
            .collect::<Vec<_>>()
            .join(",")
    })
}

// ---------- API cho module Trash và Inbox (dùng trực tiếp trên Connection) ----------

/// Task đã xoá mềm, mới xoá trước: `(id, title, deleted_at)`.
pub fn list_deleted(conn: &Connection) -> AppResult<Vec<(String, String, String)>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, deleted_at FROM tasks WHERE deleted_at IS NOT NULL
         ORDER BY deleted_at DESC, id DESC",
    )?;
    let rows = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Khôi phục Task: bỏ `deleted_at`, tách khỏi Project/Area đã bị xoá, index lại.
pub fn restore(conn: &Connection, id: &str, clock: &dyn Clock) -> AppResult<bool> {
    let now = clock.now_iso();
    let stamp: Option<String> = conn
        .query_row(
            "SELECT deleted_at FROM tasks WHERE id = ?1 AND deleted_at IS NOT NULL",
            [id],
            |r| r.get(0),
        )
        .optional()?;
    let changed = conn.execute(
        "UPDATE tasks SET deleted_at = NULL, version = version + 1, updated_at = ?2,
            project_id = CASE WHEN project_id IN (SELECT id FROM projects WHERE deleted_at IS NOT NULL)
                              THEN NULL ELSE project_id END,
            area_id = CASE WHEN area_id IN (SELECT id FROM areas WHERE deleted_at IS NOT NULL)
                           THEN NULL ELSE area_id END
         WHERE id = ?1 AND deleted_at IS NOT NULL",
        params![id, now],
    )?;
    if changed == 0 {
        return Ok(false);
    }
    // Event time block và Reminder bị xoá cùng Task (đúng mốc) quay lại.
    if let Some(stamp) = stamp {
        reminders::restore_for_task(conn, id, &stamp, &now)?;
        events::restore_for_task(conn, id, &stamp, &now)?;
    }
    let (title, description): (String, String) = conn.query_row(
        "SELECT title, description FROM tasks WHERE id = ?1",
        [id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    search::index(conn, SearchKind::Task, id, &title, &description)?;
    changelog::record(conn, "task", id, ChangeOp::Update, clock)?;
    Ok(true)
}

/// Xoá cứng Task theo thứ tự trong schema mục 3 (Inbox trỏ tới Task, Event, rồi Task).
pub fn purge(conn: &Connection, id: &str) -> AppResult<()> {
    let series: Option<String> = conn
        .query_row(
            "SELECT recurrence_series_id FROM tasks WHERE id = ?1",
            [id],
            |r| r.get(0),
        )
        .optional()?
        .flatten();
    let inbox_ids: Vec<String> = conn
        .prepare("SELECT id FROM inbox_items WHERE converted_task_id = ?1")?
        .query_map([id], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    for inbox_id in &inbox_ids {
        search::remove(conn, SearchKind::Inbox, inbox_id)?;
    }
    conn.execute("DELETE FROM inbox_items WHERE converted_task_id = ?1", [id])?;
    conn.execute("DELETE FROM events WHERE task_id = ?1", [id])?;
    // checklist_items, task_tags, note_tasks, reminders: xoá theo ON DELETE CASCADE.
    conn.execute("DELETE FROM tasks WHERE id = ?1", [id])?;
    search::remove(conn, SearchKind::Task, id)?;
    if let Some(series) = series {
        conn.execute(
            "DELETE FROM recurrence_series WHERE id = ?1
             AND NOT EXISTS (SELECT 1 FROM tasks WHERE recurrence_series_id = ?1)",
            [series],
        )?;
    }
    Ok(())
}

/// Id Task đã xoá mềm trước `cutoff_iso`.
pub fn deleted_before(conn: &Connection, cutoff_iso: &str) -> AppResult<Vec<String>> {
    let mut stmt =
        conn.prepare("SELECT id FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at < ?1")?;
    let rows = stmt
        .query_map([cutoff_iso], |r| r.get(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}
