mod clock;
mod db;
mod error;
mod ids;
mod logging;
mod modules;
mod sort_key;
mod system;

use std::time::Duration;

use tauri::{AppHandle, Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_window_state::StateFlags;

use clock::SystemClock;
use db::Db;
use modules::search::application as search_app;
use modules::settings::application as settings_app;
use modules::settings::commands::SettingsState;
use modules::settings::infrastructure::SqliteSettingsRepository;
use modules::trash::application as trash_app;
use system::windows::{launched_hidden, show_main, MAIN, QUICK_CAPTURE};
use system::{backup, AppDirs};

/// Mỗi giờ kiểm tra một lần; chưa có bản `Daily` nào trong 24 giờ qua thì tạo.
fn spawn_daily_backup(app: AppHandle, dir: std::path::PathBuf) {
    std::thread::spawn(move || loop {
        match app.state::<Db>().lock() {
            Ok(conn) => {
                if let Err(e) = backup::ensure_daily(&conn, &dir, &SystemClock) {
                    tracing::warn!(code = ?e.code, "sao lưu hằng ngày thất bại");
                }
            }
            Err(e) => tracing::warn!(code = ?e.code, "sao lưu hằng ngày: không khoá được DB"),
        }
        std::thread::sleep(Duration::from_secs(3600));
    });
}

/// Việc dọn dẹp lúc khởi động: dựng lại chỉ mục tìm kiếm nếu rỗng, xoá hẳn mục Trash quá hạn.
/// Lỗi chỉ ghi log để không chặn app khởi động.
fn startup_maintenance(conn: &mut rusqlite::Connection, trash_retention_days: u32) {
    let result = conn
        .transaction()
        .map_err(error::AppError::from)
        .and_then(|tx| {
            search_app::reindex_if_empty(&tx)?;
            let purged = trash_app::purge_expired(&tx, &SystemClock, trash_retention_days)?;
            tx.commit()?;
            Ok(purged)
        });
    match result {
        Ok(0) => {}
        Ok(n) => tracing::info!(purged = n, "đã xoá hẳn mục Trash quá hạn"),
        Err(e) => tracing::warn!(code = ?e.code, "dọn dẹp lúc khởi động thất bại"),
    }
}

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
        // Khởi động cùng Windows: app được mở với `--hidden`.
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        // dialog và opener chỉ gọi từ Rust; frontend không được cấp quyền.
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let dirs = AppDirs::new(app.path().app_local_data_dir()?);
            std::fs::create_dir_all(&dirs.data)?;
            if let Ok(guard) = logging::init(&dirs.logs) {
                app.manage(logging::LogGuard(guard));
            }
            tracing::info!(version = %app.package_info().version, "LifeHub khởi động");

            let mut conn = db::open(&dirs.data.join("lifehub.db"), &dirs.backups, &SystemClock)?;
            let settings = settings_app::get(&SqliteSettingsRepository::new(&conn))?;
            startup_maintenance(&mut conn, settings.trash_retention_days);
            app.manage(Db::new(conn));
            app.manage(dirs.clone());

            system::tray::init(app)?;
            system::shortcut::register_quick_capture(
                app.handle(),
                &settings.quick_capture_shortcut,
            );
            spawn_daily_backup(app.handle().clone(), dirs.backups.clone());

            // Cửa sổ chính tạo ở trạng thái ẩn (tránh nháy lúc khởi động); chỉ ẩn tiếp
            // khi app được mở cùng Windows và người dùng bật "khởi động ẩn".
            if !(launched_hidden() && settings.start_hidden) {
                show_main(app.handle());
            }
            app.manage(SettingsState::new(settings));
            Ok(())
        })
        .on_window_event(|window, event| match event {
            // Đóng cửa sổ chính: ẩn xuống khay hoặc thoát hẳn, tuỳ cài đặt `closeToTray`.
            WindowEvent::CloseRequested { api, .. } if window.label() == MAIN => {
                let close_to_tray = window
                    .app_handle()
                    .try_state::<SettingsState>()
                    .map_or(true, |s| s.get().close_to_tray);
                if close_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    window.app_handle().exit(0);
                }
            }
            WindowEvent::Focused(false) if window.label() == QUICK_CAPTURE => {
                let _ = window.hide();
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            modules::inbox::commands::inbox_list,
            modules::inbox::commands::inbox_create,
            modules::inbox::commands::inbox_update,
            modules::inbox::commands::inbox_delete,
            modules::inbox::commands::inbox_convert_to_task,
            modules::tasks::commands::task_list,
            modules::tasks::commands::task_get,
            modules::tasks::commands::task_create,
            modules::tasks::commands::task_update,
            modules::tasks::commands::task_set_status,
            modules::tasks::commands::task_move,
            modules::tasks::commands::task_archive,
            modules::tasks::commands::task_unarchive,
            modules::tasks::commands::task_delete,
            modules::tasks::commands::task_set_tags,
            modules::tasks::commands::checklist_add,
            modules::tasks::commands::checklist_update,
            modules::tasks::commands::checklist_toggle,
            modules::tasks::commands::checklist_reorder,
            modules::tasks::commands::checklist_delete,
            modules::tags::commands::tag_list,
            modules::tags::commands::tag_create,
            modules::tags::commands::tag_update,
            modules::tags::commands::tag_delete,
            modules::trash::commands::trash_list,
            modules::trash::commands::trash_restore,
            modules::trash::commands::trash_empty,
            modules::search::commands::search,
            modules::settings::commands::settings_get,
            modules::settings::commands::settings_update,
            modules::settings::commands::shortcut_register,
            modules::areas::commands::area_list,
            modules::areas::commands::area_create,
            modules::areas::commands::area_update,
            modules::areas::commands::area_reorder,
            modules::areas::commands::area_delete,
            system::commands::backup_now,
            system::commands::backup_list,
            system::commands::backup_restore,
            system::commands::export_json,
            system::commands::open_data_folder,
            system::commands::open_log_folder,
            system::commands::app_info,
            system::windows::app_quit,
        ])
        .run(tauri::generate_context!())
        .expect("không chạy được ứng dụng LifeHub");
}
