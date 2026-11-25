use tauri::AppHandle;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use super::windows::show_quick_capture;

/// Phím tắt Quick Capture, đặt cứng ở phase A (phiên B chuyển sang đọc từ Settings).
pub fn register_quick_capture(app: &AppHandle) {
    let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
    let result = app
        .global_shortcut()
        .on_shortcut(shortcut, |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                show_quick_capture(app);
            }
        });
    // Phím bị chiếm thì chỉ ghi log, không làm sập app.
    if let Err(e) = result {
        eprintln!("không đăng ký được Ctrl+Shift+Space: {e}");
    }
}
