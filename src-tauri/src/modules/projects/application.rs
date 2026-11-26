use crate::error::{AppError, AppResult, ErrorCode};
use crate::ids;
use crate::sort_key;

use super::domain::{
    ChildMode, NoteSummary, Project, ProjectCreate, ProjectOverview, ProjectPatch, ProjectProgress,
    StatusCounts,
};

/// Cổng ra của module Projects.
pub trait ProjectRepository {
    fn insert(&self, project: &Project) -> AppResult<()>;
    /// Ghi tên, mô tả, trạng thái, Area, màu, icon, ngày, `sort_key`; tăng `version`, index lại.
    fn save(&self, project: &Project) -> AppResult<()>;
    /// Project chưa xoá mềm (kể cả đã lưu trữ).
    fn find(&self, id: &str) -> AppResult<Option<Project>>;
    /// Theo `sort_key`; `archived` chọn nhóm đã lưu trữ hay chưa. Không trả Project đã xoá.
    fn list(&self, archived: bool) -> AppResult<Vec<Project>>;
    fn last_sort_key(&self) -> AppResult<Option<String>>;
    fn adjacent_sort_key(
        &self,
        key: &str,
        exclude_id: &str,
        after: bool,
    ) -> AppResult<Option<String>>;
    fn area_exists(&self, id: &str) -> AppResult<bool>;
    /// Đếm Task chưa lưu trữ, chưa xoá theo trạng thái.
    fn counts(&self, id: &str) -> AppResult<StatusCounts>;
    /// 5 Note cập nhật gần nhất của Project (không lấy Note đã xoá).
    fn recent_notes(&self, id: &str) -> AppResult<Vec<NoteSummary>>;
    /// Lưu trữ Project (+ Task con theo `mode`) với cùng một mốc thời gian.
    fn archive(&self, id: &str, mode: ChildMode) -> AppResult<()>;
    /// Bỏ lưu trữ Project và các Task bị lưu trữ cùng mốc với nó.
    fn unarchive(&self, id: &str) -> AppResult<()>;
    /// Xoá mềm Project (+ Task con theo `mode`) với cùng một mốc thời gian.
    fn soft_delete(&self, id: &str, mode: ChildMode) -> AppResult<()>;
}

fn not_found() -> AppError {
    AppError::new(ErrorCode::NotFound, "Không tìm thấy Project")
}

fn require(repo: &dyn ProjectRepository, id: &str) -> AppResult<Project> {
    repo.find(id)?.ok_or_else(not_found)
}

fn check_area(repo: &dyn ProjectRepository, area_id: Option<&str>) -> AppResult<()> {
    match area_id {
        Some(a) if !repo.area_exists(a)? => Err(AppError::validation("Area không tồn tại")),
        _ => Ok(()),
    }
}

pub fn list(repo: &dyn ProjectRepository, archived: bool) -> AppResult<Vec<Project>> {
    repo.list(archived)
}

pub fn progress(repo: &dyn ProjectRepository, project: &Project) -> AppResult<ProjectProgress> {
    let counts = repo.counts(&project.id)?;
    Ok(ProjectProgress::new(project, counts.done, counts.total()))
}

pub fn get_overview(repo: &dyn ProjectRepository, id: &str) -> AppResult<ProjectOverview> {
    let project = require(repo, id)?;
    let counts = repo.counts(id)?;
    Ok(ProjectOverview {
        progress: ProjectProgress::new(&project, counts.done, counts.total()),
        counts,
        project,
        recent_notes: repo.recent_notes(id)?,
    })
}

/// Project mới xếp cuối danh sách.
pub fn create(
    repo: &dyn ProjectRepository,
    now_iso: &str,
    input: &ProjectCreate,
) -> AppResult<Project> {
    let last = repo.last_sort_key()?;
    let key = sort_key::between(last.as_deref(), None);
    let project = Project::new(ids::new_id(), input, key, now_iso.to_string())?;
    check_area(repo, project.area_id.as_deref())?;
    repo.insert(&project)?;
    require(repo, &project.id)
}

pub fn update(
    repo: &dyn ProjectRepository,
    id: &str,
    patch: &ProjectPatch,
    base_version: u64,
) -> AppResult<Project> {
    let mut project = require(repo, id)?;
    if project.version != base_version {
        return Err(AppError::new(
            ErrorCode::Conflict,
            "Project đã được thay đổi ở nơi khác, hãy tải lại",
        ));
    }
    project.apply(patch)?;
    check_area(repo, project.area_id.as_deref())?;
    repo.save(&project)?;
    require(repo, id)
}

/// `before_id` = mục nằm ngay trên vị trí mới, `after_id` = mục nằm ngay dưới.
pub fn reorder(
    repo: &dyn ProjectRepository,
    id: &str,
    before_id: Option<&str>,
    after_id: Option<&str>,
) -> AppResult<Project> {
    if before_id.is_none() && after_id.is_none() {
        return Err(AppError::validation("Cần beforeId hoặc afterId"));
    }
    if before_id == Some(id) || after_id == Some(id) {
        return Err(AppError::validation(
            "Không thể xếp Project vào cạnh chính nó",
        ));
    }
    let mut project = require(repo, id)?;
    let before = before_id.map(|b| require(repo, b)).transpose()?;
    let after = after_id.map(|a| require(repo, a)).transpose()?;
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
    project.sort_key = sort_key::between(lower.as_deref(), upper.as_deref());
    repo.save(&project)?;
    require(repo, id)
}

pub fn archive(repo: &dyn ProjectRepository, id: &str, mode: ChildMode) -> AppResult<()> {
    let project = require(repo, id)?;
    if project.archived_at.is_some() {
        return Ok(());
    }
    repo.archive(id, mode)
}

pub fn unarchive(repo: &dyn ProjectRepository, id: &str) -> AppResult<()> {
    let project = require(repo, id)?;
    if project.archived_at.is_none() {
        return Ok(());
    }
    repo.unarchive(id)
}

pub fn delete(repo: &dyn ProjectRepository, id: &str, mode: ChildMode) -> AppResult<()> {
    require(repo, id)?;
    repo.soft_delete(id, mode)
}
