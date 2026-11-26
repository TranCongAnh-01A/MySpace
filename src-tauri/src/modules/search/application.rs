use rusqlite::{params_from_iter, Connection};
use serde::Serialize;
use ts_rs::TS;

use crate::error::AppResult;

use super::infrastructure::{self, SearchKind};

pub const DEFAULT_LIMIT: usize = 20;
pub const MAX_LIMIT: usize = 100;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct SearchHit {
    pub kind: SearchKind,
    pub id: String,
    pub title: String,
    /// Văn bản thuần, không HTML.
    pub snippet: String,
}

/// Chuẩn hoá câu tìm cho FTS5: tách theo khoảng trắng, chỉ giữ chữ và số, bỏ `AND/OR/NOT/NEAR`
/// viết hoa; mỗi từ thành `"từ"*` (tiền tố), nối bằng AND. Câu rỗng → `None`.
pub fn normalize_query(raw: &str) -> Option<String> {
    let terms: Vec<String> = raw
        .split_whitespace()
        .filter(|w| !matches!(*w, "AND" | "OR" | "NOT" | "NEAR"))
        .map(|w| {
            w.chars()
                .filter(|c| c.is_alphanumeric())
                .collect::<String>()
        })
        .filter(|w| !w.is_empty())
        .map(|w| format!("\"{w}\"*"))
        .collect();
    if terms.is_empty() {
        None
    } else {
        Some(terms.join(" "))
    }
}

pub fn search(
    conn: &Connection,
    query: &str,
    kinds: Option<&[SearchKind]>,
    limit: Option<usize>,
) -> AppResult<Vec<SearchHit>> {
    let Some(q) = normalize_query(query) else {
        return Ok(Vec::new());
    };
    let limit = limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    // `kinds` là enum nên nối chuỗi vào SQL là an toàn.
    let kind_filter = match kinds {
        Some(k) if !k.is_empty() => {
            let list: Vec<String> = k.iter().map(|k| format!("'{}'", k.as_str())).collect();
            format!("AND m.kind IN ({})", list.join(","))
        }
        _ => String::new(),
    };
    let sql = format!(
        "SELECT m.kind, m.entity_id,
                COALESCE(CASE m.kind
                  WHEN 'Task' THEN (SELECT title FROM tasks WHERE id = m.entity_id)
                  WHEN 'Project' THEN (SELECT name FROM projects WHERE id = m.entity_id)
                  WHEN 'Inbox' THEN (SELECT content FROM inbox_items WHERE id = m.entity_id)
                  WHEN 'Note' THEN (SELECT title FROM notes WHERE id = m.entity_id)
                  END, search_index.title),
                snippet(search_index, 1, '', '', '…', 12)
         FROM search_index JOIN search_map m ON m.fts_rowid = search_index.rowid
         WHERE search_index MATCH ?1 {kind_filter}
         ORDER BY bm25(search_index)
         LIMIT {limit}"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map(params_from_iter([q]), |r| {
            let kind: String = r.get(0)?;
            let title: String = r.get(2)?;
            let snippet: String = r.get(3)?;
            Ok((kind, r.get::<_, String>(1)?, title, snippet))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows
        .into_iter()
        .filter_map(|(kind, id, title, snippet)| {
            let kind = parse_kind(&kind)?;
            let snippet = if snippet.trim().is_empty() {
                title.clone()
            } else {
                snippet
            };
            Some(SearchHit {
                kind,
                id,
                title,
                snippet,
            })
        })
        .collect())
}

fn parse_kind(s: &str) -> Option<SearchKind> {
    [
        SearchKind::Task,
        SearchKind::Project,
        SearchKind::Note,
        SearchKind::Inbox,
    ]
    .into_iter()
    .find(|k| k.as_str() == s)
}

/// Project chưa có trong chỉ mục (tạo trước v0.3 hoặc chỉ mục bị dựng lại) thì index nốt.
pub fn reindex_missing_projects(conn: &Connection) -> AppResult<()> {
    let missing: Vec<(String, String, String)> = conn
        .prepare(
            "SELECT id, name, description FROM projects
             WHERE deleted_at IS NULL
               AND NOT EXISTS (SELECT 1 FROM search_map m
                               WHERE m.kind = 'Project' AND m.entity_id = projects.id)",
        )?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
        .collect::<Result<_, _>>()?;
    for (id, name, body) in missing {
        infrastructure::index(conn, SearchKind::Project, &id, &name, &body)?;
    }
    Ok(())
}

/// Note chưa có trong chỉ mục (chỉ mục bị dựng lại hoặc Note nhập từ nơi khác) thì index nốt.
pub fn reindex_missing_notes(conn: &Connection) -> AppResult<()> {
    let missing: Vec<(String, String, String)> = conn
        .prepare(
            "SELECT id, title, search_text FROM notes
             WHERE deleted_at IS NULL
               AND NOT EXISTS (SELECT 1 FROM search_map m
                               WHERE m.kind = 'Note' AND m.entity_id = notes.id)",
        )?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
        .collect::<Result<_, _>>()?;
    for (id, title, body) in missing {
        infrastructure::index(conn, SearchKind::Note, &id, &title, &body)?;
    }
    Ok(())
}

/// Dữ liệu tạo từ trước khi có chỉ mục (phase A) chưa được index: dựng lại khi chỉ mục rỗng.
pub fn reindex_if_empty(conn: &Connection) -> AppResult<()> {
    let indexed: i64 = conn.query_row("SELECT count(*) FROM search_map", [], |r| r.get(0))?;
    if indexed > 0 {
        return Ok(());
    }
    let tasks: Vec<(String, String, String)> = conn
        .prepare("SELECT id, title, description FROM tasks WHERE deleted_at IS NULL")?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
        .collect::<Result<_, _>>()?;
    for (id, title, body) in tasks {
        infrastructure::index(conn, SearchKind::Task, &id, &title, &body)?;
    }
    let inbox: Vec<(String, String)> = conn
        .prepare(
            "SELECT id, content FROM inbox_items WHERE deleted_at IS NULL AND status = 'Open'",
        )?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_, _>>()?;
    for (id, content) in inbox {
        infrastructure::index(conn, SearchKind::Inbox, &id, &content, "")?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    #[test]
    fn normalize_handles_special_characters_and_operators() {
        assert_eq!(normalize_query("nhac nho").unwrap(), "\"nhac\"* \"nho\"*");
        assert_eq!(normalize_query("  ").as_deref(), None);
        assert_eq!(normalize_query("AND OR NOT").as_deref(), None);
        assert_eq!(
            normalize_query("a\" OR (b*) -c: ^d").unwrap(),
            "\"a\"* \"b\"* \"c\"* \"d\"*"
        );
        assert_eq!(normalize_query("\"*()").as_deref(), None);
    }

    #[test]
    fn special_characters_never_break_the_query() {
        let conn = db::open_in_memory().unwrap();
        infrastructure::index(&conn, SearchKind::Task, "t", "alpha beta", "").unwrap();
        for q in [
            "\"", "*", "(", "a AND", "-", "NOT", "alpha\"", "((alpha", "al*pha:",
        ] {
            assert!(search(&conn, q, None, None).is_ok(), "{q}");
        }
    }

    #[test]
    fn finds_without_diacritics_and_by_prefix() {
        let conn = db::open_in_memory().unwrap();
        infrastructure::index(&conn, SearchKind::Task, "t1", "Nhắc nhở uống thuốc", "").unwrap();
        infrastructure::index(&conn, SearchKind::Inbox, "i1", "Gọi điện cho khách", "").unwrap();
        let hits = search(&conn, "nhac nho", None, None).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(
            (hits[0].kind, hits[0].id.as_str()),
            (SearchKind::Task, "t1")
        );
        assert_eq!(hits[0].title, "Nhắc nhở uống thuốc");
        assert_eq!(search(&conn, "goi di", None, None).unwrap().len(), 1);
        // Từ phải khớp tiền tố của cùng một từ, AND giữa các từ.
        assert!(search(&conn, "nhac khach", None, None).unwrap().is_empty());
    }

    #[test]
    fn d_with_stroke_matches_plain_d_and_title_stays_original() {
        let conn = db::open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO tasks (id, workspace_id, title, description, sort_key, created_at, updated_at)
             VALUES ('t1', ?1, 'Đóng tiền điện', 'hạn đầu tháng', 'V', 't', 't')",
            [crate::ids::DEFAULT_WORKSPACE_ID],
        )
        .unwrap();
        infrastructure::index(
            &conn,
            SearchKind::Task,
            "t1",
            "Đóng tiền điện",
            "hạn đầu tháng",
        )
        .unwrap();
        for q in ["dong", "dien", "đóng", "dau thang", "ĐIỆN"] {
            let hits = search(&conn, q, None, None).unwrap();
            assert_eq!(hits.len(), 1, "{q}");
            assert_eq!(hits[0].title, "Đóng tiền điện");
        }
    }

    #[test]
    fn kind_filter_limit_and_snippet() {
        let conn = db::open_in_memory().unwrap();
        for i in 0..30 {
            infrastructure::index(
                &conn,
                SearchKind::Task,
                &format!("t{i}"),
                "việc chung",
                "mô tả dài về việc cần làm",
            )
            .unwrap();
        }
        infrastructure::index(&conn, SearchKind::Inbox, "i", "việc chung", "").unwrap();
        assert_eq!(search(&conn, "viec", None, None).unwrap().len(), 20);
        assert_eq!(search(&conn, "viec", None, Some(500)).unwrap().len(), 31);
        assert_eq!(search(&conn, "viec", None, Some(5)).unwrap().len(), 5);
        let only_inbox = search(&conn, "viec", Some(&[SearchKind::Inbox]), None).unwrap();
        assert_eq!(only_inbox.len(), 1);
        assert_eq!(
            only_inbox[0].snippet, "việc chung",
            "body rỗng thì lấy title"
        );
        let task_hit = search(&conn, "mo ta", Some(&[SearchKind::Task]), Some(1)).unwrap();
        assert!(task_hit[0].snippet.contains("mô tả"));
        assert!(!task_hit[0].snippet.contains('<'));
    }

    #[test]
    fn reindex_rebuilds_only_when_index_is_empty() {
        let conn = db::open_in_memory().unwrap();
        let ws = crate::ids::DEFAULT_WORKSPACE_ID;
        conn.execute(
            "INSERT INTO inbox_items (id, workspace_id, content, created_at, updated_at)
             VALUES ('i1', ?1, 'Mua sữa', 't', 't')",
            [ws],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO tasks (id, workspace_id, title, sort_key, created_at, updated_at)
             VALUES ('t1', ?1, 'Đóng tiền điện', 'V', 't', 't')",
            [ws],
        )
        .unwrap();
        assert!(search(&conn, "sua", None, None).unwrap().is_empty());
        reindex_if_empty(&conn).unwrap();
        assert_eq!(search(&conn, "sua", None, None).unwrap().len(), 1);
        assert_eq!(search(&conn, "tien dien", None, None).unwrap().len(), 1);
        reindex_if_empty(&conn).unwrap(); // lần hai: không nhân đôi
        assert_eq!(search(&conn, "sua", None, None).unwrap().len(), 1);
    }
}
