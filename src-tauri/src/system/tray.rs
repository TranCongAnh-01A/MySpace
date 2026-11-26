use chrono::Utc;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Listener, Manager};

use crate::clock::SystemClock;
use crate::db::Db;
use crate::modules::dashboard::application as dashboard;
use crate::modules::settings::commands::SettingsState;
use crate::modules::tasks::timectx::TimeCtx;
use crate::reminders::scheduler::SchedulerHandle;

use super::windows::{navigate, request_exit, show_main, show_quick_capture};

const TRAY_ID: &str = "main";
const TASK_PREFIX: &str = "task:";
const MAX_TRAY_TASKS: usize = 5;

/// (id, tiêu đề) của tối đa 5 Task đầu trong "Hôm nay".
fn today_tasks(app: &AppHandle) -> Vec<(String, String)> {
    let (Some(db), Some(settings)) = (app.try_state::<Db>(), app.try_state::<SettingsState>())
    else {
        return Vec::new();
    };
    let Ok(conn) = db.lock() else {
        return Vec::new();
    };
    let ctx = TimeCtx::new(&settings.get().timezone, Utc::now());
    dashboard::today(&conn, &SystemClock, &ctx)
        .map(|v| {
            v.today
                .into_iter()
                .take(MAX_TRAY_TASKS)
                .map(|t| (t.id, t.title))
                .collect()
        })
        .unwrap_or_default()
}

fn shorten(title: &str) -> String {
    let t: String = title.chars().take(50).collect();
    if title.chars().count() > 50 {
        format!("{t}…")
    } else {
        t
    }
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let open = MenuItem::with_id(app, "open", "Mở LifeHub", true, None::<&str>)?;
    let capture = MenuItem::with_id(app, "capture", "Ghi nhanh", true, None::<&str>)?;

    let today = Submenu::with_id(app, "today", "Việc hôm nay", true)?;
    let tasks = today_tasks(app);
    if tasks.is_empty() {
        today.append(&MenuItem::with_id(
            app,
            "today-empty",
            "Không có việc nào",
            false,
            None::<&str>,
        )?)?;
    }
    for (id, title) in tasks {
        today.append(&MenuItem::with_id(
            app,
            format!("{TASK_PREFIX}{id}"),
            shorten(&title),
            true,
            None::<&str>,
        )?)?;
    }

    let paused = app
        .try_state::<SchedulerHandle>()
        .is_some_and(|h| h.is_paused());
    let pause = CheckMenuItem::with_id(
        app,
        "pause",
        "Tạm dừng thông báo",
        true,
        paused,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "Thoát", true, None::<&str>)?;
    Menu::with_items(
        app,
        &[
            &open,
            &capture,
            &today,
            &PredefinedMenuItem::separator(app)?,
            &pause,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )
}

/// Dựng lại menu khay (danh sách "Việc hôm nay" đổi theo dữ liệu).
pub fn refresh(app: &AppHandle) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    match build_menu(app) {
        Ok(menu) => {
            if let Err(e) = tray.set_menu(Some(menu)) {
                tracing::warn!(error = %e, "không cập nhật được menu khay");
            }
        }
        Err(e) => tracing::warn!(error = %e, "không dựng được menu khay"),
    }
}

/// Khay hệ thống: Mở, Ghi nhanh, Việc hôm nay, Tạm dừng thông báo, Thoát.
/// Bấm trái vào biểu tượng = mở cửa sổ chính.
pub fn init(app: &App) -> tauri::Result<()> {
    let menu = build_menu(app.handle())?;
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("LifeHub")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "capture" => show_quick_capture(app),
            "pause" => {
                // Ô đánh dấu tự đổi trạng thái khi bấm; trạng thái thật nằm ở scheduler.
                if let Some(h) = app.try_state::<SchedulerHandle>() {
                    h.set_paused(!h.is_paused());
                }
            }
            "quit" => request_exit(app),
            other => {
                if let Some(id) = other.strip_prefix(TASK_PREFIX) {
                    navigate(app, &format!("/tasks/{id}"));
                }
            }
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

    // Task đổi thì làm mới "Việc hôm nay".
    let handle = app.handle().clone();
    app.listen("entity-changed", move |event| {
        if event.payload().contains("\"entity\":\"task\"") {
            refresh(&handle);
        }
    });
    Ok(())
}
