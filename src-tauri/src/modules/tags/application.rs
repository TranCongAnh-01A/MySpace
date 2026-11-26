use crate::error::{AppError, AppResult, ErrorCode};
use crate::ids;

use super::domain::{Tag, TagCreate, TagPatch};

pub trait TagRepository {
    fn insert(&self, tag: &Tag) -> AppResult<()>;
    fn update(&self, tag: &Tag) -> AppResult<()>;
    fn find(&self, id: &str) -> AppResult<Option<Tag>>;
    /// Theo tên (không phân biệt hoa thường).
    fn list(&self) -> AppResult<Vec<Tag>>;
    /// Có tag khác (không tính `exclude_id`) trùng tên không?
    fn name_taken(&self, name: &str, exclude_id: Option<&str>) -> AppResult<bool>;
    /// Xoá mềm tag và xoá cứng các liên kết `task_tags`.
    fn soft_delete(&self, id: &str) -> AppResult<()>;
}

fn duplicate() -> AppError {
    AppError::new(ErrorCode::Conflict, "Đã có tag trùng tên")
}

fn require(repo: &dyn TagRepository, id: &str) -> AppResult<Tag> {
    repo.find(id)?
        .ok_or_else(|| AppError::new(ErrorCode::NotFound, "Không tìm thấy tag"))
}

pub fn list(repo: &dyn TagRepository) -> AppResult<Vec<Tag>> {
    repo.list()
}

pub fn create(repo: &dyn TagRepository, input: &TagCreate) -> AppResult<Tag> {
    let tag = Tag::new(ids::new_id(), input)?;
    if repo.name_taken(&tag.name, None)? {
        return Err(duplicate());
    }
    repo.insert(&tag)?;
    Ok(tag)
}

pub fn update(repo: &dyn TagRepository, id: &str, patch: &TagPatch) -> AppResult<Tag> {
    let mut tag = require(repo, id)?;
    tag.apply(patch)?;
    if repo.name_taken(&tag.name, Some(id))? {
        return Err(duplicate());
    }
    repo.update(&tag)?;
    Ok(tag)
}

pub fn delete(repo: &dyn TagRepository, id: &str) -> AppResult<()> {
    require(repo, id)?;
    repo.soft_delete(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clock::FixedClock;
    use crate::db;
    use crate::modules::tags::infrastructure::SqliteTagRepository;
    use chrono::{TimeZone, Utc};

    fn clock() -> FixedClock {
        FixedClock(Utc.with_ymd_and_hms(2026, 11, 26, 0, 0, 0).unwrap())
    }

    fn mk(repo: &dyn TagRepository, name: &str) -> AppResult<Tag> {
        create(
            repo,
            &TagCreate {
                name: name.into(),
                color: None,
            },
        )
    }

    #[test]
    fn list_is_sorted_by_name_case_insensitive() {
        let conn = db::open_in_memory().unwrap();
        let c = clock();
        let repo = SqliteTagRepository::new(&conn, &c);
        for n in ["banana", "Cam", "apple"] {
            mk(&repo, n).unwrap();
        }
        let names: Vec<_> = list(&repo).unwrap().into_iter().map(|t| t.name).collect();
        assert_eq!(names, ["apple", "banana", "Cam"]);
    }

    #[test]
    fn duplicate_name_is_conflict_ignoring_case() {
        let conn = db::open_in_memory().unwrap();
        let c = clock();
        let repo = SqliteTagRepository::new(&conn, &c);
        let a = mk(&repo, "Việc nhà").unwrap();
        assert_eq!(mk(&repo, "VIỆC NHÀ").unwrap_err().code, ErrorCode::Conflict);
        let b = mk(&repo, "Khác").unwrap();
        let rename = |id: &str, name: &str| {
            update(
                &repo,
                id,
                &TagPatch {
                    name: Some(name.into()),
                    color: None,
                },
            )
        };
        assert_eq!(
            rename(&b.id, "việc nhà").unwrap_err().code,
            ErrorCode::Conflict
        );
        // Đổi hoa/thường tên của chính nó thì được.
        assert_eq!(rename(&a.id, "VIỆC NHÀ").unwrap().name, "VIỆC NHÀ");
        assert_eq!(
            update(&repo, "x", &TagPatch::default()).unwrap_err().code,
            ErrorCode::NotFound
        );
    }

    #[test]
    fn delete_removes_links_and_frees_the_name() {
        let conn = db::open_in_memory().unwrap();
        let c = clock();
        let repo = SqliteTagRepository::new(&conn, &c);
        let t = mk(&repo, "x").unwrap();
        conn.execute(
            "INSERT INTO tasks (id, workspace_id, title, sort_key, created_at, updated_at)
             VALUES ('t1', ?1, 'T', 'V', 't', 't')",
            [ids::DEFAULT_WORKSPACE_ID],
        )
        .unwrap();
        conn.execute("INSERT INTO task_tags VALUES ('t1', ?1)", [&t.id])
            .unwrap();
        delete(&repo, &t.id).unwrap();
        let links: i64 = conn
            .query_row("SELECT count(*) FROM task_tags", [], |r| r.get(0))
            .unwrap();
        assert_eq!(links, 0);
        assert!(list(&repo).unwrap().is_empty());
        assert_eq!(delete(&repo, &t.id).unwrap_err().code, ErrorCode::NotFound);
        mk(&repo, "x").unwrap(); // tên được dùng lại
    }
}
