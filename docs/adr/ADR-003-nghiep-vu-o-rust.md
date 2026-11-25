# ADR-003 — Nghiệp vụ nằm ở Rust, không ở frontend
- **Trạng thái:** Đã chấp nhận · **Ngày:** 2026-11-26

## Bối cảnh
LifeHub có nhiều thao tác ghi nhiều bản ghi (chuyển Inbox thành Task, lưu trữ Project kèm Task), cần validation và một bộ nhắc nhở chạy nền (spec mục 5.3, 7.5). Nhắc nhở phải hoạt động khi không có cửa sổ nào mở.

## Các phương án đã cân nhắc
- **Nghiệp vụ và truy cập dữ liệu ở TypeScript, dùng `tauri-plugin-sql`:** là phương án dự phòng nếu Rust quá chậm (spec mục 13, rủi ro 1). Đánh đổi là mất một phần toàn vẹn ở tầng core.
- **Nghiệp vụ ở Rust, frontend chỉ gọi command:** được chọn.

## Quyết định
- Frontend không chạy SQL. Toàn bộ logic nghiệp vụ và truy cập dữ liệu nằm ở Rust. Không dùng `tauri-plugin-sql` cho nghiệp vụ (spec mục 6).
- Core tổ chức theo modular monolith theo chiều dọc. Mỗi module có các lớp `domain`, `application`, `infrastructure`, `commands` (spec mục 7.1, 7.2).
- Validation nằm ở Rust. Frontend chỉ validate thêm để phản hồi nhanh (spec mục 7.4).

Lý do: transaction, validation và scheduler nhắc nhở dùng chung một nguồn logic (spec mục 14, ADR-003).

## Hệ quả
**Tích cực**
- Một nguồn logic cho cả giao diện và bộ nhắc nhở chạy nền.
- Use case có thể kiểm thử bằng SQLite in-memory, không cần khởi động Tauri (spec mục 7.2).
- Toàn vẹn dữ liệu do cơ sở dữ liệu đảm bảo bằng foreign key và check constraint, không chỉ dựa vào code (spec mục 5.3).

**Đánh đổi**
- Người phát triển phải học Rust. Analysis xác định đây là rủi ro lớn nhất về tiến độ (analysis mục 2).
- Có phương án dự phòng: nếu sau Phase 1 vẫn quá chậm thì chuyển nghiệp vụ sang TypeScript (spec mục 13).

## Liên quan
- [Spec mục 5.3, 6, 7.1, 7.2, 13](../spec/lifehub_spec_20261126.md)
- [Phân tích: mục 2 và 3](../plan/lifehub_analysis_20261126.md)
- [ADR-001: nền tảng Tauri 2](./ADR-001-nen-tang-tauri.md)
- [ADR-004: tìm kiếm FTS5](./ADR-004-tim-kiem-fts5.md)
