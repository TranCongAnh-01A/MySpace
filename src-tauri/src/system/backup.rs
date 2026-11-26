//! Sao lưu và khôi phục. Thư mục `backups/` là nguồn chuẩn; bảng `backups` chỉ là bản ghi
//! metadata và luôn được đồng bộ lại theo thư mục.
//!
//! Tên tệp: `lifehub-<reason-kebab>-<YYYYMMDD-HHMMSS>Z.db`.

use std::path::Path;

use chrono::{DateTime, Duration, NaiveDateTime, SecondsFormat, TimeZone, Utc};
use rusqlite::{params, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::clock::Clock;
use crate::error::{AppError, AppResult, ErrorCode};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub enum BackupReason {
    Manual,
    Daily,
    PreMigration,
    PreRestore,
}

impl BackupReason {
    const ALL: [Self; 4] = [
        Self::Manual,
        Self::Daily,
        Self::PreMigration,
        Self::PreRestore,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Manual => "Manual",
            Self::Daily => "Daily",
            Self::PreMigration => "PreMigration",
            Self::PreRestore => "PreRestore",
        }
    }

    fn kebab(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::Daily => "daily",
            Self::PreMigration => "pre-migration",
            Self::PreRestore => "pre-restore",
        }
    }

    /// Số bản giữ lại cho mỗi loại.
    pub fn keep(self) -> usize {
        match self {
            Self::Daily => 7,
            Self::Manual => 10,
            Self::PreMigration | Self::PreRestore => 3,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct Backup {
    pub file_name: String,
    pub reason: BackupReason,
    #[ts(type = "number")]
    pub size_bytes: u64,
    pub created_at: String,
}

const PREFIX: &str = "lifehub-";
const STAMP_FORMAT: &str = "%Y%m%d-%H%M%S";

pub fn file_name(reason: BackupReason, now: DateTime<Utc>) -> String {
    format!(
        "{PREFIX}{}-{}Z.db",
        reason.kebab(),
        now.format(STAMP_FORMAT)
    )
}

/// Đọc loại và thời điểm từ tên tệp; tên không khớp mẫu chuẩn → `None`.
pub fn parse_file_name(name: &str) -> Option<(BackupReason, DateTime<Utc>)> {
    let rest = name.strip_prefix(PREFIX)?.strip_suffix("Z.db")?;
    if rest.len() < 16 || !rest.is_char_boundary(rest.len() - 15) {
        return None;
    }
    let (kebab, stamp) = rest.split_at(rest.len() - 15);
    let kebab = kebab.strip_suffix('-')?;
    let reason = BackupReason::ALL.into_iter().find(|r| r.kebab() == kebab)?;
    let naive = NaiveDateTime::parse_from_str(stamp, STAMP_FORMAT).ok()?;
    Some((reason, Utc.from_utc_datetime(&naive)))
}

fn iso(t: DateTime<Utc>) -> String {
    t.to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// Tạo bản sao lưu bằng `VACUUM INTO`, ghi metadata, dọn bản cũ.
pub fn create(
    conn: &Connection,
    dir: &Path,
    reason: BackupReason,
    clock: &dyn Clock,
) -> AppResult<Backup> {
    std::fs::create_dir_all(dir)?;
    let now = clock.now();
    let name = file_name(reason, now);
    let target = dir.join(&name);
    if target.exists() {
        return Err(AppError::new(
            ErrorCode::Conflict,
            "Vừa có một bản sao lưu cùng loại trong giây này, hãy thử lại sau",
        ));
    }
    conn.execute("VACUUM INTO ?1", [target.to_string_lossy().as_ref()])?;
    let size = std::fs::metadata(&target)?.len();
    let backup = Backup {
        file_name: name,
        reason,
        size_bytes: size,
        created_at: iso(now),
    };
    record(conn, &backup)?;
    prune(conn, dir, reason)?;
    tracing::info!(file = %backup.file_name, size, "đã sao lưu");
    Ok(backup)
}

fn record(conn: &Connection, b: &Backup) -> AppResult<()> {
    conn.execute(
        "INSERT INTO backups (id, file_name, reason, size_bytes, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (file_name) DO UPDATE SET size_bytes = excluded.size_bytes",
        params![
            crate::ids::new_id(),
            b.file_name,
            b.reason.as_str(),
            i64::try_from(b.size_bytes).unwrap_or(i64::MAX),
            b.created_at
        ],
    )?;
    Ok(())
}

/// Quét thư mục, trả về các bản sao lưu hợp lệ (mới nhất trước). Không đụng DB.
fn scan(dir: &Path) -> AppResult<Vec<Backup>> {
    let mut found = Vec::new();
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(found),
        Err(e) => return Err(e.into()),
    };
    for entry in entries {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let Some((reason, at)) = parse_file_name(&name) else {
            continue;
        };
        if !entry.file_type()?.is_file() {
            continue;
        }
        found.push(Backup {
            file_name: name,
            reason,
            size_bytes: entry.metadata()?.len(),
            created_at: iso(at),
        });
    }
    found.sort_by(|a, b| b.file_name.cmp(&a.file_name));
    found.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(found)
}

/// Đồng bộ bảng `backups` theo thư mục: thêm dòng còn thiếu, xoá dòng không còn tệp.
pub fn sync(conn: &Connection, dir: &Path) -> AppResult<Vec<Backup>> {
    let on_disk = scan(dir)?;
    for b in &on_disk {
        record(conn, b)?;
    }
    let known: Vec<String> = conn
        .prepare("SELECT file_name FROM backups")?
        .query_map([], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    for name in known {
        if !on_disk.iter().any(|b| b.file_name == name) {
            conn.execute("DELETE FROM backups WHERE file_name = ?1", [name])?;
        }
    }
    Ok(on_disk)
}

pub fn list(conn: &Connection, dir: &Path) -> AppResult<Vec<Backup>> {
    sync(conn, dir)
}

/// Giữ số bản mới nhất theo từng loại, xoá phần còn lại (tệp và dòng metadata).
fn prune(conn: &Connection, dir: &Path, reason: BackupReason) -> AppResult<()> {
    let of_kind: Vec<Backup> = scan(dir)?
        .into_iter()
        .filter(|b| b.reason == reason)
        .collect();
    for old in of_kind.iter().skip(reason.keep()) {
        if let Err(e) = std::fs::remove_file(dir.join(&old.file_name)) {
            tracing::warn!(file = %old.file_name, error = %e, "không xoá được bản sao lưu cũ");
            continue;
        }
        conn.execute("DELETE FROM backups WHERE file_name = ?1", [&old.file_name])?;
    }
    Ok(())
}

/// Sau khi mở DB: đưa các bản sao lưu có sẵn (kể cả pre-migration, tạo trước khi bảng
/// `backups` có) vào metadata và dọn bản cũ.
pub fn register_existing(conn: &Connection, dir: &Path) -> AppResult<()> {
    sync(conn, dir)?;
    for reason in BackupReason::ALL {
        prune(conn, dir, reason)?;
    }
    Ok(())
}

/// Tạo bản `Daily` nếu 24 giờ qua chưa có bản nào. Trả `true` nếu vừa tạo.
pub fn ensure_daily(conn: &Connection, dir: &Path, clock: &dyn Clock) -> AppResult<bool> {
    let cutoff = clock.now() - Duration::hours(24);
    let recent = scan(dir)?
        .iter()
        .any(|b| b.reason == BackupReason::Daily && b.created_at >= iso(cutoff));
    if recent {
        return Ok(false);
    }
    create(conn, dir, BackupReason::Daily, clock)?;
    Ok(true)
}

/// Tên tệp hợp lệ để khôi phục: đúng mẫu chuẩn, không chứa đường dẫn.
fn validate_restore_name(name: &str) -> AppResult<()> {
    let plain = !name.contains(['/', '\\'])
        && !name.contains("..")
        && Path::new(name).components().count() == 1;
    if !plain || parse_file_name(name).is_none() {
        return Err(AppError::validation("Tên tệp sao lưu không hợp lệ"));
    }
    Ok(())
}

/// Khôi phục DB đang mở từ một bản sao lưu (chép nội dung vào kết nối hiện có, không tráo tệp).
/// Trước đó tạo bản `PreRestore`; sau đó chạy lại migration vì bản sao lưu có thể cũ hơn.
/// Gọi xong thì phía gọi phải khởi động lại app.
pub fn restore(
    conn: &mut Connection,
    dir: &Path,
    clock: &dyn Clock,
    file_name: &str,
) -> AppResult<()> {
    validate_restore_name(file_name)?;
    let path = dir.join(file_name);
    if !path.is_file() {
        return Err(AppError::new(
            ErrorCode::NotFound,
            "Không tìm thấy bản sao lưu",
        ));
    }
    let corrupt = |detail: String| {
        let mut e = AppError::validation("Bản sao lưu bị hỏng hoặc không phải dữ liệu LifeHub");
        e.details = Some(detail);
        e
    };
    let source = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| corrupt(e.to_string()))?;
    let verdict: String = source
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(|e| corrupt(e.to_string()))?;
    if verdict != "ok" {
        return Err(corrupt(verdict));
    }
    let has_workspaces: i64 = source
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'workspaces'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| corrupt(e.to_string()))?;
    if has_workspaces == 0 {
        return Err(corrupt("thiếu bảng workspaces".into()));
    }

    create(conn, dir, BackupReason::PreRestore, clock)?;
    {
        let backup = rusqlite::backup::Backup::new(&source, conn)?;
        backup.run_to_completion(64, std::time::Duration::from_millis(5), None)?;
    }
    crate::db::migrations::run(conn)?;
    sync(conn, dir)?;
    tracing::info!(file = file_name, "đã khôi phục từ bản sao lưu");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clock::FixedClock;
    use crate::db;
    use crate::ids;

    fn temp_dir() -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("lifehub-backup-{}", ids::new_id()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn at(h: u32, m: u32, s: u32) -> FixedClock {
        FixedClock(Utc.with_ymd_and_hms(2026, 11, 26, h, m, s).unwrap())
    }

    fn area_names(conn: &Connection) -> Vec<String> {
        conn.prepare("SELECT name FROM areas ORDER BY name")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .map(Result::unwrap)
            .collect()
    }

    fn add_area(conn: &Connection, name: &str) {
        conn.execute(
            "INSERT INTO areas (id, workspace_id, name, sort_key, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'V', 't', 't')",
            params![ids::new_id(), ids::DEFAULT_WORKSPACE_ID, name],
        )
        .unwrap();
    }

    #[test]
    fn file_name_round_trips() {
        let t = Utc.with_ymd_and_hms(2026, 11, 26, 2, 15, 0).unwrap();
        let name = file_name(BackupReason::PreMigration, t);
        assert_eq!(name, "lifehub-pre-migration-20261126-021500Z.db");
        assert_eq!(
            parse_file_name(&name),
            Some((BackupReason::PreMigration, t))
        );
        for r in BackupReason::ALL {
            assert_eq!(parse_file_name(&file_name(r, t)), Some((r, t)));
        }
    }

    #[test]
    fn parse_rejects_foreign_names() {
        for n in [
            "lifehub.db",
            "lifehub-manual-20261126.db",
            "lifehub-lạ-20261126-021500Z.db",
            "lifehub-manual-20261326-021500Z.db",
            "../lifehub-manual-20261126-021500Z.db",
            "pre-migration-20261126T010203Z.db",
            "",
        ] {
            assert!(parse_file_name(n).is_none(), "{n}");
        }
    }

    #[test]
    fn create_writes_file_and_metadata() {
        let conn = db::open_in_memory().unwrap();
        let dir = temp_dir();
        let b = create(&conn, &dir, BackupReason::Manual, &at(1, 2, 3)).unwrap();
        assert_eq!(b.file_name, "lifehub-manual-20261126-010203Z.db");
        assert!(b.size_bytes > 0 && dir.join(&b.file_name).is_file());
        assert_eq!(b.created_at, "2026-11-26T01:02:03.000Z");
        let n: i64 = conn
            .query_row("SELECT count(*) FROM backups", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
        // Cùng loại, cùng giây → từ chối thay vì ghi đè.
        assert_eq!(
            create(&conn, &dir, BackupReason::Manual, &at(1, 2, 3))
                .unwrap_err()
                .code,
            ErrorCode::Conflict
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn list_is_newest_first_and_syncs_with_folder() {
        let conn = db::open_in_memory().unwrap();
        let dir = temp_dir();
        let a = create(&conn, &dir, BackupReason::Manual, &at(1, 0, 0)).unwrap();
        let b = create(&conn, &dir, BackupReason::Daily, &at(2, 0, 0)).unwrap();
        // Tệp bị xoá tay → mất khỏi danh sách và metadata.
        std::fs::remove_file(dir.join(&a.file_name)).unwrap();
        // Tệp thả vào thư mục (hoặc pre-migration) → được thêm; tệp lạ bị bỏ qua.
        std::fs::copy(
            dir.join(&b.file_name),
            dir.join("lifehub-pre-migration-20261126-030000Z.db"),
        )
        .unwrap();
        std::fs::write(dir.join("ghi-chu.txt"), "x").unwrap();

        let names: Vec<_> = list(&conn, &dir)
            .unwrap()
            .into_iter()
            .map(|b| b.file_name)
            .collect();
        assert_eq!(
            names,
            [
                "lifehub-pre-migration-20261126-030000Z.db",
                "lifehub-daily-20261126-020000Z.db"
            ]
        );
        let rows: i64 = conn
            .query_row("SELECT count(*) FROM backups", [], |r| r.get(0))
            .unwrap();
        assert_eq!(rows, 2);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn retention_keeps_newest_per_kind() {
        let conn = db::open_in_memory().unwrap();
        let dir = temp_dir();
        for s in 0..12 {
            create(&conn, &dir, BackupReason::Manual, &at(1, 0, s)).unwrap();
        }
        for s in 0..9 {
            create(&conn, &dir, BackupReason::Daily, &at(2, 0, s)).unwrap();
        }
        for s in 0..5 {
            create(&conn, &dir, BackupReason::PreRestore, &at(3, 0, s)).unwrap();
        }
        let all = list(&conn, &dir).unwrap();
        let count = |r| all.iter().filter(|b| b.reason == r).count();
        assert_eq!(count(BackupReason::Manual), 10);
        assert_eq!(count(BackupReason::Daily), 7);
        assert_eq!(count(BackupReason::PreRestore), 3);
        // Bản giữ lại là bản mới nhất.
        assert!(all.iter().any(|b| b.file_name
            == file_name(
                BackupReason::Manual,
                Utc.with_ymd_and_hms(2026, 11, 26, 1, 0, 11).unwrap()
            )));
        assert!(!all.iter().any(|b| b.file_name
            == file_name(
                BackupReason::Manual,
                Utc.with_ymd_and_hms(2026, 11, 26, 1, 0, 0).unwrap()
            )));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn ensure_daily_creates_once_per_24h() {
        let conn = db::open_in_memory().unwrap();
        let dir = temp_dir();
        assert!(ensure_daily(&conn, &dir, &at(8, 0, 0)).unwrap());
        assert!(!ensure_daily(&conn, &dir, &at(20, 0, 0)).unwrap());
        let next_day = FixedClock(Utc.with_ymd_and_hms(2026, 11, 27, 8, 0, 1).unwrap());
        assert!(ensure_daily(&conn, &dir, &next_day).unwrap());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn backup_modify_restore_returns_to_original() {
        let mut conn = db::open_in_memory().unwrap();
        let dir = temp_dir();
        add_area(&conn, "Sức khoẻ");
        add_area(&conn, "Tài chính");
        let b = create(&conn, &dir, BackupReason::Manual, &at(1, 0, 0)).unwrap();

        conn.execute("DELETE FROM areas WHERE name = 'Sức khoẻ'", [])
            .unwrap();
        add_area(&conn, "Mới thêm sau sao lưu");
        assert_eq!(area_names(&conn), ["Mới thêm sau sao lưu", "Tài chính"]);

        restore(&mut conn, &dir, &at(2, 0, 0), &b.file_name).unwrap();

        assert_eq!(area_names(&conn), ["Sức khoẻ", "Tài chính"]);
        // Có bản PreRestore chứa trạng thái trước khi khôi phục.
        let pre = list(&conn, &dir)
            .unwrap()
            .into_iter()
            .find(|b| b.reason == BackupReason::PreRestore)
            .expect("thiếu bản PreRestore");
        let snap = Connection::open(dir.join(pre.file_name)).unwrap();
        assert_eq!(area_names(&snap), ["Mới thêm sau sao lưu", "Tài chính"]);
        drop(snap); // Windows không xoá được thư mục khi tệp còn mở
                    // Kết nối vẫn dùng được và pragma còn nguyên.
        let fk: i64 = conn
            .query_row("PRAGMA foreign_keys", [], |r| r.get(0))
            .unwrap();
        assert_eq!(fk, 1);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn restore_rejects_bad_names_missing_and_corrupt_files() {
        let mut conn = db::open_in_memory().unwrap();
        let dir = temp_dir();
        let code = |r: AppResult<()>| r.unwrap_err().code;
        for bad in [
            "../lifehub-manual-20261126-010000Z.db",
            "..\\lifehub-manual-20261126-010000Z.db",
            "sub/lifehub-manual-20261126-010000Z.db",
            "lifehub.db",
            "",
        ] {
            assert_eq!(
                code(restore(&mut conn, &dir, &at(1, 0, 0), bad)),
                ErrorCode::Validation,
                "{bad}"
            );
        }
        assert_eq!(
            code(restore(
                &mut conn,
                &dir,
                &at(1, 0, 0),
                "lifehub-manual-20261126-010000Z.db"
            )),
            ErrorCode::NotFound
        );
        // Tệp hỏng.
        std::fs::write(
            dir.join("lifehub-manual-20261126-010000Z.db"),
            b"day khong phai sqlite, chi la rac rac rac rac rac rac rac rac",
        )
        .unwrap();
        assert_eq!(
            code(restore(
                &mut conn,
                &dir,
                &at(1, 0, 0),
                "lifehub-manual-20261126-010000Z.db"
            )),
            ErrorCode::Validation
        );
        // SQLite hợp lệ nhưng không phải dữ liệu LifeHub.
        let other = Connection::open(dir.join("lifehub-manual-20261126-020000Z.db")).unwrap();
        other.execute("CREATE TABLE x (a)", []).unwrap();
        drop(other);
        assert_eq!(
            code(restore(
                &mut conn,
                &dir,
                &at(1, 0, 0),
                "lifehub-manual-20261126-020000Z.db"
            )),
            ErrorCode::Validation
        );
        // DB đang mở vẫn nguyên vẹn sau các lần thất bại.
        assert!(!area_names(&conn).contains(&"x".to_string()));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn restore_keeps_schema_up_to_date() {
        let mut conn = db::open_in_memory().unwrap();
        let dir = temp_dir();
        let b = create(&conn, &dir, BackupReason::Manual, &at(1, 0, 0)).unwrap();
        restore(&mut conn, &dir, &at(2, 0, 0), &b.file_name).unwrap();
        let v: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert!(v >= 1);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
