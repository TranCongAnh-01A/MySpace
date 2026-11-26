//! Xuất toàn bộ dữ liệu ra JSON (người dùng luôn mang dữ liệu đi được).

use rusqlite::types::ValueRef;
use rusqlite::Connection;
use serde_json::{json, Map, Value};

use crate::clock::Clock;
use crate::error::AppResult;

/// Bảng không xuất: chỉ mục tìm kiếm (dựng lại được), nhật ký thay đổi, metadata sao lưu.
fn is_excluded(table: &str) -> bool {
    table.starts_with("search_index")
        || matches!(table, "search_map" | "change_log" | "backups")
        || table.starts_with("sqlite_")
}

fn to_json(v: ValueRef<'_>) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => json!(i),
        ValueRef::Real(f) => json!(f),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => Value::String(b.iter().map(|x| format!("{x:02x}")).collect()),
    }
}

fn dump_table(conn: &Connection, table: &str) -> AppResult<Vec<Value>> {
    // Tên bảng lấy từ sqlite_master, không phải từ người dùng; vẫn bọc dấu nháy kép cho chắc.
    let mut stmt = conn.prepare(&format!("SELECT * FROM \"{table}\""))?;
    let columns: Vec<String> = stmt.column_names().map(String::from).collect();
    let mut rows = stmt.query([])?;
    let mut out = Vec::new();
    while let Some(row) = rows.next()? {
        let mut obj = Map::new();
        for (i, name) in columns.iter().enumerate() {
            obj.insert(name.clone(), to_json(row.get_ref(i)?));
        }
        out.push(Value::Object(obj));
    }
    Ok(out)
}

pub fn build(conn: &Connection, app_version: &str, clock: &dyn Clock) -> AppResult<Value> {
    let tables: Vec<String> = conn
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")?
        .query_map([], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    let mut data = Map::new();
    for table in tables.iter().filter(|t| !is_excluded(t)) {
        data.insert(table.clone(), Value::Array(dump_table(conn, table)?));
    }
    let schema_version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    Ok(json!({
        "app": "LifeHub",
        "appVersion": app_version,
        "schemaVersion": schema_version,
        "exportedAt": clock.now_iso(),
        "tables": data,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clock::FixedClock;
    use crate::db;
    use chrono::{TimeZone, Utc};

    fn export(conn: &Connection) -> Value {
        let clock = FixedClock(Utc.with_ymd_and_hms(2026, 11, 26, 1, 2, 3).unwrap());
        build(conn, "0.1.0", &clock).unwrap()
    }

    #[test]
    fn header_and_seed_data() {
        let conn = db::open_in_memory().unwrap();
        let v = export(&conn);
        assert_eq!(v["app"], "LifeHub");
        assert_eq!(v["appVersion"], "0.1.0");
        assert_eq!(v["exportedAt"], "2026-11-26T01:02:03.000Z");
        assert!(v["schemaVersion"].as_i64().unwrap() >= 1);
        let ws = &v["tables"]["workspaces"];
        assert_eq!(ws.as_array().unwrap().len(), 1);
        assert_eq!(ws[0]["id"], "019ac000-0000-7000-8000-000000000001");
    }

    #[test]
    fn excludes_derived_tables_and_includes_user_data() {
        let conn = db::open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO inbox_items (id, workspace_id, content, created_at, updated_at)
             VALUES ('i1', '019ac000-0000-7000-8000-000000000001', 'Mua sữa', 't', 't')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO search_index (title, body) VALUES ('a', 'b')",
            [],
        )
        .unwrap();
        let v = export(&conn);
        let tables = v["tables"].as_object().unwrap();
        for t in ["search_index", "search_map", "change_log", "backups"] {
            assert!(!tables.contains_key(t), "{t} không được xuất");
        }
        assert!(!tables.keys().any(|k| k.starts_with("search_index")));
        assert_eq!(tables["inbox_items"][0]["content"], "Mua sữa");
        assert!(tables["inbox_items"][0]["converted_task_id"].is_null());
        for t in ["tasks", "areas", "settings", "calendars"] {
            assert!(tables.contains_key(t), "thiếu {t}");
        }
    }

    #[test]
    fn output_is_valid_json_text() {
        let conn = db::open_in_memory().unwrap();
        let text = serde_json::to_string_pretty(&export(&conn)).unwrap();
        let back: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(back["app"], "LifeHub");
    }
}
