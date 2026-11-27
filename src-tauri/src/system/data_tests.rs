//! Test dữ liệu trên file DB thật (không in-memory): nâng cấp từ DB của bản trước,
//! sao lưu rồi khôi phục. Chạy trong `cargo test`.

use std::path::{Path, PathBuf};

use chrono::{TimeZone, Utc};
use rusqlite::Connection;

use crate::clock::{Clock, FixedClock};
use crate::db;
use crate::ids;
use crate::modules::calendar::application as calendar_app;
use crate::modules::calendar::domain::EventCreate;
use crate::modules::notes::application as notes_app;
use crate::modules::notes::domain::NoteCreate;
use crate::modules::notes::infrastructure::SqliteNoteRepository;
use crate::modules::projects::application as projects_app;
use crate::modules::projects::infrastructure::SqliteProjectRepository;
use crate::modules::search::application as search_app;
use crate::modules::search::infrastructure::SearchKind;
use crate::modules::tasks::timectx::TimeCtx;
use crate::reminders::application as reminders_app;
use crate::reminders::domain::ReminderSet;
use crate::system::backup::{self, BackupReason};
use crate::system::demo;

const FIXTURE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/tests/fixtures/lifehub_v0.5.0.db"
);

fn clock() -> FixedClock {
    FixedClock(Utc.with_ymd_and_hms(2026, 11, 27, 3, 0, 0).unwrap())
}

fn temp_dir() -> PathBuf {
    let d = std::env::temp_dir().join(format!("lifehub-data-{}", ids::new_id()));
    std::fs::create_dir_all(&d).unwrap();
    d
}

/// `from` có thể kèm điều kiện: `count(&conn, "tasks WHERE title = 'x'")`.
fn count(conn: &Connection, from: &str) -> i64 {
    conn.query_row(&format!("SELECT count(*) FROM {from}"), [], |r| r.get(0))
        .unwrap()
}

fn text(conn: &Connection, sql: &str) -> String {
    conn.query_row(sql, [], |r| r.get(0)).unwrap()
}

fn add_note(conn: &Connection, c: &FixedClock, title: &str) {
    notes_app::create(
        &SqliteNoteRepository::new(conn, c),
        &c.now_iso(),
        &NoteCreate {
            title: Some(title.into()),
            ..Default::default()
        },
    )
    .unwrap();
}

/// Sinh `tests/fixtures/lifehub_v0.5.0.db`: migration hiện tại + dữ liệu mẫu + 1 Event có
/// reminder + 1 Note. Chạy một lần rồi commit file:
/// `cargo test generate_fixture -- --ignored`. Từ đó file là "DB của bản trước".
#[test]
#[ignore = "chỉ chạy tay để sinh fixture"]
fn generate_fixture() {
    let dir = temp_dir();
    let c = clock();
    let ctx = TimeCtx::new("Asia/Ho_Chi_Minh", c.0);
    let mut conn = db::open(&dir.join("src.db"), &dir.join("backups"), &c).unwrap();
    {
        let tx = conn.transaction().unwrap();
        demo::seed(&tx, &c, &ctx).unwrap();
        tx.commit().unwrap();
    }
    let event = calendar_app::event_create(
        &conn,
        &c,
        &EventCreate {
            calendar_id: None,
            title: "Họp nhóm tuần".into(),
            description: None,
            is_all_day: false,
            start_at: Some("2026-12-01T02:00:00.000Z".into()),
            end_at: Some("2026-12-01T03:00:00.000Z".into()),
            start_date: None,
            end_date: None,
            task_id: None,
        },
    )
    .unwrap();
    reminders_app::set(
        &conn,
        &c,
        &ctx,
        &ReminderSet {
            event_id: Some(event.id),
            offset_minutes: Some(15),
            ..Default::default()
        },
    )
    .unwrap();
    add_note(&conn, &c, "Ghi chu của bản v0.5");

    let out = Path::new(FIXTURE);
    std::fs::create_dir_all(out.parent().unwrap()).unwrap();
    let _ = std::fs::remove_file(out);
    conn.execute("VACUUM INTO ?1", [out.to_string_lossy().as_ref()])
        .unwrap();
}

/// Mở fixture (DB của bản trước) bằng đúng đường đi của app: `db::open`.
///
/// Hiện chưa có migration nào sau v0.5.0 nên test này chỉ chứng minh fixture mở được và dữ
/// liệu nguyên vẹn. Nó bảo vệ cho các migration SAU NÀY: thêm migration làm hỏng dữ liệu cũ
/// thì test này đỏ (khi đó nhớ cập nhật phần kiểm tra bản `PreMigration` cho đúng).
#[test]
fn old_db_opens_with_data_intact() {
    let dir = temp_dir();
    let db_path = dir.join("lifehub.db");
    std::fs::copy(FIXTURE, &db_path).expect("thiếu tests/fixtures/lifehub_v0.5.0.db");
    let backups = dir.join("backups");
    let c = clock();
    let conn = db::open(&db_path, &backups, &c).unwrap();

    assert_eq!((count(&conn, "areas"), count(&conn, "projects")), (2, 2));
    assert_eq!(count(&conn, "tasks"), 46);
    assert_eq!(count(&conn, "events"), 1);
    assert_eq!(count(&conn, "reminders"), 1);
    assert!(count(&conn, "notes") >= 4, "3 Note mẫu + 1 Note thêm");

    // Tiến độ GGStudio 26/40 = 65%.
    let pid = text(&conn, "SELECT id FROM projects WHERE name LIKE 'GGStudio%'");
    let repo = SqliteProjectRepository::new(&conn, &c);
    let o = projects_app::get_overview(&repo, &pid).unwrap();
    assert_eq!(o.progress.percent, Some(65));

    // Tìm không dấu ra Note.
    let hits = search_app::search(&conn, "ghi chu", Some(&[SearchKind::Note]), None).unwrap();
    assert!(!hits.is_empty(), "tìm 'ghi chu' phải ra Note");

    assert_eq!(text(&conn, "PRAGMA integrity_check"), "ok");
    let fk_violations = conn
        .prepare("PRAGMA foreign_key_check")
        .unwrap()
        .query_map([], |r| r.get::<_, String>(0))
        .unwrap()
        .count();
    assert_eq!(fk_violations, 0);

    // Fixture đã ở phiên bản schema mới nhất: không cần (và không có) bản PreMigration.
    assert!(!db::migrations::needs_backup(&conn).unwrap());
    let pre_migration = std::fs::read_dir(&backups)
        .map(|d| {
            d.flatten()
                .filter(|e| e.file_name().to_string_lossy().contains("pre-migration"))
                .count()
        })
        .unwrap_or(0);
    assert_eq!(pre_migration, 0);
}

/// Sao lưu → sửa/xoá dữ liệu → khôi phục, trên file DB thật.
/// `backup::restore` không phụ thuộc `AppHandle` (lệnh Tauri chỉ gọi nó rồi `app.restart()`),
/// nên test ở đúng tầng use case, không cần tách thêm.
#[test]
fn backup_then_restore_on_a_real_file() {
    let dir = temp_dir();
    let backups = dir.join("backups");
    let c = clock();
    let mut conn = db::open(&dir.join("lifehub.db"), &backups, &c).unwrap();
    let ctx = TimeCtx::new("Asia/Ho_Chi_Minh", c.0);
    {
        let tx = conn.transaction().unwrap();
        demo::seed(&tx, &c, &ctx).unwrap();
        tx.commit().unwrap();
    }
    let (tasks, notes, projects) = (
        count(&conn, "tasks"),
        count(&conn, "notes"),
        count(&conn, "projects"),
    );

    let saved = backup::create(&conn, &backups, BackupReason::Manual, &c).unwrap();

    // Sửa và xoá sau khi sao lưu.
    conn.execute("DELETE FROM tasks WHERE title = 'Payment API'", [])
        .unwrap();
    conn.execute("UPDATE projects SET name = 'Đã đổi tên'", [])
        .unwrap();
    add_note(&conn, &c, "Note thêm sau khi sao lưu");
    assert_ne!(count(&conn, "tasks"), tasks);

    let later = FixedClock(Utc.with_ymd_and_hms(2026, 11, 27, 4, 0, 0).unwrap());
    backup::restore(&mut conn, &backups, &later, &saved.file_name).unwrap();

    assert_eq!(count(&conn, "tasks"), tasks);
    assert_eq!(count(&conn, "notes"), notes);
    assert_eq!(count(&conn, "projects"), projects);
    assert_eq!(
        count(&conn, "tasks WHERE title = 'Payment API'"),
        1,
        "Task đã xoá phải quay lại"
    );
    assert_eq!(count(&conn, "projects WHERE name = 'Đã đổi tên'"), 0);
    assert_eq!(text(&conn, "PRAGMA integrity_check"), "ok");

    let list = backup::list(&conn, &backups).unwrap();
    assert!(
        list.iter().any(|b| b.reason == BackupReason::PreRestore),
        "phải có bản PreRestore"
    );
    assert!(list.iter().any(|b| b.file_name == saved.file_name));
}
