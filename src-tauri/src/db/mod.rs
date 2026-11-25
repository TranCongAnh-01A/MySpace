pub mod migrations;

use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use rusqlite::Connection;

use crate::clock::Clock;
use crate::error::{AppError, AppResult};

/// Một kết nối duy nhất, dùng chung qua state của Tauri.
pub struct Db(Mutex<Connection>);

impl Db {
    pub fn new(conn: Connection) -> Self {
        Self(Mutex::new(conn))
    }

    pub fn lock(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.0
            .lock()
            .map_err(|_| AppError::internal("Kết nối cơ sở dữ liệu bị khoá"))
    }
}

fn apply_pragmas(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;
         PRAGMA busy_timeout = 5000;
         PRAGMA synchronous = NORMAL;",
    )?;
    Ok(())
}

/// Mở `lifehub.db` tại `path`, đặt pragma, sao lưu trước khi migrate rồi chạy migration.
pub fn open(path: &Path, backups_dir: &Path, clock: &dyn Clock) -> AppResult<Connection> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut conn = Connection::open(path)?;
    apply_pragmas(&conn)?;
    if migrations::needs_backup(&conn)? {
        migrations::backup_pre_migration(&conn, backups_dir, clock)?;
    }
    migrations::run(&mut conn)?;
    Ok(conn)
}

/// DB in-memory đã migrate xong (dùng cho test).
#[cfg(test)]
pub fn open_in_memory() -> AppResult<Connection> {
    let mut conn = Connection::open_in_memory()?;
    apply_pragmas(&conn)?;
    migrations::run(&mut conn)?;
    Ok(conn)
}
