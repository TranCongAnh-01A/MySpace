use std::sync::RwLock;

use tauri::{AppHandle, State};
use tauri_plugin_autostart::ManagerExt;

use crate::clock::SystemClock;
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::modules::emit_entity_changed;
use crate::system::shortcut;

use super::application;
use super::domain::{AppSettings, SettingsPatch};
use super::infrastructure::SqliteSettingsRepository;

/// Bản sao cài đặt trong bộ nhớ để chỗ khác (đóng cửa sổ, khởi động) đọc nhanh.
pub struct SettingsState(RwLock<AppSettings>);

impl SettingsState {
    pub fn new(settings: AppSettings) -> Self {
        Self(RwLock::new(settings))
    }

    pub fn get(&self) -> AppSettings {
        self.0
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    fn set(&self, settings: AppSettings) {
        *self
            .0
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = settings;
    }
}

fn set_autostart(app: &AppHandle, enabled: bool) -> AppResult<()> {
    let manager = app.autolaunch();
    let result = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };
    result.map_err(|e| {
        let mut err = AppError::internal("Không đổi được chế độ khởi động cùng Windows");
        err.details = Some(e.to_string());
        err
    })
}

/// Dùng chung cho `settings_update` và `shortcut_register`:
/// kiểm tra → hiệu ứng phụ (phím tắt, autostart) → lưu trong transaction → cập nhật state → event.
/// Hiệu ứng nào hoặc bước lưu thất bại thì các hiệu ứng trước đó được hoàn tác.
fn apply_update(
    app: &AppHandle,
    db: &Db,
    state: &SettingsState,
    patch: SettingsPatch,
) -> AppResult<AppSettings> {
    let current = state.get();
    let next = current.apply(&patch)?;

    let shortcut_changed = next.quick_capture_shortcut != current.quick_capture_shortcut;
    if shortcut_changed {
        shortcut::change(
            app,
            &current.quick_capture_shortcut,
            &next.quick_capture_shortcut,
        )?;
    }
    let revert_shortcut = || {
        if shortcut_changed {
            let _ = shortcut::change(
                app,
                &next.quick_capture_shortcut,
                &current.quick_capture_shortcut,
            );
        }
    };

    let autostart_changed = next.launch_at_startup != current.launch_at_startup;
    if autostart_changed {
        if let Err(e) = set_autostart(app, next.launch_at_startup) {
            revert_shortcut();
            return Err(e);
        }
    }

    let saved = (|| {
        let mut conn = db.lock()?;
        let tx = conn.transaction()?;
        let saved = application::update(
            &SqliteSettingsRepository::new(&tx),
            &SystemClock,
            &current,
            &patch,
        )?;
        tx.commit()?;
        Ok::<_, AppError>(saved)
    })();
    let saved = match saved {
        Ok(s) => s,
        Err(e) => {
            revert_shortcut();
            if autostart_changed {
                let _ = set_autostart(app, current.launch_at_startup);
            }
            return Err(e);
        }
    };

    state.set(saved.clone());
    emit_entity_changed(app, "settings", vec![]);
    Ok(saved)
}

#[tauri::command]
pub fn settings_get(state: State<'_, SettingsState>) -> AppSettings {
    state.get()
}

#[tauri::command]
pub fn settings_update(
    app: AppHandle,
    db: State<'_, Db>,
    state: State<'_, SettingsState>,
    patch: SettingsPatch,
) -> AppResult<AppSettings> {
    apply_update(&app, &db, &state, patch)
}

#[tauri::command]
pub fn shortcut_register(
    app: AppHandle,
    db: State<'_, Db>,
    state: State<'_, SettingsState>,
    accelerator: String,
) -> AppResult<AppSettings> {
    let patch = SettingsPatch {
        quick_capture_shortcut: Some(accelerator),
        ..Default::default()
    };
    apply_update(&app, &db, &state, patch)
}
