//! Gửi thông báo Windows. `Notifier` là trait để test bằng bản giả.

use tauri::AppHandle;

use crate::modules::tasks::timectx::TimeCtx;
use crate::system::windows::navigate;

use super::scheduler::Fired;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Notification {
    pub title: String,
    pub body: String,
    /// Route mở khi bấm vào thông báo.
    pub route: String,
}

impl Notification {
    pub fn from_fired(f: &Fired, ctx: &TimeCtx, english: bool) -> Self {
        let is_event = f.reminder.event_id.is_some();
        let time = f
            .anchor
            .as_deref()
            .and_then(|a| ctx.local_time(a))
            .map(|t| t.chars().take(5).collect::<String>())
            .unwrap_or_default();
        let label = match (is_event, english) {
            (true, false) => "Bắt đầu lúc",
            (false, false) => "Đến hạn lúc",
            (true, true) => "Starts at",
            (false, true) => "Due at",
        };
        let route = match (&f.reminder.task_id, &f.reminder.event_id) {
            (Some(t), _) => format!("/tasks/{t}"),
            (None, Some(e)) => {
                let date = f
                    .anchor
                    .as_deref()
                    .and_then(|a| ctx.local_date(a))
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default();
                format!("/calendar?date={date}&event={e}")
            }
            _ => "/".to_string(),
        };
        Self {
            title: f.title.clone(),
            body: format!("{label} {time}"),
            route,
        }
    }
}

pub trait Notifier: Send + Sync {
    fn notify(&self, n: &Notification) -> Result<(), String>;
}

/// Thông báo toast Windows; bấm vào thì phát `navigate` và hiện cửa sổ chính.
pub struct WinNotifier {
    app: AppHandle,
}

impl WinNotifier {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }

    fn app_id(&self) -> String {
        // Bản debug chạy từ thư mục build, chưa có AUMID riêng nên mượn của PowerShell.
        if cfg!(debug_assertions) {
            tauri_winrt_notification::Toast::POWERSHELL_APP_ID.to_string()
        } else {
            self.app.config().identifier.clone()
        }
    }
}

impl Notifier for WinNotifier {
    fn notify(&self, n: &Notification) -> Result<(), String> {
        let app = self.app.clone();
        let route = n.route.clone();
        tauri_winrt_notification::Toast::new(&self.app_id())
            .title(&n.title)
            .text1(&n.body)
            .on_activated(move |_| {
                navigate(&app, &route);
                Ok(())
            })
            .show()
            .map_err(|e| e.to_string())
    }
}
