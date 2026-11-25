# ADR-007 — Phạm vi lặp lại
- **Trạng thái:** Đã chấp nhận · **Ngày:** 2026-11-26

## Bối cảnh
Người dùng cần lặp lại cho Task và sự kiện. Phần khó của lặp lại là ngoại lệ: sửa hoặc xóa riêng một lần lặp, chia chuỗi (spec mục 3.5). Cần giới hạn để kịp tiến độ MVP. Spec xếp sự kiện lặp vào nhóm "Sau v1.0" (spec mục 3.5, 11).

## Các phương án đã cân nhắc
- **Sự kiện lặp có ngoại lệ trong MVP:** bị loại vì phần ngoại lệ phức tạp (spec mục 3.5).
- **Tự viết bộ sinh lịch:** bị loại. Spec ghi rõ "không tự viết bộ sinh lịch" (spec mục 3.5).
- **Task lặp đơn giản trong MVP, sự kiện lặp dùng thư viện RRULE sau v1.0:** được chọn.

## Quyết định
- **MVP:** Task lặp theo ngày, tuần, tháng. Hoàn thành lần này thì sinh lần tiếp theo (spec mục 3.3). Bảng `RecurrenceSeries` có `Frequency` (Daily/Weekly/Monthly) (spec mục 8.4).
- Khóa duy nhất `(RecurrenceSeriesId, OccurrenceDate)` để không sinh trùng (spec mục 3.3, 8.5).
- **Sau v1.0:** sự kiện lặp có ngoại lệ, dùng thư viện RRULE có sẵn, lưu ngoại lệ riêng. Quy tắc lặp tùy chỉnh dạng RRULE cho Task cũng thuộc sau v1.0 (spec mục 3.3, 3.5).

## Hệ quả
**Tích cực**
- Phạm vi MVP nhỏ, dễ kiểm thử (unit test cho task lặp, test không sinh trùng) (spec mục 12.1, analysis mục 5 phase B2).
- Không tự viết logic lịch phức tạp.

**Đánh đổi**
- Không có sự kiện lặp trong v1.0. Người dùng phải tự tạo từng sự kiện.
- Khi làm sự kiện lặp, phải tích hợp thư viện RRULE và bảng ngoại lệ, là việc có chi phí riêng (spec mục 3.5).

## Liên quan
- [Spec mục 3.3, 3.5, 8.4, 8.5, 12.1](../spec/lifehub_spec_20261126.md)
- [Phân tích: mục 5](../plan/lifehub_analysis_20261126.md)
- [ADR-005: trạng thái Task cố định](./ADR-005-trang-thai-task-co-dinh.md)
