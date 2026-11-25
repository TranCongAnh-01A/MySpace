use tauri::{AppHandle, Manager};

pub const MAIN: &str = "main";
pub const QUICK_CAPTURE: &str = "quick-capture";

/// Hiện cửa sổ chính (kể cả khi đang ẩn xuống khay hoặc thu nhỏ) và đưa lên trước.
pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(MAIN) {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
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
