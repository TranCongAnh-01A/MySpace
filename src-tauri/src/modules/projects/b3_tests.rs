use chrono::{TimeZone, Utc};
use rusqlite::Connection;

use crate::clock::FixedClock;
use crate::db;
use crate::error::ErrorCode;
use crate::ids::DEFAULT_WORKSPACE_ID as WS;
use crate::modules::search::application as search_app;
use crate::modules::tasks::application as tasks_app;
use crate::modules::tasks::domain::{TaskCreate, TaskFilter, TaskPatch, TaskStatus};
use crate::modules::tasks::infrastructure::SqliteTaskRepository;
use crate::modules::tasks::timectx::TimeCtx;
use crate::modules::trash::application as trash_app;
use crate::modules::trash::domain::TrashKind;

use super::application as app;
use super::domain::{ChildMode, Project, ProjectCreate, ProjectPatch};
use super::infrastructure::SqliteProjectRepository;

fn at(day: u32, hour: u32) -> FixedClock {
    FixedClock(Utc.with_ymd_and_hms(2026, 11, day, hour, 0, 0).unwrap())
}

fn ctx(c: &FixedClock) -> TimeCtx {
    TimeCtx::new("Asia/Ho_Chi_Minh", c.0)
}

fn project(conn: &Connection, c: &FixedClock, name: &str, area: Option<&str>) -> Project {
    let repo = SqliteProjectRepository::new(conn, c);
    app::create(
        &repo,
        &c.0.to_rfc3339(),
        &ProjectCreate {
            name: name.into(),
            area_id: area.map(Into::into),
            ..Default::default()
        },
    )
    .unwrap()
}

fn task(
    conn: &Connection,
    c: &FixedClock,
    project_id: &str,
    title: &str,
    status: TaskStatus,
) -> String {
    let repo = SqliteTaskRepository::new(conn, c);
    tasks_app::create(
        &repo,
        &ctx(c),
        &TaskCreate {
            title: title.into(),
            project_id: Some(project_id.into()),
            status: Some(status),
            ..Default::default()
        },
    )
    .unwrap()
    .id
}

fn area(conn: &Connection, id: &str) {
    conn.execute(
        "INSERT INTO areas (id, workspace_id, name, sort_key, created_at, updated_at)
         VALUES (?1, ?2, 'Khu', 'V', 't', 't')",
        rusqlite::params![id, WS],
    )
    .unwrap();
}

fn col(conn: &Connection, table: &str, col: &str, id: &str) -> Option<String> {
    conn.query_row(
        &format!("SELECT {col} FROM {table} WHERE id = ?1"),
        [id],
        |r| r.get(0),
    )
    .unwrap()
}

fn count(conn: &Connection, table: &str) -> i64 {
    conn.query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r.get(0))
        .unwrap()
}

fn overview(conn: &Connection, c: &FixedClock, id: &str) -> super::domain::ProjectOverview {
    app::get_overview(&SqliteProjectRepository::new(conn, c), id).unwrap()
}

#[test]
fn progress_counts_only_live_tasks() {
    let conn = db::open_in_memory().unwrap();
    let c = at(26, 3);
    let p = project(&conn, &c, "P", None);
    assert_eq!(overview(&conn, &c, &p.id).progress.percent, None);
    let mut ids = Vec::new();
    for i in 0..40 {
        let status = if i < 26 {
            TaskStatus::Done
        } else {
            TaskStatus::Todo
        };
        ids.push(task(&conn, &c, &p.id, &format!("t{i}"), status));
    }
    let o = overview(&conn, &c, &p.id);
    assert_eq!((o.progress.done, o.progress.total), (26, 40));
    assert_eq!(o.progress.percent, Some(65));
    assert_eq!(o.counts.todo, 14);
    assert!(o.recent_notes.is_empty());
    // Task đã lưu trữ hoặc đã xoá không tính.
    let repo = SqliteTaskRepository::new(&conn, &c);
    tasks_app::archive(&repo, &ids[0]).unwrap(); // Done
    tasks_app::delete(&repo, &ids[39]).unwrap(); // Todo
    let o = overview(&conn, &c, &p.id);
    assert_eq!((o.progress.done, o.progress.total), (25, 38));
    assert_eq!(o.progress.percent, Some(66));
    assert_eq!(
        app::get_overview(&SqliteProjectRepository::new(&conn, &c), "nope")
            .unwrap_err()
            .code,
        ErrorCode::NotFound
    );
}

#[test]
fn detach_keeps_tasks_and_gives_them_the_projects_area() {
    let conn = db::open_in_memory().unwrap();
    let c = at(26, 3);
    area(&conn, "a1");
    let p = project(&conn, &c, "P", Some("a1"));
    let t = task(&conn, &c, &p.id, "t", TaskStatus::Todo);
    let archived = task(&conn, &c, &p.id, "cũ", TaskStatus::Todo);
    tasks_app::archive(&SqliteTaskRepository::new(&conn, &c), &archived).unwrap();

    app::archive(
        &SqliteProjectRepository::new(&conn, &c),
        &p.id,
        ChildMode::Detach,
    )
    .unwrap();

    for id in [&t, &archived] {
        assert_eq!(col(&conn, "tasks", "project_id", id), None);
        assert_eq!(col(&conn, "tasks", "area_id", id).as_deref(), Some("a1"));
    }
    assert!(
        col(&conn, "tasks", "archived_at", &t).is_none(),
        "Task vẫn đang mở"
    );
    assert!(col(&conn, "projects", "archived_at", &p.id).is_some());
    // Project không có Area: Task không nhận Area nào.
    let q = project(&conn, &c, "Q", None);
    let t2 = task(&conn, &c, &q.id, "t2", TaskStatus::Todo);
    app::delete(
        &SqliteProjectRepository::new(&conn, &c),
        &q.id,
        ChildMode::Detach,
    )
    .unwrap();
    assert_eq!(col(&conn, "tasks", "project_id", &t2), None);
    assert_eq!(col(&conn, "tasks", "area_id", &t2), None);
}

#[test]
fn archive_with_children_and_unarchive_restore_only_same_batch() {
    let conn = db::open_in_memory().unwrap();
    let early = at(20, 3);
    let p = project(&conn, &early, "P", None);
    let before = task(&conn, &early, &p.id, "đã archive trước", TaskStatus::Todo);
    let live = task(&conn, &early, &p.id, "đang mở", TaskStatus::Done);
    tasks_app::archive(&SqliteTaskRepository::new(&conn, &early), &before).unwrap();

    let later = at(22, 3);
    let repo = SqliteProjectRepository::new(&conn, &later);
    app::archive(&repo, &p.id, ChildMode::WithChildren).unwrap();
    let stamp = col(&conn, "projects", "archived_at", &p.id).unwrap();
    assert_eq!(col(&conn, "tasks", "archived_at", &live), Some(stamp));
    assert_eq!(
        col(&conn, "tasks", "archived_at", &before).as_deref(),
        Some("2026-11-20T03:00:00.000Z"),
        "Task đã archive trước giữ mốc cũ"
    );
    // Project đã lưu trữ: không gán Task mới vào được.
    let err = tasks_app::create(
        &SqliteTaskRepository::new(&conn, &later),
        &ctx(&later),
        &TaskCreate {
            title: "x".into(),
            project_id: Some(p.id.clone()),
            ..Default::default()
        },
    )
    .unwrap_err();
    assert_eq!(err.code, ErrorCode::Validation);
    assert_eq!(app::list(&repo, true).unwrap().len(), 1);
    assert!(app::list(&repo, false).unwrap().is_empty());

    app::unarchive(&repo, &p.id).unwrap();
    assert!(col(&conn, "tasks", "archived_at", &live).is_none());
    assert!(
        col(&conn, "tasks", "archived_at", &before).is_some(),
        "chỉ khôi phục cùng mốc"
    );
    assert!(col(&conn, "projects", "archived_at", &p.id).is_none());
}

#[test]
fn delete_with_children_then_trash_restore_brings_back_same_batch() {
    let conn = db::open_in_memory().unwrap();
    let early = at(20, 3);
    let p = project(&conn, &early, "Dự án Mặt Trăng", None);
    let gone_before = task(&conn, &early, &p.id, "xoá trước", TaskStatus::Todo);
    let live = task(&conn, &early, &p.id, "Việc bay lên", TaskStatus::Todo);
    tasks_app::delete(&SqliteTaskRepository::new(&conn, &early), &gone_before).unwrap();

    let later = at(22, 3);
    app::delete(
        &SqliteProjectRepository::new(&conn, &later),
        &p.id,
        ChildMode::WithChildren,
    )
    .unwrap();
    assert!(search_app::search(&conn, "mat trang", None, None)
        .unwrap()
        .is_empty());
    assert!(search_app::search(&conn, "bay len", None, None)
        .unwrap()
        .is_empty());
    let items = trash_app::list(&conn, 30).unwrap();
    let kinds: Vec<_> = items.iter().map(|i| (i.kind, i.title.as_str())).collect();
    assert!(kinds.contains(&(TrashKind::Project, "Dự án Mặt Trăng")));
    assert_eq!(items.len(), 3, "Project + Task cùng lúc + Task xoá trước");

    trash_app::restore(&conn, &later, TrashKind::Project, &p.id).unwrap();
    assert!(col(&conn, "tasks", "deleted_at", &live).is_none());
    assert!(col(&conn, "tasks", "deleted_at", &gone_before).is_some());
    assert_eq!(
        search_app::search(&conn, "mat trang", None, None)
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        search_app::search(&conn, "bay len", None, None)
            .unwrap()
            .len(),
        1
    );
    assert_eq!(trash_app::list(&conn, 30).unwrap().len(), 1);
    assert_eq!(
        trash_app::restore(&conn, &later, TrashKind::Project, &p.id)
            .unwrap_err()
            .code,
        ErrorCode::NotFound
    );
}

#[test]
fn purge_removes_children_and_detaches_notes() {
    let conn = db::open_in_memory().unwrap();
    let c = at(1, 3);
    let p = project(&conn, &c, "P", None);
    task(&conn, &c, &p.id, "con", TaskStatus::Todo);
    conn.execute(
        "INSERT INTO notes (id, workspace_id, project_id, created_at, updated_at)
         VALUES ('n1', ?1, ?2, 't', 't')",
        rusqlite::params![WS, p.id],
    )
    .unwrap();
    app::delete(
        &SqliteProjectRepository::new(&conn, &c),
        &p.id,
        ChildMode::WithChildren,
    )
    .unwrap();

    // Chưa tới hạn thì giữ; quá hạn thì xoá hẳn.
    assert_eq!(trash_app::purge_expired(&conn, &at(10, 3), 30).unwrap(), 0);
    // Project + Task + Note đã xoá cùng Project (từ B5, `WithChildren` xoá cả Note).
    assert_eq!(trash_app::purge_expired(&conn, &at(26, 3), 10).unwrap(), 3);
    assert_eq!((count(&conn, "projects"), count(&conn, "tasks")), (0, 0));
    assert_eq!(count(&conn, "notes"), 0);
    assert_eq!(count(&conn, "search_map"), 0);

    // trash_empty cũng xoá Project.
    let p2 = project(&conn, &c, "P2", None);
    app::delete(
        &SqliteProjectRepository::new(&conn, &c),
        &p2.id,
        ChildMode::Detach,
    )
    .unwrap();
    assert_eq!(trash_app::empty(&conn, &c).unwrap(), 1);
    assert_eq!(count(&conn, "projects"), 0);
}

#[test]
fn task_project_must_be_active() {
    let conn = db::open_in_memory().unwrap();
    let c = at(26, 3);
    let p = project(&conn, &c, "P", None);
    let q = project(&conn, &c, "Q", None);
    let repo = SqliteTaskRepository::new(&conn, &c);
    let mk = |pid: &str| {
        tasks_app::create(
            &repo,
            &ctx(&c),
            &TaskCreate {
                title: "t".into(),
                project_id: Some(pid.into()),
                ..Default::default()
            },
        )
    };
    assert_eq!(mk("nope").unwrap_err().code, ErrorCode::Validation);
    let t = mk(&p.id).unwrap();
    let move_to = |pid: &str| {
        tasks_app::update(
            &repo,
            &ctx(&c),
            &t.id,
            &TaskPatch {
                project_id: Some(Some(pid.into())),
                ..Default::default()
            },
            t.version,
        )
    };
    app::archive(
        &SqliteProjectRepository::new(&conn, &c),
        &q.id,
        ChildMode::Detach,
    )
    .unwrap();
    assert_eq!(move_to(&q.id).unwrap_err().code, ErrorCode::Validation);
    let r = project(&conn, &c, "R", None);
    app::delete(
        &SqliteProjectRepository::new(&conn, &c),
        &r.id,
        ChildMode::Detach,
    )
    .unwrap();
    assert_eq!(move_to(&r.id).unwrap_err().code, ErrorCode::Validation);
    // Sửa Task nằm sẵn trong Project vẫn được.
    let patch = TaskPatch {
        title: Some("mới".into()),
        ..Default::default()
    };
    assert!(tasks_app::update(&repo, &ctx(&c), &t.id, &patch, t.version).is_ok());
    let listed = tasks_app::list(
        &repo,
        &ctx(&c),
        &TaskFilter {
            project_id: Some(p.id.clone()),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(listed.len(), 1);
}

#[test]
fn search_finds_projects_including_archived_but_not_deleted() {
    let conn = db::open_in_memory().unwrap();
    let c = at(26, 3);
    let p = project(&conn, &c, "Khách sạn Đà Lạt", None);
    let repo = SqliteProjectRepository::new(&conn, &c);
    let hits = search_app::search(&conn, "da lat", None, None).unwrap();
    assert_eq!(
        (hits.len(), hits[0].title.as_str()),
        (1, "Khách sạn Đà Lạt")
    );
    app::update(
        &repo,
        &p.id,
        &ProjectPatch {
            description: Some("Đặt phòng online".into()),
            ..Default::default()
        },
        p.version,
    )
    .unwrap();
    assert_eq!(
        search_app::search(&conn, "dat phong", None, None)
            .unwrap()
            .len(),
        1
    );
    app::archive(&repo, &p.id, ChildMode::Detach).unwrap();
    assert_eq!(
        search_app::search(&conn, "da lat", None, None)
            .unwrap()
            .len(),
        1
    );
    app::delete(&repo, &p.id, ChildMode::Detach).unwrap();
    assert!(search_app::search(&conn, "da lat", None, None)
        .unwrap()
        .is_empty());

    // Project chưa có trong chỉ mục thì khởi động sẽ index nốt.
    conn.execute(
        "INSERT INTO projects (id, workspace_id, name, sort_key, created_at, updated_at)
         VALUES ('old', ?1, 'Dự án cũ', 'Z', 't', 't')",
        [WS],
    )
    .unwrap();
    assert!(search_app::search(&conn, "du an cu", None, None)
        .unwrap()
        .is_empty());
    search_app::reindex_missing_projects(&conn).unwrap();
    assert_eq!(
        search_app::search(&conn, "du an cu", None, None)
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn update_conflict_validation_and_reorder() {
    let conn = db::open_in_memory().unwrap();
    let c = at(26, 3);
    let repo = SqliteProjectRepository::new(&conn, &c);
    let a = project(&conn, &c, "A", None);
    let b = project(&conn, &c, "B", None);
    let d = project(&conn, &c, "C", None);
    let names = || {
        app::list(&repo, false)
            .unwrap()
            .into_iter()
            .map(|p| p.name)
            .collect::<Vec<_>>()
    };
    assert_eq!(names(), ["A", "B", "C"]);
    app::reorder(&repo, &d.id, Some(&a.id), Some(&b.id)).unwrap();
    assert_eq!(names(), ["A", "C", "B"]);
    assert_eq!(
        app::reorder(&repo, &a.id, None, None).unwrap_err().code,
        ErrorCode::Validation
    );

    let patch = |json: &str| serde_json::from_str::<ProjectPatch>(json).unwrap();
    let updated = app::update(
        &repo,
        &a.id,
        &patch(r#"{"name":"A2","icon":"star"}"#),
        a.version,
    )
    .unwrap();
    assert_eq!(
        (updated.name.as_str(), updated.version),
        ("A2", a.version + 1)
    );
    let code = |r: crate::error::AppResult<Project>| r.unwrap_err().code;
    assert_eq!(
        code(app::update(
            &repo,
            &a.id,
            &patch(r#"{"name":"x"}"#),
            a.version
        )),
        ErrorCode::Conflict
    );
    assert_eq!(
        code(app::update(
            &repo,
            &a.id,
            &patch(r#"{"areaId":"nope"}"#),
            updated.version
        )),
        ErrorCode::Validation
    );
    assert_eq!(
        code(app::update(&repo, "nope", &patch("{}"), 1)),
        ErrorCode::NotFound
    );
    let ops: Vec<String> = conn
        .prepare(
            "SELECT op FROM change_log WHERE entity = 'project' AND entity_id = ?1 ORDER BY seq",
        )
        .unwrap()
        .query_map([&a.id], |r| r.get(0))
        .unwrap()
        .map(Result::unwrap)
        .collect();
    assert_eq!(ops, ["Insert", "Update"]);
}
