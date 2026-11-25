<!-- 
🚨 TEMPLATE INSTRUCTION: 
- [HUMAN] Please copy this template, fill in the blanks, and DELETE this comment block before saving.
- [AGENT/MCP] You MUST remove this entire comment block and all placeholder tags (e.g., [Tên_lệnh]) when generating the final file. Do not output this instruction block to the user.
-->

<!-- Vị trí: docs/log/log_YYYYMMDD.md -->
<!-- Hướng dẫn: Đổi tên file này thành log_YYYYMMDD.md theo ngày hiện tại (ví dụ: log_20260713.md).
     Mỗi phiên làm việc mới trong cùng một ngày được NỐI THÊM (append) vào cuối file này dưới dạng
     một mục "## Phiên [số]" mới — không ghi đè lên các phiên trước đó. -->
         
## Log mới nhất của file này là: Phiên [số] #L[dòng_bắt_đầu]-#L[dòng_kết_thúc]

# Log Phiên Làm Việc — Ngày YYYY-MM-DD

> ⚠️ File này KHÔNG nằm trong danh sách ngoại lệ (G.2) — khi tạo thật, đặt tên theo dạng:
> `docs/log/log_YYYYMMDD.md` (VD: `log_20260712.md`).
> Sau khi tạo, nhớ cập nhật liên kết vào [docs/INDEX.md](./INDEX.md).
> File này ghi lại nhật ký các thay đổi, tác vụ đã thực hiện và trạng thái công việc theo từng phiên làm việc (session) trong ngày. Dùng để tra cứu lại bối cảnh nhanh khi bắt đầu phiên mới (xem A.1 — Bootstrap Protocol).

---

## Phiên 1 — [HH:mm] → [HH:mm]

### Tóm tắt công việc

> `[commit-style]` [Dòng tóm tắt ngắn gọn theo kiểu commit message, ví dụ: "feat: thêm xác thực OTP cho luồng đăng nhập"]

- [Mô tả ngắn gọn công việc/tác vụ đã thực hiện trong phiên]
- [...]

### Trạng thái task
- ✅ [Tên task đã hoàn thành]
- 🔄 [Tên task đang thực hiện, chưa xong]
- ⏸️ [Tên task tạm hoãn]
- ❌ [Tên task thất bại / bị chặn — nêu lý do ngắn gọn]

### File bị ảnh hưởng
- Tạo mới: `đường/dẫn/file_moi.md`
- Chỉnh sửa: `đường/dẫn/file_da_sua.dart`
- Xoá: `đường/dẫn/file_da_xoa.ts`

### Ghi chú tồn đọng cho phiên sau
- [Vấn đề còn dang dở, điều cần lưu ý hoặc quyết định đang chờ người dùng]

---

<!--
  Khi có phiên làm việc tiếp theo trong CÙNG ngày, sao chép khối mẫu dưới đây,
  tăng số thứ tự phiên và điền thời gian mới, rồi nối vào cuối file:

## Phiên 2 — [HH:mm] → [HH:mm]

### Tóm tắt công việc

> `[commit-style]` [Dòng tóm tắt ngắn gọn theo kiểu commit message]

- ...

### Trạng thái task
- ...

### File bị ảnh hưởng
- ...

### Ghi chú tồn đọng cho phiên sau
- ...

---
-->
