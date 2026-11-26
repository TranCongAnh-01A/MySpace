//! Đo thời gian: lọc 5.000 Task và tìm trên 10.000 bản ghi phải dưới 100 ms (bản release).
//! Bản debug chỉ in số đo, không kiểm ngưỡng.

use std::time::Instant;

use chrono::{TimeZone, Utc};

use crate::clock::FixedClock;
use crate::db;
use crate::ids::DEFAULT_WORKSPACE_ID;
use crate::modules::search::application as search_app;
use crate::modules::search::infrastructure::{self as search, SearchKind};
use crate::modules::tasks::application as tasks;
use crate::modules::tasks::domain::{DueFilter, Priority, TaskFilter, TaskSort, TaskStatus};
use crate::modules::tasks::infrastructure::SqliteTaskRepository;
use crate::modules::tasks::timectx::TimeCtx;

const LIMIT_MS: u128 = 100;

fn check(label: &str, ms: u128) {
    eprintln!("[perf] {label}: {ms} ms");
    if !cfg!(debug_assertions) {
        assert!(
            ms < LIMIT_MS,
            "{label} mất {ms} ms (giới hạn {LIMIT_MS} ms)"
        );
    }
}

#[test]
fn filtering_5000_tasks_and_searching_10000_records_is_fast() {
    let mut conn = db::open_in_memory().unwrap();
    let words = [
        "nhắc nhở",
        "họp nhóm",
        "đóng tiền",
        "viết báo cáo",
        "mua sắm",
        "gọi điện",
    ];
    let statuses = ["Todo", "InProgress", "Review", "Done"];
    let priorities = ["Urgent", "High", "Medium", "Low"];
    {
        let tx = conn.transaction().unwrap();
        for i in 0..5000usize {
            let status = statuses[i % 4];
            let id = format!("t{i:05}");
            let title = format!("{} số {i}", words[i % words.len()]);
            let day = 1 + (i % 28);
            tx.execute(
                "INSERT INTO tasks (id, workspace_id, title, description, status, priority, due_date,
                    completed_at, sort_key, created_at, updated_at)
                 VALUES (?1, ?2, ?3, 'mô tả chi tiết của việc cần làm', ?4, ?5, ?6, ?7, ?8, 't', 't')",
                rusqlite::params![
                    id,
                    DEFAULT_WORKSPACE_ID,
                    title,
                    status,
                    priorities[i % 4],
                    (i % 3 != 0).then(|| format!("2026-12-{day:02}")),
                    (status == "Done").then_some("2026-11-01T00:00:00.000Z"),
                    format!("{i:06}"),
                ],
            )
            .unwrap();
            search::index(
                &tx,
                SearchKind::Task,
                &id,
                &title,
                "mô tả chi tiết của việc cần làm",
            )
            .unwrap();
            if i % 2 == 0 {
                tx.execute(
                    "INSERT INTO checklist_items (id, task_id, content, sort_key, created_at, updated_at)
                     VALUES (?1, ?2, 'bước', 'V', 't', 't')",
                    rusqlite::params![format!("c{i}"), id],
                )
                .unwrap();
            }
        }
        for i in 0..5000usize {
            let id = format!("i{i:05}");
            let content = format!("{} ghi nhanh {i}", words[(i + 2) % words.len()]);
            tx.execute(
                "INSERT INTO inbox_items (id, workspace_id, content, created_at, updated_at)
                 VALUES (?1, ?2, ?3, 't', 't')",
                rusqlite::params![id, DEFAULT_WORKSPACE_ID, content],
            )
            .unwrap();
            search::index(&tx, SearchKind::Inbox, &id, &content, "").unwrap();
        }
        tx.commit().unwrap();
    }

    let clock = FixedClock(Utc.with_ymd_and_hms(2026, 12, 10, 3, 0, 0).unwrap());
    let ctx = TimeCtx::new("Asia/Ho_Chi_Minh", clock.0);
    let repo = SqliteTaskRepository::new(&conn, &clock);

    let t = Instant::now();
    let all = tasks::list(&repo, &ctx, &TaskFilter::default()).unwrap();
    check("task_list không lọc (5.000)", t.elapsed().as_millis());
    assert_eq!(all.len(), 5000);
    assert_eq!(all.iter().filter(|t| t.checklist_total == 1).count(), 2500);

    let filter = TaskFilter {
        status: Some(vec![TaskStatus::Todo, TaskStatus::InProgress]),
        priority: Some(vec![Priority::Urgent, Priority::High]),
        due: Some(DueFilter::Next7),
        sort: Some(TaskSort::DueDate),
        ..Default::default()
    };
    let t = Instant::now();
    let filtered = tasks::list(&repo, &ctx, &filter).unwrap();
    check(
        "task_list có lọc + sắp xếp theo hạn",
        t.elapsed().as_millis(),
    );
    assert!(!filtered.is_empty());

    for (label, query) in [
        ("search 'nhac nho'", "nhac nho"),
        ("search 'dong tien so 4'", "dong tien so 4"),
    ] {
        let t = Instant::now();
        let hits = search_app::search(&conn, query, None, None).unwrap();
        check(label, t.elapsed().as_millis());
        assert!(!hits.is_empty());
    }
}
