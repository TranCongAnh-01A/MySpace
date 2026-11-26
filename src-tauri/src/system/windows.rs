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

/// Thoát hẳn app (khác với đóng cửa sổ chính, chỉ ẩn xuống khay).
#[tauri::command]
pub fn app_quit(app: AppHandle) {
    app.exit(0);
}
