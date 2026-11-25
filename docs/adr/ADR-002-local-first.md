# ADR-002 — Local-first, không tài khoản trong MVP
- **Trạng thái:** Đã chấp nhận · **Ngày:** 2026-11-26

## Bối cảnh
Nhiều ứng dụng năng suất phụ thuộc vào cloud, chậm khi mạng yếu, và người dùng không kiểm soát được dữ liệu của mình (spec mục 1.2). LifeHub cần dùng được hoàn toàn khi không có mạng (spec mục 1.3).

## Các phương án đã cân nhắc
- **Tài khoản và đồng bộ cloud ngay từ MVP:** bị đưa ra khỏi MVP. Spec liệt kê tài khoản người dùng, đồng bộ, nhiều workspace và cộng tác vào nhóm "Không thuộc MVP" (spec mục 2.3).
- **Local-first, một file SQLite trên máy người dùng:** được chọn.

## Quyết định
- Dữ liệu nằm trong một file SQLite cục bộ (`%LOCALAPPDATA%\<app-identifier>\lifehub.db`) (spec mục 8.1).
- Một người dùng trên một máy. Không có tài khoản, xác thực hay phân quyền trong MVP (spec mục 1.5, 2.3).
- Vẫn thiết kế dữ liệu sẵn sàng cho đồng bộ từ đầu: khóa UUID v7, các cột `Version` và `DeletedAt`, bảng `ChangeLog` (spec mục 7.6).

## Hệ quả
**Tích cực**
- Dùng được khi không có mạng và không cần tài khoản (spec mục 9.1).
- Người dùng sở hữu dữ liệu và sao lưu, khôi phục được qua chức năng Backup/Restore (spec mục 1.3).
- Không phải xây dựng phần xác thực và đa người dùng trong MVP.

**Đánh đổi**
- Chưa có đồng bộ nhiều máy trong v1.0. Đồng bộ là hướng mở rộng sau v1.0 (spec mục 1.5, 7.6).
- Khi làm đồng bộ, phải thêm máy chủ, xác thực và xử lý xung đột. Spec ghi việc này là phần sau v1.0 (spec mục 7.6).
- Thư mục dữ liệu gắn với `identifier` của ứng dụng, nên phải chốt identifier trước khi phát hành (spec mục 16.1).

## Liên quan
- [Spec mục 1, 2.3, 7.6, 8.1](../spec/lifehub_spec_20261126.md)
- [Phân tích: mục 3](../plan/lifehub_analysis_20261126.md)
- [ADR-001: nền tảng Tauri 2](./ADR-001-nen-tang-tauri.md)
- [ADR-008: phân phối](./ADR-008-phan-phoi.md)
