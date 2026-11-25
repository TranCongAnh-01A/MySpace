# ADR-006 — Fractional indexing cho thứ tự kéo thả
- **Trạng thái:** Đã chấp nhận · **Ngày:** 2026-11-26

## Bối cảnh
Kanban (Task và Project) cho phép kéo thả thẻ trong cột và giữ thứ tự sau khi tải lại (spec mục 3.4, 12.2). Cần lưu thứ tự sao cho một lần kéo không phải cập nhật nhiều bản ghi.

## Các phương án đã cân nhắc
- **Số thứ tự nguyên và đánh lại cả cột khi thả vào giữa:** làm một lần kéo thả phải ghi lại nhiều bản ghi. Spec yêu cầu kéo một thẻ không đánh lại số cả cột (spec mục 8.5).
- **Fractional indexing:** chọn khóa dạng chuỗi nằm giữa hai khóa lân cận.

## Quyết định
- Cột `SortKey` là chuỗi theo fractional indexing (spec mục 8.5, 7.4).
- Kéo một thẻ vào giữa hai thẻ chỉ cập nhật một bản ghi, không đánh lại số cả cột (spec mục 8.5).
- Core tính `sortKey` khi nhận `task_move(id, status, beforeId?, afterId?)`. Frontend không tự tính (analysis mục 3).
- Dùng crate `fractional_index` (analysis mục 3).

## Hệ quả
**Tích cực**
- Một thao tác kéo thả ghi một bản ghi. Dễ đảm bảo đúng khi nhiều thao tác liên tiếp.
- Thứ tự giữ nguyên sau khi khởi động lại, đáp ứng tiêu chí nghiệm thu Kanban (spec mục 12.2).
- Cùng cơ chế dùng cho checklist và thứ tự Area (analysis mục 3, spec mục 8.4).

**Đánh đổi**
- Khóa là chuỗi nên phải có logic sinh khóa ở Rust, và phải kiểm thử kỹ các trường hợp đặt cạnh nhau. Spec yêu cầu test "Unit (Rust): fractional index" (spec mục 12.1).
- Index `(ProjectId, Status, SortKey)` phải được tạo để truy vấn cột nhanh (spec mục 8.5).

## Liên quan
- [Spec mục 3.4, 7.4, 8.5, 12.1, 12.2](../spec/lifehub_spec_20261126.md)
- [Phân tích: mục 3](../plan/lifehub_analysis_20261126.md)
- [ADR-005: trạng thái Task cố định](./ADR-005-trang-thai-task-co-dinh.md)
