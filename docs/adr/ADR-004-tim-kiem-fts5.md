# ADR-004 — Tìm kiếm bằng SQLite FTS5
- **Trạng thái:** Đã chấp nhận · **Ngày:** 2026-11-26

## Bối cảnh
LifeHub cần tìm kiếm toàn văn trên Task, Project, Note và Inbox, không phân biệt dấu. Ví dụ: gõ "nhac nho" phải ra "nhắc nhở" (spec mục 8.5, 9.1).

## Các phương án đã cân nhắc
- **Tìm chuỗi thường trên các bảng gốc:** không có tokenizer bỏ dấu nên không đạt yêu cầu tìm không dấu. Đây là suy luận từ yêu cầu, không phải phương án được nguồn nêu tên.
- **SQLite FTS5 với tokenizer `unicode61 remove_diacritics 2`:** được chọn.

## Quyết định
- Dùng bảng FTS5 với tokenizer `unicode61 remove_diacritics 2` (spec mục 8.5; analysis mục 3).
- Cập nhật chỉ mục trong cùng transaction với thao tác ghi, bằng trigger hoặc ở tầng repository (spec mục 8.5).
- Phạm vi mở dần theo phiên bản: Task và Inbox ở v0.2, thêm Project ở v0.3, thêm Note ở v0.5 (analysis mục 3, bảng API `search`).
- Khi build, kiểm tra bản SQLite có bật FTS5. Thư viện rusqlite dùng feature `bundled` (spec mục 8.5, analysis mục 3).

## Hệ quả
**Tích cực**
- Tìm không dấu hoạt động với tiếng Việt, như yêu cầu nghiệm thu spec mục 12.2.
- Chỉ mục luôn đồng bộ với dữ liệu nhờ cùng transaction.
- Không cần thêm dịch vụ tìm kiếm bên ngoài, phù hợp với định hướng offline (spec mục 9.1).

**Đánh đổi**
- Phải kiểm tra FTS5 có sẵn trong bản SQLite được build (spec mục 8.5).
- Cần code bảo trì chỉ mục khi thêm module có thể tìm kiếm.
- Mục tiêu "tìm kiếm trên 10.000 bản ghi dưới 100 ms" là mục tiêu kiểm thử, chưa phải số liệu đã đo (spec mục 9.3).

## Liên quan
- [Spec mục 8.5, 9.1, 9.3, 12.2](../spec/lifehub_spec_20261126.md)
- [Phân tích: mục 3](../plan/lifehub_analysis_20261126.md)
- [ADR-003: nghiệp vụ nằm ở Rust](./ADR-003-nghiep-vu-o-rust.md)
