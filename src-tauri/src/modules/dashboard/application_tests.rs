use super::*;
use crate::clock::FixedClock;
use crate::db;
use crate::modules::projects::domain::{ChildMode, ProjectCreate};
use crate::modules::tasks::domain::{Priority, TaskCreate};
use chrono::{TimeZone, Utc};

/// 2026-11-26 18:00 UTC = 01:00 ngày 27/11 ở Việt Nam.
fn clock() -> FixedClock {
    FixedClock(Utc.with_ymd_and_hms(2026, 11, 26, 18, 0, 0).unwrap())
}

fn titles(tasks: &[Task]) -> Vec<&str> {
    tasks.iter().map(|t| t.title.as_str()).collect()
}

#[test]
fn groups_tasks_by_due_date_in_settings_timezone() {
    let conn = db::open_in_memory().unwrap();
    let c = clock();
    let vn = TimeCtx::new("Asia/Ho_Chi_Minh", c.0);
    let tasks_repo = SqliteTaskRepository::new(&conn, &c);
    let projects_repo = SqliteProjectRepository::new(&conn, &c);
    let proj = |name: &str, status| {
        projects::create(
            &projects_repo,
            &c.now_iso(),
            &ProjectCreate {
                name: name.into(),
                status: Some(status),
                ..Default::default()
            },
        )
        .unwrap()
    };
    let active = proj("Đang chạy", ProjectStatus::Active);
    proj("Tạm dừng", ProjectStatus::OnHold);
    let shelved = proj("Cất đi", ProjectStatus::Active);

    let mk = |title: &str, f: &dyn Fn(&mut TaskCreate)| {
        let mut input = TaskCreate {
            title: title.into(),
            ..Default::default()
        };
        f(&mut input);
        tasks::create(&tasks_repo, &vn, &input).unwrap()
    };
    mk("A cả ngày vừa", &|t| {
        t.due_date = Some("2026-11-27".into())
    });
    mk("B 10h", &|t| {
        t.due_at = Some("2026-11-27T03:00:00.000Z".into());
        t.priority = Some(Priority::Low);
    });
    mk("C 8h", &|t| {
        t.due_at = Some("2026-11-27T01:00:00.000Z".into())
    });
    mk("D cả ngày gấp", &|t| {
        t.due_date = Some("2026-11-27".into());
        t.priority = Some(Priority::Urgent);
    });
    mk("Đã xong hôm nay", &|t| {
        t.due_date = Some("2026-11-27".into());
        t.status = Some(TaskStatus::Done);
    });
    let archived = mk("Đã lưu trữ", &|t| {
        t.due_date = Some("2026-11-27".into())
    });
    tasks::archive(&tasks_repo, &archived.id).unwrap();
    mk("G trễ 22/11", &|t| t.due_date = Some("2026-11-22".into()));
    mk("E trễ 20/11", &|t| t.due_date = Some("2026-11-20".into()));
    mk("Trễ nhưng xong", &|t| {
        t.due_date = Some("2026-11-25".into());
        t.status = Some(TaskStatus::Done);
    });
    mk("H 29/11", &|t| t.due_date = Some("2026-11-29".into()));
    mk("I 4/12", &|t| t.due_date = Some("2026-12-04".into()));
    mk("J 5/12", &|t| t.due_date = Some("2026-12-05".into()));
    mk("Trong dự án đang chạy", &|t| {
        t.project_id = Some(active.id.clone());
        t.status = Some(TaskStatus::Done);
    });
    // Task nằm trong Project (sẽ bị lưu trữ), hạn hôm nay: không được hiện.
    mk("Nằm trong dự án lưu trữ", &|t| {
        t.project_id = Some(shelved.id.clone());
        t.due_date = Some("2026-11-27".into());
    });
    projects::archive(&projects_repo, &shelved.id, ChildMode::WithChildren).unwrap();
    // Task bị gỡ lưu trữ riêng nhưng vẫn thuộc Project đã lưu trữ: cũng không hiện.
    conn.execute(
        "UPDATE tasks SET archived_at = NULL WHERE project_id = ?1",
        [&shelved.id],
    )
    .unwrap();

    let view = today(&conn, &c, &vn).unwrap();
    assert_eq!(view.date, "2026-11-27");
    // Có giờ trước (theo giờ), rồi cả ngày theo ưu tiên; Done/lưu trữ/Project lưu trữ bị bỏ.
    assert_eq!(
        titles(&view.today),
        ["C 8h", "B 10h", "D cả ngày gấp", "A cả ngày vừa"]
    );
    assert_eq!(titles(&view.overdue), ["E trễ 20/11", "G trễ 22/11"]);
    assert_eq!(titles(&view.upcoming), ["H 29/11", "I 4/12"]);
    let names: Vec<&str> = view
        .active_projects
        .iter()
        .map(|p| p.name.as_str())
        .collect();
    assert_eq!(names, ["Đang chạy"]);
    assert_eq!(view.active_projects[0].percent, Some(100));
    assert!(view.recent_notes.is_empty());

    // Cùng dữ liệu, múi giờ UTC: "hôm nay" là 26/11 nên ngày 27/11 thuộc "sắp tới".
    let utc = TimeCtx::new("UTC", c.0);
    let view = today(&conn, &c, &utc).unwrap();
    assert_eq!(view.date, "2026-11-26");
    assert!(!titles(&view.today).contains(&"A cả ngày vừa"));
    assert!(titles(&view.upcoming).contains(&"A cả ngày vừa"));
}

#[test]
fn caps_overdue_at_50_and_upcoming_at_20() {
    let conn = db::open_in_memory().unwrap();
    let c = clock();
    let vn = TimeCtx::new("Asia/Ho_Chi_Minh", c.0);
    let repo = SqliteTaskRepository::new(&conn, &c);
    for i in 0..60 {
        for (prefix, date) in [("trễ", "2026-10-01"), ("sắp", "2026-11-30")] {
            tasks::create(
                &repo,
                &vn,
                &TaskCreate {
                    title: format!("{prefix} {i}"),
                    due_date: Some(date.into()),
                    ..Default::default()
                },
            )
            .unwrap();
        }
    }
    let view = today(&conn, &c, &vn).unwrap();
    assert_eq!(view.overdue.len(), MAX_OVERDUE);
    assert_eq!(view.upcoming.len(), MAX_UPCOMING);
}
