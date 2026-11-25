use serde::Serialize;
use ts_rs::TS;

/// Mã lỗi chung cho mọi command (xem analysis mục 3).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
// NotFound/Conflict dùng từ phase B trở đi.
#[allow(dead_code)]
pub enum ErrorCode {
    NotFound,
    Validation,
    Conflict,
    Db,
    Io,
    Internal,
}

/// Lỗi trả về qua IPC: `{ code, message, details? }`. `message` hiển thị được cho người dùng.
#[derive(Debug, Clone, Serialize, TS, thiserror::Error)]
#[error("{code:?}: {message}")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct AppError {
    pub code: ErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub details: Option<String>,
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            details: None,
        }
    }

    pub fn validation(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::Validation, message)
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::Internal, message)
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        Self {
            code: ErrorCode::Db,
            message: "Lỗi cơ sở dữ liệu".into(),
            details: Some(e.to_string()),
        }
    }
}

impl From<rusqlite_migration::Error> for AppError {
    fn from(e: rusqlite_migration::Error) -> Self {
        Self {
            code: ErrorCode::Db,
            message: "Không nâng cấp được cơ sở dữ liệu".into(),
            details: Some(e.to_string()),
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        Self {
            code: ErrorCode::Io,
            message: "Lỗi đọc/ghi tệp".into(),
            details: Some(e.to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_with_screaming_code() {
        let json = serde_json::to_value(AppError::validation("sai")).unwrap();
        assert_eq!(json["code"], "VALIDATION");
        assert_eq!(json["message"], "sai");
        assert!(json.get("details").is_none());
    }
}
