use std::sync::{mpsc, Mutex};
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

use crate::reminders::domain::Navigate;

pub const MAIN: &str = "main";
pub const QUICK_CAPTURE: &str = "quick-capture";

/// App được mở với `--hidden` (autostart cùng Windows)?
pub fn launched_hidden() -> bool {
    std::env::args().any(|a| a == "--hidden")
}

/// Hiện cửa sổ chính (kể cả khi đang ẩn xuống khay hoặc thu nhỏ) và đưa lên trước.
pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(MAIN) {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Phát event `navigate` tới frontend rồi hiện cửa sổ chính, đưa lên trước.
pub fn navigate(app: &AppHandle, route: &str) {
    let payload = Navigate {
        route: route.to_string(),
    };
    if let Err(e) = app.emit("navigate", payload) {
        tracing::warn!(error = %e, "không phát được navigate");
    }
    show_main(app);
}

/// Hiện cửa sổ Quick Capture ở giữa màn hình và focus.
pub fn show_quick_capture(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(QUICK_CAPTURE) {
        let _ = w.center();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Thời gian tối đa chờ frontend lưu xong trước khi thoát hẳn.
pub const QUIT_TIMEOUT: Duration = Duration::from_millis(1500);

/// Cổng thoát an toàn: chỉ một yêu cầu thoát được xử lý tại một thời điểm.
#[derive(Default)]
pub struct ExitGate {
    waiting: Mutex<Option<mpsc::Sender<()>>>,
}

impl ExitGate {
    /// Bắt đầu một lần chờ. `None` nếu đang có lần chờ khác (yêu cầu thoát thêm bị bỏ qua).
    pub fn begin(&self) -> Option<mpsc::Receiver<()>> {
        let mut slot = self.waiting.lock().ok()?;
        if slot.is_some() {
            return None;
        }
        let (tx, rx) = mpsc::channel();
        *slot = Some(tx);
        Some(rx)
    }

    /// Frontend báo đã lưu xong. Không có lần chờ nào thì bỏ qua.
    pub fn ready(&self) {
        if let Ok(slot) = self.waiting.lock() {
            if let Some(tx) = slot.as_ref() {
                let _ = tx.send(());
            }
        }
    }
}

/// Chờ tín hiệu `ready`; `true` nếu nhận được trước khi hết `timeout`.
pub fn wait_ready(rx: &mpsc::Receiver<()>, timeout: Duration) -> bool {
    rx.recv_timeout(timeout).is_ok()
}

/// Mọi đường thoát hẳn đi qua đây: phát `app-will-quit`, chờ `app_quit_ready` tối đa 1,5 giây
/// (để frontend lưu Note đang soạn), rồi thoát. Đang chờ mà có yêu cầu thoát khác thì bỏ qua.
pub fn request_exit(app: &AppHandle) {
    let Some(gate) = app.try_state::<ExitGate>() else {
        app.exit(0);
        return;
    };
    let Some(rx) = gate.begin() else {
        return;
    };
    if let Err(e) = app.emit("app-will-quit", ()) {
        tracing::warn!(error = %e, "không phát được app-will-quit");
    }
    let app = app.clone();
    std::thread::spawn(move || {
        if !wait_ready(&rx, QUIT_TIMEOUT) {
            tracing::info!("frontend không trả lời app-will-quit, thoát luôn");
        }
        app.exit(0);
    });
}

/// Thoát hẳn app (khác với đóng cửa sổ chính, chỉ ẩn xuống khay).
#[tauri::command]
pub fn app_quit(app: AppHandle) {
    request_exit(&app);
}

/// Frontend báo đã lưu xong sau `app-will-quit`.
#[tauri::command]
pub fn app_quit_ready(gate: tauri::State<'_, ExitGate>) {
    gate.ready();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ready_unblocks_the_wait() {
        let gate = ExitGate::default();
        let rx = gate.begin().unwrap();
        gate.ready();
        assert!(wait_ready(&rx, Duration::from_millis(500)));
    }

    #[test]
    fn no_answer_times_out() {
        let gate = ExitGate::default();
        let rx = gate.begin().unwrap();
        let started = std::time::Instant::now();
        assert!(!wait_ready(&rx, Duration::from_millis(60)));
        assert!(started.elapsed() >= Duration::from_millis(60));
    }

    #[test]
    fn second_request_while_waiting_is_ignored() {
        let gate = ExitGate::default();
        let _rx = gate.begin().unwrap();
        assert!(gate.begin().is_none());
    }

    #[test]
    fn ready_without_waiting_is_harmless() {
        ExitGate::default().ready();
    }

    #[test]
    fn quit_timeout_is_one_and_a_half_seconds() {
        assert_eq!(QUIT_TIMEOUT, Duration::from_millis(1500));
    }
}
