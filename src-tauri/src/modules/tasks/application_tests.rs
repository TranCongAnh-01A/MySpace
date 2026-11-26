use super::*;
use crate::clock::FixedClock;
use crate::db;
use crate::modules::search::application as search_app;
use crate::modules::tags::application as tags_app;
use crate::modules::tags::domain::TagCreate;
use crate::modules::tags::infrastructure::SqliteTagRepository;
use crate::modules::tasks::domain::{DueFilter, Frequency, TaskSort, Weekday};
use crate::modules::tasks::infrastructure::SqliteTaskRepository;
use chrono::{TimeZone, Utc};
use rusqlite::Connection;

/// 2026-11-26 18:00 UTC = 01:00 ngày 27/11 ở Việt Nam.
fn now() -> chrono::DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 11, 26, 18, 0, 0).unwrap()
}

fn ctx() -> TimeCtx {
    TimeCtx::new("Asia/Ho_Chi_Minh", now())
}

fn clock() -> FixedClock {
    FixedClock(now())
}

fn mk(repo: &dyn TaskRepository, f: impl FnOnce(&mut TaskCreate)) -> Task {
    let mut input = TaskCreate {
        title: "Việc".into(),
        ..Default::default()
    };
    f(&mut input);
    create(repo, &ctx(), &input).unwrap()
}

fn titles(tasks: &[Task]) -> Vec<&str> {
    tasks.iter().map(|t| t.title.as_str()).collect()
}

fn daily() -> Option<Recurrence> {
    Some(Recurrence {
        frequency: Frequency::Daily,
        interval: 1,
        by_weekday: None,
    })
}

fn code<T: std::fmt::Debug>(r: AppResult<T>) -> ErrorCode {
    r.unwrap_err().code
}

macro_rules! setup {
    ($conn:ident, $clock:ident, $repo:ident) => {
        let $conn: Connection = db::open_in_memory().unwrap();
        let $clock = clock();
        let $repo = SqliteTaskRepository::new(&$conn, &$clock);
    };
}

#[test]
fn create_sets_defaults_and_appends_in_order() {
    setup!(conn, c, repo);
    let a = mk(&repo, |t| t.title = "A".into());
    let b = mk(&repo, |t| t.title = "B".into());
    assert_eq!(
        (a.status, a.priority, a.version, a.checklist_total),
        (TaskStatus::Todo, Priority::Medium, 1, 0)
    );
    assert!(a.sort_key < b.sort_key);
    let all = list(&repo, &ctx(), &TaskFilter::default()).unwrap();
    assert_eq!(titles(&all), ["A", "B"]);
    // Có dòng nhật ký và chỉ mục tìm kiếm.
    let log: i64 = conn
        .query_row(
            "SELECT count(*) FROM change_log WHERE entity = 'task'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(log, 2);
    assert_eq!(
        search_app::search(&conn, "viec", None, None).unwrap().len(),
        0
    );
}

#[test]
fn create_validation() {
    setup!(conn, c, repo);
    let bad = |f: &dyn Fn(&mut TaskCreate)| {
        let mut input = TaskCreate {
            title: "x".into(),
            ..Default::default()
        };
        f(&mut input);
        create(&repo, &ctx(), &input)
    };
    assert_eq!(code(bad(&|t| t.title = "  ".into())), ErrorCode::Validation);
    assert_eq!(
        code(bad(&|t| t.title = "a".repeat(501))),
        ErrorCode::Validation
    );
    assert_eq!(
        code(bad(&|t| t.estimated_minutes = Some(0))),
        ErrorCode::Validation
    );
    assert_eq!(
        code(bad(&|t| {
            t.due_date = Some("2026-12-01".into());
            t.due_at = Some("2026-12-01T01:00:00Z".into());
        })),
        ErrorCode::Validation
    );
    assert_eq!(
        code(bad(&|t| {
            t.project_id = Some("p".into());
            t.area_id = Some("a".into());
        })),
        ErrorCode::Validation
    );
    assert_eq!(
        code(bad(&|t| {
            t.start_date = Some("2026-12-05".into());
            t.due_date = Some("2026-12-01".into());
        })),
        ErrorCode::Validation
    );
    assert_eq!(
        code(bad(&|t| t.recurrence = daily())),
        ErrorCode::Validation
    ); // thiếu hạn
    assert_eq!(
        code(bad(&|t| t.project_id = Some("khong-co".into()))),
        ErrorCode::Validation
    ); // FK
    assert_eq!(
        code(bad(&|t| t.tag_ids = Some(vec!["khong-co".into()]))),
        ErrorCode::Validation
    );
    drop(conn);
}

#[test]
fn done_and_reopen_set_completed_at_and_previous_status() {
    setup!(conn, c, repo);
    let t = mk(&repo, |t| t.status = Some(TaskStatus::Review));
    let done = set_status(&repo, &ctx(), &t.id, TaskStatus::Done).unwrap();
    assert_eq!(done.task.status, TaskStatus::Done);
    assert_eq!(
        done.task.completed_at.as_deref(),
        Some("2026-11-26T18:00:00.000Z")
    );
    assert!(done.next.is_none());
    let prev: String = conn
        .query_row(
            "SELECT previous_status FROM tasks WHERE id = ?1",
            [&t.id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(prev, "Review");
    let reopened = set_status(&repo, &ctx(), &t.id, TaskStatus::Review).unwrap();
    assert_eq!(reopened.task.status, TaskStatus::Review);
    assert!(reopened.task.completed_at.is_none());
    assert!(reopened.task.version > done.task.version);
    // Cùng trạng thái: không đổi version.
    let same = set_status(&repo, &ctx(), &t.id, TaskStatus::Review).unwrap();
    assert_eq!(same.task.version, reopened.task.version);
    assert_eq!(
        code(set_status(&repo, &ctx(), "x", TaskStatus::Done)),
        ErrorCode::NotFound
    );
}

#[test]
fn update_requires_matching_base_version() {
    setup!(conn, c, repo);
    let t = mk(&repo, |_| {});
    let patch = TaskPatch {
        title: Some("Mới".into()),
        ..Default::default()
    };
    let updated = update(&repo, &ctx(), &t.id, &patch, 1).unwrap();
    assert_eq!((updated.title.as_str(), updated.version), ("Mới", 2));
    assert_eq!(
        code(update(&repo, &ctx(), &t.id, &patch, 1)),
        ErrorCode::Conflict
    );
    assert_eq!(
        code(update(&repo, &ctx(), "x", &patch, 1)),
        ErrorCode::NotFound
    );
    // Chỉ mục tìm kiếm được cập nhật theo.
    assert_eq!(
        search_app::search(&conn, "moi", None, None).unwrap().len(),
        1
    );
}

#[test]
fn patch_is_three_state_and_due_fields_exclude_each_other() {
    setup!(conn, c, repo);
    let t = mk(&repo, |t| {
        t.due_date = Some("2026-12-01".into());
        t.estimated_minutes = Some(30);
        t.description = Some("mô tả".into());
    });
    // Thiếu = giữ nguyên.
    let u = update(
        &repo,
        &ctx(),
        &t.id,
        &TaskPatch {
            title: Some("a".into()),
            ..Default::default()
        },
        1,
    )
    .unwrap();
    assert_eq!(u.due_date.as_deref(), Some("2026-12-01"));
    assert_eq!(u.estimated_minutes, Some(30));
    // null = xoá.
    let patch = TaskPatch {
        due_date: Some(None),
        estimated_minutes: Some(None),
        ..Default::default()
    };
    let u = update(&repo, &ctx(), &t.id, &patch, 2).unwrap();
    assert_eq!((u.due_date, u.estimated_minutes), (None, None));
    // Đặt hạn theo giờ.
    let patch = TaskPatch {
        due_at: Some(Some("2026-12-01T09:00:00+07:00".into())),
        ..Default::default()
    };
    let u = update(&repo, &ctx(), &t.id, &patch, 3).unwrap();
    assert_eq!(u.due_at.as_deref(), Some("2026-12-01T02:00:00.000Z"));
    // Đặt hạn theo ngày thì hạn theo giờ tự bỏ.
    let patch = TaskPatch {
        due_date: Some(Some("2026-12-02".into())),
        ..Default::default()
    };
    let u = update(&repo, &ctx(), &t.id, &patch, 4).unwrap();
    assert_eq!(
        (u.due_date.as_deref(), u.due_at.as_deref()),
        (Some("2026-12-02"), None)
    );
    // Cả hai cùng lúc là lỗi.
    let both = TaskPatch {
        due_date: Some(Some("2026-12-02".into())),
        due_at: Some(Some("2026-12-02T01:00:00Z".into())),
        ..Default::default()
    };
    assert_eq!(
        code(update(&repo, &ctx(), &t.id, &both, 5)),
        ErrorCode::Validation
    );
    // Project/Area loại trừ nhau; project không tồn tại → VALIDATION.
    let bad_project = TaskPatch {
        project_id: Some(Some("khong-co".into())),
        ..Default::default()
    };
    assert_eq!(
        code(update(&repo, &ctx(), &t.id, &bad_project, 5)),
        ErrorCode::Validation
    );
    assert_eq!(
        update(
            &repo,
            &ctx(),
            &t.id,
            &TaskPatch {
                description: Some("x".into()),
                ..Default::default()
            },
            5
        )
        .unwrap()
        .version,
        6
    );
    drop(conn);
}

#[test]
fn project_and_area_switch_clears_the_other() {
    setup!(conn, c, repo);
    let ws = crate::ids::DEFAULT_WORKSPACE_ID;
    conn.execute_batch(&format!(
        "INSERT INTO areas (id, workspace_id, name, sort_key, created_at, updated_at) VALUES ('a1','{ws}','A','V','t','t');
         INSERT INTO projects (id, workspace_id, name, sort_key, created_at, updated_at) VALUES ('p1','{ws}','P','V','t','t');"
    ))
    .unwrap();
    let t = mk(&repo, |t| t.area_id = Some("a1".into()));
    let u = update(
        &repo,
        &ctx(),
        &t.id,
        &TaskPatch {
            project_id: Some(Some("p1".into())),
            ..Default::default()
        },
        1,
    )
    .unwrap();
    assert_eq!(
        (u.project_id.as_deref(), u.area_id.as_deref()),
        (Some("p1"), None)
    );
    let u = update(
        &repo,
        &ctx(),
        &t.id,
        &TaskPatch {
            project_id: Some(None),
            area_id: Some(Some("a1".into())),
            ..Default::default()
        },
        2,
    )
    .unwrap();
    assert_eq!((u.project_id, u.area_id.as_deref()), (None, Some("a1")));
}

// ---------- Task lặp ----------

#[test]
fn recurring_done_spawns_next_once() {
    setup!(conn, c, repo);
    let tag = tags_app::create(
        &SqliteTagRepository::new(&conn, &c),
        &TagCreate {
            name: "nhà".into(),
            color: None,
        },
    )
    .unwrap();
    let t = mk(&repo, |t| {
        t.title = "Tưới cây".into();
        t.due_date = Some("2026-11-27".into());
        t.recurrence = daily();
        t.priority = Some(Priority::High);
        t.tag_ids = Some(vec![tag.id.clone()]);
        t.description = Some("mô tả".into());
    });
    assert_eq!(t.recurrence, daily());
    checklist_add(&repo, &t.id, "Lấy nước").unwrap();
    let done_item = checklist_add(&repo, &t.id, "Tưới").unwrap();
    checklist_toggle(&repo, &done_item.id).unwrap();

    let first = set_status(&repo, &ctx(), &t.id, TaskStatus::Done).unwrap();
    let next = first.next.expect("phải sinh lần tiếp theo");
    assert_eq!(next.due_date.as_deref(), Some("2026-11-28"));
    assert_eq!(next.status, TaskStatus::Todo);
    assert_eq!(
        (next.title.as_str(), next.priority),
        ("Tưới cây", Priority::High)
    );
    assert_eq!(next.tag_ids, vec![tag.id.clone()]);
    assert_eq!(next.description, "mô tả");
    assert_eq!(next.recurrence, daily());
    assert_ne!(next.id, t.id);
    // Checklist chép sang, chưa đánh dấu.
    let items = get_detail(&repo, &next.id).unwrap().checklist;
    assert_eq!(
        items.iter().map(|i| i.content.as_str()).collect::<Vec<_>>(),
        ["Lấy nước", "Tưới"]
    );
    assert!(items.iter().all(|i| !i.is_done));

    // Mở lại rồi Done lần nữa: lần 28/11 đã tồn tại nên không sinh trùng.
    set_status(&repo, &ctx(), &t.id, TaskStatus::Todo).unwrap();
    let again = set_status(&repo, &ctx(), &t.id, TaskStatus::Done).unwrap();
    assert!(again.next.is_none());
    let n: i64 = conn
        .query_row(
            "SELECT count(*) FROM tasks WHERE recurrence_series_id IS NOT NULL",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(n, 2);
    // Gọi thẳng hàm sinh lần nữa cũng không trùng.
    let done = repo.get(&t.id).unwrap().unwrap();
    assert!(spawn_next(&repo, &ctx(), &done).unwrap().is_none());
}

#[test]
fn recurring_with_time_keeps_local_time() {
    setup!(conn, c, repo);
    // 09:00 giờ VN ngày 27/11 = 02:00 UTC.
    let t = mk(&repo, |t| {
        t.due_at = Some("2026-11-27T02:00:00Z".into());
        t.recurrence = Some(Recurrence {
            frequency: Frequency::Weekly,
            interval: 1,
            by_weekday: None,
        });
    });
    let next = set_status(&repo, &ctx(), &t.id, TaskStatus::Done)
        .unwrap()
        .next
        .unwrap();
    assert_eq!(next.due_at.as_deref(), Some("2026-12-04T02:00:00.000Z"));
    assert_eq!(next.due_date, None);
    drop(conn);
}

#[test]
fn recurring_monthly_chain_from_31st() {
    setup!(conn, c, repo);
    let mut task = mk(&repo, |t| {
        t.due_date = Some("2027-01-31".into());
        t.recurrence = Some(Recurrence {
            frequency: Frequency::Monthly,
            interval: 1,
            by_weekday: None,
        });
    });
    let mut dates = vec![task.due_date.clone().unwrap()];
    for _ in 0..3 {
        task = set_status(&repo, &ctx(), &task.id, TaskStatus::Done)
            .unwrap()
            .next
            .unwrap();
        dates.push(task.due_date.clone().unwrap());
    }
    assert_eq!(
        dates,
        ["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]
    );
    drop(conn);
}

#[test]
fn recurring_by_weekday_follows_the_list() {
    setup!(conn, c, repo);
    // 2026-11-27 là thứ Sáu.
    let t = mk(&repo, |t| {
        t.due_date = Some("2026-11-27".into());
        t.recurrence = Some(Recurrence {
            frequency: Frequency::Weekly,
            interval: 1,
            by_weekday: Some(vec![Weekday::Mo, Weekday::Fr]),
        });
    });
    let n1 = set_status(&repo, &ctx(), &t.id, TaskStatus::Done)
        .unwrap()
        .next
        .unwrap();
    assert_eq!(n1.due_date.as_deref(), Some("2026-11-30")); // thứ Hai
    let n2 = set_status(&repo, &ctx(), &n1.id, TaskStatus::Done)
        .unwrap()
        .next
        .unwrap();
    assert_eq!(n2.due_date.as_deref(), Some("2026-12-04")); // thứ Sáu
    assert_eq!(
        n2.recurrence.unwrap().by_weekday,
        Some(vec![Weekday::Mo, Weekday::Fr])
    );
    drop(conn);
}

#[test]
fn turning_recurrence_off_and_on() {
    setup!(conn, c, repo);
    let t = mk(&repo, |t| {
        t.due_date = Some("2026-11-27".into());
        t.recurrence = daily();
    });
    // Tắt: Done không sinh lần tiếp.
    let off = update(
        &repo,
        &ctx(),
        &t.id,
        &TaskPatch {
            recurrence: Some(None),
            ..Default::default()
        },
        1,
    )
    .unwrap();
    assert!(off.recurrence.is_none());
    let done = set_status(&repo, &ctx(), &t.id, TaskStatus::Done).unwrap();
    assert!(done.next.is_none());
    // Bật lại (cùng chuỗi): sinh tiếp bình thường.
    set_status(&repo, &ctx(), &t.id, TaskStatus::Todo).unwrap();
    let v = repo.get(&t.id).unwrap().unwrap().version;
    let on = update(
        &repo,
        &ctx(),
        &t.id,
        &TaskPatch {
            recurrence: Some(daily()),
            ..Default::default()
        },
        v,
    )
    .unwrap();
    assert!(on.recurrence.is_some());
    let done = set_status(&repo, &ctx(), &t.id, TaskStatus::Done).unwrap();
    assert!(done.next.is_some());
    // Task thường được bật lặp: cần hạn.
    let plain = mk(&repo, |_| {});
    let patch = TaskPatch {
        recurrence: Some(daily()),
        ..Default::default()
    };
    assert_eq!(
        code(update(&repo, &ctx(), &plain.id, &patch, 1)),
        ErrorCode::Validation
    );
    let patch = TaskPatch {
        recurrence: Some(daily()),
        due_date: Some(Some("2026-12-01".into())),
        ..Default::default()
    };
    assert!(update(&repo, &ctx(), &plain.id, &patch, 1)
        .unwrap()
        .recurrence
        .is_some());
    drop(conn);
}

#[test]
fn editing_a_recurring_task_updates_future_occurrences() {
    setup!(conn, c, repo);
    let t = mk(&repo, |t| {
        t.due_date = Some("2026-11-27".into());
        t.recurrence = daily();
    });
    update(
        &repo,
        &ctx(),
        &t.id,
        &TaskPatch {
            title: Some("Tên mới".into()),
            ..Default::default()
        },
        1,
    )
    .unwrap();
    let next = set_status(&repo, &ctx(), &t.id, TaskStatus::Done)
        .unwrap()
        .next
        .unwrap();
    assert_eq!(next.title, "Tên mới");
    drop(conn);
}

// ---------- Lọc theo hạn ----------

#[test]
fn due_filters_use_the_settings_timezone() {
    setup!(conn, c, repo);
    let mk_due = |title: &str, date: Option<&str>, at: Option<&str>| {
        mk(&repo, |t| {
            t.title = title.into();
            t.due_date = date.map(Into::into);
            t.due_at = at.map(Into::into);
        })
    };
    mk_due("hôm nay (ngày)", Some("2026-11-27"), None);
    mk_due("hôm nay (giờ)", None, Some("2026-11-26T20:00:00Z")); // 03:00 27/11 VN
    mk_due("quá hạn (ngày)", Some("2026-11-26"), None);
    mk_due("quá hạn (giờ)", None, Some("2026-11-26T10:00:00Z")); // 17:00 26/11 VN
    mk_due("ngày mai", Some("2026-11-28"), None);
    mk_due("ngày mai (giờ)", None, Some("2026-11-28T16:59:00Z")); // 23:59 28/11 VN
    mk_due("+7 ngày", Some("2026-12-04"), None);
    mk_due("+8 ngày", Some("2026-12-05"), None);
    mk_due("không hạn", None, None);
    let done = mk_due("quá hạn nhưng đã xong", Some("2026-11-20"), None);
    set_status(&repo, &ctx(), &done.id, TaskStatus::Done).unwrap();

    let f = |due: DueFilter, ctx: &TimeCtx| {
        let filter = TaskFilter {
            due: Some(due),
            ..Default::default()
        };
        let mut names: Vec<String> = list(&repo, ctx, &filter)
            .unwrap()
            .into_iter()
            .map(|t| t.title)
            .collect();
        names.sort();
        names
    };
    assert_eq!(
        f(DueFilter::Today, &ctx()),
        ["hôm nay (giờ)", "hôm nay (ngày)"]
    );
    assert_eq!(
        f(DueFilter::Overdue, &ctx()),
        ["quá hạn (giờ)", "quá hạn (ngày)"]
    );
    assert_eq!(
        f(DueFilter::Next7, &ctx()),
        ["+7 ngày", "ngày mai", "ngày mai (giờ)"]
    );
    assert_eq!(f(DueFilter::None, &ctx()), ["không hạn"]);

    // Cùng một thời điểm nhưng ở Los Angeles (10:00 ngày 26/11): "hôm nay" là 26/11 nên các
    // mục "quá hạn" ở Việt Nam (26/11) lại là "hôm nay", còn mục 27/11 chưa tới.
    let la = TimeCtx::new("America/Los_Angeles", now());
    assert_eq!(
        f(DueFilter::Today, &la),
        ["hôm nay (giờ)", "quá hạn (giờ)", "quá hạn (ngày)"]
    );
    assert!(!f(DueFilter::Overdue, &la).contains(&"quá hạn nhưng đã xong".to_string()));
    drop(conn);
}

#[test]
fn filters_by_status_priority_tag_archived_and_counts() {
    setup!(conn, c, repo);
    let tag = tags_app::create(
        &SqliteTagRepository::new(&conn, &c),
        &TagCreate {
            name: "t".into(),
            color: None,
        },
    )
    .unwrap();
    let a = mk(&repo, |t| {
        t.title = "a".into();
        t.priority = Some(Priority::Urgent);
    });
    let b = mk(&repo, |t| {
        t.title = "b".into();
        t.status = Some(TaskStatus::InProgress);
    });
    let _ = mk(&repo, |t| t.title = "c".into());
    let tagged = set_tags(&repo, &ctx(), &a.id, &[tag.id.clone(), tag.id.clone()]).unwrap();
    assert_eq!(tagged.tag_ids, vec![tag.id.clone()]);
    assert_eq!(
        code(set_tags(&repo, &ctx(), &a.id, &["x".into()])),
        ErrorCode::Validation
    );
    checklist_add(&repo, &b.id, "1").unwrap();
    let i2 = checklist_add(&repo, &b.id, "2").unwrap();
    checklist_toggle(&repo, &i2.id).unwrap();

    let run = |f: TaskFilter| titles(&list(&repo, &ctx(), &f).unwrap()).join("");
    assert_eq!(
        run(TaskFilter {
            status: Some(vec![TaskStatus::InProgress]),
            ..Default::default()
        }),
        "b"
    );
    assert_eq!(
        run(TaskFilter {
            priority: Some(vec![Priority::Urgent]),
            ..Default::default()
        }),
        "Việc".repeat(0) + "a"
    );
    assert_eq!(
        run(TaskFilter {
            tag_id: Some(tag.id.clone()),
            ..Default::default()
        }),
        "a"
    );
    let listed = list(
        &repo,
        &ctx(),
        &TaskFilter {
            status: Some(vec![TaskStatus::InProgress]),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(
        (listed[0].checklist_done, listed[0].checklist_total),
        (1, 2)
    );

    archive(&repo, &c_id(&repo, "c")).unwrap();
    assert_eq!(run(TaskFilter::default()), "ab");
    assert_eq!(
        run(TaskFilter {
            archived: Some(true),
            ..Default::default()
        }),
        "c"
    );
    unarchive(&repo, &c_id(&repo, "c")).ok();
    drop(conn);
}

fn c_id(repo: &dyn TaskRepository, title: &str) -> String {
    let all = repo
        .list(
            &TaskFilter {
                archived: None,
                ..Default::default()
            },
            &ctx(),
        )
        .unwrap();
    let archived = repo
        .list(
            &TaskFilter {
                archived: Some(true),
                ..Default::default()
            },
            &ctx(),
        )
        .unwrap();
    all.into_iter()
        .chain(archived)
        .find(|t| t.title == title)
        .unwrap()
        .id
}

#[test]
fn sorting_modes() {
    setup!(conn, c, repo);
    let mk_t = |title: &str, p: Priority, date: Option<&str>, at: Option<&str>| {
        mk(&repo, |t| {
            t.title = title.into();
            t.priority = Some(p);
            t.due_date = date.map(Into::into);
            t.due_at = at.map(Into::into);
        })
    };
    mk_t("k-low-none", Priority::Low, None, None);
    mk_t("a-high-dec3", Priority::High, Some("2026-12-03"), None);
    mk_t(
        "b-urgent-dec3-timed",
        Priority::Urgent,
        None,
        Some("2026-12-03T02:00:00Z"),
    );
    mk_t("c-med-dec1", Priority::Medium, Some("2026-12-01"), None);
    let sorted = |sort: TaskSort| {
        titles(
            &list(
                &repo,
                &ctx(),
                &TaskFilter {
                    sort: Some(sort),
                    ..Default::default()
                },
            )
            .unwrap(),
        )
        .into_iter()
        .map(str::to_string)
        .collect::<Vec<_>>()
    };
    assert_eq!(
        sorted(TaskSort::Manual),
        [
            "k-low-none",
            "a-high-dec3",
            "b-urgent-dec3-timed",
            "c-med-dec1"
        ]
    );
    // Hạn sớm trước, không hạn cuối; cùng ngày thì Task có giờ đứng trước.
    assert_eq!(
        sorted(TaskSort::DueDate),
        [
            "c-med-dec1",
            "b-urgent-dec3-timed",
            "a-high-dec3",
            "k-low-none"
        ]
    );
    assert_eq!(
        sorted(TaskSort::Priority),
        [
            "b-urgent-dec3-timed",
            "a-high-dec3",
            "c-med-dec1",
            "k-low-none"
        ]
    );
    drop(conn);
}

#[test]
fn created_sort_is_newest_first() {
    let conn = db::open_in_memory().unwrap();
    for (i, hour) in [10, 12, 11].into_iter().enumerate() {
        let c = FixedClock(Utc.with_ymd_and_hms(2026, 11, 26, hour, 0, 0).unwrap());
        let repo = SqliteTaskRepository::new(&conn, &c);
        mk(&repo, |t| t.title = format!("t{i}"));
    }
    let c = clock();
    let repo = SqliteTaskRepository::new(&conn, &c);
    let got = list(
        &repo,
        &ctx(),
        &TaskFilter {
            sort: Some(TaskSort::Created),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(titles(&got), ["t1", "t2", "t0"]);
}

// ---------- Kéo thả ----------

#[test]
fn move_orders_within_and_across_columns() {
    setup!(conn, c, repo);
    let t: Vec<Task> = ["A", "B", "C", "D"]
        .iter()
        .map(|n| mk(&repo, |t| t.title = (*n).into()))
        .collect();
    let order = |status: TaskStatus| {
        titles(
            &list(
                &repo,
                &ctx(),
                &TaskFilter {
                    status: Some(vec![status]),
                    ..Default::default()
                },
            )
            .unwrap(),
        )
        .join("")
    };
    assert_eq!(order(TaskStatus::Todo), "ABCD");
    // D lên giữa A và B.
    move_task(
        &repo,
        &ctx(),
        &t[3].id,
        TaskStatus::Todo,
        Some(&t[0].id),
        Some(&t[1].id),
    )
    .unwrap();
    assert_eq!(order(TaskStatus::Todo), "ADBC");
    // Một phía: ngay dưới C... (xuống cuối) và ngay trên A (lên đầu).
    move_task(
        &repo,
        &ctx(),
        &t[0].id,
        TaskStatus::Todo,
        Some(&t[2].id),
        None,
    )
    .unwrap();
    assert_eq!(order(TaskStatus::Todo), "DBCA");
    move_task(
        &repo,
        &ctx(),
        &t[2].id,
        TaskStatus::Todo,
        None,
        Some(&t[3].id),
    )
    .unwrap();
    assert_eq!(order(TaskStatus::Todo), "CDBA");
    // Sang cột khác: thiếu cả hai thì xếp cuối cột đích.
    move_task(&repo, &ctx(), &t[0].id, TaskStatus::InProgress, None, None).unwrap();
    move_task(&repo, &ctx(), &t[1].id, TaskStatus::InProgress, None, None).unwrap();
    assert_eq!(order(TaskStatus::InProgress), "AB");
    assert_eq!(order(TaskStatus::Todo), "CD");
    // Chèn vào giữa cột đích.
    move_task(
        &repo,
        &ctx(),
        &t[3].id,
        TaskStatus::InProgress,
        Some(&t[0].id),
        Some(&t[1].id),
    )
    .unwrap();
    assert_eq!(order(TaskStatus::InProgress), "ADB");
    // Lỗi.
    assert_eq!(
        code(move_task(
            &repo,
            &ctx(),
            &t[0].id,
            TaskStatus::Todo,
            Some(&t[0].id),
            None
        )),
        ErrorCode::Validation
    );
    assert_eq!(
        code(move_task(
            &repo,
            &ctx(),
            &t[0].id,
            TaskStatus::Todo,
            Some("x"),
            None
        )),
        ErrorCode::NotFound
    );
    drop(conn);
}

#[test]
fn move_into_done_applies_done_rules_and_spawns_next() {
    setup!(conn, c, repo);
    let t = mk(&repo, |t| {
        t.due_date = Some("2026-11-27".into());
        t.recurrence = daily();
    });
    let r = move_task(&repo, &ctx(), &t.id, TaskStatus::Done, None, None).unwrap();
    assert_eq!(r.task.status, TaskStatus::Done);
    assert!(r.task.completed_at.is_some());
    assert!(r.next.is_some());
    drop(conn);
}

#[test]
fn board_columns_are_per_project() {
    setup!(conn, c, repo);
    let ws = crate::ids::DEFAULT_WORKSPACE_ID;
    conn.execute(
        &format!("INSERT INTO projects (id, workspace_id, name, sort_key, created_at, updated_at) VALUES ('p1','{ws}','P','V','t','t')"),
        [],
    )
    .unwrap();
    let a = mk(&repo, |t| t.title = "ngoài".into());
    let p = mk(&repo, |t| {
        t.title = "trong".into();
        t.project_id = Some("p1".into());
    });
    // Cùng cột Todo nhưng khác Project nên khoá bắt đầu lại từ đầu.
    assert_eq!(a.sort_key, p.sort_key);
    let filter = TaskFilter {
        project_id: Some("p1".into()),
        ..Default::default()
    };
    assert_eq!(titles(&list(&repo, &ctx(), &filter).unwrap()), ["trong"]);
    drop(conn);
}

// ---------- Xoá / lưu trữ / checklist ----------

#[test]
fn delete_hides_task_and_search_entry() {
    setup!(conn, c, repo);
    let t = mk(&repo, |t| t.title = "Nhắc nhở".into());
    assert_eq!(
        search_app::search(&conn, "nhac nho", None, None)
            .unwrap()
            .len(),
        1
    );
    delete(&repo, &t.id).unwrap();
    assert!(list(&repo, &ctx(), &TaskFilter::default())
        .unwrap()
        .is_empty());
    assert_eq!(code(get_detail(&repo, &t.id)), ErrorCode::NotFound);
    assert!(search_app::search(&conn, "nhac nho", None, None)
        .unwrap()
        .is_empty());
    assert_eq!(code(delete(&repo, &t.id)), ErrorCode::NotFound);
}

#[test]
fn checklist_crud_and_reorder() {
    setup!(conn, c, repo);
    let t = mk(&repo, |_| {});
    let other = mk(&repo, |_| {});
    let a = checklist_add(&repo, &t.id, " một ").unwrap();
    let b = checklist_add(&repo, &t.id, "hai").unwrap();
    let cc = checklist_add(&repo, &t.id, "ba").unwrap();
    let foreign = checklist_add(&repo, &other.id, "lạ").unwrap();
    assert_eq!(a.content, "một");
    let names = |repo: &dyn TaskRepository| {
        get_detail(repo, &t.id)
            .unwrap()
            .checklist
            .into_iter()
            .map(|i| i.content)
            .collect::<Vec<_>>()
            .join(",")
    };
    assert_eq!(names(&repo), "một,hai,ba");
    checklist_reorder(&repo, &cc.id, Some(&a.id), Some(&b.id)).unwrap();
    assert_eq!(names(&repo), "một,ba,hai");
    checklist_reorder(&repo, &a.id, Some(&b.id), None).unwrap();
    assert_eq!(names(&repo), "ba,hai,một");
    checklist_reorder(&repo, &b.id, None, Some(&cc.id)).unwrap();
    assert_eq!(names(&repo), "hai,ba,một");
    assert_eq!(
        code(checklist_reorder(&repo, &a.id, None, None)),
        ErrorCode::Validation
    );
    assert_eq!(
        code(checklist_reorder(&repo, &a.id, Some(&foreign.id), None)),
        ErrorCode::Validation
    );
    assert!(checklist_toggle(&repo, &a.id).unwrap().is_done);
    assert!(!checklist_toggle(&repo, &a.id).unwrap().is_done);
    assert_eq!(
        checklist_update(&repo, &a.id, "một!").unwrap().content,
        "một!"
    );
    assert_eq!(
        code(checklist_update(&repo, &a.id, "  ")),
        ErrorCode::Validation
    );
    assert_eq!(
        code(checklist_add(&repo, &t.id, &"a".repeat(501))),
        ErrorCode::Validation
    );
    assert_eq!(code(checklist_add(&repo, "x", "a")), ErrorCode::NotFound);
    checklist_delete(&repo, &b.id).unwrap();
    assert_eq!(names(&repo), "ba,một!");
    assert_eq!(code(checklist_delete(&repo, &b.id)), ErrorCode::NotFound);
    drop(conn);
}
