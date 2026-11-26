use std::sync::Mutex;

use chrono::{Duration, TimeZone, Utc};
use rusqlite::Connection;

use super::application as app;
use super::domain::*;
use super::notifier::{Notification, Notifier};
use super::repository as repo;
use super::scheduler::{dispatch, process, sleep_for};
use crate::clock::FixedClock;
use crate::db;
use crate::error::ErrorCode;
use crate::modules::calendar::application as calendar;
use crate::modules::calendar::domain::EventCreate;
use crate::modules::tasks::application as tasks;
use crate::modules::tasks::domain::{Frequency, Recurrence, Task, TaskCreate, TaskStatus};
use crate::modules::tasks::infrastructure::SqliteTaskRepository;
use crate::modules::tasks::timectx::TimeCtx;

fn at(h: u32, m: u32, s: u32) -> chrono::DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 11, 27, h, m, s).unwrap()
}

fn clock_at(h: u32, m: u32, s: u32) -> FixedClock {
    FixedClock(at(h, m, s))
}

fn ctx(c: &FixedClock) -> TimeCtx {
    TimeCtx::new("Asia/Ho_Chi_Minh", c.0)
}

fn mk_task(conn: &Connection, c: &FixedClock, f: impl FnOnce(&mut TaskCreate)) -> Task {
    let mut input = TaskCreate {
        title: "Nộp báo cáo".into(),
        ..Default::default()
    };
    f(&mut input);
    tasks::create(&SqliteTaskRepository::new(conn, c), &ctx(c), &input).unwrap()
}

fn fixed(conn: &Connection, c: &FixedClock, task: &Task, trigger: &str) -> Reminder {
    app::set(
        conn,
        c,
        &ctx(c),
        &ReminderSet {
            task_id: Some(task.id.clone()),
            trigger_at: Some(trigger.into()),
            ..Default::default()
        },
    )
    .unwrap()
}

fn status(conn: &Connection, id: &str) -> ReminderStatus {
    repo::get(conn, id).unwrap().unwrap().status
}

#[derive(Default)]
struct FakeNotifier(Mutex<Vec<Notification>>);

impl Notifier for FakeNotifier {
    fn notify(&self, n: &Notification) -> Result<(), String> {
        self.0.lock().unwrap().push(n.clone());
        Ok(())
    }
}

/// Chạy một vòng scheduler với đồng hồ `c`, gửi thông báo giả; trả số thông báo đã gửi.
fn tick(conn: &Connection, c: &FixedClock, paused: bool, enabled: bool, n: &FakeNotifier) -> usize {
    let ctx = ctx(c);
    let out = process(conn, c, &ctx, paused, enabled).unwrap();
    dispatch(&out.fired, &ctx, false, n, |_| {});
    out.fired.len()
}

#[test]
fn set_validates_the_shape_of_the_input() {
    let conn = db::open_in_memory().unwrap();
    let c = clock_at(1, 0, 0);
    let t = mk_task(&conn, &c, |_| {}); // không có hạn
    let code = |input: ReminderSet| app::set(&conn, &c, &ctx(&c), &input).unwrap_err().code;
    // Không nguồn / hai nguồn.
    assert_eq!(
        code(ReminderSet {
            offset_minutes: Some(5),
            ..Default::default()
        }),
        ErrorCode::Validation
    );
    assert_eq!(
        code(ReminderSet {
            task_id: Some(t.id.clone()),
            event_id: Some("x".into()),
            offset_minutes: Some(5),
            ..Default::default()
        }),
        ErrorCode::Validation
    );
    // Cả offset lẫn triggerAt, hoặc không có cái nào.
    assert_eq!(
        code(ReminderSet {
            task_id: Some(t.id.clone()),
            offset_minutes: Some(5),
            trigger_at: Some("2026-11-27T05:00:00Z".into()),
            ..Default::default()
        }),
        ErrorCode::Validation
    );
    assert_eq!(
        code(ReminderSet {
            task_id: Some(t.id.clone()),
            ..Default::default()
        }),
        ErrorCode::Validation
    );
    // Dùng offset mà Task không có hạn.
    assert_eq!(
        code(ReminderSet {
            task_id: Some(t.id.clone()),
            offset_minutes: Some(5),
            ..Default::default()
        }),
        ErrorCode::Validation
    );
    // Giờ cố định thì không cần hạn.
    let r = fixed(&conn, &c, &t, "2026-11-27T05:00:00Z");
    assert_eq!(
        (r.status, r.offset_minutes),
        (ReminderStatus::Pending, None)
    );
    assert_eq!(
        code(ReminderSet {
            task_id: Some("khong-co".into()),
            trigger_at: Some("2026-11-27T05:00:00Z".into()),
            ..Default::default()
        }),
        ErrorCode::NotFound
    );
}

#[test]
fn offset_is_relative_to_due_at_or_nine_am_local() {
    let conn = db::open_in_memory().unwrap();
    let c = clock_at(1, 0, 0);
    let with_time = mk_task(&conn, &c, |t| {
        t.due_at = Some("2026-11-28T10:00:00Z".into())
    });
    let with_date = mk_task(&conn, &c, |t| t.due_date = Some("2026-11-28".into()));
    let set = |t: &Task, off| {
        app::set(
            &conn,
            &c,
            &ctx(&c),
            &ReminderSet {
                task_id: Some(t.id.clone()),
                offset_minutes: Some(off),
                ..Default::default()
            },
        )
        .unwrap()
    };
    assert_eq!(set(&with_time, 30).trigger_at, "2026-11-28T09:30:00.000Z");
    // 09:00 giờ VN ngày 28 = 02:00Z.
    assert_eq!(set(&with_date, 0).trigger_at, "2026-11-28T02:00:00.000Z");
}

#[test]
fn marking_a_task_done_dismisses_pending_reminders() {
    let conn = db::open_in_memory().unwrap();
    let c = clock_at(1, 0, 0);
    let repo_t = SqliteTaskRepository::new(&conn, &c);
    let t = mk_task(&conn, &c, |t| {
        t.due_at = Some("2026-11-28T10:00:00Z".into())
    });
    let r = fixed(&conn, &c, &t, "2026-11-28T09:00:00Z");
    tasks::set_status(&repo_t, &ctx(&c), &t.id, TaskStatus::Done).unwrap();
    assert_eq!(status(&conn, &r.id), ReminderStatus::Dismissed);
    // Mở lại không khôi phục.
    tasks::set_status(&repo_t, &ctx(&c), &t.id, TaskStatus::Todo).unwrap();
    assert_eq!(status(&conn, &r.id), ReminderStatus::Dismissed);
}

#[test]
fn next_recurrence_copies_offset_reminders_only() {
    let conn = db::open_in_memory().unwrap();
    let c = clock_at(1, 0, 0);
    let repo_t = SqliteTaskRepository::new(&conn, &c);
    let t = mk_task(&conn, &c, |t| {
        t.due_at = Some("2026-11-28T10:00:00Z".into());
        t.recurrence = Some(Recurrence {
            frequency: Frequency::Daily,
            interval: 1,
            by_weekday: None,
        });
    });
    let with_offset = app::set(
        &conn,
        &c,
        &ctx(&c),
        &ReminderSet {
            task_id: Some(t.id.clone()),
            offset_minutes: Some(15),
            ..Default::default()
        },
    )
    .unwrap();
    fixed(&conn, &c, &t, "2026-11-28T08:00:00Z");
    let result = tasks::set_status(&repo_t, &ctx(&c), &t.id, TaskStatus::Done).unwrap();
    let next = result.next.expect("có lần lặp tiếp theo");
    let copied = app::list(&conn, Some(&next.id), None).unwrap();
    assert_eq!(copied.len(), 1);
    assert_eq!(copied[0].offset_minutes, Some(15));
    assert_eq!(copied[0].status, ReminderStatus::Pending);
    assert_eq!(copied[0].trigger_at, "2026-11-29T09:45:00.000Z");
    assert_ne!(copied[0].id, with_offset.id);
}

#[test]
fn scheduler_fires_on_time_and_never_twice() {
    let conn = db::open_in_memory().unwrap();
    let setup = clock_at(1, 0, 0);
    let t = mk_task(&conn, &setup, |t| {
        t.due_at = Some("2026-11-27T03:00:00Z".into())
    });
    let r = fixed(&conn, &setup, &t, "2026-11-27T02:00:00Z");
    let n = FakeNotifier::default();

    // Chưa đến giờ.
    assert_eq!(tick(&conn, &clock_at(1, 59, 59), false, true, &n), 0);
    assert_eq!(status(&conn, &r.id), ReminderStatus::Pending);
    // Đúng giờ: bắn một lần.
    assert_eq!(tick(&conn, &clock_at(2, 0, 0), false, true, &n), 1);
    assert_eq!(status(&conn, &r.id), ReminderStatus::Sent);
    // Vòng sau (kể cả sau đó) không bắn lại.
    assert_eq!(tick(&conn, &clock_at(2, 0, 1), false, true, &n), 0);
    assert_eq!(tick(&conn, &clock_at(2, 3, 0), false, true, &n), 0);
    let sent = n.0.lock().unwrap();
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0].title, "Nộp báo cáo");
    // Hạn 03:00Z = 10:00 giờ VN.
    assert_eq!(sent[0].body, "Đến hạn lúc 10:00");
    assert_eq!(sent[0].route, format!("/tasks/{}", t.id));
    assert!(repo::get(&conn, &r.id).unwrap().unwrap().sent_at.is_some());
}

#[test]
fn reminders_later_than_five_minutes_become_missed() {
    let conn = db::open_in_memory().unwrap();
    let setup = clock_at(1, 0, 0);
    let t = mk_task(&conn, &setup, |_| {});
    let within = fixed(&conn, &setup, &t, "2026-11-27T02:00:00Z");
    let late = fixed(&conn, &setup, &t, "2026-11-27T01:50:00Z");
    let n = FakeNotifier::default();
    // Đúng 5 phút sau `within` thì vẫn bắn; `late` đã trễ 15 phút nên bị bỏ lỡ.
    assert_eq!(tick(&conn, &clock_at(2, 5, 0), false, true, &n), 1);
    assert_eq!(status(&conn, &within.id), ReminderStatus::Sent);
    assert_eq!(status(&conn, &late.id), ReminderStatus::Missed);
    assert_eq!(n.0.lock().unwrap().len(), 1);

    // Trễ 5 phút 1 giây thì Missed.
    let later = fixed(&conn, &setup, &t, "2026-11-27T03:00:00Z");
    assert_eq!(tick(&conn, &clock_at(3, 5, 1), false, true, &n), 0);
    assert_eq!(status(&conn, &later.id), ReminderStatus::Missed);
    // `reminder_missed_list` trả về, mới nhất trước, kèm tiêu đề.
    let list = app::missed_list(&conn, &ctx(&setup)).unwrap();
    assert_eq!(list.len(), 2);
    assert_eq!(list[0].reminder.id, later.id);
    assert_eq!(list[0].title, "Nộp báo cáo");
    app::dismiss(&conn, &setup, &later.id).unwrap();
    assert_eq!(app::missed_list(&conn, &ctx(&setup)).unwrap().len(), 1);
    app::dismiss_all(&conn, &setup).unwrap();
    assert!(app::missed_list(&conn, &ctx(&setup)).unwrap().is_empty());
}

#[test]
fn paused_or_disabled_notifications_turn_due_reminders_into_missed() {
    let conn = db::open_in_memory().unwrap();
    let setup = clock_at(1, 0, 0);
    let t = mk_task(&conn, &setup, |_| {});
    let a = fixed(&conn, &setup, &t, "2026-11-27T02:00:00Z");
    let b = fixed(&conn, &setup, &t, "2026-11-27T02:01:00Z");
    let future = fixed(&conn, &setup, &t, "2026-11-27T04:00:00Z");
    let n = FakeNotifier::default();
    assert_eq!(tick(&conn, &clock_at(2, 0, 30), true, true, &n), 0);
    assert_eq!(status(&conn, &a.id), ReminderStatus::Missed);
    assert_eq!(status(&conn, &b.id), ReminderStatus::Pending);
    assert_eq!(tick(&conn, &clock_at(2, 1, 30), false, false, &n), 0);
    assert_eq!(status(&conn, &b.id), ReminderStatus::Missed);
    // Lần nhắc tương lai vẫn Pending.
    assert_eq!(status(&conn, &future.id), ReminderStatus::Pending);
    assert!(n.0.lock().unwrap().is_empty());
}

#[test]
fn scheduler_skips_deleted_sources_and_fires_event_reminders() {
    let conn = db::open_in_memory().unwrap();
    let setup = clock_at(1, 0, 0);
    let t = mk_task(&conn, &setup, |_| {});
    fixed(&conn, &setup, &t, "2026-11-27T02:00:00Z");
    tasks::delete(&SqliteTaskRepository::new(&conn, &setup), &t.id).unwrap();
    let event = calendar::event_create(
        &conn,
        &setup,
        &EventCreate {
            title: "Họp nhóm".into(),
            start_at: Some("2026-11-27T03:00:00Z".into()),
            end_at: Some("2026-11-27T04:00:00Z".into()),
            ..Default::default()
        },
    )
    .unwrap();
    let r = app::set(
        &conn,
        &setup,
        &ctx(&setup),
        &ReminderSet {
            event_id: Some(event.id.clone()),
            offset_minutes: Some(10),
            ..Default::default()
        },
    )
    .unwrap();
    let n = FakeNotifier::default();
    // Reminder của Task đã xoá bị bỏ qua; chỉ Event bắn.
    assert_eq!(tick(&conn, &clock_at(2, 50, 0), false, true, &n), 1);
    assert_eq!(status(&conn, &r.id), ReminderStatus::Sent);
    let sent = n.0.lock().unwrap();
    assert_eq!(sent[0].title, "Họp nhóm");
    // Bắt đầu 03:00Z = 10:00 giờ VN.
    assert_eq!(sent[0].body, "Bắt đầu lúc 10:00");
    assert!(sent[0]
        .route
        .starts_with("/calendar?date=2026-11-27&event="));
}

#[test]
fn sleep_is_capped_at_sixty_seconds() {
    let now = at(2, 0, 0);
    assert_eq!(sleep_for(None, now).as_secs(), 60);
    assert_eq!(sleep_for(Some(now + Duration::hours(3)), now).as_secs(), 60);
    assert_eq!(
        sleep_for(Some(now + Duration::seconds(20)), now).as_secs(),
        20
    );
    assert_eq!(
        sleep_for(Some(now + Duration::milliseconds(200)), now).as_secs(),
        1
    );
}

#[test]
fn delete_removes_a_reminder_for_good() {
    let conn = db::open_in_memory().unwrap();
    let c = clock_at(1, 0, 0);
    let t = mk_task(&conn, &c, |_| {});
    let r = fixed(&conn, &c, &t, "2026-11-27T05:00:00Z");
    app::delete(&conn, &c, &r.id).unwrap();
    assert!(app::list(&conn, Some(&t.id), None).unwrap().is_empty());
    assert_eq!(
        app::delete(&conn, &c, &r.id).unwrap_err().code,
        ErrorCode::NotFound
    );
}
