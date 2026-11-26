//! Ghi/xoá chỉ mục FTS5 qua `search_map` (không quét bảng, không dùng trigger).
#![allow(dead_code)]

use rusqlite::{params, Connection, OptionalExtension};

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::AppResult;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub enum SearchKind {
    Task,
    Project,
    Note,
    Inbox,
}

impl SearchKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Task => "Task",
            Self::Project => "Project",
            Self::Note => "Note",
            Self::Inbox => "Inbox",
        }
    }
}

fn mapped_rowid(conn: &Connection, kind: SearchKind, id: &str) -> AppResult<Option<i64>> {
    Ok(conn
        .query_row(
            "SELECT fts_rowid FROM search_map WHERE kind = ?1 AND entity_id = ?2",
            params![kind.as_str(), id],
            |r| r.get(0),
        )
        .optional()?)
}

/// `đ/Đ` không có dạng tách dấu nên FTS (`remove_diacritics`) không gộp được với `d`.
/// Thêm một bản đã gộp vào cuối để gõ "dien" vẫn ra "điện". Tiêu đề hiển thị lấy từ bảng gốc
/// (xem `search::application`), nên bản gộp thêm trong cột title không lộ ra ngoài.
fn with_folded_copy(text: &str) -> String {
    if text.contains(['đ', 'Đ']) {
        let folded: String = text
            .chars()
            .map(|c| match c {
                'đ' => 'd',
                'Đ' => 'D',
                c => c,
            })
            .collect();
        format!(
            "{text}
{folded}"
        )
    } else {
        text.to_string()
    }
}

/// Thêm hoặc thay nội dung tìm kiếm của một thực thể.
pub fn index(
    conn: &Connection,
    kind: SearchKind,
    id: &str,
    title: &str,
    body: &str,
) -> AppResult<()> {
    if let Some(rowid) = mapped_rowid(conn, kind, id)? {
        conn.execute("DELETE FROM search_index WHERE rowid = ?1", [rowid])?;
    }
    conn.execute(
        "INSERT INTO search_index (title, body) VALUES (?1, ?2)",
        params![with_folded_copy(title), with_folded_copy(body)],
    )?;
    let rowid = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO search_map (kind, entity_id, fts_rowid) VALUES (?1, ?2, ?3)
         ON CONFLICT (kind, entity_id) DO UPDATE SET fts_rowid = excluded.fts_rowid",
        params![kind.as_str(), id, rowid],
    )?;
    Ok(())
}

/// Xoá thực thể khỏi chỉ mục (không lỗi nếu chưa từng được index).
pub fn remove(conn: &Connection, kind: SearchKind, id: &str) -> AppResult<()> {
    if let Some(rowid) = mapped_rowid(conn, kind, id)? {
        conn.execute("DELETE FROM search_index WHERE rowid = ?1", [rowid])?;
        conn.execute(
            "DELETE FROM search_map WHERE kind = ?1 AND entity_id = ?2",
            params![kind.as_str(), id],
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn hits(conn: &Connection, q: &str) -> Vec<i64> {
        conn.prepare("SELECT rowid FROM search_index WHERE search_index MATCH ?1")
            .unwrap()
            .query_map([q], |r| r.get(0))
            .unwrap()
            .map(Result::unwrap)
            .collect()
    }

    fn map_count(conn: &Connection) -> i64 {
        conn.query_row("SELECT count(*) FROM search_map", [], |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn index_match_without_diacritics_then_remove() {
        let conn = db::open_in_memory().unwrap();
        index(
            &conn,
            SearchKind::Task,
            "t1",
            "Gọi điện khách hàng",
            "nhắc nhở",
        )
        .unwrap();
        assert_eq!(hits(&conn, "goi").len(), 1);
        assert_eq!(hits(&conn, "nhac").len(), 1);
        remove(&conn, SearchKind::Task, "t1").unwrap();
        assert!(hits(&conn, "goi").is_empty());
        assert_eq!(map_count(&conn), 0);
    }

    #[test]
    fn reindex_replaces_old_content() {
        let conn = db::open_in_memory().unwrap();
        index(&conn, SearchKind::Note, "n1", "cũ", "").unwrap();
        index(&conn, SearchKind::Note, "n1", "mới", "").unwrap();
        assert!(hits(&conn, "cu").is_empty());
        assert_eq!(hits(&conn, "moi").len(), 1);
        assert_eq!(map_count(&conn), 1);
    }

    #[test]
    fn same_id_different_kind_are_separate_and_remove_is_idempotent() {
        let conn = db::open_in_memory().unwrap();
        index(&conn, SearchKind::Task, "x", "alpha", "").unwrap();
        index(&conn, SearchKind::Inbox, "x", "beta", "").unwrap();
        remove(&conn, SearchKind::Task, "x").unwrap();
        remove(&conn, SearchKind::Task, "x").unwrap();
        assert!(hits(&conn, "alpha").is_empty());
        assert_eq!(hits(&conn, "beta").len(), 1);
    }
}
