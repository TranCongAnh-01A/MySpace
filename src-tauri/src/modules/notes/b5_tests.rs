use chrono::{TimeZone, Utc};
use rusqlite::Connection;

use crate::clock::{Clock, FixedClock};
use crate::db;
use crate::error::ErrorCode;
use crate::modules::dashboard::application as dashboard;
use crate::modules::inbox::application as inbox_app;
use crate::modules::inbox::infrastructure::SqliteInboxRepository;
use crate::modules::projects::application as projects_app;
use crate::modules::projects::domain::{ChildMode, Project, ProjectCreate};
use crate::modules::projects::infrastructure::SqliteProjectRepository;
use crate::modules::search::application as search_app;
use crate::modules::search::infrastructure::SearchKind;
use crate::modules::tasks::application as tasks_app;
use crate::modules::tasks::domain::TaskCreate;
use crate::modules::tasks::infrastructure::SqliteTaskRepository;
use crate::modules::tasks::timectx::TimeCtx;
use crate::modules::trash::application as trash_app;
use crate::modules::trash::domain::TrashKind;

use super::application as app;
use super::domain::{Note, NoteCreate, NoteFilter, NoteSort, EMPTY_DOC};
use super::infrastructure::{self, SqliteNoteRepository};

fn at(day: u32, hour: u32) -> FixedClock {
    FixedClock(Utc.with_ymd_and_hms(2026, 11, day, hour, 0, 0).unwrap())
}

fn ctx(c: &FixedClock) -> TimeCtx {
    TimeCtx::new("Asia/Ho_Chi_Minh", c.0)
}

fn doc_with(text: &str) -> String {
    format!(
        r#"{{"type":"doc","content":[{{"type":"paragraph","content":[{{"type":"text","text":"{text}"}}]}}]}}"#
    )
}

fn mk(conn: &Connection, c: &FixedClock, title: &str, f: impl FnOnce(&mut NoteCreate)) -> Note {
    let mut input = NoteCreate {
        title: Some(title.into()),
        ..Default::default()
    };
    f(&mut input);
    app::create(&SqliteNoteRepository::new(conn, c), &c.now_iso(), &input).unwrap()
}

fn project(conn: &Connection, c: &FixedClock, name: &str) -> Project {
    projects_app::create(
        &SqliteProjectRepository::new(conn, c),
        &c.now_iso(),
        &ProjectCreate {
            name: name.into(),
            ..Default::default()
        },
    )
    .unwrap()
}

fn task(conn: &Connection, c: &FixedClock, title: &str) -> String {
    tasks_app::create(
        &SqliteTaskRepository::new(conn, c),
        &ctx(c),
        &TaskCreate {
            title: title.into(),
            ..Default::default()
        },
    )
    .unwrap()
    .id
}

fn count(conn: &Connection, table: &str) -> i64 {
    conn.query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r.get(0))
        .unwrap()
}

#[test]
fn create_defaults_to_empty_doc_and_version_one() {
    let conn = db::open_in_memory().unwrap();
    let c = at(26, 3);
    let n = mk(&conn, &c, "  Họp  ", |_| {});
    assert_eq!(n.title, "Họp");
    assert_eq!(n.content_json, EMPTY_DOC);
    assert_eq!(n.version, 1);
    assert!(n.task_ids.is_empty() && n.tag_ids.is_empty());
}

#[test]
fn save_checks_base_version_and_bumps_it() {
    let conn = db::open_in_memory().unwrap();
    let c = at(26, 3);
    let n = mk(&conn, &c, "A", |_| {});
    let later = at(26, 4);
    let repo = SqliteNoteRepository::new(&conn, &later);
    let content = doc_with("xin chào");

    let err = app::save(&repo, &n.id, "A", &content, 7).unwrap_err();
    assert_eq!(err.code, ErrorCode::Conflict);

    let same_title = app::save(&repo, &n.id, "A", &content, 1).unwrap();
    assert_eq!(same_title.result.version, 2);
    assert_eq!(same_title.result.updated_at, "2026-11-26T04:00:00.000Z");
    assert!(
        !same_title.title_changed,
        "title không đổi thì không phát event"
    );

    let renamed = app::save(&repo, &n.id, "B", &content, 2).unwrap();
    assert_eq!(renamed.result.version, 3);
    assert!(renamed.title_changed);

    // Lưu bản cũ sau khi đã có bản mới: CONFLICT, nội dung giữ nguyên.
    assert_eq!(
        app::save(&repo, &n.id, "C", &content, 2).unwrap_err().code,
        ErrorCode::Conflict
    );
    assert_eq!(app::get(&repo, &n.id).unwrap().title, "B");
}

#[test]
fn save_rejects_bad_content_without_changing_anything() {
    let conn = db::open_in_memory().unwrap();
    let c = at(26, 3);
    let n = mk(&conn, &c, "A", |_| {});
    let repo = SqliteNoteRepository::new(&conn, &c);
    for bad in [
        r#"{"type":"doc","content":[{"type":"script"}]}"#,
        r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"link","attrs":{"href":"javascript:alert(1)"}}]}]}]}"#,
        "không phải json",
    ] {
        let err = app::save(&repo, &n.id, "A", bad, 1).unwrap_err();
        assert_eq!(err.code, ErrorCode::Validation, "{bad}");
    }
    let err = app::create(
        &repo,
        &c.now_iso(),
        &NoteCreate {
            content_json: Some(r#"{"type":"doc","content":[{"type":"iframe"}]}"#.into()),
            ..Default::default()
        },
    )
    .unwrap_err();
    assert_eq!(err.code, ErrorCode::Validation);
    assert_eq!(app::get(&repo, &n.id).unwrap().version, 1);
    assert_eq!(count(&conn, "notes"), 1);
}

#[test]
fn search_finds_note_without_diacritics_and_by_body() {
    let conn = db::open_in_memory().unwrap();
    let c = at(26, 3);
    let n = mk(&conn, &c, "Ghi chú", |_| {});
    let hits = search_app::search(&conn, "ghi chu", None, None).unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(
        (hits[0].kind, hits[0].id.as_str()),
        (SearchKind::Note, n.id.as_str())
    );
    assert_eq!(hits[0].title, "Ghi chú");

    let repo = SqliteNoteRepository::new(&conn, &c);
    app::save(&repo, &n.id, "Ghi chú", &doc_with("thanh toán Stripe"), 1).unwrap();
    assert_eq!(
        search_app::search(&conn, "stripe", None, None)
            .unwrap()
            .len(),
        1
    );
    app::delete(&repo, &n.id).unwrap();
    assert!(search_app::search(&conn, "stripe", None, None)
        .unwrap()
        .is_empty());
}

#[test]
fn reindex_missing_notes_restores_lost_index() {
    let conn = db::open_in_memory().unwrap();
    let c = at(26, 3);
    mk(&conn, &c, "Họp khách", |_| {});
    conn.execute_batch("DELETE FROM search_index; DELETE FROM search_map;")
        .unwrap();
    assert!(search_app::search(&conn, "hop", None, None)
        .unwrap()
        .is_empty());
    search_app::reindex_missing_notes(&conn).unwrap();
    assert_eq!(
        search_app::search(&conn, "hop", None, None).unwrap().len(),
        1
    );
}

#[test]
fn list_filters_sorts_and_hides_archived_projects() {
    let conn = db::open_in_memory().unwrap();
    let (c1, c2, c3) = (at(1, 1), at(2, 1), at(3, 1));
    let p = project(&conn, &c1, "P");
    let t = task(&conn, &c1, "T");
    let b = mk(&conn, &c1, "bravo", |i| i.project_id = Some(p.id.clone()));
    let a = mk(&conn, &c2, "Alpha", |i| i.task_id = Some(t.clone()));
    let free = mk(&conn, &c3, "zulu", |_| {});
    let repo = SqliteNoteRepository::new(&conn, &c3);
    let ids = |f: NoteFilter| -> Vec<String> {
        app::list(&repo, &f)
            .unwrap()
            .into_iter()
            .map(|n| n.id)
            .collect()
    };

    assert_eq!(
        ids(NoteFilter::default()),
        [free.id.clone(), a.id.clone(), b.id.clone()]
    );
    let by_title = NoteFilter {
        sort: Some(NoteSort::Title),
        ..Default::default()
    };
    assert_eq!(ids(by_title), [a.id.clone(), b.id.clone(), free.id.clone()]);
    let by_task = NoteFilter {
        task_id: Some(t),
        ..Default::default()
    };
    assert_eq!(ids(by_task), std::slice::from_ref(&a.id));

    projects_app::archive(
        &SqliteProjectRepository::new(&conn, &c3),
        &p.id,
        ChildMode::WithChildren,
    )
    .unwrap();
    assert_eq!(ids(NoteFilter::default()), [free.id.clone(), a.id.clone()]);
    let in_project = NoteFilter {
        project_id: Some(p.id),
        ..Default::default()
    };
    assert_eq!(ids(in_project), [b.id]);
    let list = app::list(&repo, &NoteFilter::default()).unwrap();
    assert_eq!(list[0].excerpt, "");
}

#[test]
fn links_tags_and_task_detail_note_ids() {
    let conn = db::open_in_memory().unwrap();
    let c = at(26, 3);
    let t = task(&conn, &c, "Payment API");
    let n1 = mk(&conn, &at(26, 4), "một", |_| {});
    let n2 = mk(&conn, &at(26, 5), "hai", |i| i.task_id = Some(t.clone()));
    let repo = SqliteNoteRepository::new(&conn, &c);

    app::link_task(&repo, &n1.id, &t).unwrap();
    app::link_task(&repo, &n1.id, &t).unwrap(); // lần hai không lỗi
    assert_eq!(
        app::get(&repo, &n1.id).unwrap().task_ids,
        std::slice::from_ref(&t)
    );
    assert_eq!(
        app::link_task(&repo, &n1.id, "không-có").unwrap_err().code,
        ErrorCode::Validation
    );

    let detail = tasks_app::get_detail(&SqliteTaskRepository::new(&conn, &c), &t).unwrap();
    assert_eq!(detail.note_ids, [n2.id.clone(), n1.id.clone()]);

    app::unlink_task(&repo, &n1.id, &t).unwrap();
    app::delete(&repo, &n2.id).unwrap();
    let detail = tasks_app::get_detail(&SqliteTaskRepository::new(&conn, &c), &t).unwrap();
    assert!(
        detail.note_ids.is_empty(),
        "Note đã xoá/gỡ không còn trong noteIds"
    );

    let tag = crate::modules::tags::application::create(
        &crate::modules::tags::infrastructure::SqliteTagRepository::new(&conn, &c),
        &crate::modules::tags::domain::TagCreate {
            name: "ý tưởng".into(),
            color: None,
        },
    )
    .unwrap();
    let tagged = app::set_tags(&repo, &n1.id, &[tag.id.clone(), tag.id.clone()]).unwrap();
    assert_eq!(tagged.tag_ids, std::slice::from_ref(&tag.id));
    assert_eq!(
        app::set_tags(&repo, &n1.id, &["x".into()])
            .unwrap_err()
            .code,
        ErrorCode::Validation
    );
    let by_tag = NoteFilter {
        tag_id: Some(tag.id),
        ..Default::default()
    };
    assert_eq!(app::list(&repo, &by_tag).unwrap().len(), 1);
}

#[test]
fn move_handles_three_states_and_rejects_cycles() {
    let conn = db::open_in_memory().unwrap();
    let c = at(26, 3);
    let p = project(&conn, &c, "P");
    let a = mk(&conn, &c, "a", |_| {});
    let b = mk(&conn, &c, "b", |i| i.parent_note_id = Some(a.id.clone()));
    let d = mk(&conn, &c, "d", |i| i.parent_note_id = Some(b.id.clone()));
    let repo = SqliteNoteRepository::new(&conn, &c);

    // a → con của d: vòng a → d → b → a.
    let err = app::move_note(&repo, &a.id, None, Some(Some(d.id.clone()))).unwrap_err();
    assert_eq!(err.code, ErrorCode::Validation);
    let err = app::move_note(&repo, &a.id, None, Some(Some(a.id.clone()))).unwrap_err();
    assert_eq!(err.code, ErrorCode::Validation);
    assert_eq!(
        app::move_note(&repo, &b.id, None, Some(Some("không-có".into())))
            .unwrap_err()
            .code,
        ErrorCode::Validation
    );

    let moved = app::move_note(&repo, &b.id, Some(Some(p.id.clone())), None).unwrap();
    assert_eq!(moved.project_id.as_deref(), Some(p.id.as_str()));
    assert_eq!(
        moved.parent_note_id.as_deref(),
        Some(a.id.as_str()),
        "thiếu = giữ nguyên"
    );
    assert_eq!(moved.version, 2);

    let cleared = app::move_note(&repo, &b.id, Some(None), Some(None)).unwrap();
    assert_eq!((cleared.project_id, cleared.parent_note_id), (None, None));

    projects_app::archive(
        &SqliteProjectRepository::new(&conn, &c),
        &p.id,
        ChildMode::Detach,
    )
    .unwrap();
    assert_eq!(
        app::move_note(&repo, &b.id, Some(Some(p.id)), None)
            .unwrap_err()
            .code,
        ErrorCode::Validation,
        "không chuyển vào Project đã lưu trữ"
    );
}

#[test]
fn create_with_missing_task_or_archived_project_is_validation() {
    let conn = db::open_in_memory().unwrap();
    let c = at(26, 3);
    let repo = SqliteNoteRepository::new(&conn, &c);
    for input in [
        NoteCreate {
            task_id: Some("x".into()),
            ..Default::default()
        },
        NoteCreate {
            project_id: Some("x".into()),
            ..Default::default()
        },
        NoteCreate {
            parent_note_id: Some("x".into()),
            ..Default::default()
        },
        NoteCreate {
            title: Some("x".repeat(301)),
            ..Default::default()
        },
    ] {
        let err = app::create(&repo, &c.now_iso(), &input).unwrap_err();
        assert_eq!(err.code, ErrorCode::Validation);
    }
    assert_eq!(count(&conn, "notes"), 0);
}

fn convert(
    conn: &Connection,
    c: &FixedClock,
    id: &str,
    input: &NoteCreate,
) -> crate::error::AppResult<Note> {
    inbox_app::convert_to_note(
        &SqliteInboxRepository::new(conn, c),
        &SqliteNoteRepository::new(conn, c),
        c,
        id,
        input,
    )
}

#[test]
fn inbox_convert_to_note_fills_title_and_body_and_conflicts_second_time() {
    let conn = db::open_in_memory().unwrap();
    let c = at(26, 3);
    let long = format!("{}\ndòng hai", "đ".repeat(100));
    let item = inbox_app::create(&SqliteInboxRepository::new(&conn, &c), &c, &long).unwrap();

    let note = convert(&conn, &c, &item.id, &NoteCreate::default()).unwrap();
    assert_eq!(note.title.chars().count(), 80);
    let text = crate::modules::notes::domain::extract_text(
        &serde_json::from_str(&note.content_json).unwrap(),
    );
    assert_eq!(text, long);

    let items = inbox_app::list(&SqliteInboxRepository::new(&conn, &c), None).unwrap();
    assert_eq!(
        items[0].converted_note_id.as_deref(),
        Some(note.id.as_str())
    );
    assert_eq!(
        convert(&conn, &c, &item.id, &NoteCreate::default())
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    assert_eq!(count(&conn, "notes"), 1);

    // Tiêu đề và nội dung do người dùng đưa vào được giữ nguyên.
    let item2 = inbox_app::create(&SqliteInboxRepository::new(&conn, &c), &c, "ghi nhanh").unwrap();
    let custom = NoteCreate {
        title: Some("Tên riêng".into()),
        content_json: Some(doc_with("nội dung riêng")),
        ..Default::default()
    };
    let n2 = convert(&conn, &c, &item2.id, &custom).unwrap();
    assert_eq!(n2.title, "Tên riêng");
    assert_eq!(n2.content_json, doc_with("nội dung riêng"));

    // Chuyển lỗi (nội dung sai) thì mục Inbox vẫn còn Open.
    let item3 = inbox_app::create(&SqliteInboxRepository::new(&conn, &c), &c, "x").unwrap();
    let bad = NoteCreate {
        content_json: Some("{}".into()),
        ..Default::default()
    };
    assert_eq!(
        convert(&conn, &c, &item3.id, &bad).unwrap_err().code,
        ErrorCode::Validation
    );
    let open = inbox_app::list(
        &SqliteInboxRepository::new(&conn, &c),
        Some(crate::modules::inbox::domain::InboxStatus::Open),
    )
    .unwrap();
    assert_eq!(open.len(), 1);
}

#[test]
fn trash_note_delete_restore_and_purge() {
    let conn = db::open_in_memory().unwrap();
    let c = at(26, 3);
    let n = mk(&conn, &c, "Họp khách", |_| {});
    let repo = SqliteNoteRepository::new(&conn, &c);
    app::delete(&repo, &n.id).unwrap();
    assert_eq!(
        app::get(&repo, &n.id).unwrap_err().code,
        ErrorCode::NotFound
    );
    assert!(app::list(&repo, &NoteFilter::default()).unwrap().is_empty());
    let trashed = NoteFilter {
        trashed: Some(true),
        ..Default::default()
    };
    assert_eq!(app::list(&repo, &trashed).unwrap().len(), 1);

    let items = trash_app::list(&conn, 30).unwrap();
    assert_eq!(
        (items[0].kind, items[0].title.as_str()),
        (TrashKind::Note, "Họp khách")
    );

    trash_app::restore(&conn, &c, TrashKind::Note, &n.id).unwrap();
    assert_eq!(app::get(&repo, &n.id).unwrap().title, "Họp khách");
    assert_eq!(
        search_app::search(&conn, "hop khach", None, None)
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        trash_app::restore(&conn, &c, TrashKind::Note, &n.id)
            .unwrap_err()
            .code,
        ErrorCode::NotFound
    );

    app::delete(&repo, &n.id).unwrap();
    assert_eq!(trash_app::empty(&conn, &c).unwrap(), 1);
    assert_eq!(count(&conn, "notes"), 0);
    assert_eq!(count(&conn, "search_map"), 0);
}

#[test]
fn purge_note_orphans_children_and_removes_converted_inbox_item() {
    let conn = db::open_in_memory().unwrap();
    let c = at(26, 3);
    let t = task(&conn, &c, "T");
    let item = inbox_app::create(&SqliteInboxRepository::new(&conn, &c), &c, "gốc").unwrap();
    let parent = convert(&conn, &c, &item.id, &NoteCreate::default()).unwrap();
    let child = mk(&conn, &c, "con", |i| {
        i.parent_note_id = Some(parent.id.clone());
        i.task_id = Some(t.clone());
    });
    let repo = SqliteNoteRepository::new(&conn, &c);
    app::delete(&repo, &parent.id).unwrap();
    assert_eq!(
        app::get(&repo, &child.id)
            .unwrap()
            .parent_note_id
            .as_deref(),
        Some(parent.id.as_str()),
        "xoá mềm không đụng Note con"
    );

    trash_app::empty(&conn, &c).unwrap();
    assert_eq!(count(&conn, "inbox_items"), 0);
    let child = app::get(&repo, &child.id).unwrap();
    assert_eq!(child.parent_note_id, None);
    assert_eq!(child.task_ids, [t]);
}

#[test]
fn deleting_a_task_purges_its_note_links_only() {
    let conn = db::open_in_memory().unwrap();
    let c = at(26, 3);
    let t = task(&conn, &c, "T");
    let n = mk(&conn, &c, "n", |i| i.task_id = Some(t.clone()));
    tasks_app::delete(&SqliteTaskRepository::new(&conn, &c), &t).unwrap();
    trash_app::empty(&conn, &c).unwrap();
    assert_eq!(count(&conn, "note_tasks"), 0);
    assert!(app::get(&SqliteNoteRepository::new(&conn, &c), &n.id)
        .unwrap()
        .task_ids
        .is_empty());
}

#[test]
fn project_delete_with_children_removes_notes_and_restore_brings_them_back() {
    let conn = db::open_in_memory().unwrap();
    let c = at(26, 3);
    let p = project(&conn, &c, "Dự án");
    let inside = mk(&conn, &c, "trong dự án", |i| {
        i.project_id = Some(p.id.clone())
    });
    // Note đã xoá từ trước (mốc khác) không được khôi phục theo Project.
    let earlier = mk(&conn, &c, "đã xoá trước", |i| {
        i.project_id = Some(p.id.clone())
    });
    let outside = mk(&conn, &c, "ngoài", |_| {});
    let repo = SqliteNoteRepository::new(&conn, &c);
    app::delete(&SqliteNoteRepository::new(&conn, &at(25, 1)), &earlier.id).unwrap();

    let later = at(27, 3);
    projects_app::delete(
        &SqliteProjectRepository::new(&conn, &later),
        &p.id,
        ChildMode::WithChildren,
    )
    .unwrap();
    let visible: Vec<_> = app::list(&repo, &NoteFilter::default())
        .unwrap()
        .into_iter()
        .map(|n| n.id)
        .collect();
    assert_eq!(visible, std::slice::from_ref(&outside.id));
    assert!(search_app::search(&conn, "trong du an", None, None)
        .unwrap()
        .is_empty());

    trash_app::restore(&conn, &later, TrashKind::Project, &p.id).unwrap();
    let back = app::get(&repo, &inside.id).unwrap();
    assert_eq!(back.project_id.as_deref(), Some(p.id.as_str()));
    assert_eq!(
        app::get(&repo, &earlier.id).unwrap_err().code,
        ErrorCode::NotFound
    );
    assert_eq!(
        search_app::search(&conn, "trong du an", None, None)
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn project_delete_detach_keeps_notes_and_purge_removes_deleted_ones() {
    let conn = db::open_in_memory().unwrap();
    let c = at(26, 3);
    let kept = project(&conn, &c, "Giữ");
    let gone = project(&conn, &c, "Bỏ");
    let n = mk(&conn, &c, "giữ lại", |i| {
        i.project_id = Some(kept.id.clone())
    });
    let m = mk(&conn, &c, "bị xoá", |i| {
        i.project_id = Some(gone.id.clone())
    });
    let projects = SqliteProjectRepository::new(&conn, &c);
    projects_app::delete(&projects, &kept.id, ChildMode::Detach).unwrap();
    projects_app::delete(&projects, &gone.id, ChildMode::WithChildren).unwrap();
    let repo = SqliteNoteRepository::new(&conn, &c);
    assert_eq!(app::get(&repo, &n.id).unwrap().project_id, None);

    trash_app::empty(&conn, &c).unwrap();
    assert_eq!(count(&conn, "projects"), 0);
    assert_eq!(
        count(&conn, "notes"),
        1,
        "chỉ Note đã gỡ khỏi Project còn lại"
    );
    assert_eq!(
        app::get(&repo, &m.id).unwrap_err().code,
        ErrorCode::NotFound
    );
}

#[test]
fn restored_note_loses_deleted_project() {
    let conn = db::open_in_memory().unwrap();
    let c = at(26, 3);
    let p = project(&conn, &c, "P");
    let n = mk(&conn, &c, "n", |i| i.project_id = Some(p.id.clone()));
    let repo = SqliteNoteRepository::new(&conn, &c);
    app::delete(&repo, &n.id).unwrap();
    projects_app::delete(
        &SqliteProjectRepository::new(&conn, &c),
        &p.id,
        ChildMode::Detach,
    )
    .unwrap();
    trash_app::restore(&conn, &c, TrashKind::Note, &n.id).unwrap();
    assert_eq!(app::get(&repo, &n.id).unwrap().project_id, None);
}

#[test]
fn recent_notes_in_dashboard_and_project_overview() {
    let conn = db::open_in_memory().unwrap();
    let c = at(26, 3);
    let p = project(&conn, &c, "P");
    for i in 0..7 {
        let clock = at(10 + i, 1);
        mk(&conn, &clock, &format!("n{i}"), |n| {
            if i % 2 == 0 {
                n.project_id = Some(p.id.clone());
            }
        });
    }
    let doomed = mk(&conn, &at(26, 1), "đã xoá", |n| {
        n.project_id = Some(p.id.clone())
    });
    app::delete(&SqliteNoteRepository::new(&conn, &c), &doomed.id).unwrap();

    let view = dashboard::today(&conn, &c, &ctx(&c)).unwrap();
    let titles: Vec<_> = view.recent_notes.iter().map(|n| n.title.as_str()).collect();
    assert_eq!(titles, ["n6", "n5", "n4", "n3", "n2"]);

    let overview =
        projects_app::get_overview(&SqliteProjectRepository::new(&conn, &c), &p.id).unwrap();
    let titles: Vec<_> = overview
        .recent_notes
        .iter()
        .map(|n| n.title.as_str())
        .collect();
    assert_eq!(titles, ["n6", "n4", "n2", "n0"]);
}

#[test]
fn recent_notes_skip_archived_projects_on_dashboard() {
    let conn = db::open_in_memory().unwrap();
    let c = at(26, 3);
    let p = project(&conn, &c, "P");
    mk(&conn, &c, "trong", |n| n.project_id = Some(p.id.clone()));
    mk(&conn, &at(25, 3), "ngoài", |_| {});
    projects_app::archive(
        &SqliteProjectRepository::new(&conn, &c),
        &p.id,
        ChildMode::WithChildren,
    )
    .unwrap();
    let recent = infrastructure::recent(&conn, None).unwrap();
    assert_eq!(recent.len(), 1);
    assert_eq!(recent[0].title, "ngoài");
}

#[test]
#[cfg(debug_assertions)]
fn demo_seed_adds_three_notes_with_one_linked_to_payment_api() {
    let mut conn = db::open_in_memory().unwrap();
    let c = at(26, 3);
    {
        let tx = conn.transaction().unwrap();
        crate::system::demo::seed(&tx, &c, &ctx(&c)).unwrap();
        tx.commit().unwrap();
    }
    let repo = SqliteNoteRepository::new(&conn, &c);
    let notes = app::list(&repo, &NoteFilter::default()).unwrap();
    assert_eq!(notes.len(), 3);
    let linked = app::list(
        &repo,
        &NoteFilter {
            task_id: Some(
                conn.query_row(
                    "SELECT id FROM tasks WHERE title = 'Payment API'",
                    [],
                    |r| r.get(0),
                )
                .unwrap(),
            ),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(linked.len(), 1);
    assert_eq!(linked[0].title, "API thanh toán");
    assert!(!linked[0].excerpt.is_empty());
    assert_eq!(
        search_app::search(&conn, "booking", Some(&[SearchKind::Note]), None)
            .unwrap()
            .len(),
        1
    );
}
