use chrono::{TimeZone, Utc};
use rusqlite::Connection;

use super::application::*;
use super::domain::*;
use crate::clock::FixedClock;
use crate::db;
use crate::error::ErrorCode;
use crate::modules::tasks::application as tasks;
use crate::modules::tasks::domain::{Task, TaskCreate, TaskPatch};
use crate::modules::tasks::infrastructure::{self as tasks_infra, SqliteTaskRepository};
use crate::modules::tasks::timectx::TimeCtx;
use crate::reminders::domain::ReminderSet;
use crate::reminders::{application as reminders, repository as reminders_repo};

/// 2026-11-26 18:00 UTC = 01:00 ngày 27/11 ở Việt Nam.
fn clock() -> FixedClock {
    FixedClock(Utc.with_ymd_and_hms(2026, 11, 26, 18, 0, 0).unwrap())
}

fn ctx(c: &FixedClock) -> TimeCtx {
    TimeCtx::new("Asia/Ho_Chi_Minh", c.0)
}

fn setup() -> (Connection, FixedClock) {
    (db::open_in_memory().unwrap(), clock())
}

fn mk_task(conn: &Connection, c: &FixedClock, f: impl FnOnce(&mut TaskCreate)) -> Task {
    let mut input = TaskCreate {
        title: "Việc".into(),
        ..Default::default()
    };
    f(&mut input);
    tasks::create(&SqliteTaskRepository::new(conn, c), &ctx(c), &input).unwrap()
}

fn timed(title: &str, start: &str, end: &str) -> EventCreate {
    EventCreate {
        title: title.into(),
        start_at: Some(start.into()),
        end_at: Some(end.into()),
        ..Default::default()
    }
}

fn all_day(title: &str, start: &str, end: &str) -> EventCreate {
    EventCreate {
        title: title.into(),
        is_all_day: true,
        start_date: Some(start.into()),
        end_date: Some(end.into()),
        ..Default::default()
    }
}

fn labels(items: &[CalendarItem]) -> Vec<String> {
    items
        .iter()
        .map(|i| match i {
            CalendarItem::Event { event } => format!("E:{}", event.title),
            CalendarItem::Deadline { task } => format!("D:{}", task.title),
        })
        .collect()
}

#[test]
fn default_calendar_is_seeded_and_used() {
    let (conn, c) = setup();
    let cals = calendar_list(&conn).unwrap();
    assert_eq!(cals.len(), 1);
    assert!(cals[0].is_default);
    let e = event_create(
        &conn,
        &c,
        &timed("A", "2026-11-27T02:00:00Z", "2026-11-27T03:00:00Z"),
    )
    .unwrap();
    assert_eq!(e.calendar_id, cals[0].id);
    assert_eq!(e.start_at.as_deref(), Some("2026-11-27T02:00:00.000Z"));
}

#[test]
fn event_validation() {
    let (conn, c) = setup();
    let code = |input: EventCreate| event_create(&conn, &c, &input).unwrap_err().code;
    assert_eq!(
        code(timed("  ", "2026-11-27T02:00:00Z", "2026-11-27T03:00:00Z")),
        ErrorCode::Validation
    );
    assert_eq!(
        code(timed("A", "2026-11-27T03:00:00Z", "2026-11-27T03:00:00Z")),
        ErrorCode::Validation
    );
    assert_eq!(
        code(timed("A", "2026-11-01T00:00:00Z", "2026-11-16T00:01:00Z")),
        ErrorCode::Validation
    );
    assert_eq!(
        code(all_day("A", "2026-11-27", "2026-11-26")),
        ErrorCode::Validation
    );
    assert_eq!(
        code(all_day("A", "2026-01-01", "2027-01-02")),
        ErrorCode::Validation
    );
    let mut with_task = timed("A", "2026-11-27T02:00:00Z", "2026-11-27T03:00:00Z");
    with_task.task_id = Some("khong-co".into());
    assert_eq!(code(with_task), ErrorCode::Validation);
    // Đúng 14 ngày và đúng 366 ngày thì được.
    event_create(
        &conn,
        &c,
        &timed("A", "2026-11-01T00:00:00Z", "2026-11-15T00:00:00Z"),
    )
    .unwrap();
    event_create(&conn, &c, &all_day("B", "2026-01-01", "2026-12-31")).unwrap();
}

#[test]
fn range_returns_events_and_deadlines_in_settings_timezone() {
    let (conn, c) = setup();
    let ctx = ctx(&c);
    // 2026-11-27 giờ VN = [26/11 17:00Z, 27/11 17:00Z).
    event_create(
        &conn,
        &c,
        &timed("trong ngày", "2026-11-27T02:00:00Z", "2026-11-27T03:00:00Z"),
    )
    .unwrap();
    // Kết thúc đúng 00:00 VN ngày 27 → không chồng lên ngày 27.
    event_create(
        &conn,
        &c,
        &timed("trước", "2026-11-26T15:00:00Z", "2026-11-26T17:00:00Z"),
    )
    .unwrap();
    // Bắt đầu 17:00Z ngày 27 = 00:00 VN ngày 28 → ngoài khoảng.
    event_create(
        &conn,
        &c,
        &timed("sau", "2026-11-27T17:00:00Z", "2026-11-27T18:00:00Z"),
    )
    .unwrap();
    // Event cả ngày 25–27 (ngày cuối inclusive) chồng lên ngày 27; 20–26 thì không.
    event_create(&conn, &c, &all_day("cả ngày", "2026-11-25", "2026-11-27")).unwrap();
    event_create(&conn, &c, &all_day("đã qua", "2026-11-20", "2026-11-26")).unwrap();
    // Deadline theo ngày và theo giờ (17:30Z 26/11 = 00:30 VN 27/11).
    mk_task(&conn, &c, |t| {
        t.title = "hạn ngày".into();
        t.due_date = Some("2026-11-27".into());
    });
    mk_task(&conn, &c, |t| {
        t.title = "hạn giờ".into();
        t.due_at = Some("2026-11-26T17:30:00Z".into());
    });
    mk_task(&conn, &c, |t| {
        t.title = "ngày khác".into();
        t.due_date = Some("2026-11-28".into());
    });
    let done = mk_task(&conn, &c, |t| {
        t.title = "đã xong".into();
        t.due_date = Some("2026-11-27".into());
    });
    tasks::set_status(
        &SqliteTaskRepository::new(&conn, &c),
        &ctx,
        &done.id,
        crate::modules::tasks::domain::TaskStatus::Done,
    )
    .unwrap();
    let removed = mk_task(&conn, &c, |t| {
        t.title = "đã xoá".into();
        t.due_date = Some("2026-11-27".into());
    });
    tasks::delete(&SqliteTaskRepository::new(&conn, &c), &removed.id).unwrap();
    let archived = mk_task(&conn, &c, |t| {
        t.title = "lưu trữ".into();
        t.due_date = Some("2026-11-27".into());
    });
    tasks::archive(&SqliteTaskRepository::new(&conn, &c), &archived.id).unwrap();

    let items = range(&conn, &c, &ctx, "2026-11-27", "2026-11-27").unwrap();
    let got = labels(&items);
    // Đã xoá / đã lưu trữ / hạn ngày khác / Event ngoài khoảng đều không có mặt; Task Done thì có.
    let mut sorted = got.clone();
    sorted.sort();
    assert_eq!(
        sorted,
        [
            "D:hạn giờ",
            "D:hạn ngày",
            "D:đã xong",
            "E:cả ngày",
            "E:trong ngày"
        ]
    );
    // Theo thời điểm bắt đầu: Event cả ngày (bắt đầu 25/11) đầu tiên, Event 09:00 VN cuối cùng.
    assert_eq!(got.first().unwrap(), "E:cả ngày");
    assert_eq!(got.last().unwrap(), "E:trong ngày");
}

#[test]
fn range_is_sorted_by_start_with_all_day_first() {
    let (conn, c) = setup();
    event_create(
        &conn,
        &c,
        &timed("muộn", "2026-11-27T08:00:00Z", "2026-11-27T09:00:00Z"),
    )
    .unwrap();
    event_create(
        &conn,
        &c,
        &timed("sớm", "2026-11-27T01:00:00Z", "2026-11-27T02:00:00Z"),
    )
    .unwrap();
    event_create(&conn, &c, &all_day("cả ngày", "2026-11-27", "2026-11-27")).unwrap();
    let items = range(&conn, &c, &ctx(&c), "2026-11-27", "2026-11-27").unwrap();
    assert_eq!(labels(&items), ["E:cả ngày", "E:sớm", "E:muộn"]);
    let today = today_schedule(&conn, &c, &ctx(&c)).unwrap();
    assert_eq!(today.len(), 3);
    assert!(range(&conn, &c, &ctx(&c), "2026-11-28", "2026-11-27").is_err());
}

#[test]
fn schedule_block_creates_event_with_task_id() {
    let (conn, c) = setup();
    let t = mk_task(&conn, &c, |t| t.title = "Viết báo cáo".into());
    let e = schedule_block(
        &conn,
        &c,
        &t.id,
        "2026-11-27T02:00:00Z",
        "2026-11-27T04:00:00Z",
        None,
    )
    .unwrap();
    assert_eq!(e.task_id.as_deref(), Some(t.id.as_str()));
    assert_eq!(e.title, "Viết báo cáo");
    assert!(!e.is_all_day);
    assert_eq!(
        schedule_block(
            &conn,
            &c,
            "khong-co",
            "2026-11-27T02:00:00Z",
            "2026-11-27T04:00:00Z",
            None
        )
        .unwrap_err()
        .code,
        ErrorCode::NotFound
    );
}

#[test]
fn deleting_and_restoring_a_task_takes_its_time_block_and_pending_reminders_along() {
    let (conn, c) = setup();
    let ctx = ctx(&c);
    let t = mk_task(&conn, &c, |t| {
        t.due_at = Some("2026-11-27T02:00:00Z".into())
    });
    let block = schedule_block(
        &conn,
        &c,
        &t.id,
        "2026-11-27T05:00:00Z",
        "2026-11-27T06:00:00Z",
        None,
    )
    .unwrap();
    let r_task = reminders::set(
        &conn,
        &c,
        &ctx,
        &ReminderSet {
            task_id: Some(t.id.clone()),
            offset_minutes: Some(30),
            ..Default::default()
        },
    )
    .unwrap();
    let r_event = reminders::set(
        &conn,
        &c,
        &ctx,
        &ReminderSet {
            event_id: Some(block.id.clone()),
            offset_minutes: Some(10),
            ..Default::default()
        },
    )
    .unwrap();
    // Reminder đã gửi thì không bị xoá mềm.
    let sent = reminders::set(
        &conn,
        &c,
        &ctx,
        &ReminderSet {
            task_id: Some(t.id.clone()),
            trigger_at: Some("2026-11-26T00:00:00Z".into()),
            ..Default::default()
        },
    )
    .unwrap();
    reminders_repo::set_status(
        &conn,
        &c,
        &sent.id,
        crate::reminders::domain::ReminderStatus::Pending,
        crate::reminders::domain::ReminderStatus::Sent,
    )
    .unwrap();

    tasks::delete(&SqliteTaskRepository::new(&conn, &c), &t.id).unwrap();
    assert!(super::infrastructure::get(&conn, &block.id)
        .unwrap()
        .is_none());
    assert!(reminders_repo::get(&conn, &r_task.id).unwrap().is_none());
    assert!(reminders_repo::get(&conn, &r_event.id).unwrap().is_none());
    assert!(reminders_repo::get(&conn, &sent.id).unwrap().is_some());
    assert!(range(&conn, &c, &ctx, "2026-11-27", "2026-11-27")
        .unwrap()
        .is_empty());

    assert!(tasks_infra::restore(&conn, &t.id, &c).unwrap());
    assert!(super::infrastructure::get(&conn, &block.id)
        .unwrap()
        .is_some());
    assert!(reminders_repo::get(&conn, &r_task.id).unwrap().is_some());
    assert!(reminders_repo::get(&conn, &r_event.id).unwrap().is_some());
    assert_eq!(
        range(&conn, &c, &ctx, "2026-11-27", "2026-11-27")
            .unwrap()
            .len(),
        2
    );
}

#[test]
fn only_events_deleted_with_the_task_come_back_on_restore() {
    let (conn, c) = setup();
    let t = mk_task(&conn, &c, |_| {});
    let early = schedule_block(
        &conn,
        &c,
        &t.id,
        "2026-11-27T05:00:00Z",
        "2026-11-27T06:00:00Z",
        None,
    )
    .unwrap();
    event_delete(&conn, &c, &early.id).unwrap();
    // Event đã xoá trước khi xoá Task: mốc `deleted_at` khác, không quay lại.
    let later = FixedClock(Utc.with_ymd_and_hms(2026, 11, 26, 19, 0, 0).unwrap());
    tasks::delete(&SqliteTaskRepository::new(&conn, &later), &t.id).unwrap();
    assert!(tasks_infra::restore(&conn, &t.id, &later).unwrap());
    assert!(super::infrastructure::get(&conn, &early.id)
        .unwrap()
        .is_none());
}

#[test]
fn purging_a_task_removes_its_events_and_reminders() {
    let (conn, c) = setup();
    let t = mk_task(&conn, &c, |t| {
        t.due_at = Some("2026-11-27T02:00:00Z".into())
    });
    let block = schedule_block(
        &conn,
        &c,
        &t.id,
        "2026-11-27T05:00:00Z",
        "2026-11-27T06:00:00Z",
        None,
    )
    .unwrap();
    reminders::set(
        &conn,
        &c,
        &ctx(&c),
        &ReminderSet {
            event_id: Some(block.id.clone()),
            offset_minutes: Some(5),
            ..Default::default()
        },
    )
    .unwrap();
    tasks::delete(&SqliteTaskRepository::new(&conn, &c), &t.id).unwrap();
    tasks_infra::purge(&conn, &t.id).unwrap();
    let n: i64 = conn
        .query_row(
            "SELECT (SELECT count(*) FROM events) + (SELECT count(*) FROM reminders)",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(n, 0);
}

#[test]
fn event_update_checks_version_and_recomputes_reminders() {
    let (conn, c) = setup();
    let ctx = ctx(&c);
    let e = event_create(
        &conn,
        &c,
        &timed("A", "2026-11-27T02:00:00Z", "2026-11-27T03:00:00Z"),
    )
    .unwrap();
    let r = reminders::set(
        &conn,
        &c,
        &ctx,
        &ReminderSet {
            event_id: Some(e.id.clone()),
            offset_minutes: Some(15),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(r.trigger_at, "2026-11-27T01:45:00.000Z");

    let patch = EventPatch {
        start_at: Some(Some("2026-11-27T04:00:00Z".into())),
        end_at: Some(Some("2026-11-27T05:00:00Z".into())),
        ..Default::default()
    };
    assert_eq!(
        event_update(&conn, &c, &ctx, &e.id, &patch, 99)
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    let updated = event_update(&conn, &c, &ctx, &e.id, &patch, e.version).unwrap();
    assert_eq!(updated.version, e.version + 1);
    let r = reminders_repo::get(&conn, &r.id).unwrap().unwrap();
    assert_eq!(r.trigger_at, "2026-11-27T03:45:00.000Z");

    // Đổi sang cả ngày: gửi đủ bộ trường mới và null cho bộ cũ → mốc gốc là 09:00 địa phương.
    let to_all_day = EventPatch {
        is_all_day: Some(true),
        start_at: Some(None),
        end_at: Some(None),
        start_date: Some(Some("2026-11-28".into())),
        end_date: Some(Some("2026-11-28".into())),
        ..Default::default()
    };
    let e2 = event_update(&conn, &c, &ctx, &e.id, &to_all_day, updated.version).unwrap();
    assert!(e2.is_all_day && e2.start_at.is_none());
    let r = reminders_repo::get(&conn, &r.id).unwrap().unwrap();
    // 09:00 VN 28/11 = 02:00Z, trừ 15 phút.
    assert_eq!(r.trigger_at, "2026-11-28T01:45:00.000Z");
    // Trạng thái cuối không hợp lệ (cả ngày mà vẫn còn giờ) bị từ chối.
    let bad = EventPatch {
        start_at: Some(Some("2026-11-28T04:00:00Z".into())),
        ..Default::default()
    };
    assert_eq!(
        event_update(&conn, &c, &ctx, &e.id, &bad, e2.version)
            .unwrap_err()
            .code,
        ErrorCode::Validation
    );
}

#[test]
fn task_update_recomputes_offset_reminders_and_drops_them_without_a_due() {
    let (conn, c) = setup();
    let ctx = ctx(&c);
    let repo = SqliteTaskRepository::new(&conn, &c);
    let t = mk_task(&conn, &c, |t| t.due_date = Some("2026-11-27".into()));
    let r = reminders::set(
        &conn,
        &c,
        &ctx,
        &ReminderSet {
            task_id: Some(t.id.clone()),
            offset_minutes: Some(60),
            ..Default::default()
        },
    )
    .unwrap();
    // Hạn chỉ có ngày → 09:00 VN = 02:00Z, trừ 60 phút.
    assert_eq!(r.trigger_at, "2026-11-27T01:00:00.000Z");
    let fixed = reminders::set(
        &conn,
        &c,
        &ctx,
        &ReminderSet {
            task_id: Some(t.id.clone()),
            trigger_at: Some("2026-11-30T00:00:00Z".into()),
            ..Default::default()
        },
    )
    .unwrap();

    let patch = TaskPatch {
        due_at: Some(Some("2026-11-29T10:00:00Z".into())),
        ..Default::default()
    };
    let t2 = tasks::update(&repo, &ctx, &t.id, &patch, t.version).unwrap();
    assert_eq!(
        reminders_repo::get(&conn, &r.id)
            .unwrap()
            .unwrap()
            .trigger_at,
        "2026-11-29T09:00:00.000Z"
    );
    // Reminder giờ cố định không bị đổi.
    assert_eq!(
        reminders_repo::get(&conn, &fixed.id)
            .unwrap()
            .unwrap()
            .trigger_at,
        "2026-11-30T00:00:00.000Z"
    );
    let detail = tasks::get_detail(&repo, &t.id).unwrap();
    assert_eq!(detail.reminders.len(), 2);

    let clear = TaskPatch {
        due_at: Some(None),
        due_date: Some(None),
        ..Default::default()
    };
    tasks::update(&repo, &ctx, &t.id, &clear, t2.version).unwrap();
    assert!(reminders_repo::get(&conn, &r.id).unwrap().is_none());
    assert!(reminders_repo::get(&conn, &fixed.id).unwrap().is_some());
}
