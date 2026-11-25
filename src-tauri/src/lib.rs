mod clock;
mod db;
mod error;
mod ids;
mod modules;
mod system;

use tauri::{Manager, WindowEvent};
use tauri_plugin_window_state::StateFlags;

use clock::SystemClock;
use system::windows::{show_main, MAIN, QUICK_CAPTURE};

pub fn run() {
    tauri::Builder::default()
        // single-instance phải được đăng ký đầu tiên.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app);
        }))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                // Chỉ nhớ kích thước/vị trí; không nhớ trạng thái ẩn/hiện.
                .with_state_flags(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED)
                .with_denylist(&[QUICK_CAPTURE])
                .build(),
        )
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let dir = app.path().app_local_data_dir()?;
            let conn = db::open(&dir.join("lifehub.db"), &dir.join("backups"), &SystemClock)?;
            app.manage(db::Db::new(conn));
            system::tray::init(app)?;
            system::shortcut::register_quick_capture(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| match event {
            // Đóng cửa sổ chính = ẩn xuống khay; thoát hẳn qua Ctrl+Q hoặc menu khay.
            WindowEvent::CloseRequested { api, .. } if window.label() == MAIN => {
                api.prevent_close();
                let _ = window.hide();
            }
            WindowEvent::Focused(false) if window.label() == QUICK_CAPTURE => {
                let _ = window.hide();
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            modules::inbox::commands::inbox_list,
            modules::inbox::commands::inbox_create,
            system::windows::app_quit,
        ])
        .run(tauri::generate_context!())
        .expect("lỗi khi chạy LifeHub");
}
