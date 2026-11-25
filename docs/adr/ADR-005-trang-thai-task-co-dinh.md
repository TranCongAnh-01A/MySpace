# ADR-005 — Trạng thái Task cố định trong MVP
- **Trạng thái:** Đã chấp nhận · **Ngày:** 2026-11-26

## Bối cảnh
Task cần một tập trạng thái để lọc, hiển thị Kanban và tính tiến độ Project. Phạm vi MVP cần giữ gọn để kịp tiến độ 20 tuần (spec mục 2.3, 10).

## Các phương án đã cân nhắc
- **Trạng thái tùy chỉnh theo Project ngay từ MVP:** bị đưa ra khỏi MVP (spec mục 2.3, 3.3).
- **Subtask nhiều cấp:** cũng bị đưa ra khỏi MVP. Thay bằng Checklist (spec mục 3.3).
- **Trạng thái cố định Todo, In Progress, Review, Done:** được chọn.

## Quyết định
- `Status` của Task là enum cố định: Todo, InProgress, Review, Done. Lưu dạng `TEXT` kèm `CHECK` (spec mục 8.5).
- Checklist là danh sách bước nhỏ trong Task, thay cho Subtask (spec mục 3.3, ADR-005).
- Quy tắc đi kèm: chuyển sang Done thì ghi `CompletedAt`. Mở lại thì xóa `CompletedAt` và trả về trạng thái trước đó, mặc định Todo (spec mục 3.3). Analysis bổ sung cột `previous_status` để làm việc này (analysis mục 2).

## Hệ quả
**Tích cực**
- Schema và giao diện Kanban đơn giản, ít trường hợp cần xử lý.
- Tiến độ Project tính được ngay từ trạng thái Done (spec mục 3.4).
- Kiểu `status` trong DTO và API được khai báo cố định, khớp với bảng Task ở analysis mục 3.

**Đánh đổi**
- Người dùng không tự đặt được trạng thái riêng trong v1.0.
- Khi làm trạng thái tùy chỉnh sau v1.0, cần thêm bảng trạng thái có trường `Category` (Todo/Doing/Done) để tính tiến độ (spec mục 8.5).

## Liên quan
- [Spec mục 2.3, 3.3, 3.4, 8.5](../spec/lifehub_spec_20261126.md)
- [Phân tích: mục 2 và 3](../plan/lifehub_analysis_20261126.md)
- [ADR-006: fractional indexing](./ADR-006-fractional-indexing.md)
