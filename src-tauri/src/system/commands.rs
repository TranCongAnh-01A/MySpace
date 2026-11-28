//! Command hệ thống: sao lưu, xuất dữ liệu, mở thư mục, thông tin app.

use std::path::Path;

use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use ts_rs::TS;

use crate::clock::SystemClock;
use crate::db::Db;
use crate::error::{AppError, AppResult};

use super::backup::{self, Backup, BackupReason};
use super::{export, AppDirs};

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct AppInfo {
    pub version: String,
    pub data_dir: String,
    pub log_dir: String,
    pub backup_dir: String,
    /// Có tự kiểm tra cập nhật lúc khởi động không: chỉ bản release. Bản debug (kể cả E2E, `LIFEHUB_DATA_DIR`) không gọi mạng; ở bản release
    /// hai biến môi trường đó vô hiệu.
    pub auto_update_check: bool,
}

#[tauri::command]
pub fn backup_now(db: State<'_, Db>, dirs: State<'_, AppDirs>) -> AppResult<Backup> {
    let conn = db.lock()?;
    backup::create(&conn, &dirs.backups, BackupReason::Manual, &SystemClock)
}

#[tauri::command]
pub fn backup_list(db: State<'_, Db>, dirs: State<'_, AppDirs>) -> AppResult<Vec<Backup>> {
    let conn = db.lock()?;
    backup::list(&conn, &dirs.backups)
}

/// Khôi phục rồi khởi động lại app (lệnh này không trả về khi thành công).
#[tauri::command]
pub fn backup_restore(
    app: AppHandle,
    db: State<'_, Db>,
    dirs: State<'_, AppDirs>,
    file_name: String,
) -> AppResult<()> {
    {
        let mut conn = db.lock()?;
        backup::restore(&mut conn, &dirs.backups, &SystemClock, &file_name)?;
    }
    app.restart()
}

/// Hộp thoại lưu tệp mở từ phía Rust (frontend không có quyền `dialog`/`fs`).
/// Trả về đường dẫn đã ghi, hoặc `null` nếu người dùng huỷ.
#[tauri::command]
pub async fn export_json(app: AppHandle, db: State<'_, Db>) -> AppResult<Option<String>> {
    let json = {
        let conn = db.lock()?;
        let value = export::build(&conn, &app.package_info().version.to_string(), &SystemClock)?;
        serde_json::to_string_pretty(&value).map_err(|e| AppError::internal(e.to_string()))?
    };
    let suggested = format!(
        "lifehub-export-{}.json",
        chrono::Utc::now().format("%Y%m%d")
    );
    let dialog_app = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        dialog_app
            .dialog()
            .file()
            .set_file_name(suggested)
            .add_filter("JSON", &["json"])
            .blocking_save_file()
    })
    .await
    .map_err(|e| AppError::internal(e.to_string()))?;
    let Some(file) = picked else {
        return Ok(None);
    };
    let path = file
        .into_path()
        .map_err(|e| AppError::internal(e.to_string()))?;
    std::fs::write(&path, json)?;
    tracing::info!("đã xuất dữ liệu ra JSON");
    Ok(Some(path.to_string_lossy().into_owned()))
}

fn open_dir(app: &AppHandle, dir: &Path) -> AppResult<()> {
    std::fs::create_dir_all(dir)?;
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(|e| {
            let mut err = AppError::new(crate::error::ErrorCode::Io, "Không mở được thư mục");
            err.details = Some(e.to_string());
            err
        })
}

#[tauri::command]
pub fn open_data_folder(app: AppHandle, dirs: State<'_, AppDirs>) -> AppResult<()> {
    open_dir(&app, &dirs.data)
}

#[tauri::command]
pub fn open_log_folder(app: AppHandle, dirs: State<'_, AppDirs>) -> AppResult<()> {
    open_dir(&app, &dirs.logs)
}

#[tauri::command]
pub fn app_info(app: AppHandle, dirs: State<'_, AppDirs>) -> AppInfo {
    let s = |p: &Path| p.to_string_lossy().into_owned();
    AppInfo {
        version: app.package_info().version.to_string(),
        data_dir: s(&dirs.data),
        log_dir: s(&dirs.logs),
        backup_dir: s(&dirs.backups),
        auto_update_check: !cfg!(debug_assertions),
    }
}

/// Frontend gọi một lần sau khi vẽ xong Today lần đầu (đo `startup_ms`).
#[tauri::command]
pub fn app_ready() {
    super::log_startup_ready();
}
