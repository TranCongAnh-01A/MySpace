//! Scheduler: vòng lặp tìm lần nhắc kế tiếp, đánh dấu `Sent`/`Missed`, rồi gửi thông báo.
//!
//! `process` là phần thuần (nhận `Clock`, không đụng Tauri) nên test được với đồng hồ giả.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, Utc};
use rusqlite::Connection;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Notify;

use crate::clock::{Clock, SystemClock};
use crate::db::Db;
use crate::error::AppResult;
use crate::modules::settings::commands::SettingsState;
use crate::modules::tasks::timectx::TimeCtx;

use super::domain::{decide, Decision, Reminder, ReminderFired, ReminderStatus};
use super::notifier::{Notification, Notifier, WinNotifier};
use super::repository as repo;

/// Tối đa ngủ bao lâu giữa hai lần kiểm tra.
const MAX_SLEEP_SECS: i64 = 60;

/// Tay cầm điều khiển scheduler: đánh thức và tạm dừng thông báo (trong bộ nhớ).
#[derive(Clone)]
pub struct SchedulerHandle {
    notify: Arc<Notify>,
    paused: Arc<AtomicBool>,
}

impl SchedulerHandle {
    pub fn new() -> Self {
        Self {
            notify: Arc::new(Notify::new()),
            paused: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Báo dữ liệu reminder/Task/Event/Settings đã đổi: vòng lặp tính lại ngay.
    pub fn wake(&self) {
        self.notify.notify_one();
    }

    pub fn is_paused(&self) -> bool {
        self.paused.load(Ordering::Relaxed)
    }

    pub fn set_paused(&self, paused: bool) {
        self.paused.store(paused, Ordering::Relaxed);
        self.wake();
    }
}

impl Default for SchedulerHandle {
    fn default() -> Self {
        Self::new()
    }
}

/// Một lần nhắc vừa chuyển `Sent`, cần gửi thông báo.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Fired {
    pub reminder: Reminder,
    pub title: String,
    /// Thời điểm gốc (hạn/giờ bắt đầu), UTC.
    pub anchor: Option<String>,
}

#[derive(Debug, Default)]
pub struct Outcome {
    pub fired: Vec<Fired>,
    pub missed: usize,
    /// Mốc `trigger_at` kế tiếp còn chờ (nếu có).
    pub next_trigger: Option<DateTime<Utc>>,
}

/// Xử lý mọi lần nhắc đến hạn. Gọi trong một transaction; gửi thông báo sau khi commit.
pub fn process(
    conn: &Connection,
    clock: &dyn Clock,
    ctx: &TimeCtx,
    paused: bool,
    notifications_enabled: bool,
) -> AppResult<Outcome> {
    let mut out = Outcome::default();
    let now = clock.now();
    let blocked = paused || !notifications_enabled;
    while let Some(r) = repo::next_pending(conn)? {
        match decide(&r.trigger_at, now, blocked) {
            Decision::Wait => {
                out.next_trigger = DateTime::parse_from_rfc3339(&r.trigger_at)
                    .ok()
                    .map(|t| t.with_timezone(&Utc));
                break;
            }
            Decision::Missed => {
                if repo::set_status(
                    conn,
                    clock,
                    &r.id,
                    ReminderStatus::Pending,
                    ReminderStatus::Missed,
                )? {
                    out.missed += 1;
                }
            }
            Decision::Fire => {
                // Chỉ gửi khi cập nhật đúng 1 dòng: không thể gửi trùng.
                if repo::set_status(
                    conn,
                    clock,
                    &r.id,
                    ReminderStatus::Pending,
                    ReminderStatus::Sent,
                )? {
                    let (title, anchor) =
                        repo::source_info(conn, &r, ctx)?.unwrap_or((String::new(), None));
                    out.fired.push(Fired {
                        reminder: r,
                        title,
                        anchor,
                    });
                }
            }
        }
    }
    Ok(out)
}

/// Thời gian ngủ tới lần kiểm tra kế tiếp.
pub fn sleep_for(next: Option<DateTime<Utc>>, now: DateTime<Utc>) -> Duration {
    let secs = next.map_or(MAX_SLEEP_SECS, |t| {
        ((t - now).num_milliseconds() + 999)
            .div_euclid(1000)
            .clamp(1, MAX_SLEEP_SECS)
    });
    Duration::from_secs(secs.unsigned_abs())
}

/// Gửi thông báo cho các lần nhắc vừa `Sent`.
pub fn dispatch(
    fired: &[Fired],
    ctx: &TimeCtx,
    english: bool,
    notifier: &dyn Notifier,
    mut on_fired: impl FnMut(&Reminder),
) {
    for f in fired {
        let n = Notification::from_fired(f, ctx, english);
        if let Err(e) = notifier.notify(&n) {
            tracing::warn!(error = %e, "không gửi được thông báo");
        }
        on_fired(&f.reminder);
    }
}

fn run_once(app: &AppHandle, handle: &SchedulerHandle, notifier: &dyn Notifier) -> Duration {
    let settings = app.state::<SettingsState>().get();
    let ctx = TimeCtx::new(&settings.timezone, Utc::now());
    let result = {
        let db = app.state::<Db>();
        let conn = match db.lock() {
            Ok(c) => c,
            Err(_) => return Duration::from_secs(5),
        };
        let paused = handle.is_paused();
        conn.unchecked_transaction()
            .map_err(crate::error::AppError::from)
            .and_then(|tx| {
                let out = process(
                    &tx,
                    &SystemClock,
                    &ctx,
                    paused,
                    settings.notifications_enabled,
                )?;
                tx.commit()?;
                Ok(out)
            })
    };
    match result {
        Ok(out) => {
            let english = matches!(
                settings.language,
                crate::modules::settings::domain::Language::En
            );
            dispatch(&out.fired, &ctx, english, notifier, |r| {
                let _ = app.emit(
                    "reminder-fired",
                    ReminderFired {
                        reminder_id: r.id.clone(),
                        task_id: r.task_id.clone(),
                        event_id: r.event_id.clone(),
                    },
                );
            });
            if !out.fired.is_empty() || out.missed > 0 {
                crate::modules::emit_entity_changed(app, "reminder", Vec::new());
            }
            sleep_for(out.next_trigger, Utc::now())
        }
        Err(e) => {
            tracing::warn!(code = ?e.code, "scheduler lỗi");
            Duration::from_secs(MAX_SLEEP_SECS.unsigned_abs())
        }
    }
}

/// Chạy một vòng ngay (để reminder quá hạn thành `Missed` trước khi UI hỏi), rồi lặp nền.
pub fn start(app: &AppHandle, handle: SchedulerHandle) {
    let notifier = WinNotifier::new(app.clone());
    // Vòng đầu tiên chạy đồng bộ: reminder quá hạn thành `Missed` trước khi UI gọi reminder_missed_list.
    let first = run_once(app, &handle, &notifier);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut wait = first;
        loop {
            // Ngủ tới mốc kế tiếp, hoặc dậy sớm khi có `wake()`.
            let _ = tokio::time::timeout(wait, handle.notify.notified()).await;
            wait = run_once(&app, &handle, &notifier);
        }
    });
}
