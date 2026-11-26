//! Nhật ký thay đổi (nền cho đồng bộ sau này). Ghi ở tầng repository, cùng transaction.

use rusqlite::{params, Connection};

use crate::clock::Clock;
use crate::error::AppResult;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChangeOp {
    Insert,
    Update,
    Delete,
}

impl ChangeOp {
    fn as_str(self) -> &'static str {
        match self {
            Self::Insert => "Insert",
            Self::Update => "Update",
            Self::Delete => "Delete",
        }
    }
}

pub fn record(
    conn: &Connection,
    entity: &str,
    entity_id: &str,
    op: ChangeOp,
    clock: &dyn Clock,
) -> AppResult<()> {
    conn.execute(
        "INSERT INTO change_log (entity, entity_id, op, changed_at) VALUES (?1, ?2, ?3, ?4)",
        params![entity, entity_id, op.as_str(), clock.now_iso()],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clock::FixedClock;
    use crate::db;
    use chrono::{TimeZone, Utc};

    type Row = (i64, String, String, String, Option<String>);

    #[test]
    fn records_rows_in_order() {
        let conn = db::open_in_memory().unwrap();
        let clock = FixedClock(Utc.with_ymd_and_hms(2026, 11, 26, 1, 2, 3).unwrap());
        record(&conn, "area", "a1", ChangeOp::Insert, &clock).unwrap();
        record(&conn, "area", "a1", ChangeOp::Delete, &clock).unwrap();
        let rows: Vec<Row> = conn
            .prepare("SELECT seq, entity, op, changed_at, synced_at FROM change_log ORDER BY seq")
            .unwrap()
            .query_map([], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
            })
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].2, "Insert");
        assert_eq!(rows[1].2, "Delete");
        assert_eq!(rows[0].3, "2026-11-26T01:02:03.000Z");
        assert!(rows[0].4.is_none());
        assert!(rows[0].0 < rows[1].0);
    }
}
