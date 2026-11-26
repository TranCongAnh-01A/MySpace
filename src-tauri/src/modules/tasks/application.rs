use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult, ErrorCode};
use crate::ids;
use crate::sort_key;

use super::domain::{
    normalize_due_at, validate_checklist_content, validate_date, validate_description,
    validate_estimated, validate_title, ChecklistItem, Priority, Recurrence, Task, TaskCreate,
    TaskDetail, TaskFilter, TaskPatch, TaskStatus, TaskStatusResult,
};
use super::recurrence::next_occurrence;
use super::timectx::{fmt_date, parse_date, TimeCtx};

/// Mẫu để sinh các lần lặp sau. `anchor_date` là ngày của lần đầu tiên.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesTemplate {
    pub title: String,
    pub description: String,
    pub priority: Priority,
    pub project_id: Option<String>,
    pub area_id: Option<String>,
    pub tag_ids: Vec<String>,
    pub checklist: Vec<String>,
    pub estimated_minutes: Option<u32>,
    /// Giờ địa phương `HH:MM:SS` nếu hạn có giờ.
    pub due_time: Option<String>,
    pub anchor_date: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Series {
    pub id: String,
    pub recurrence: Recurrence,
    pub is_active: bool,
    pub template: SeriesTemplate,
}

/// Cổng ra của module Tasks (task, checklist, series lặp).
pub trait TaskRepository {
    fn insert(&self, task: &Task) -> AppResult<()>;
    /// Ghi mọi trường sửa được; `version` tăng 1 ở tầng này.
    fn save(&self, task: &Task) -> AppResult<()>;
    /// Task chưa xoá mềm (kể cả đã lưu trữ).
    fn get(&self, id: &str) -> AppResult<Option<Task>>;
    fn list(&self, filter: &TaskFilter, ctx: &TimeCtx) -> AppResult<Vec<Task>>;
    fn column_last_key(
        &self,
        project_id: Option<&str>,
        status: TaskStatus,
    ) -> AppResult<Option<String>>;
    fn column_neighbour(
        &self,
        project_id: Option<&str>,
        status: TaskStatus,
        key: &str,
        exclude_id: &str,
        after: bool,
    ) -> AppResult<Option<String>>;
    fn set_archived(&self, id: &str, archived: bool) -> AppResult<()>;
    fn soft_delete(&self, id: &str) -> AppResult<()>;
    fn existing_tag_ids(&self, ids: &[String]) -> AppResult<Vec<String>>;
    fn replace_tags(&self, task_id: &str, tag_ids: &[String]) -> AppResult<()>;
    fn checklist(&self, task_id: &str) -> AppResult<Vec<ChecklistItem>>;
    fn checklist_get(&self, id: &str) -> AppResult<Option<ChecklistItem>>;
    fn checklist_insert(&self, item: &ChecklistItem) -> AppResult<()>;
    fn checklist_update(&self, item: &ChecklistItem) -> AppResult<()>;
    fn checklist_delete(&self, id: &str) -> AppResult<()>;
    fn checklist_last_key(&self, task_id: &str) -> AppResult<Option<String>>;
    fn checklist_neighbour(
        &self,
        task_id: &str,
        key: &str,
        exclude_id: &str,
        after: bool,
    ) -> AppResult<Option<String>>;
    fn series_get(&self, id: &str) -> AppResult<Option<Series>>;
    fn series_insert(&self, series: &Series) -> AppResult<()>;
    fn series_update(&self, series: &Series) -> AppResult<()>;
    fn occurrence_exists(&self, series_id: &str, date: &str) -> AppResult<bool>;
}

fn not_found() -> AppError {
    AppError::new(ErrorCode::NotFound, "Không tìm thấy Task")
}

fn require(repo: &dyn TaskRepository, id: &str) -> AppResult<Task> {
    repo.get(id)?.ok_or_else(not_found)
}

fn non_empty(s: &Option<String>) -> Option<String> {
    s.as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn check_tags(repo: &dyn TaskRepository, ids: &[String]) -> AppResult<Vec<String>> {
    let mut unique: Vec<String> = Vec::new();
    for id in ids {
        if !unique.contains(id) {
            unique.push(id.clone());
        }
    }
    if repo.existing_tag_ids(&unique)?.len() != unique.len() {
        return Err(AppError::validation("Có tag không tồn tại"));
    }
    Ok(unique)
}

// ---------- Truy vấn ----------

pub fn list(repo: &dyn TaskRepository, ctx: &TimeCtx, filter: &TaskFilter) -> AppResult<Vec<Task>> {
    repo.list(filter, ctx)
}

pub fn get_detail(repo: &dyn TaskRepository, id: &str) -> AppResult<TaskDetail> {
    let task = require(repo, id)?;
    Ok(TaskDetail {
        checklist: repo.checklist(id)?,
        task,
        note_ids: Vec::new(),
    })
}

// ---------- Tạo ----------

fn template_for(
    task: &Task,
    checklist: Vec<String>,
    ctx: &TimeCtx,
    anchor: &str,
) -> SeriesTemplate {
    SeriesTemplate {
        title: task.title.clone(),
        description: task.description.clone(),
        priority: task.priority,
        project_id: task.project_id.clone(),
        area_id: task.area_id.clone(),
        tag_ids: task.tag_ids.clone(),
        checklist,
        estimated_minutes: task.estimated_minutes,
        due_time: task.due_at.as_deref().and_then(|at| ctx.local_time(at)),
        anchor_date: anchor.to_string(),
    }
}

pub fn create(repo: &dyn TaskRepository, ctx: &TimeCtx, input: &TaskCreate) -> AppResult<Task> {
    let status = input.status.unwrap_or(TaskStatus::Todo);
    let now = ctx.now_iso();
    let mut task = Task {
        id: ids::new_id(),
        project_id: non_empty(&input.project_id),
        area_id: non_empty(&input.area_id),
        title: validate_title(&input.title)?,
        description: validate_description(input.description.as_deref().unwrap_or(""))?,
        status,
        priority: input.priority.unwrap_or(Priority::Medium),
        start_date: non_empty(&input.start_date)
            .as_deref()
            .map(validate_date)
            .transpose()?,
        due_date: non_empty(&input.due_date)
            .as_deref()
            .map(validate_date)
            .transpose()?,
        due_at: non_empty(&input.due_at)
            .as_deref()
            .map(normalize_due_at)
            .transpose()?,
        estimated_minutes: input
            .estimated_minutes
            .map(validate_estimated)
            .transpose()?,
        completed_at: (status == TaskStatus::Done).then(|| now.clone()),
        sort_key: String::new(),
        recurrence: input
            .recurrence
            .clone()
            .map(Recurrence::validated)
            .transpose()?,
        tag_ids: check_tags(repo, input.tag_ids.as_deref().unwrap_or(&[]))?,
        checklist_done: 0,
        checklist_total: 0,
        archived_at: None,
        deleted_at: None,
        version: 1,
        created_at: now.clone(),
        updated_at: now,
        previous_status: None,
        series_id: None,
        occurrence_date: None,
    };
    task.validate_shape(ctx)?;
    let last = repo.column_last_key(task.project_id.as_deref(), status)?;
    task.sort_key = sort_key::between(last.as_deref(), None);

    if let Some(rec) = task.recurrence.clone() {
        let day = task
            .due_day(ctx)
            .ok_or_else(|| AppError::validation("Task lặp cần có hạn"))?;
        let series = Series {
            id: ids::new_id(),
            recurrence: rec,
            is_active: true,
            template: template_for(&task, Vec::new(), ctx, &day),
        };
        repo.series_insert(&series)?;
        task.series_id = Some(series.id);
        task.occurrence_date = Some(day);
    }
    repo.insert(&task)?;
    repo.replace_tags(&task.id, &task.tag_ids)?;
    require(repo, &task.id)
}

// ---------- Cập nhật ----------

pub fn update(
    repo: &dyn TaskRepository,
    ctx: &TimeCtx,
    id: &str,
    patch: &TaskPatch,
    base_version: u64,
) -> AppResult<Task> {
    let mut task = require(repo, id)?;
    if task.version != base_version {
        return Err(AppError::new(
            ErrorCode::Conflict,
            "Task đã được thay đổi ở nơi khác, hãy tải lại",
        ));
    }
    let old_due_day = task.due_day(ctx);

    if let Some(v) = &patch.title {
        task.title = validate_title(v)?;
    }
    if let Some(v) = &patch.description {
        task.description = validate_description(v)?;
    }
    if let Some(v) = patch.priority {
        task.priority = v;
    }
    // Đặt hạn theo ngày thì bỏ hạn theo giờ (và ngược lại) nếu patch không nói gì về trường kia.
    if let Some(v) = &patch.due_date {
        task.due_date = non_empty(v).as_deref().map(validate_date).transpose()?;
        if task.due_date.is_some() && patch.due_at.is_none() {
            task.due_at = None;
        }
    }
    if let Some(v) = &patch.due_at {
        task.due_at = non_empty(v).as_deref().map(normalize_due_at).transpose()?;
        if task.due_at.is_some() && patch.due_date.is_none() {
            task.due_date = None;
        }
    }
    if let Some(v) = &patch.start_date {
        task.start_date = non_empty(v).as_deref().map(validate_date).transpose()?;
    }
    if let Some(v) = patch.estimated_minutes {
        task.estimated_minutes = v.map(validate_estimated).transpose()?;
    }
    // Chuyển sang Project thì bỏ Area (và ngược lại) nếu patch không nói gì về trường kia.
    if let Some(v) = &patch.project_id {
        task.project_id = non_empty(v);
        if task.project_id.is_some() && patch.area_id.is_none() {
            task.area_id = None;
        }
    }
    if let Some(v) = &patch.area_id {
        task.area_id = non_empty(v);
        if task.area_id.is_some() && patch.project_id.is_none() {
            task.project_id = None;
        }
    }

    // Task lặp: bật/đổi/tắt chuỗi lặp.
    let mut series = match &task.series_id {
        Some(sid) => repo.series_get(sid)?,
        None => None,
    };
    match &patch.recurrence {
        Some(Some(rec)) => task.recurrence = Some(rec.clone().validated()?),
        Some(None) => task.recurrence = None,
        None => {}
    }
    task.validate_shape(ctx)?;

    let new_due_day = task.due_day(ctx);
    if let Some(rec) = task.recurrence.clone() {
        let day = new_due_day.clone().unwrap_or_default();
        if let Some(s) = series.as_mut() {
            s.recurrence = rec;
            s.is_active = true;
        } else {
            let s = Series {
                id: ids::new_id(),
                recurrence: rec,
                is_active: true,
                template: template_for(&task, Vec::new(), ctx, &day),
            };
            repo.series_insert(&s)?;
            task.series_id = Some(s.id.clone());
            task.occurrence_date = Some(day.clone());
            series = Some(s);
        }
        // Đổi hạn thì ngày của lần lặp này đổi theo (không được trùng lần khác của chuỗi).
        if old_due_day != new_due_day && task.occurrence_date.as_deref() != Some(day.as_str()) {
            let sid = task.series_id.clone().unwrap_or_default();
            if repo.occurrence_exists(&sid, &day)? {
                return Err(AppError::validation("Đã có Task lặp cho ngày này"));
            }
            task.occurrence_date = Some(day);
        }
    } else if let Some(s) = series.as_mut() {
        s.is_active = false;
    }

    repo.save(&task)?;
    let fresh = require(repo, id)?;
    if let Some(mut s) = series {
        if s.is_active {
            let checklist = repo.checklist(id)?.into_iter().map(|c| c.content).collect();
            s.template = template_for(&fresh, checklist, ctx, &s.template.anchor_date);
        }
        repo.series_update(&s)?;
    }
    // Đọc lại: cột `recurrence` của Task phụ thuộc trạng thái (bật/tắt) của chuỗi vừa ghi.
    require(repo, id)
}

pub fn set_tags(
    repo: &dyn TaskRepository,
    ctx: &TimeCtx,
    task_id: &str,
    tag_ids: &[String],
) -> AppResult<Task> {
    let task = require(repo, task_id)?;
    let ids = check_tags(repo, tag_ids)?;
    repo.replace_tags(task_id, &ids)?;
    repo.save(&task)?; // tăng version, cập nhật updated_at, ghi nhật ký
    let fresh = require(repo, task_id)?;
    refresh_template(repo, ctx, &fresh)?;
    Ok(fresh)
}

fn refresh_template(repo: &dyn TaskRepository, ctx: &TimeCtx, task: &Task) -> AppResult<()> {
    let Some(sid) = &task.series_id else {
        return Ok(());
    };
    if let Some(mut s) = repo.series_get(sid)? {
        if s.is_active {
            let checklist = repo
                .checklist(&task.id)?
                .into_iter()
                .map(|c| c.content)
                .collect();
            s.template = template_for(task, checklist, ctx, &s.template.anchor_date);
            repo.series_update(&s)?;
        }
    }
    Ok(())
}

// ---------- Trạng thái ----------

fn end_of_column_key(
    repo: &dyn TaskRepository,
    task: &Task,
    status: TaskStatus,
) -> AppResult<String> {
    let last = repo.column_last_key(task.project_id.as_deref(), status)?;
    Ok(sort_key::between(last.as_deref(), None))
}

pub fn set_status(
    repo: &dyn TaskRepository,
    ctx: &TimeCtx,
    id: &str,
    status: TaskStatus,
) -> AppResult<TaskStatusResult> {
    let mut task = require(repo, id)?;
    if task.status == status {
        return Ok(TaskStatusResult { task, next: None });
    }
    task.sort_key = end_of_column_key(repo, &task, status)?;
    task.set_status(status, &ctx.now_iso());
    finish_status_change(repo, ctx, task)
}

pub fn move_task(
    repo: &dyn TaskRepository,
    ctx: &TimeCtx,
    id: &str,
    status: TaskStatus,
    before_id: Option<&str>,
    after_id: Option<&str>,
) -> AppResult<TaskStatusResult> {
    if before_id == Some(id) || after_id == Some(id) {
        return Err(AppError::validation("Không thể xếp Task vào cạnh chính nó"));
    }
    let mut task = require(repo, id)?;
    let before = before_id.map(|b| require(repo, b)).transpose()?;
    let after = after_id.map(|a| require(repo, a)).transpose()?;
    let project = task.project_id.clone();
    task.sort_key = sort_key::place(
        before.as_ref().map(|t| t.sort_key.as_str()),
        after.as_ref().map(|t| t.sort_key.as_str()),
        || repo.column_last_key(project.as_deref(), status),
        |key, is_after| repo.column_neighbour(project.as_deref(), status, key, id, is_after),
    )?;
    task.set_status(status, &ctx.now_iso());
    finish_status_change(repo, ctx, task)
}

fn finish_status_change(
    repo: &dyn TaskRepository,
    ctx: &TimeCtx,
    task: Task,
) -> AppResult<TaskStatusResult> {
    let became_done = task.status == TaskStatus::Done && task.completed_at.is_some();
    repo.save(&task)?;
    let task = require(repo, &task.id)?;
    let next = if became_done {
        spawn_next(repo, ctx, &task)?
    } else {
        None
    };
    Ok(TaskStatusResult { task, next })
}

/// Sinh lần lặp tiếp theo của một Task vừa xong. Đã có lần đó rồi thì không sinh nữa (`None`).
fn spawn_next(repo: &dyn TaskRepository, ctx: &TimeCtx, done: &Task) -> AppResult<Option<Task>> {
    let Some(sid) = &done.series_id else {
        return Ok(None);
    };
    let Some(series) = repo.series_get(sid)? else {
        return Ok(None);
    };
    if !series.is_active {
        return Ok(None);
    }
    let anchor = parse_date(&series.template.anchor_date);
    let current = done.due_day(ctx).as_deref().and_then(parse_date);
    let (Some(anchor), Some(current)) = (anchor, current) else {
        return Ok(None);
    };
    let next_day = next_occurrence(&series.recurrence, anchor, current);
    let next_text = fmt_date(next_day);
    if repo.occurrence_exists(sid, &next_text)? {
        return Ok(None);
    }
    let tpl = &series.template;
    let (due_date, due_at) = match tpl.due_time.as_deref() {
        Some(time) => (None, ctx.utc_from_local(next_day, time)),
        None => (Some(next_text.clone()), None),
    };
    let tags = repo.existing_tag_ids(&tpl.tag_ids)?;
    let now = ctx.now_iso();
    let mut task = Task {
        id: ids::new_id(),
        project_id: tpl.project_id.clone(),
        area_id: tpl.area_id.clone(),
        title: tpl.title.clone(),
        description: tpl.description.clone(),
        status: TaskStatus::Todo,
        priority: tpl.priority,
        start_date: None,
        due_date,
        due_at,
        estimated_minutes: tpl.estimated_minutes,
        completed_at: None,
        sort_key: String::new(),
        recurrence: Some(series.recurrence.clone()),
        tag_ids: tags.clone(),
        checklist_done: 0,
        checklist_total: 0,
        archived_at: None,
        deleted_at: None,
        version: 1,
        created_at: now.clone(),
        updated_at: now,
        previous_status: None,
        series_id: Some(sid.clone()),
        occurrence_date: Some(next_text),
    };
    task.sort_key = end_of_column_key(repo, &task, TaskStatus::Todo)?;
    repo.insert(&task)?;
    repo.replace_tags(&task.id, &tags)?;
    // Checklist lấy theo Task vừa xong (phản ánh các sửa đổi mới nhất), chưa đánh dấu.
    let contents: Vec<String> = repo
        .checklist(&done.id)?
        .into_iter()
        .map(|c| c.content)
        .collect();
    let mut key: Option<String> = None;
    for content in &contents {
        let k = sort_key::between(key.as_deref(), None);
        repo.checklist_insert(&ChecklistItem {
            id: ids::new_id(),
            task_id: task.id.clone(),
            content: content.clone(),
            is_done: false,
            sort_key: k.clone(),
        })?;
        key = Some(k);
    }
    Ok(Some(require(repo, &task.id)?))
}

// ---------- Lưu trữ / xoá ----------

pub fn archive(repo: &dyn TaskRepository, id: &str) -> AppResult<()> {
    require(repo, id)?;
    repo.set_archived(id, true)
}

pub fn unarchive(repo: &dyn TaskRepository, id: &str) -> AppResult<()> {
    require(repo, id)?;
    repo.set_archived(id, false)
}

pub fn delete(repo: &dyn TaskRepository, id: &str) -> AppResult<()> {
    require(repo, id)?;
    repo.soft_delete(id)
}

// ---------- Checklist ----------

fn require_item(repo: &dyn TaskRepository, id: &str) -> AppResult<ChecklistItem> {
    repo.checklist_get(id)?
        .ok_or_else(|| AppError::new(ErrorCode::NotFound, "Không tìm thấy mục checklist"))
}

pub fn checklist_add(
    repo: &dyn TaskRepository,
    task_id: &str,
    content: &str,
) -> AppResult<ChecklistItem> {
    require(repo, task_id)?;
    let content = validate_checklist_content(content)?;
    let last = repo.checklist_last_key(task_id)?;
    let item = ChecklistItem {
        id: ids::new_id(),
        task_id: task_id.to_string(),
        content,
        is_done: false,
        sort_key: sort_key::between(last.as_deref(), None),
    };
    repo.checklist_insert(&item)?;
    Ok(item)
}

pub fn checklist_update(
    repo: &dyn TaskRepository,
    id: &str,
    content: &str,
) -> AppResult<ChecklistItem> {
    let mut item = require_item(repo, id)?;
    item.content = validate_checklist_content(content)?;
    repo.checklist_update(&item)?;
    Ok(item)
}

pub fn checklist_toggle(repo: &dyn TaskRepository, id: &str) -> AppResult<ChecklistItem> {
    let mut item = require_item(repo, id)?;
    item.is_done = !item.is_done;
    repo.checklist_update(&item)?;
    Ok(item)
}

pub fn checklist_reorder(
    repo: &dyn TaskRepository,
    id: &str,
    before_id: Option<&str>,
    after_id: Option<&str>,
) -> AppResult<ChecklistItem> {
    if before_id.is_none() && after_id.is_none() {
        return Err(AppError::validation("Cần beforeId hoặc afterId"));
    }
    if before_id == Some(id) || after_id == Some(id) {
        return Err(AppError::validation("Không thể xếp mục vào cạnh chính nó"));
    }
    let mut item = require_item(repo, id)?;
    let sibling = |sid: Option<&str>| -> AppResult<Option<ChecklistItem>> {
        sid.map(|s| {
            let other = require_item(repo, s)?;
            if other.task_id != item.task_id {
                return Err(AppError::validation("Mục checklist thuộc Task khác"));
            }
            Ok(other)
        })
        .transpose()
    };
    let before = sibling(before_id)?;
    let after = sibling(after_id)?;
    item.sort_key = sort_key::place(
        before.as_ref().map(|c| c.sort_key.as_str()),
        after.as_ref().map(|c| c.sort_key.as_str()),
        || repo.checklist_last_key(&item.task_id),
        |key, is_after| repo.checklist_neighbour(&item.task_id, key, id, is_after),
    )?;
    repo.checklist_update(&item)?;
    Ok(item)
}

pub fn checklist_delete(repo: &dyn TaskRepository, id: &str) -> AppResult<ChecklistItem> {
    let item = require_item(repo, id)?;
    repo.checklist_delete(id)?;
    Ok(item)
}

#[cfg(test)]
#[path = "application_tests.rs"]
mod tests;
