use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::{AppError, AppResult};

pub const MAX_CONTENT_CHARS: usize = 10_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub enum InboxStatus {
    Open,
    Processed,
}

impl InboxStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Open => "Open",
            Self::Processed => "Processed",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "Open" => Some(Self::Open),
            "Processed" => Some(Self::Processed),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct InboxItem {
    pub id: String,
    pub content: String,
    pub status: InboxStatus,
    #[ts(optional)]
    pub converted_task_id: Option<String>,
    #[ts(optional)]
    pub converted_note_id: Option<String>,
    #[ts(optional)]
    pub processed_at: Option<String>,
    pub created_at: String,
}

impl InboxItem {
    /// Tạo mục Inbox mới (trạng thái `Open`). Nội dung được cắt khoảng trắng hai đầu.
    pub fn new(id: String, content: &str, now: String) -> AppResult<Self> {
        let content = validate_content(content)?;
        Ok(Self {
            id,
            content,
            status: InboxStatus::Open,
            converted_task_id: None,
            converted_note_id: None,
            processed_at: None,
            created_at: now,
        })
    }
}

fn validate_content(raw: &str) -> AppResult<String> {
    let content = raw.trim();
    if content.is_empty() {
        return Err(AppError::validation("Nội dung không được để trống"));
    }
    if content.chars().count() > MAX_CONTENT_CHARS {
        return Err(AppError::validation(format!(
            "Nội dung tối đa {MAX_CONTENT_CHARS} ký tự"
        )));
    }
    Ok(content.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ErrorCode;

    #[test]
    fn rejects_empty_and_whitespace() {
        for s in ["", "   \n\t"] {
            let err = InboxItem::new("1".into(), s, "t".into()).unwrap_err();
            assert_eq!(err.code, ErrorCode::Validation);
        }
    }

    #[test]
    fn rejects_too_long() {
        let long = "a".repeat(MAX_CONTENT_CHARS + 1);
        assert!(InboxItem::new("1".into(), &long, "t".into()).is_err());
        let ok = "a".repeat(MAX_CONTENT_CHARS);
        assert!(InboxItem::new("1".into(), &ok, "t".into()).is_ok());
    }

    #[test]
    fn trims_content() {
        let item = InboxItem::new("1".into(), "  mua sữa \n", "t".into()).unwrap();
        assert_eq!(item.content, "mua sữa");
        assert_eq!(item.status, InboxStatus::Open);
    }
}
