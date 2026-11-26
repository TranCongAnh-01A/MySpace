//! Test B2: sửa, xoá, chuyển Inbox → Task.

use chrono::{TimeZone, Utc};

use super::*;
use crate::clock::FixedClock;
use crate::db;
use crate::modules::inbox::infrastructure::SqliteInboxRepository;
use crate::modules::search::application as search_app;
use crate::modules::tasks::domain::TaskFilter;
use crate::modules::tasks::infrastructure::SqliteTaskRepository;

fn clock() -> FixedClock {
    FixedClock(Utc.with_ymd_and_hms(2026, 11, 26, 3, 0, 0).unwrap())
}

fn ctx() -> TimeCtx {
    TimeCtx::new("Asia/Ho_Chi_Minh", clock().0)
}

fn new_item(repo: &dyn InboxRepository, text: &str) -> InboxItem {
    create(repo, &clock(), text).unwrap()
}

fn input(title: &str) -> TaskCreate {
    TaskCreate {
        title: title.into(),
        ..Default::default()
    }
}

#[test]
fn update_changes_content_and_search_index() {
    let conn = db::open_in_memory().unwrap();
    let c = clock();
    let repo = SqliteInboxRepository::new(&conn, &c);
    let item = new_item(&repo, "Mua sữa");
    assert_eq!(
        search_app::search(&conn, "sua", None, None).unwrap().len(),
        1
    );
    let updated = update(&repo, &item.id, "  Mua bánh mì ").unwrap();
    assert_eq!(updated.content, "Mua bánh mì");
    assert_eq!(list(&repo, None).unwrap()[0].content, "Mua bánh mì");
    assert!(search_app::search(&conn, "sua", None, None)
        .unwrap()
        .is_empty());
    assert_eq!(
        search_app::search(&conn, "banh mi", None, None)
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        update(&repo, &item.id, " ").unwrap_err().code,
        ErrorCode::Validation
    );
    assert_eq!(
        update(&repo, "x", "a").unwrap_err().code,
        ErrorCode::NotFound
    );
}

#[test]
fn delete_is_soft_and_removes_from_list_and_search() {
    let conn = db::open_in_memory().unwrap();
    let c = clock();
    let repo = SqliteInboxRepository::new(&conn, &c);
    let item = new_item(&repo, "Gọi điện");
    delete(&repo, &item.id).unwrap();
    assert!(list(&repo, None).unwrap().is_empty());
    assert!(search_app::search(&conn, "goi", None, None)
        .unwrap()
        .is_empty());
    let kept: i64 = conn
        .query_row("SELECT count(*) FROM inbox_items", [], |r| r.get(0))
        .unwrap();
    assert_eq!(kept, 1);
    assert_eq!(
        delete(&repo, &item.id).unwrap_err().code,
        ErrorCode::NotFound
    );
}

#[test]
fn convert_creates_task_and_marks_processed_atomically() {
    let mut conn = db::open_in_memory().unwrap();
    let c = clock();
    let item = new_item(&SqliteInboxRepository::new(&conn, &c), "Viết báo cáo");
    let task = {
        let tx = conn.transaction().unwrap();
        let task = convert_to_task(
            &SqliteInboxRepository::new(&tx, &c),
            &SqliteTaskRepository::new(&tx, &c),
            &ctx(),
            &item.id,
            &input("Viết báo cáo tuần"),
        )
        .unwrap();
        tx.commit().unwrap();
        task
    };
    let repo = SqliteInboxRepository::new(&conn, &c);
    let got = list(&repo, Some(InboxStatus::Processed)).unwrap();
    assert_eq!(got.len(), 1);
    assert_eq!(got[0].converted_task_id.as_deref(), Some(task.id.as_str()));
    assert!(got[0].processed_at.is_some());
    // Mục đã xử lý không còn trong chỉ mục Inbox; Task thì có.
    let hits = search_app::search(&conn, "bao cao", None, None).unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].id, task.id);
}

#[test]
fn converting_or_editing_twice_is_conflict() {
    let mut conn = db::open_in_memory().unwrap();
    let c = clock();
    let item = new_item(&SqliteInboxRepository::new(&conn, &c), "Một việc");
    let tx = conn.transaction().unwrap();
    let inbox = SqliteInboxRepository::new(&tx, &c);
    let tasks = SqliteTaskRepository::new(&tx, &c);
    convert_to_task(&inbox, &tasks, &ctx(), &item.id, &input("Việc")).unwrap();
    let again = convert_to_task(&inbox, &tasks, &ctx(), &item.id, &input("Việc lần hai"));
    assert_eq!(again.unwrap_err().code, ErrorCode::Conflict);
    assert_eq!(
        update(&inbox, &item.id, "sửa").unwrap_err().code,
        ErrorCode::Conflict
    );
    tx.commit().unwrap();
    // Chỉ có đúng một Task.
    let all = tasks_count(&conn);
    assert_eq!(all, 1);
}

fn tasks_count(conn: &rusqlite::Connection) -> usize {
    let c = clock();
    crate::modules::tasks::application::list(
        &SqliteTaskRepository::new(conn, &c),
        &ctx(),
        &TaskFilter::default(),
    )
    .unwrap()
    .len()
}

#[test]
fn failed_task_validation_leaves_inbox_item_open() {
    let mut conn = db::open_in_memory().unwrap();
    let c = clock();
    let item = new_item(&SqliteInboxRepository::new(&conn, &c), "Việc");
    {
        let tx = conn.transaction().unwrap();
        let err = convert_to_task(
            &SqliteInboxRepository::new(&tx, &c),
            &SqliteTaskRepository::new(&tx, &c),
            &ctx(),
            &item.id,
            &input("   "),
        )
        .unwrap_err();
        assert_eq!(err.code, ErrorCode::Validation);
        // không commit
    }
    let open = list(
        &SqliteInboxRepository::new(&conn, &c),
        Some(InboxStatus::Open),
    )
    .unwrap();
    assert_eq!(open.len(), 1);
    assert_eq!(tasks_count(&conn), 0);
}

#[test]
fn rollback_after_task_created_undoes_everything() {
    let mut conn = db::open_in_memory().unwrap();
    let c = clock();
    let item = new_item(&SqliteInboxRepository::new(&conn, &c), "Việc");
    {
        let tx = conn.transaction().unwrap();
        convert_to_task(
            &SqliteInboxRepository::new(&tx, &c),
            &SqliteTaskRepository::new(&tx, &c),
            &ctx(),
            &item.id,
            &input("Việc"),
        )
        .unwrap();
        // bỏ tx → rollback
    }
    assert_eq!(tasks_count(&conn), 0);
    let open = list(
        &SqliteInboxRepository::new(&conn, &c),
        Some(InboxStatus::Open),
    )
    .unwrap();
    assert_eq!(open.len(), 1);
}
