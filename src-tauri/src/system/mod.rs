pub mod backup;
pub mod commands;
#[cfg(debug_assertions)]
pub mod demo;
pub mod export;
pub mod shortcut;
pub mod tray;
pub mod windows;

use std::path::PathBuf;

/// Các thư mục của app, tính một lần lúc khởi động.
#[derive(Debug, Clone)]
pub struct AppDirs {
    pub data: PathBuf,
    pub logs: PathBuf,
    pub backups: PathBuf,
}

impl AppDirs {
    pub fn new(data: PathBuf) -> Self {
        Self {
            logs: data.join("logs"),
            backups: data.join("backups"),
            data,
        }
    }
}
