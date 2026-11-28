//! Đo hiệu năng theo spec 9.3. Test gắn `#[ignore]`, không assert thời gian (tránh flaky).
//! Chạy: `cargo test --release -- --ignored perf_ --nocapture`.
//! Dùng DB tạm trong thư mục tạm của hệ điều hành; không chạm vào dữ liệu thật.

use std::time::Instant;

use chrono::{TimeZone, Utc};

use crate::clock::FixedClock;
use crate::db;
use crate::ids::{self, DEFAULT_WORKSPACE_ID};
use crate::modules::dashboard::application as dashboard;
use crate::modules::search::application as search_app;
use crate::modules::search::infrastructure::{self as search, SearchKind};
use crate::modules::tasks::application as tasks;
use crate::modules::tasks::domain::{DueFilter, TaskFilter, TaskStatus};
use crate::modules::tasks::infrastructure::SqliteTaskRepository;
use crate::modules::tasks::timectx::TimeCtx;

const RUNS: usize = 20;
const PROJECTS: usize = 20;
const TASKS: usize = 5000;
const NOTES: usize = 10_000 - TASKS - PROJECTS;

/// Median (ms, có phần lẻ) của `RUNS` lần chạy; trả về cả kết quả lần cuối để assert.
fn median_ms<T>(mut f: impl FnMut() -> T) -> (f64, T) {
    let mut times = Vec::with_capacity(RUNS);
    let mut last = None;
    for _ in 0..RUNS {
        let t = Instant::now();
        last = Some(f());
        times.push(t.elapsed().as_secs_f64() * 1000.0);
    }
    times.sort_by(|a, b| a.partial_cmp(b).unwrap());
    (times[RUNS / 2], last.unwrap())
}

#[test]
#[ignore]
fn perf_core_5000_tasks_10000_records() {
    let dir = std::env::temp_dir().join(format!("lifehub-perf-{}", ids::new_id()));
    let clock = FixedClock(Utc.with_ymd_and_hms(2026, 12, 10, 3, 0, 0).unwrap());
    let mut conn = db::open(&dir.join("perf.db"), &dir.join("backups"), &clock).unwrap();

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
    let tx = conn.transaction().unwrap();
    for p in 0..PROJECTS {
        let id = format!("p{p:03}");
        let name = format!("Dự án {p} ghi chú");
        tx.execute(
            "INSERT INTO projects (id, workspace_id, name, sort_key, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 't', 't')",
            rusqlite::params![id, DEFAULT_WORKSPACE_ID, name, format!("{p:04}")],
        )
        .unwrap();
        search::index(&tx, SearchKind::Project, &id, &name, "mô tả dự án").unwrap();
    }
    for i in 0..TASKS {
        let status = statuses[i % 4];
        let id = format!("t{i:05}");
        let title = format!("{} số {i}", words[i % words.len()]);
        let due = match i % 3 {
            0 => None,
            1 => Some(format!("2026-12-{:02}", 1 + (i % 28))),
            _ => Some(format!("2026-11-{:02}", 1 + (i % 28))),
        };
        tx.execute(
            "INSERT INTO tasks (id, workspace_id, project_id, title, description, status, priority,
                due_date, completed_at, sort_key, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 'mô tả chi tiết của việc cần làm', ?5, ?6, ?7, ?8, ?9, 't', 't')",
            rusqlite::params![
                id,
                DEFAULT_WORKSPACE_ID,
                format!("p{:03}", i % PROJECTS),
                title,
                status,
                priorities[i % 4],
                due,
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
    }
    for i in 0..NOTES {
        let id = format!("n{i:05}");
        let title = format!("Ghi chú {} {i}", words[(i + 1) % words.len()]);
        let text = "nội dung ghi chú tiếng Việt có dấu để tìm kiếm";
        tx.execute(
            "INSERT INTO notes (id, workspace_id, project_id, title, search_text, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 't', 't')",
            rusqlite::params![
                id,
                DEFAULT_WORKSPACE_ID,
                format!("p{:03}", i % PROJECTS),
                title,
                text
            ],
        )
        .unwrap();
        search::index(&tx, SearchKind::Note, &id, &title, text).unwrap();
    }
    tx.commit().unwrap();

    let ctx = TimeCtx::new("Asia/Ho_Chi_Minh", clock.0);
    let repo = SqliteTaskRepository::new(&conn, &clock);
    println!(
        "[perf] dữ liệu: {TASKS} Task, {PROJECTS} Project, {NOTES} Note; median của {RUNS} lần"
    );

    let (ms, all) = median_ms(|| tasks::list(&repo, &ctx, &TaskFilter::default()).unwrap());
    println!("[perf] task_list không lọc: {ms:.2} ms");
    assert_eq!(all.len(), TASKS);

    let f = TaskFilter {
        project_id: Some("p003".into()),
        ..Default::default()
    };
    let (ms, r) = median_ms(|| tasks::list(&repo, &ctx, &f).unwrap());
    println!(
        "[perf] task_list theo Project: {ms:.2} ms ({} kết quả)",
        r.len()
    );
    assert_eq!(r.len(), TASKS / PROJECTS);

    let f = TaskFilter {
        status: Some(vec![TaskStatus::InProgress]),
        ..Default::default()
    };
    let (ms, r) = median_ms(|| tasks::list(&repo, &ctx, &f).unwrap());
    println!(
        "[perf] task_list theo trạng thái: {ms:.2} ms ({} kết quả)",
        r.len()
    );
    assert_eq!(r.len(), TASKS / 4);

    let f = TaskFilter {
        due: Some(DueFilter::Overdue),
        ..Default::default()
    };
    let (ms, r) = median_ms(|| tasks::list(&repo, &ctx, &f).unwrap());
    println!("[perf] task_list quá hạn: {ms:.2} ms ({} kết quả)", r.len());
    assert!(!r.is_empty());

    for q in ["nhac nho", "ghi chu", "dong tien so 4"] {
        let (ms, hits) = median_ms(|| search_app::search(&conn, q, None, None).unwrap());
        println!("[perf] search '{q}': {ms:.2} ms ({} kết quả)", hits.len());
        assert!(!hits.is_empty());
    }

    let (ms, view) = median_ms(|| dashboard::today(&conn, &clock, &ctx).unwrap());
    println!(
        "[perf] dashboard today (tham khảo): {ms:.2} ms (hôm nay {}, quá hạn {})",
        view.today.len(),
        view.overdue.len()
    );

    drop(conn);
    let _ = std::fs::remove_dir_all(&dir);
}
