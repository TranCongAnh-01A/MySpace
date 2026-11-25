use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::App;

use super::windows::{show_main, show_quick_capture};

/// Khay hệ thống: Mở, Ghi nhanh, Thoát. Bấm trái vào biểu tượng = mở cửa sổ chính.
pub fn init(app: &App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Mở LifeHub", true, None::<&str>)?;
    let capture = MenuItem::with_id(app, "capture", "Ghi nhanh", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Thoát", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &capture, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("LifeHub")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "capture" => show_quick_capture(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}
