# LOCAL RULE — Rule Cục bộ của Dự án

> ⚠️ File nằm trong danh sách ngoại lệ (G.2) — **luôn ghi đè/cập nhật trực tiếp**, không đính kèm ngày tháng.
> Theo A.2, rule trong file này **luôn được ưu tiên áp dụng cao nhất**, ghi đè lên Global Rule khi có xung đột
> (trừ các nguyên tắc an toàn/bảo mật cốt lõi vẫn giữ nguyên).

**Cập nhật lần cuối:** 2026-11-26 00:32

---

## A. Ngoại lệ / Ghi đè so với Global Rule
> Liệt kê rõ những điểm dự án này làm khác đi so với Global Rule, để AI biết đây là chủ đích chứ không phải lỗi.

| Mục Global Rule | Nội dung Global Rule | Ngoại lệ áp dụng cho dự án này | Lý do |
|---|---|---|---|
| _(VD: B.1)_ | Comment bắt buộc Tiếng Việt | Comment bằng Tiếng Anh | Team quốc tế |

## B. Quy tắc Riêng của Dự án
- (VD: Quy ước đặt tên branch Git riêng)
- (VD: Chuẩn response API riêng)
- (VD: Thư viện bắt buộc/cấm dùng)
- (VD: Ngôn ngữ cần giao tiếp trong dự án)

## C. Ràng buộc Bảo mật Đặc thù (nếu có)
- ...

## D. Rule Con theo Module
> Các rule chi tiết hơn theo từng module nằm trong thư mục `docs/rule/`, xem mục lục tại [../INDEX.md](../INDEX.md).

## E. Ghi chú
- Nếu không có ngoại lệ nào, AI mặc định áp dụng 100% Global Rule.
