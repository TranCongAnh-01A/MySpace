use crate::error::{AppError, AppResult, ErrorCode};
use crate::ids;

use super::domain::{
    extract_text, validate_content, validate_title, Note, NoteCreate, NoteFilter, NoteSaveResult,
    NoteSummary, EMPTY_DOC, MAX_PARENT_DEPTH,
};

/// Dữ liệu một Note mới để ghi (đã kiểm tra).
pub struct NewNote {
    pub id: String,
    pub project_id: Option<String>,
    pub parent_note_id: Option<String>,
    pub title: String,
    pub content_json: String,
    pub search_text: String,
    pub created_at: String,
}

/// Cổng ra của module Notes.
pub trait NoteRepository {
    /// Ghi Note; index tìm kiếm và nhật ký thay đổi.
    fn insert(&self, note: &NewNote) -> AppResult<()>;
    /// Note chưa xoá mềm.
    fn find(&self, id: &str) -> AppResult<Option<Note>>;
    /// Mặc định mới cập nhật trước; bỏ Note đã xoá và Note của Project đã lưu trữ.
    fn list(&self, filter: &NoteFilter) -> AppResult<Vec<NoteSummary>>;
    /// Ghi tiêu đề, nội dung, `search_text`; `version + 1`; index lại; nhật ký.
    fn save_content(
        &self,
        id: &str,
        title: &str,
        content_json: &str,
        search_text: &str,
    ) -> AppResult<()>;
    /// Đặt lại Project và Note cha (`version + 1`).
    fn set_location(
        &self,
        id: &str,
        project_id: Option<&str>,
        parent_note_id: Option<&str>,
    ) -> AppResult<()>;
    fn soft_delete(&self, id: &str) -> AppResult<()>;
    /// Liên kết Task; đã có thì bỏ qua. Không đổi `version` của Note.
    fn link_task(&self, note_id: &str, task_id: &str) -> AppResult<()>;
    fn unlink_task(&self, note_id: &str, task_id: &str) -> AppResult<()>;
    fn replace_tags(&self, note_id: &str, tag_ids: &[String]) -> AppResult<()>;
    fn existing_tag_ids(&self, ids: &[String]) -> AppResult<Vec<String>>;
    fn project_is_active(&self, id: &str) -> AppResult<bool>;
    fn task_exists(&self, id: &str) -> AppResult<bool>;
    /// Note cha của `id` (kể cả Note đã xoá): `None` nếu không có dòng đó.
    fn parent_of(&self, id: &str) -> AppResult<Option<Option<String>>>;
}

/// Kết quả `save`: `title_changed` quyết định có phát `entity-changed` hay không.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SaveOutcome {
    pub result: NoteSaveResult,
    pub title_changed: bool,
}

fn not_found() -> AppError {
    AppError::new(ErrorCode::NotFound, "Không tìm thấy ghi chú")
}

fn require(repo: &dyn NoteRepository, id: &str) -> AppResult<Note> {
    repo.find(id)?.ok_or_else(not_found)
}

fn check_project(repo: &dyn NoteRepository, id: Option<&str>) -> AppResult<()> {
    match id {
        Some(p) if !repo.project_is_active(p)? => Err(AppError::validation(
            "Project không tồn tại hoặc đã được lưu trữ",
        )),
        _ => Ok(()),
    }
}

/// Note cha phải tồn tại và không tạo vòng (đi ngược chuỗi cha, tối đa 50 cấp).
fn check_parent(repo: &dyn NoteRepository, note_id: Option<&str>, parent: &str) -> AppResult<()> {
    if repo.find(parent)?.is_none() {
        return Err(AppError::validation("Note cha không tồn tại"));
    }
    let mut cursor = Some(parent.to_string());
    let mut depth = 0;
    while let Some(id) = cursor {
        if note_id == Some(id.as_str()) {
            return Err(AppError::validation("Note cha tạo thành vòng lặp"));
        }
        depth += 1;
        if depth > MAX_PARENT_DEPTH {
            return Err(AppError::validation("Cây Note quá sâu"));
        }
        cursor = repo.parent_of(&id)?.flatten();
    }
    Ok(())
}

fn check_tags(repo: &dyn NoteRepository, ids: &[String]) -> AppResult<Vec<String>> {
    let mut unique: Vec<String> = Vec::new();
    for id in ids {
        if !unique.contains(id) {
            unique.push(id.clone());
        }
    }
    if repo.existing_tag_ids(&unique)?.len() != unique.len() {
        return Err(AppError::validation("Có tag không tồn tại"));
    }
    Ok(unique)
}

/// Kiểm tra nội dung rồi trả về `(content_json, search_text)`.
fn prepare_content(raw: &str) -> AppResult<(String, String)> {
    let doc = validate_content(raw)?;
    Ok((raw.to_string(), extract_text(&doc)))
}

pub fn list(repo: &dyn NoteRepository, filter: &NoteFilter) -> AppResult<Vec<NoteSummary>> {
    repo.list(filter)
}

pub fn get(repo: &dyn NoteRepository, id: &str) -> AppResult<Note> {
    require(repo, id)
}

pub fn create(repo: &dyn NoteRepository, now_iso: &str, input: &NoteCreate) -> AppResult<Note> {
    let title = validate_title(input.title.as_deref().unwrap_or(""))?;
    let (content_json, search_text) =
        prepare_content(input.content_json.as_deref().unwrap_or(EMPTY_DOC))?;
    let project_id = input.project_id.clone().filter(|p| !p.is_empty());
    let parent = input.parent_note_id.clone().filter(|p| !p.is_empty());
    check_project(repo, project_id.as_deref())?;
    if let Some(p) = &parent {
        check_parent(repo, None, p)?;
    }
    if let Some(t) = &input.task_id {
        if !repo.task_exists(t)? {
            return Err(AppError::validation("Task không tồn tại"));
        }
    }
    let tags = check_tags(repo, input.tag_ids.as_deref().unwrap_or(&[]))?;

    let id = ids::new_id();
    repo.insert(&NewNote {
        id: id.clone(),
        project_id,
        parent_note_id: parent,
        title,
        content_json,
        search_text,
        created_at: now_iso.to_string(),
    })?;
    if let Some(t) = &input.task_id {
        repo.link_task(&id, t)?;
    }
    if !tags.is_empty() {
        repo.replace_tags(&id, &tags)?;
    }
    require(repo, &id)
}

/// Lưu tiêu đề + nội dung. Lệch `base_version` thì `CONFLICT`.
pub fn save(
    repo: &dyn NoteRepository,
    id: &str,
    title: &str,
    content_json: &str,
    base_version: u64,
) -> AppResult<SaveOutcome> {
    let current = require(repo, id)?;
    if current.version != base_version {
        return Err(AppError::new(
            ErrorCode::Conflict,
            "Ghi chú đã được thay đổi ở nơi khác, hãy tải lại",
        ));
    }
    let title = validate_title(title)?;
    let (content_json, search_text) = prepare_content(content_json)?;
    repo.save_content(id, &title, &content_json, &search_text)?;
    let fresh = require(repo, id)?;
    Ok(SaveOutcome {
        result: NoteSaveResult {
            version: fresh.version,
            updated_at: fresh.updated_at,
        },
        title_changed: fresh.title != current.title,
    })
}

/// `None` = giữ nguyên, `Some(None)` = bỏ, `Some(Some(x))` = đặt.
pub fn move_note(
    repo: &dyn NoteRepository,
    id: &str,
    project: Option<Option<String>>,
    parent: Option<Option<String>>,
) -> AppResult<Note> {
    let note = require(repo, id)?;
    let project_id = match project {
        None => note.project_id.clone(),
        Some(p) => p.filter(|p| !p.is_empty()),
    };
    let parent_id = match parent {
        None => note.parent_note_id.clone(),
        Some(p) => p.filter(|p| !p.is_empty()),
    };
    if project_id != note.project_id {
        check_project(repo, project_id.as_deref())?;
    }
    if parent_id != note.parent_note_id {
        if let Some(p) = &parent_id {
            check_parent(repo, Some(id), p)?;
        }
    }
    repo.set_location(id, project_id.as_deref(), parent_id.as_deref())?;
    require(repo, id)
}

pub fn delete(repo: &dyn NoteRepository, id: &str) -> AppResult<()> {
    require(repo, id)?;
    repo.soft_delete(id)
}

pub fn link_task(repo: &dyn NoteRepository, note_id: &str, task_id: &str) -> AppResult<()> {
    require(repo, note_id)?;
    if !repo.task_exists(task_id)? {
        return Err(AppError::validation("Task không tồn tại"));
    }
    repo.link_task(note_id, task_id)
}

pub fn unlink_task(repo: &dyn NoteRepository, note_id: &str, task_id: &str) -> AppResult<()> {
    require(repo, note_id)?;
    repo.unlink_task(note_id, task_id)
}

pub fn set_tags(repo: &dyn NoteRepository, note_id: &str, tag_ids: &[String]) -> AppResult<Note> {
    require(repo, note_id)?;
    let ids = check_tags(repo, tag_ids)?;
    repo.replace_tags(note_id, &ids)?;
    require(repo, note_id)
}
