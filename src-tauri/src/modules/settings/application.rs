use serde_json::{Map, Value};

use crate::clock::Clock;
use crate::error::AppResult;

use super::domain::{system_timezone, AppSettings, SettingsPatch};

/// Cổng ra của module: mỗi khoá một dòng JSON.
pub trait SettingsRepository {
    fn load_all(&self) -> AppResult<Vec<(String, String)>>;
    fn upsert(&self, key: &str, value_json: &str, now: &str) -> AppResult<()>;
}

/// Mặc định (nằm trong code) chồng các giá trị đã lưu lên trên.
/// Dòng nào hỏng hoặc không còn hợp lệ thì bỏ qua, dùng mặc định cho khoá đó.
pub fn get(repo: &dyn SettingsRepository) -> AppResult<AppSettings> {
    let defaults = AppSettings::defaults(system_timezone());
    let mut object = to_object(&defaults);
    for (key, raw) in repo.load_all()? {
        let Ok(value) = serde_json::from_str::<Value>(&raw) else {
            continue;
        };
        if !object.contains_key(&key) {
            continue;
        }
        let previous = object.insert(key.clone(), value);
        let ok = serde_json::from_value::<AppSettings>(Value::Object(object.clone()))
            .ok()
            .is_some_and(|s| s.validate().is_ok());
        if !ok {
            if let Some(prev) = previous {
                object.insert(key, prev);
            }
        }
    }
    Ok(serde_json::from_value(Value::Object(object)).unwrap_or(defaults))
}

/// Áp patch, kiểm tra, chỉ ghi các khoá thực sự đổi. Trả về cài đặt mới.
pub fn update(
    repo: &dyn SettingsRepository,
    clock: &dyn Clock,
    current: &AppSettings,
    patch: &SettingsPatch,
) -> AppResult<AppSettings> {
    let next = current.apply(patch)?;
    let before = to_object(current);
    let after = to_object(&next);
    let now = clock.now_iso();
    for (key, value) in &after {
        if before.get(key) != Some(value) {
            repo.upsert(key, &value.to_string(), &now)?;
        }
    }
    Ok(next)
}

fn to_object(s: &AppSettings) -> Map<String, Value> {
    match serde_json::to_value(s) {
        Ok(Value::Object(m)) => m,
        _ => Map::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clock::FixedClock;
    use crate::db;
    use crate::error::ErrorCode;
    use crate::modules::settings::domain::Theme;
    use crate::modules::settings::infrastructure::SqliteSettingsRepository;
    use chrono::{TimeZone, Utc};

    fn clock() -> FixedClock {
        FixedClock(Utc.with_ymd_and_hms(2026, 11, 26, 0, 0, 0).unwrap())
    }

    fn row_count(conn: &rusqlite::Connection) -> i64 {
        conn.query_row("SELECT count(*) FROM settings", [], |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn empty_db_returns_defaults() {
        let conn = db::open_in_memory().unwrap();
        let s = get(&SqliteSettingsRepository::new(&conn)).unwrap();
        assert_eq!(s, AppSettings::defaults(system_timezone()));
        assert_eq!(row_count(&conn), 0, "get không được ghi gì");
    }

    #[test]
    fn patch_one_field_leaves_others_and_persists() {
        let conn = db::open_in_memory().unwrap();
        let repo = SqliteSettingsRepository::new(&conn);
        let current = get(&repo).unwrap();
        let patch = SettingsPatch {
            theme: Some(Theme::Dark),
            ..Default::default()
        };
        let next = update(&repo, &clock(), &current, &patch).unwrap();
        assert_eq!(next.theme, Theme::Dark);
        assert_eq!(row_count(&conn), 1, "chỉ ghi khoá đã đổi");

        let reloaded = get(&repo).unwrap();
        assert_eq!(reloaded, next);
        assert_eq!(reloaded.language, current.language);
    }

    #[test]
    fn invalid_patch_is_validation_error_and_writes_nothing() {
        let conn = db::open_in_memory().unwrap();
        let repo = SqliteSettingsRepository::new(&conn);
        let current = get(&repo).unwrap();
        let patch = SettingsPatch {
            theme: Some(Theme::Dark),
            trash_retention_days: Some(0),
            ..Default::default()
        };
        let err = update(&repo, &clock(), &current, &patch).unwrap_err();
        assert_eq!(err.code, ErrorCode::Validation);
        assert_eq!(row_count(&conn), 0);
    }

    #[test]
    fn corrupt_stored_row_falls_back_to_default_for_that_key() {
        let conn = db::open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO settings (key, value_json, updated_at) VALUES
             ('theme', '\"Neon\"', 't'), ('closeToTray', 'false', 't'), ('lạ', '1', 't')",
            [],
        )
        .unwrap();
        let s = get(&SqliteSettingsRepository::new(&conn)).unwrap();
        assert_eq!(s.theme, Theme::System);
        assert!(!s.close_to_tray);
    }

    #[test]
    fn unchanged_patch_writes_nothing() {
        let conn = db::open_in_memory().unwrap();
        let repo = SqliteSettingsRepository::new(&conn);
        let current = get(&repo).unwrap();
        let patch = SettingsPatch {
            theme: Some(current.theme),
            ..Default::default()
        };
        update(&repo, &clock(), &current, &patch).unwrap();
        assert_eq!(row_count(&conn), 0);
    }
}
