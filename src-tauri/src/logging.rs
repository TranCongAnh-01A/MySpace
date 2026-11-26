//! Log ra tệp xoay vòng theo ngày: `<data>/logs/lifehub.<ngày>.log`, giữ 7 tệp.
//! Không log nội dung người dùng (Inbox, tiêu đề): chỉ log id và mã lỗi.

use std::path::Path;

use tracing_appender::non_blocking::WorkerGuard;
use tracing_appender::rolling::{Builder, Rotation};
use tracing_subscriber::fmt::writer::MakeWriterExt;
use tracing_subscriber::EnvFilter;

/// Giữ guard của log trong state của Tauri tới khi app thoát.
pub struct LogGuard(#[allow(dead_code)] pub WorkerGuard);

/// Khởi tạo log. Giữ `WorkerGuard` trả về tới khi app thoát (rơi guard = mất log chưa ghi).
pub fn init(log_dir: &Path) -> Result<WorkerGuard, String> {
    std::fs::create_dir_all(log_dir).map_err(|e| e.to_string())?;
    let appender = Builder::new()
        .rotation(Rotation::DAILY)
        .filename_prefix("lifehub")
        .filename_suffix("log")
        .max_log_files(7)
        .build(log_dir)
        .map_err(|e| e.to_string())?;
    let (file_writer, guard) = tracing_appender::non_blocking(appender);

    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        EnvFilter::new(if cfg!(debug_assertions) {
            "lifehub_lib=debug,info"
        } else {
            "info"
        })
    });
    let builder = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_ansi(false);

    // Bản dev ghi thêm ra stdout.
    let result = if cfg!(debug_assertions) {
        builder
            .with_writer(file_writer.and(std::io::stdout))
            .try_init()
    } else {
        builder.with_writer(file_writer).try_init()
    };
    result.map_err(|e| e.to_string())?;
    Ok(guard)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_log_file_into_dir() {
        let dir = std::env::temp_dir().join(format!("lifehub-log-{}", crate::ids::new_id()));
        let guard = init(&dir).unwrap();
        tracing::info!("kiểm tra log");
        drop(guard); // flush
        let files: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert!(
            files
                .iter()
                .any(|f| f.starts_with("lifehub") && f.ends_with(".log")),
            "{files:?}"
        );
        let content = std::fs::read_to_string(dir.join(&files[0])).unwrap();
        assert!(content.contains("kiểm tra log"));
        let _ = std::fs::remove_dir_all(dir);
    }
}
