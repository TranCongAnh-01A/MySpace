pub mod backup;
pub mod commands;
#[cfg(all(test, debug_assertions))]
mod data_tests;
#[cfg(debug_assertions)]
pub mod demo;
pub mod export;
pub mod shortcut;
pub mod tray;
pub mod windows;

use std::ffi::OsString;
use std::path::PathBuf;

/// Chọn thư mục dữ liệu. `override_dir` (từ `LIFEHUB_DATA_DIR`) chỉ được dùng khi `allow_override`
/// là `true`; bản release luôn truyền `false` nên không thể bị chuyển hướng dữ liệu.
pub fn pick_data_dir(
    default: PathBuf,
    override_dir: Option<OsString>,
    allow_override: bool,
) -> PathBuf {
    match override_dir {
        Some(dir) if allow_override && !dir.is_empty() => PathBuf::from(dir),
        _ => default,
    }
}

/// Thư mục dữ liệu thực dùng: ở bản debug, `LIFEHUB_DATA_DIR` thay cho thư mục mặc định (E2E).
pub fn resolve_data_dir(default: PathBuf) -> PathBuf {
    pick_data_dir(
        default,
        std::env::var_os("LIFEHUB_DATA_DIR"),
        cfg!(debug_assertions),
    )
}

/// `true` khi chạy E2E: bản debug, có `LIFEHUB_E2E=1`. Bản release luôn `false`.
pub fn e2e_mode() -> bool {
    cfg!(debug_assertions) && std::env::var("LIFEHUB_E2E").is_ok_and(|v| v == "1")
}

/// Bản debug có `LIFEHUB_DATA_DIR`: dùng dữ liệu tách biệt nên không được tranh single-instance
/// và file trạng thái cửa sổ với app thật đang chạy. Bản release luôn `false`.
pub fn isolated_run() -> bool {
    cfg!(debug_assertions) && std::env::var_os("LIFEHUB_DATA_DIR").is_some_and(|v| !v.is_empty())
}

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn debug_build_uses_override() {
        let d = pick_data_dir("real".into(), Some("e2e".into()), true);
        assert_eq!(d, PathBuf::from("e2e"));
    }

    #[test]
    fn release_build_ignores_override() {
        let d = pick_data_dir("real".into(), Some("e2e".into()), false);
        assert_eq!(d, PathBuf::from("real"));
    }

    #[test]
    fn empty_or_missing_override_keeps_default() {
        assert_eq!(
            pick_data_dir("real".into(), Some("".into()), true),
            PathBuf::from("real")
        );
        assert_eq!(
            pick_data_dir("real".into(), None, true),
            PathBuf::from("real")
        );
    }
}
