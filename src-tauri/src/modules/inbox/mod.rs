//! Module Inbox, chia 4 lớp theo spec 7.2. Đây là mẫu cho các module khác.
//!
//! - `domain`: kiểu và quy tắc thuần, không biết DB hay Tauri.
//! - `application`: use case + trait repository.
//! - `infrastructure`: repository cài bằng rusqlite.
//! - `commands`: lớp mỏng nối IPC với use case.

pub mod application;
pub mod commands;
pub mod domain;
pub mod infrastructure;
