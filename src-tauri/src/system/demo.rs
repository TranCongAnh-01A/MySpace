//! Dữ liệu mẫu cho bản debug (`seed_demo_data`). Bản release không có module này.

use chrono::{Duration, Utc};
use rusqlite::Connection;
use tauri::{AppHandle, State};

use crate::clock::{Clock, SystemClock};
use crate::db::Db;
use crate::error::{AppError, AppResult, ErrorCode};
use crate::modules::areas::application as areas_app;
use crate::modules::areas::domain::{Area, AreaCreate};
use crate::modules::areas::infrastructure::SqliteAreaRepository;
use crate::modules::emit_entity_changed;
use crate::modules::inbox::application as inbox_app;
use crate::modules::inbox::infrastructure::SqliteInboxRepository;
use crate::modules::notes::application as notes_app;
use crate::modules::notes::domain::NoteCreate;
use crate::modules::notes::infrastructure::SqliteNoteRepository;
use crate::modules::projects::application as projects_app;
use crate::modules::projects::domain::{Project, ProjectCreate, ProjectStatus};
use crate::modules::projects::infrastructure::{self as projects_infra, SqliteProjectRepository};
use crate::modules::settings::commands::SettingsState;
use crate::modules::tags::application as tags_app;
use crate::modules::tags::domain::{Tag, TagCreate};
use crate::modules::tags::infrastructure::SqliteTagRepository;
use crate::modules::tasks::application as tasks_app;
use crate::modules::tasks::domain::{Priority, TaskCreate, TaskStatus};
use crate::modules::tasks::infrastructure::SqliteTaskRepository;
use crate::modules::tasks::timectx::{fmt_date, TimeCtx};

/// Tên dùng để phát hiện đã seed (kiểm tra theo tiền tố).
pub const DEMO_MARKER: &str = "GGStudio";
const GG_NAME: &str = "GGStudio — Gaming Services Marketplace";

const DONE_NAMES: [&str; 26] = [
    "Authentication",
    "Database",
    "Landing page",
    "Thiết kế logo và bộ nhận diện",
    "Khảo sát đối thủ",
    "Wireframe trang chủ",
    "Wireframe trang dịch vụ",
    "Thiết lập CI/CD",
    "Cấu hình môi trường staging",
    "API danh sách dịch vụ",
    "API hồ sơ người bán",
    "Trang đăng ký / đăng nhập",
    "Trang danh sách dịch vụ",
    "Trang chi tiết dịch vụ",
    "Tìm kiếm và lọc dịch vụ",
    "Phân quyền người dùng",
    "Upload ảnh đại diện",
    "Hệ thống đánh giá",
    "Trang hồ sơ người bán",
    "Giao diện mobile responsive",
    "Viết test cho Authentication",
    "Tối ưu truy vấn Database",
    "Trang Điều khoản dịch vụ",
    "Cấu hình tên miền và SSL",
    "Logging và theo dõi lỗi",
    "Tài liệu API",
];

/// (tiêu đề, trạng thái, ưu tiên, hạn tính từ hôm nay theo ngày, tag).
type Row = (
    &'static str,
    TaskStatus,
    Priority,
    Option<i64>,
    &'static [&'static str],
);

/// 14 Task chưa xong: 2 quá hạn (Payment API, Email service), 3 hạn hôm nay.
const OPEN_ROWS: [Row; 14] = [
    (
        "Booking system",
        TaskStatus::InProgress,
        Priority::High,
        Some(0),
        &["backend"],
    ),
    (
        "Admin UI",
        TaskStatus::InProgress,
        Priority::Medium,
        Some(0),
        &["frontend"],
    ),
    (
        "SEO",
        TaskStatus::Todo,
        Priority::Low,
        Some(0),
        &["frontend"],
    ),
    (
        "Payment API",
        TaskStatus::Todo,
        Priority::Urgent,
        Some(-3),
        &["backend", "urgent"],
    ),
    (
        "Email service",
        TaskStatus::Todo,
        Priority::High,
        Some(-1),
        &["backend"],
    ),
    (
        "Review code module Booking",
        TaskStatus::Review,
        Priority::Medium,
        Some(2),
        &["backend"],
    ),
    (
        "Review giao diện Admin",
        TaskStatus::Review,
        Priority::Low,
        Some(3),
        &["frontend"],
    ),
    (
        "Thông báo đẩy cho người dùng",
        TaskStatus::Todo,
        Priority::Medium,
        Some(4),
        &[],
    ),
    (
        "Trang quản lý đơn hàng",
        TaskStatus::Todo,
        Priority::High,
        Some(5),
        &["frontend"],
    ),
    (
        "Báo cáo doanh thu",
        TaskStatus::Todo,
        Priority::Medium,
        Some(7),
        &[],
    ),
    (
        "Chat giữa người mua và người bán",
        TaskStatus::Todo,
        Priority::Medium,
        Some(9),
        &["backend"],
    ),
    (
        "Kiểm thử tải",
        TaskStatus::Todo,
        Priority::Low,
        Some(11),
        &[],
    ),
    (
        "Chuẩn bị tài liệu bàn giao",
        TaskStatus::Todo,
        Priority::Low,
        Some(13),
        &[],
    ),
    (
        "Kế hoạch ra mắt",
        TaskStatus::Todo,
        Priority::High,
        None,
        &["urgent"],
    ),
];

const THESIS_TASKS: [(&str, TaskStatus); 6] = [
    ("Chọn đề tài", TaskStatus::Done),
    ("Viết đề cương", TaskStatus::Done),
    ("Chương 1: Cơ sở lý thuyết", TaskStatus::InProgress),
    ("Chương 2: Phân tích hệ thống", TaskStatus::Todo),
    ("Chương 3: Cài đặt và kiểm thử", TaskStatus::Todo),
    ("Chuẩn bị slide bảo vệ", TaskStatus::Todo),
];

fn find_area(repo: &SqliteAreaRepository<'_>, name: &str) -> AppResult<Area> {
    match areas_app::list(repo)?.into_iter().find(|a| a.name == name) {
        Some(a) => Ok(a),
        None => areas_app::create(
            repo,
            &AreaCreate {
                name: name.into(),
                color: None,
            },
        ),
    }
}

fn find_tag(repo: &SqliteTagRepository<'_>, name: &str) -> AppResult<Tag> {
    match tags_app::list(repo)?.into_iter().find(|t| t.name == name) {
        Some(t) => Ok(t),
        None => tags_app::create(
            repo,
            &TagCreate {
                name: name.into(),
                color: None,
            },
        ),
    }
}

fn make_project(
    repo: &SqliteProjectRepository<'_>,
    clock: &dyn Clock,
    input: ProjectCreate,
) -> AppResult<Project> {
    projects_app::create(repo, &clock.now_iso(), &input)
}

fn text(t: &str) -> serde_json::Value {
    serde_json::json!({ "type": "text", "text": t })
}

fn para(t: &str) -> serde_json::Value {
    serde_json::json!({ "type": "paragraph", "content": [text(t)] })
}

fn heading(level: u8, t: &str) -> serde_json::Value {
    serde_json::json!({ "type": "heading", "attrs": { "level": level }, "content": [text(t)] })
}

fn checklist(items: &[(&str, bool)]) -> serde_json::Value {
    let rows: Vec<_> = items
        .iter()
        .map(|(t, done)| {
            serde_json::json!({ "type": "taskItem", "attrs": { "checked": done }, "content": [para(t)] })
        })
        .collect();
    serde_json::json!({ "type": "taskList", "content": rows })
}

fn code(language: &str, body: &str) -> serde_json::Value {
    serde_json::json!({ "type": "codeBlock", "attrs": { "language": language }, "content": [text(body)] })
}

fn doc(content: Vec<serde_json::Value>) -> String {
    serde_json::json!({ "type": "doc", "content": content }).to_string()
}

/// 3 Note cho GGStudio; Note "API thanh toán" liên kết với Task "Payment API".
fn seed_notes(
    conn: &Connection,
    clock: &dyn Clock,
    project_id: &str,
    payment_task: Option<&str>,
) -> AppResult<()> {
    let repo = SqliteNoteRepository::new(conn, clock);
    let now = clock.now_iso();
    let rows = [
        (
            "Yêu cầu kỹ thuật Booking",
            doc(vec![
                heading(1, "Yêu cầu kỹ thuật Booking"),
                para("Đặt lịch theo khung giờ 30 phút, chống đặt trùng ở tầng cơ sở dữ liệu."),
                heading(2, "Việc cần làm"),
                checklist(&[
                    ("Thiết kế bảng booking_slots", true),
                    ("API giữ chỗ tạm 10 phút", false),
                    ("Gửi email xác nhận", false),
                ]),
                code(
                    "sql",
                    "CREATE UNIQUE INDEX ux_slot ON booking_slots (provider_id, starts_at);",
                ),
            ]),
            None,
        ),
        (
            "Ghi chú họp khách hàng",
            doc(vec![
                heading(2, "Họp ngày 20/11"),
                para("Khách muốn thêm bộ lọc theo game và mức giá."),
                checklist(&[
                    ("Gửi báo giá bản cập nhật", false),
                    ("Xác nhận lịch demo tuần sau", true),
                ]),
            ]),
            None,
        ),
        (
            "API thanh toán",
            doc(vec![
                heading(1, "API thanh toán"),
                para("Dùng Stripe Connect, người bán nhận tiền sau khi đơn hoàn tất."),
                checklist(&[
                    ("Tạo tài khoản Connect cho người bán", false),
                    ("Webhook xác nhận thanh toán", false),
                ]),
                code(
                    "json",
                    "{ \"event\": \"payment.succeeded\", \"orderId\": \"...\" }",
                ),
            ]),
            payment_task,
        ),
    ];
    for (title, content, task_id) in rows {
        notes_app::create(
            &repo,
            &now,
            &NoteCreate {
                title: Some(title.into()),
                content_json: Some(content),
                project_id: Some(project_id.into()),
                task_id: task_id.map(Into::into),
                ..Default::default()
            },
        )?;
    }
    Ok(())
}

/// Tạo dữ liệu mẫu trong `conn` (gọi trong một transaction).
/// Đã có Project tên bắt đầu bằng "GGStudio" thì trả `CONFLICT`.
pub fn seed(conn: &Connection, clock: &dyn Clock, ctx: &TimeCtx) -> AppResult<()> {
    if projects_infra::name_starts_with(conn, DEMO_MARKER)? {
        return Err(AppError::new(
            ErrorCode::Conflict,
            "Dữ liệu mẫu đã tồn tại (dự án GGStudio)",
        ));
    }
    let areas = SqliteAreaRepository::new(conn, clock);
    let tags = SqliteTagRepository::new(conn, clock);
    let projects = SqliteProjectRepository::new(conn, clock);
    let tasks = SqliteTaskRepository::new(conn, clock);

    let work = find_area(&areas, "Công việc")?;
    let study = find_area(&areas, "Học tập")?;
    let backend = find_tag(&tags, "backend")?.id;
    let frontend = find_tag(&tags, "frontend")?.id;
    let urgent = find_tag(&tags, "urgent")?.id;
    let tag_by_name = |n: &str| match n {
        "backend" => backend.clone(),
        "frontend" => frontend.clone(),
        _ => urgent.clone(),
    };

    let today = ctx.today();
    let day = |offset: i64| fmt_date(today + Duration::days(offset));

    let gg = make_project(
        &projects,
        clock,
        ProjectCreate {
            name: GG_NAME.into(),
            description: Some("Nền tảng chợ dịch vụ game: đặt lịch, thanh toán, đánh giá.".into()),
            area_id: Some(work.id.clone()),
            status: Some(ProjectStatus::Active),
            color: Some("#A08BDF".into()),
            icon: Some("gamepad-2".into()),
            start_date: Some(day(-30)),
            target_date: Some(day(21)),
        },
    )?;

    for (i, name) in DONE_NAMES.iter().enumerate() {
        let n = i64::try_from(i).unwrap_or(0);
        tasks_app::create(
            &tasks,
            ctx,
            &TaskCreate {
                title: (*name).into(),
                project_id: Some(gg.id.clone()),
                status: Some(TaskStatus::Done),
                priority: Some(if i < 3 {
                    Priority::High
                } else {
                    Priority::Medium
                }),
                due_date: (i % 3 == 0).then(|| day(-(n / 2) - 1)),
                tag_ids: (i < 3).then(|| vec![backend.clone()]),
                ..Default::default()
            },
        )?;
    }
    let mut payment_task: Option<String> = None;
    for (title, status, priority, offset, tag_names) in OPEN_ROWS {
        let task = tasks_app::create(
            &tasks,
            ctx,
            &TaskCreate {
                title: title.into(),
                project_id: Some(gg.id.clone()),
                status: Some(status),
                priority: Some(priority),
                due_date: offset.map(day),
                tag_ids: Some(tag_names.iter().map(|n| tag_by_name(n)).collect()),
                ..Default::default()
            },
        )?;
        if title == "Payment API" {
            payment_task = Some(task.id);
        }
    }
    seed_notes(conn, clock, &gg.id, payment_task.as_deref())?;

    let thesis = make_project(
        &projects,
        clock,
        ProjectCreate {
            name: "Đồ án tốt nghiệp".into(),
            area_id: Some(study.id.clone()),
            color: Some("#4FB3A5".into()),
            icon: Some("graduation-cap".into()),
            target_date: Some(day(60)),
            ..Default::default()
        },
    )?;
    for (i, (title, status)) in THESIS_TASKS.iter().enumerate() {
        let week = i64::try_from(i).unwrap_or(0) + 1;
        tasks_app::create(
            &tasks,
            ctx,
            &TaskCreate {
                title: (*title).into(),
                project_id: Some(thesis.id.clone()),
                status: Some(*status),
                due_date: Some(day(7 * week)),
                ..Default::default()
            },
        )?;
    }

    let inbox = SqliteInboxRepository::new(conn, clock);
    for text in [
        "Gọi khách hàng GGStudio xác nhận yêu cầu",
        "Đọc tài liệu Stripe Connect",
        "Mua cáp HDMI",
    ] {
        inbox_app::create(&inbox, clock, text)?;
    }
    Ok(())
}

/// Chỉ có ở bản debug. Một transaction; đã có dự án GGStudio thì `CONFLICT`.
#[tauri::command]
pub fn seed_demo_data(
    app: AppHandle,
    db: State<'_, Db>,
    settings: State<'_, SettingsState>,
) -> AppResult<()> {
    {
        let mut conn = db.lock()?;
        let tx = conn.transaction()?;
        let ctx = TimeCtx::new(&settings.get().timezone, Utc::now());
        seed(&tx, &SystemClock, &ctx)?;
        tx.commit()?;
    }
    for entity in ["area", "tag", "project", "task", "inbox", "note"] {
        emit_entity_changed(&app, entity, vec![]);
    }
    Ok(())
}

#[cfg(test)]
#[path = "demo_tests.rs"]
mod tests;
