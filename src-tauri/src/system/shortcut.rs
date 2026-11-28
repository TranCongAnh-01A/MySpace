use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::error::{AppError, AppResult, ErrorCode};

use super::windows::show_quick_capture;

/// Đọc chuỗi phím (VD `Ctrl+Alt+K`). Không đọc được → `VALIDATION`.
pub fn parse(accelerator: &str) -> AppResult<Shortcut> {
    accelerator
        .trim()
        .parse::<Shortcut>()
        .map_err(|e| AppError::validation(format!("Không đọc được phím tắt: {e}")))
}

fn bind(app: &AppHandle, accelerator: &str) -> AppResult<()> {
    let shortcut = parse(accelerator)?;
    app.global_shortcut()
        .on_shortcut(shortcut, |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                let t = std::time::Instant::now();
                show_quick_capture(app);
                tracing::info!(
                    quick_capture_show_ms = t.elapsed().as_millis() as u64,
                    "Quick Capture đã hiện"
                );
            }
        })
        .map_err(|e| {
            let mut err = AppError::new(
                ErrorCode::Conflict,
                "Phím tắt này đang được ứng dụng khác sử dụng",
            );
            err.details = Some(e.to_string());
            err
        })
}

/// Đăng ký phím Quick Capture lúc khởi động. Thất bại chỉ ghi log, không làm sập app.
pub fn register_quick_capture(app: &AppHandle, accelerator: &str) {
    if let Err(e) = bind(app, accelerator) {
        tracing::warn!(code = ?e.code, accelerator, "không đăng ký được phím tắt Quick Capture");
    }
}

/// Đổi phím Quick Capture. Phím mới đăng ký thất bại thì phím cũ được giữ nguyên.
pub fn change(app: &AppHandle, old: &str, new: &str) -> AppResult<()> {
    if old.trim().eq_ignore_ascii_case(new.trim()) {
        return Ok(());
    }
    parse(new)?; // lỗi cú pháp: chưa đụng tới phím cũ
    let old_shortcut = parse(old).ok();
    if let Some(s) = old_shortcut {
        let _ = app.global_shortcut().unregister(s);
    }
    match bind(app, new) {
        Ok(()) => Ok(()),
        Err(e) => {
            if old_shortcut.is_some() {
                if let Err(restore) = bind(app, old) {
                    tracing::error!(code = ?restore.code, "không khôi phục được phím tắt cũ");
                }
            }
            Err(e)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_valid_accelerators() {
        for a in ["Ctrl+Shift+Space", "Ctrl+Alt+K", " ctrl+shift+q "] {
            assert!(parse(a).is_ok(), "{a}");
        }
    }

    #[test]
    fn rejects_garbage() {
        for a in ["", "Ctrl+", "không phải phím", "Ctrl+Shift+Nothing"] {
            assert_eq!(parse(a).unwrap_err().code, ErrorCode::Validation, "{a}");
        }
    }
}
