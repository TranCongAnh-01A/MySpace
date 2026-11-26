use crate::clock::Clock;
use crate::error::{AppError, AppResult, ErrorCode};
use crate::ids;
use crate::modules::tasks::application::{self as tasks, TaskRepository};
use crate::modules::tasks::domain::{Task, TaskCreate};
use crate::modules::tasks::timectx::TimeCtx;

use super::domain::{validate_content, InboxItem, InboxStatus};

/// Cổng ra của module: lớp infrastructure cài trait này.
pub trait InboxRepository {
    fn insert(&self, item: &InboxItem) -> AppResult<()>;
    /// Mới nhất trước. `None` = mọi trạng thái.
    fn list(&self, status: Option<InboxStatus>) -> AppResult<Vec<InboxItem>>;
    /// Mục chưa xoá mềm.
    fn find(&self, id: &str) -> AppResult<Option<InboxItem>>;
    fn update_content(&self, id: &str, content: &str) -> AppResult<()>;
    fn soft_delete(&self, id: &str) -> AppResult<()>;
    /// Đặt `Processed` + `converted_task_id` + `processed_at` trong một câu lệnh.
    fn mark_processed(&self, id: &str, task_id: &str) -> AppResult<()>;
}

fn require(repo: &dyn InboxRepository, id: &str) -> AppResult<InboxItem> {
    repo.find(id)?
        .ok_or_else(|| AppError::new(ErrorCode::NotFound, "Không tìm thấy mục Inbox"))
}

fn already_processed() -> AppError {
    AppError::new(ErrorCode::Conflict, "Mục Inbox này đã được xử lý")
}

/// Sửa nội dung; mục đã xử lý thì không sửa được (`CONFLICT`).
pub fn update(repo: &dyn InboxRepository, id: &str, content: &str) -> AppResult<InboxItem> {
    let mut item = require(repo, id)?;
    if item.status == InboxStatus::Processed {
        return Err(already_processed());
    }
    item.content = validate_content(content)?;
    repo.update_content(id, &item.content)?;
    Ok(item)
}

pub fn delete(repo: &dyn InboxRepository, id: &str) -> AppResult<()> {
    require(repo, id)?;
    repo.soft_delete(id)
}

/// Biến mục Inbox thành Task (gọi trong một transaction). Đổi lần hai thì `CONFLICT`.
pub fn convert_to_task(
    inbox: &dyn InboxRepository,
    task_repo: &dyn TaskRepository,
    ctx: &TimeCtx,
    id: &str,
    input: &TaskCreate,
) -> AppResult<Task> {
    let item = require(inbox, id)?;
    if item.status != InboxStatus::Open {
        return Err(already_processed());
    }
    let task = tasks::create(task_repo, ctx, input)?;
    inbox.mark_processed(id, &task.id)?;
    Ok(task)
}

pub fn create(
    repo: &dyn InboxRepository,
    clock: &dyn Clock,
    content: &str,
) -> AppResult<InboxItem> {
    let item = InboxItem::new(ids::new_id(), content, clock.now_iso())?;
    repo.insert(&item)?;
    Ok(item)
}

pub fn list(repo: &dyn InboxRepository, status: Option<InboxStatus>) -> AppResult<Vec<InboxItem>> {
    repo.list(status)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clock::FixedClock;
    use crate::db;
    use crate::error::ErrorCode;
    use crate::modules::inbox::infrastructure::SqliteInboxRepository;
    use chrono::{Duration, TimeZone, Utc};

    fn clock_at(secs: i64) -> FixedClock {
        FixedClock(Utc.with_ymd_and_hms(2026, 11, 26, 0, 0, 0).unwrap() + Duration::seconds(secs))
    }

    #[test]
    fn created_item_appears_in_list() {
        let conn = db::open_in_memory().unwrap();
        let clk = clock_at(0);
        let repo = SqliteInboxRepository::new(&conn, &clk);
        let item = create(&repo, &clock_at(0), "Gọi điện cho khách").unwrap();
        let items = list(&repo, None).unwrap();
        assert_eq!(items, vec![item]);
    }

    #[test]
    fn empty_content_is_validation_error() {
        let conn = db::open_in_memory().unwrap();
        let clk = clock_at(0);
        let repo = SqliteInboxRepository::new(&conn, &clk);
        let err = create(&repo, &clock_at(0), "  ").unwrap_err();
        assert_eq!(err.code, ErrorCode::Validation);
        assert!(list(&repo, None).unwrap().is_empty());
    }

    #[test]
    fn list_is_newest_first_and_filters_status() {
        let conn = db::open_in_memory().unwrap();
        let clk = clock_at(0);
        let repo = SqliteInboxRepository::new(&conn, &clk);
        let a = create(&repo, &clock_at(0), "một").unwrap();
        let b = create(&repo, &clock_at(5), "hai").unwrap();
        let ids: Vec<_> = list(&repo, Some(InboxStatus::Open))
            .unwrap()
            .into_iter()
            .map(|i| i.id)
            .collect();
        assert_eq!(ids, vec![b.id, a.id]);
        assert!(list(&repo, Some(InboxStatus::Processed))
            .unwrap()
            .is_empty());
    }
}

#[cfg(test)]
#[path = "b2_tests.rs"]
mod b2_tests;
