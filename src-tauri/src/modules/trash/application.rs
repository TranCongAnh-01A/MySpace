use chrono::{DateTime, Duration, Utc};
use rusqlite::Connection;

use crate::clock::Clock;
use crate::error::{AppError, AppResult, ErrorCode};
use crate::modules::tasks::timectx::iso;
use crate::modules::{inbox::infrastructure as inbox, tasks::infrastructure as tasks};

use super::domain::{TrashItem, TrashKind};

const MAX_TITLE_CHARS: usize = 100;

fn purge_at(deleted_at: &str, retention_days: u32) -> String {
    DateTime::parse_from_rfc3339(deleted_at)
        .map(|t| iso(t.with_timezone(&Utc) + Duration::days(i64::from(retention_days))))
        .unwrap_or_else(|_| deleted_at.to_string())
}

fn short(text: &str) -> String {
    let first_line = text.lines().next().unwrap_or("");
    if first_line.chars().count() > MAX_TITLE_CHARS {
        let cut: String = first_line.chars().take(MAX_TITLE_CHARS).collect();
        format!("{cut}…")
    } else {
        first_line.to_string()
    }
}

/// Mục trong Trash, mới xoá trước.
pub fn list(conn: &Connection, retention_days: u32) -> AppResult<Vec<TrashItem>> {
    let mut items: Vec<TrashItem> = Vec::new();
    for (id, title, deleted_at) in tasks::list_deleted(conn)? {
        items.push(TrashItem {
            kind: TrashKind::Task,
            id,
            title,
            purge_at: purge_at(&deleted_at, retention_days),
            deleted_at,
        });
    }
    for (id, content, deleted_at) in inbox::list_deleted(conn)? {
        items.push(TrashItem {
            kind: TrashKind::Inbox,
            id,
            title: short(&content),
            purge_at: purge_at(&deleted_at, retention_days),
            deleted_at,
        });
    }
    items.sort_by(|a, b| {
        b.deleted_at
            .cmp(&a.deleted_at)
            .then_with(|| b.id.cmp(&a.id))
    });
    Ok(items)
}

pub fn restore(conn: &Connection, clock: &dyn Clock, kind: TrashKind, id: &str) -> AppResult<()> {
    let restored = match kind {
        TrashKind::Task => tasks::restore(conn, id, clock)?,
        TrashKind::Inbox => inbox::restore(conn, id, clock)?,
    };
    if restored {
        Ok(())
    } else {
        Err(AppError::new(
            ErrorCode::NotFound,
            "Không tìm thấy mục trong Trash",
        ))
    }
}

/// Xoá hẳn mọi mục trong Trash. Trả về số mục đã xoá.
pub fn empty(conn: &Connection) -> AppResult<usize> {
    purge_ids(
        conn,
        tasks::list_deleted(conn)?
            .into_iter()
            .map(|t| t.0)
            .collect(),
        inbox::list_deleted(conn)?
            .into_iter()
            .map(|t| t.0)
            .collect(),
    )
}

/// Xoá hẳn mục có `deleted_at` cũ hơn `retention_days`. Chạy lúc khởi động.
pub fn purge_expired(
    conn: &Connection,
    clock: &dyn Clock,
    retention_days: u32,
) -> AppResult<usize> {
    let cutoff = iso(clock.now() - Duration::days(i64::from(retention_days)));
    purge_ids(
        conn,
        tasks::deleted_before(conn, &cutoff)?,
        inbox::deleted_before(conn, &cutoff)?,
    )
}

fn purge_ids(conn: &Connection, task_ids: Vec<String>, inbox_ids: Vec<String>) -> AppResult<usize> {
    let mut n = 0;
    // Task trước (xoá luôn mục Inbox đã chuyển thành Task đó), rồi tới Inbox.
    for id in &task_ids {
        tasks::purge(conn, id)?;
        n += 1;
    }
    for id in &inbox_ids {
        inbox::purge(conn, id)?;
        n += 1;
    }
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clock::FixedClock;
    use crate::db;
    use crate::ids::DEFAULT_WORKSPACE_ID as WS;
    use crate::modules::inbox::application as inbox_app;
    use crate::modules::inbox::infrastructure::SqliteInboxRepository;
    use crate::modules::search::application as search_app;
    use crate::modules::tasks::application as tasks_app;
    use crate::modules::tasks::domain::{
        Frequency, Recurrence, TaskCreate, TaskFilter, TaskStatus,
    };
    use crate::modules::tasks::infrastructure::SqliteTaskRepository;
    use crate::modules::tasks::timectx::TimeCtx;
    use chrono::TimeZone;

    fn at(day: u32) -> FixedClock {
        FixedClock(Utc.with_ymd_and_hms(2026, 11, day, 3, 0, 0).unwrap())
    }

    fn ctx(c: &FixedClock) -> TimeCtx {
        TimeCtx::new("Asia/Ho_Chi_Minh", c.0)
    }

    fn new_task(conn: &Connection, c: &FixedClock, title: &str) -> String {
        let repo = SqliteTaskRepository::new(conn, c);
        let input = TaskCreate {
            title: title.into(),
            ..Default::default()
        };
        tasks_app::create(&repo, &ctx(c), &input).unwrap().id
    }

    fn count(conn: &Connection, table: &str) -> i64 {
        conn.query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn list_orders_newest_first_and_computes_purge_at() {
        let conn = db::open_in_memory().unwrap();
        let (c1, c2, c3) = (at(1), at(2), at(3));
        let t = new_task(&conn, &c1, "Task cũ");
        tasks_app::delete(&SqliteTaskRepository::new(&conn, &c1), &t).unwrap();
        let i = inbox_app::create(
            &SqliteInboxRepository::new(&conn, &c2),
            &c2,
            "Ghi nhanh\ndòng hai",
        )
        .unwrap();
        inbox_app::delete(&SqliteInboxRepository::new(&conn, &c2), &i.id).unwrap();
        let t2 = new_task(&conn, &c3, "Task mới");
        tasks_app::delete(&SqliteTaskRepository::new(&conn, &c3), &t2).unwrap();

        let items = list(&conn, 30).unwrap();
        let got: Vec<_> = items.iter().map(|i| (i.kind, i.title.as_str())).collect();
        assert_eq!(
            got,
            [
                (TrashKind::Task, "Task mới"),
                (TrashKind::Inbox, "Ghi nhanh"),
                (TrashKind::Task, "Task cũ")
            ]
        );
        assert_eq!(items[2].deleted_at, "2026-11-01T03:00:00.000Z");
        assert_eq!(items[2].purge_at, "2026-12-01T03:00:00.000Z");
        assert_eq!(
            list(&conn, 7).unwrap()[2].purge_at,
            "2026-11-08T03:00:00.000Z"
        );
    }

    #[test]
    fn restore_task_reindexes_and_detaches_deleted_parents() {
        let conn = db::open_in_memory().unwrap();
        let c = at(5);
        conn.execute_batch(&format!(
            "INSERT INTO areas (id, workspace_id, name, sort_key, created_at, updated_at, deleted_at)
               VALUES ('a1','{WS}','A','V','t','t','t');
             INSERT INTO projects (id, workspace_id, name, sort_key, created_at, updated_at)
               VALUES ('p1','{WS}','P','V','t','t');"
        ))
        .unwrap();
        let id = new_task(&conn, &c, "Nhắc nhở");
        // Task trỏ tới Area đã xoá (Area bị xoá sau khi Task vào Trash).
        conn.execute("UPDATE tasks SET area_id = 'a1' WHERE id = ?1", [&id])
            .unwrap();
        tasks_app::delete(&SqliteTaskRepository::new(&conn, &c), &id).unwrap();
        assert!(search_app::search(&conn, "nhac nho", None, None)
            .unwrap()
            .is_empty());

        restore(&conn, &c, TrashKind::Task, &id).unwrap();
        let t = tasks_app::list(
            &SqliteTaskRepository::new(&conn, &c),
            &ctx(&c),
            &TaskFilter::default(),
        )
        .unwrap();
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].area_id, None, "Area đã xoá thì tách ra");
        assert_eq!(
            search_app::search(&conn, "nhac nho", None, None)
                .unwrap()
                .len(),
            1
        );
        assert!(list(&conn, 30).unwrap().is_empty());

        // Project còn sống thì giữ nguyên.
        conn.execute(
            "UPDATE tasks SET area_id = NULL, project_id = 'p1' WHERE id = ?1",
            [&id],
        )
        .unwrap();
        tasks_app::delete(&SqliteTaskRepository::new(&conn, &c), &id).unwrap();
        restore(&conn, &c, TrashKind::Task, &id).unwrap();
        let project: Option<String> = conn
            .query_row("SELECT project_id FROM tasks WHERE id = ?1", [&id], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(project.as_deref(), Some("p1"));
        assert_eq!(
            restore(&conn, &c, TrashKind::Task, &id).unwrap_err().code,
            ErrorCode::NotFound
        );
    }

    #[test]
    fn restore_inbox_reindexes_open_items_only() {
        let conn = db::open_in_memory().unwrap();
        let c = at(5);
        let repo = SqliteInboxRepository::new(&conn, &c);
        let i = inbox_app::create(&repo, &c, "Mua sữa").unwrap();
        inbox_app::delete(&repo, &i.id).unwrap();
        restore(&conn, &c, TrashKind::Inbox, &i.id).unwrap();
        assert_eq!(
            search_app::search(&conn, "sua", None, None).unwrap().len(),
            1
        );
        assert_eq!(
            restore(&conn, &c, TrashKind::Inbox, "x").unwrap_err().code,
            ErrorCode::NotFound
        );
    }

    #[test]
    fn purge_task_removes_dependents_in_order() {
        let conn = db::open_in_memory().unwrap();
        let c = at(5);
        let ctx = ctx(&c);
        let repo = SqliteTaskRepository::new(&conn, &c);
        let input = TaskCreate {
            title: "Lặp".into(),
            due_date: Some("2026-11-06".into()),
            recurrence: Some(Recurrence {
                frequency: Frequency::Daily,
                interval: 1,
                by_weekday: None,
            }),
            ..Default::default()
        };
        let t = tasks_app::create(&repo, &ctx, &input).unwrap();
        tasks_app::checklist_add(&repo, &t.id, "bước").unwrap();
        // Task đã sinh lần tiếp để series còn Task khác sau khi purge Task đầu.
        let next = tasks_app::set_status(&repo, &ctx, &t.id, TaskStatus::Done)
            .unwrap()
            .next
            .unwrap();
        // Inbox đã chuyển thành Task đầu + Event của Task đầu.
        let inbox_repo = SqliteInboxRepository::new(&conn, &c);
        let item = inbox_app::create(&inbox_repo, &c, "gốc").unwrap();
        inbox_repo_mark(&conn, &item.id, &t.id);
        conn.execute(
            "INSERT INTO events (id, calendar_id, task_id, title, is_all_day, start_date, end_date, created_at, updated_at)
             VALUES ('e1', '019ac000-0000-7000-8000-000000000002', ?1, 'E', 1, '2026-11-06', '2026-11-06', 't', 't')",
            [&t.id],
        )
        .unwrap();
        tasks_app::delete(&repo, &t.id).unwrap();

        assert_eq!(empty(&conn).unwrap(), 1);
        assert_eq!(count(&conn, "tasks"), 1, "Task lần sau còn nguyên");
        assert_eq!(
            count(&conn, "checklist_items"),
            1,
            "checklist của lần sau (chép từ lần đầu)"
        );
        assert_eq!(count(&conn, "events"), 0);
        assert_eq!(count(&conn, "inbox_items"), 0);
        assert_eq!(
            count(&conn, "recurrence_series"),
            1,
            "series còn Task nên được giữ"
        );
        // Xoá nốt Task cuối: series cũng đi theo.
        tasks_app::delete(&repo, &next.id).unwrap();
        empty(&conn).unwrap();
        assert_eq!(
            (
                count(&conn, "tasks"),
                count(&conn, "recurrence_series"),
                count(&conn, "checklist_items")
            ),
            (0, 0, 0)
        );
        assert_eq!(count(&conn, "search_map"), 0);
    }

    fn inbox_repo_mark(conn: &Connection, inbox_id: &str, task_id: &str) {
        conn.execute(
            "UPDATE inbox_items SET status='Processed', converted_task_id=?2, processed_at='t' WHERE id=?1",
            [inbox_id, task_id],
        )
        .unwrap();
    }

    #[test]
    fn purge_expired_uses_retention_days() {
        let conn = db::open_in_memory().unwrap();
        let old = at(1);
        let recent = at(20);
        let a = new_task(&conn, &old, "cũ");
        tasks_app::delete(&SqliteTaskRepository::new(&conn, &old), &a).unwrap();
        let b = new_task(&conn, &recent, "mới");
        tasks_app::delete(&SqliteTaskRepository::new(&conn, &recent), &b).unwrap();
        let i =
            inbox_app::create(&SqliteInboxRepository::new(&conn, &old), &old, "inbox cũ").unwrap();
        inbox_app::delete(&SqliteInboxRepository::new(&conn, &old), &i.id).unwrap();

        // "Bây giờ" = 26/11 03:00. Giữ 30 ngày: mục xoá ngày 1/11 (25 ngày) còn nguyên.
        let now = at(26);
        assert_eq!(purge_expired(&conn, &now, 30).unwrap(), 0);
        // Giữ 10 ngày: 2 mục cũ (ngày 1/11) bị xoá, mục ngày 20/11 (6 ngày) còn.
        assert_eq!(purge_expired(&conn, &now, 10).unwrap(), 2);
        let left = list(&conn, 10).unwrap();
        assert_eq!(left.len(), 1);
        assert_eq!(left[0].title, "mới");
    }
}
