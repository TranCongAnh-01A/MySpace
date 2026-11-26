use crate::error::{AppError, AppResult, ErrorCode};
use crate::ids;
use crate::sort_key;

use super::domain::{Area, AreaCreate, AreaPatch};

/// Cổng ra của module: lớp infrastructure cài trait này.
pub trait AreaRepository {
    fn insert(&self, area: &Area) -> AppResult<()>;
    /// Ghi tên, màu, sort_key của area đã có.
    fn update(&self, area: &Area) -> AppResult<()>;
    fn find(&self, id: &str) -> AppResult<Option<Area>>;
    /// Theo `sort_key`, bỏ qua bản ghi đã xoá mềm.
    fn list(&self) -> AppResult<Vec<Area>>;
    fn last_sort_key(&self) -> AppResult<Option<String>>;
    /// Khoá của mục kề `key` (phía sau nếu `after`, phía trước nếu không), bỏ qua `exclude_id`.
    fn adjacent_sort_key(
        &self,
        key: &str,
        exclude_id: &str,
        after: bool,
    ) -> AppResult<Option<String>>;
    /// Xoá mềm và đặt `area_id = NULL` cho Project/Task đang trỏ tới.
    fn soft_delete(&self, id: &str) -> AppResult<()>;
}

fn not_found() -> AppError {
    AppError::new(ErrorCode::NotFound, "Không tìm thấy Area")
}

fn require(repo: &dyn AreaRepository, id: &str) -> AppResult<Area> {
    repo.find(id)?.ok_or_else(not_found)
}

pub fn list(repo: &dyn AreaRepository) -> AppResult<Vec<Area>> {
    repo.list()
}

/// Area mới xếp cuối danh sách.
pub fn create(repo: &dyn AreaRepository, input: &AreaCreate) -> AppResult<Area> {
    let last = repo.last_sort_key()?;
    let key = sort_key::between(last.as_deref(), None);
    let area = Area::new(ids::new_id(), input, key)?;
    repo.insert(&area)?;
    Ok(area)
}

pub fn update(repo: &dyn AreaRepository, id: &str, patch: &AreaPatch) -> AppResult<Area> {
    let mut area = require(repo, id)?;
    area.apply(patch)?;
    repo.update(&area)?;
    Ok(area)
}

/// `before_id` = mục nằm ngay trên vị trí mới, `after_id` = mục nằm ngay dưới.
pub fn reorder(
    repo: &dyn AreaRepository,
    id: &str,
    before_id: Option<&str>,
    after_id: Option<&str>,
) -> AppResult<Area> {
    if before_id.is_none() && after_id.is_none() {
        return Err(AppError::validation("Cần beforeId hoặc afterId"));
    }
    if before_id == Some(id) || after_id == Some(id) {
        return Err(AppError::validation("Không thể xếp Area vào cạnh chính nó"));
    }
    let mut area = require(repo, id)?;
    let before = before_id.map(|b| require(repo, b)).transpose()?;
    let after = after_id.map(|a| require(repo, a)).transpose()?;

    // Chỉ cho một phía thì phía kia là mục kề thật sự trong danh sách.
    let lower = match (&before, &after) {
        (Some(b), _) => Some(b.sort_key.clone()),
        (None, Some(a)) => repo.adjacent_sort_key(&a.sort_key, id, false)?,
        (None, None) => None,
    };
    let upper = match (&after, &before) {
        (Some(a), _) => Some(a.sort_key.clone()),
        (None, Some(b)) => repo.adjacent_sort_key(&b.sort_key, id, true)?,
        (None, None) => None,
    };
    if let (Some(l), Some(u)) = (&lower, &upper) {
        if l >= u {
            return Err(AppError::validation(
                "beforeId phải nằm ngay trên afterId trong danh sách",
            ));
        }
    }
    area.sort_key = sort_key::between(lower.as_deref(), upper.as_deref());
    repo.update(&area)?;
    Ok(area)
}

pub fn delete(repo: &dyn AreaRepository, id: &str) -> AppResult<()> {
    require(repo, id)?;
    repo.soft_delete(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clock::FixedClock;
    use crate::db;
    use crate::modules::areas::infrastructure::SqliteAreaRepository;
    use chrono::{TimeZone, Utc};
    use rusqlite::Connection;

    fn clock() -> FixedClock {
        FixedClock(Utc.with_ymd_and_hms(2026, 11, 26, 0, 0, 0).unwrap())
    }

    fn mk(repo: &dyn AreaRepository, name: &str) -> Area {
        create(
            repo,
            &AreaCreate {
                name: name.into(),
                color: None,
            },
        )
        .unwrap()
    }

    fn names(repo: &dyn AreaRepository) -> Vec<String> {
        list(repo).unwrap().into_iter().map(|a| a.name).collect()
    }

    fn setup() -> Connection {
        db::open_in_memory().unwrap()
    }

    #[test]
    fn create_appends_and_list_is_in_order() {
        let conn = setup();
        let clock = clock();
        let repo = SqliteAreaRepository::new(&conn, &clock);
        for n in ["A", "B", "C"] {
            mk(&repo, n);
        }
        assert_eq!(names(&repo), ["A", "B", "C"]);
    }

    #[test]
    fn create_records_changelog() {
        let conn = setup();
        let clock = clock();
        let repo = SqliteAreaRepository::new(&conn, &clock);
        let a = mk(&repo, "A");
        update(
            &repo,
            &a.id,
            &AreaPatch {
                name: Some("A2".into()),
                color: None,
            },
        )
        .unwrap();
        delete(&repo, &a.id).unwrap();
        let ops: Vec<String> = conn
            .prepare(
                "SELECT op FROM change_log WHERE entity = 'area' AND entity_id = ?1 ORDER BY seq",
            )
            .unwrap()
            .query_map([&a.id], |r| r.get(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert_eq!(ops, ["Insert", "Update", "Delete"]);
    }

    #[test]
    fn update_changes_fields_and_bumps_version() {
        let conn = setup();
        let clock = clock();
        let repo = SqliteAreaRepository::new(&conn, &clock);
        let a = mk(&repo, "Cũ");
        let u = update(
            &repo,
            &a.id,
            &AreaPatch {
                name: Some("Mới".into()),
                color: Some("#FF0000".into()),
            },
        )
        .unwrap();
        assert_eq!(
            (u.name.as_str(), u.color.as_deref()),
            ("Mới", Some("#FF0000"))
        );
        let version: i64 = conn
            .query_row("SELECT version FROM areas WHERE id = ?1", [&a.id], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(version, 2);
        assert_eq!(
            update(&repo, "nope", &AreaPatch::default())
                .unwrap_err()
                .code,
            ErrorCode::NotFound
        );
        let err = update(
            &repo,
            &a.id,
            &AreaPatch {
                name: Some(" ".into()),
                color: None,
            },
        )
        .unwrap_err();
        assert_eq!(err.code, ErrorCode::Validation);
    }

    #[test]
    fn reorder_with_both_neighbours() {
        let conn = setup();
        let clock = clock();
        let repo = SqliteAreaRepository::new(&conn, &clock);
        let a = mk(&repo, "A");
        let b = mk(&repo, "B");
        let c = mk(&repo, "C");
        // C lên giữa A và B.
        reorder(&repo, &c.id, Some(&a.id), Some(&b.id)).unwrap();
        assert_eq!(names(&repo), ["A", "C", "B"]);
    }

    #[test]
    fn reorder_with_one_neighbour_uses_real_neighbour() {
        let conn = setup();
        let clock = clock();
        let repo = SqliteAreaRepository::new(&conn, &clock);
        let a = mk(&repo, "A");
        let b = mk(&repo, "B");
        let c = mk(&repo, "C");
        let d = mk(&repo, "D");
        reorder(&repo, &d.id, Some(&a.id), None).unwrap(); // ngay dưới A
        assert_eq!(names(&repo), ["A", "D", "B", "C"]);
        reorder(&repo, &a.id, None, Some(&c.id)).unwrap(); // ngay trên C
        assert_eq!(names(&repo), ["D", "B", "A", "C"]);
        reorder(&repo, &c.id, None, Some(&d.id)).unwrap(); // lên đầu
        assert_eq!(names(&repo), ["C", "D", "B", "A"]);
        reorder(&repo, &c.id, Some(&a.id), None).unwrap(); // xuống cuối
        assert_eq!(names(&repo), ["D", "B", "A", "C"]);
        let _ = b;
    }

    #[test]
    fn reorder_many_times_keeps_order_consistent() {
        let conn = setup();
        let clock = clock();
        let repo = SqliteAreaRepository::new(&conn, &clock);
        let a = mk(&repo, "A");
        let b = mk(&repo, "B");
        let c = mk(&repo, "C");
        // Đổi chỗ qua lại 200 lần giữa A và B.
        for _ in 0..200 {
            reorder(&repo, &c.id, Some(&a.id), Some(&b.id)).unwrap();
            reorder(&repo, &c.id, Some(&b.id), None).unwrap();
        }
        assert_eq!(names(&repo), ["A", "B", "C"]);
    }

    #[test]
    fn reorder_rejects_bad_input() {
        let conn = setup();
        let clock = clock();
        let repo = SqliteAreaRepository::new(&conn, &clock);
        let a = mk(&repo, "A");
        let b = mk(&repo, "B");
        let code = |r: AppResult<Area>| r.unwrap_err().code;
        assert_eq!(
            code(reorder(&repo, &a.id, None, None)),
            ErrorCode::Validation
        );
        assert_eq!(
            code(reorder(&repo, &a.id, Some(&a.id), None)),
            ErrorCode::Validation
        );
        assert_eq!(
            code(reorder(&repo, &a.id, Some(&b.id), Some(&a.id))),
            ErrorCode::Validation
        );
        assert_eq!(
            code(reorder(&repo, &a.id, Some("nope"), None)),
            ErrorCode::NotFound
        );
        assert_eq!(
            code(reorder(&repo, "nope", Some(&a.id), None)),
            ErrorCode::NotFound
        );
        // before phải nằm trên after: (B, A) là ngược thứ tự.
        let c = mk(&repo, "C");
        assert_eq!(
            code(reorder(&repo, &c.id, Some(&b.id), Some(&a.id))),
            ErrorCode::Validation
        );
    }

    #[test]
    fn delete_is_soft_and_detaches_projects_and_tasks() {
        let conn = setup();
        let clock = clock();
        let repo = SqliteAreaRepository::new(&conn, &clock);
        let a = mk(&repo, "A");
        let keep = mk(&repo, "Giữ lại");
        let ws = ids::DEFAULT_WORKSPACE_ID;
        conn.execute(
            "INSERT INTO projects (id, workspace_id, area_id, name, sort_key, created_at, updated_at)
             VALUES ('p1', ?1, ?2, 'P', 'V', 't', 't'), ('p2', ?1, ?3, 'Q', 'W', 't', 't')",
            rusqlite::params![ws, a.id, keep.id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO tasks (id, workspace_id, area_id, title, sort_key, created_at, updated_at)
             VALUES ('t1', ?1, ?2, 'T', 'V', 't', 't')",
            rusqlite::params![ws, a.id],
        )
        .unwrap();

        delete(&repo, &a.id).unwrap();

        assert_eq!(names(&repo), ["Giữ lại"]);
        let deleted_at: Option<String> = conn
            .query_row("SELECT deleted_at FROM areas WHERE id = ?1", [&a.id], |r| {
                r.get(0)
            })
            .unwrap();
        assert!(deleted_at.is_some(), "xoá mềm, dòng vẫn còn");
        let area_of = |table: &str, id: &str| -> Option<String> {
            conn.query_row(
                &format!("SELECT area_id FROM {table} WHERE id = ?1"),
                [id],
                |r| r.get(0),
            )
            .unwrap()
        };
        assert_eq!(area_of("projects", "p1"), None);
        assert_eq!(area_of("tasks", "t1"), None);
        assert_eq!(area_of("projects", "p2"), Some(keep.id.clone()));
        assert_eq!(delete(&repo, &a.id).unwrap_err().code, ErrorCode::NotFound);
    }

    #[test]
    fn transaction_rollback_undoes_delete() {
        let mut conn = setup();
        let clock = clock();
        let a = mk(&SqliteAreaRepository::new(&conn, &clock), "A");
        {
            let tx = conn.transaction().unwrap();
            delete(&SqliteAreaRepository::new(&tx, &clock), &a.id).unwrap();
            // bỏ `tx` mà không commit → rollback
        }
        assert_eq!(names(&SqliteAreaRepository::new(&conn, &clock)), ["A"]);
    }
}
