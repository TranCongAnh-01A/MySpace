<!-- 
🚨 TEMPLATE INSTRUCTION: 
- [HUMAN] Please copy this template, fill in the blanks, and DELETE this comment block before saving.
- [AGENT/MCP] You MUST remove this entire comment block and all placeholder tags (e.g., [Tên_lệnh]) when generating the final file. Do not output this instruction block to the user.
-->

# 📋 SPEC — [Tên Tính năng / Hệ thống]

> File này dùng để **người dùng tự điền tay** trước khi yêu cầu AI build/sửa, giúp AI hiểu đúng ý định, phạm vi và ràng buộc kỹ thuật ngay từ đầu.
> Không cần trả lời hết tất cả — chỉ cần điền phần bạn đã có ý tưởng, để trống phần chưa rõ.
> ⚠️ File này KHÔNG nằm trong danh sách ngoại lệ (G.2) — khi tạo file thật (không phải bản template gốc), đặt tên theo dạng:
> `docs/spec/[ten_tinh_nang]_spec_YYYYMMDD.md` (VD: `checkout_flow_spec_20260714.md`).
> Nếu trùng ngày, thêm hậu tố `_HHMM` hoặc `_v2`.
> Sau khi tạo/điền xong, nhớ cập nhật liên kết vào [docs/INDEX.md](../INDEX.md), và có thể dùng kèm `#plan` hoặc `#ask` để AI phân tích, đề xuất hướng triển khai.

---

## 1. Bối cảnh & Mục tiêu
- Vấn đề đang gặp phải là gì / muốn build tính năng gì?
- Ai sẽ dùng tính năng này (end-user, admin, hệ thống khác gọi vào)?
- Mục tiêu chính cần đạt được (1-2 câu, càng cụ thể càng tốt)?
- Đây là tính năng **mới hoàn toàn** hay **sửa/mở rộng** cái đã có? Nếu sửa, cái cũ đang hoạt động ra sao?

## 2. Công nghệ & Ràng buộc Kỹ thuật
- Ngôn ngữ/framework chính đang dùng (hoặc muốn dùng)?
- Database/lưu trữ dữ liệu: dùng gì (PostgreSQL, MongoDB, Redis, file tĩnh...)?
- Có thư viện/package **bắt buộc phải dùng** (hoặc bắt buộc **không được dùng**) không?
- Có giới hạn hạ tầng không (serverless, VPS, self-host, giới hạn RAM/CPU/băng thông)?
- Có cần tương thích ngược (backward compatible) với hệ thống/API cũ không?

## 3. Ý tưởng Hoạt động Sơ bộ
- Mô tả ngắn gọn cách tính năng này hoạt động theo cách bạn hình dung?
- Có ví dụ/sản phẩm tương tự để tham khảo không (tên app, link, ảnh chụp)?
- Có sẵn wireframe/mockup UI không (nếu có giao diện)?

## 4. Luồng Hoạt động (Flow)
- Input đầu vào là gì (dữ liệu, sự kiện, thao tác người dùng, webhook...)?
- Các bước xử lý chính theo đúng thứ tự (Bước 1 → Bước 2 → Bước 3...)?
- Output/kết quả cuối cùng trả về là gì?
- Có cần xử lý bất đồng bộ / real-time / background job / cron không?

## 5. Phạm vi (Scope)
- **Trong phạm vi (In-scope):** những gì bắt buộc phải có ở bản đầu tiên?
- **Ngoài phạm vi (Out-of-scope):** những gì chưa cần làm ngay, để lại sau?
- Có deadline hoặc mốc thời gian ưu tiên nào không?

## 6. Trường hợp Đặc biệt & Edge Case
- Trường hợp lỗi/thất bại cần xử lý ra sao (input rỗng/sai định dạng, mất mạng, trùng dữ liệu...)?
- Có giới hạn (limit) nào cần áp dụng không (rate limit, kích thước file, số lượng bản ghi...)?
- Nhiều người dùng/tiến trình cùng thao tác đồng thời (concurrency) có cần xử lý đặc biệt không?

## 7. Bảo mật & Phân quyền
- Ai được phép truy cập/thao tác tính năng này (role, permission)?
- Có dữ liệu nhạy cảm cần bảo vệ không (thông tin cá nhân, thanh toán, key...)?
- Có cần xác thực/đăng nhập (authentication/authorization) không?

## 8. Tích hợp & Phụ thuộc
- Tính năng này có gọi API/dịch vụ bên ngoài nào không (third-party, payment gateway, mail service...)?
- Có phụ thuộc vào module/tính năng khác đã có sẵn trong hệ thống không?

## 9. Câu hỏi Mở / Chưa chắc chắn
- Liệt kê những điều bạn còn phân vân, chưa quyết định, muốn AI đề xuất thêm phương án lựa chọn.