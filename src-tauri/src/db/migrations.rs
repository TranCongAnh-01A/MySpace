use std::path::Path;

use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};

use crate::clock::Clock;
use crate::error::AppResult;

/// Danh sách migration theo thứ tự. Thêm file mới ở cuối mảng.
const SCRIPTS: &[&str] = &[include_str!("../../migrations/001_init.sql")];

pub fn migrations() -> Migrations<'static> {
    Migrations::new(SCRIPTS.iter().map(|s| M::up(s)).collect())
}

/// Số migration đã chạy (lưu trong `PRAGMA user_version`).
fn user_version(conn: &Connection) -> AppResult<usize> {
    let v: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    Ok(usize::try_from(v).unwrap_or(0))
}

/// DB đã có dữ liệu và còn migration chưa chạy?
pub fn needs_backup(conn: &Connection) -> AppResult<bool> {
    let v = user_version(conn)?;
    Ok(v > 0 && v < SCRIPTS.len())
}

/// Chép DB sang `<dir>/pre-migration-<UTC>.db` bằng `VACUUM INTO`.
pub fn backup_pre_migration(conn: &Connection, dir: &Path, clock: &dyn Clock) -> AppResult<()> {
    std::fs::create_dir_all(dir)?;
    let stamp = clock.now().format("%Y%m%dT%H%M%SZ");
    let target = dir.join(format!("pre-migration-{stamp}.db"));
    conn.execute("VACUUM INTO ?1", [target.to_string_lossy().as_ref()])?;
    Ok(())
}

pub fn run(conn: &mut Connection) -> AppResult<()> {
    migrations().to_latest(conn)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clock::FixedClock;
    use crate::db;
    use chrono::{TimeZone, Utc};

    fn table_names(conn: &Connection) -> Vec<String> {
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table'")
            .unwrap();
        stmt.query_map([], |r| r.get::<_, String>(0))
            .unwrap()
            .map(Result::unwrap)
            .collect()
    }

    #[test]
    fn migration_creates_all_tables() {
        let conn = db::open_in_memory().unwrap();
        let tables = table_names(&conn);
        for t in [
            "workspaces",
            "settings",
            "areas",
            "projects",
            "milestones",
            "recurrence_series",
            "tasks",
            "checklist_items",
            "tags",
            "task_tags",
            "notes",
            "note_tags",
            "note_tasks",
            "inbox_items",
            "calendars",
            "events",
            "reminders",
            "search_index",
            "search_map",
            "change_log",
            "backups",
        ] {
            assert!(tables.iter().any(|n| n == t), "thiếu bảng {t}");
        }
    }

    #[test]
    fn foreign_keys_are_on() {
        let conn = db::open_in_memory().unwrap();
        let fk: i64 = conn
            .query_row("PRAGMA foreign_keys", [], |r| r.get(0))
            .unwrap();
        assert_eq!(fk, 1);
    }

    #[test]
    fn fts5_is_available() {
        let conn = db::open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO search_index (title, body) VALUES ('Nhắc nhở', 'nội dung')",
            [],
        )
        .unwrap();
        let hits: i64 = conn
            .query_row(
                "SELECT count(*) FROM search_index WHERE search_index MATCH 'nhac'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(hits, 1);
    }

    #[test]
    fn needs_backup_only_for_partially_migrated_db() {
        let mut conn = Connection::open_in_memory().unwrap();
        assert!(!needs_backup(&conn).unwrap(), "DB mới không cần backup");
        run(&mut conn).unwrap();
        assert!(!needs_backup(&conn).unwrap(), "đã ở bản mới nhất");
    }

    #[test]
    fn backup_creates_file() {
        let conn = db::open_in_memory().unwrap();
        let dir = std::env::temp_dir().join(format!("lifehub-test-{}", crate::ids::new_id()));
        let clock = FixedClock(Utc.with_ymd_and_hms(2026, 11, 26, 1, 2, 3).unwrap());
        backup_pre_migration(&conn, &dir, &clock).unwrap();
        assert!(dir.join("pre-migration-20261126T010203Z.db").exists());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
