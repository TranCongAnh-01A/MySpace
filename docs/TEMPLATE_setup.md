<!-- 
🚨 TEMPLATE INSTRUCTION: 
- [HUMAN] Please copy this template, fill in the blanks, and DELETE this comment block before saving.
- [AGENT/MCP] You MUST remove this entire comment block and all placeholder tags (e.g., [Tên_lệnh]) when generating the final file. Do not output this instruction block to the user.
-->

# [TÊN DỰ ÁN/MODULE]_SETUP — Hướng dẫn Thiết lập

> ⚠️ File có hậu tố `_setup.md` nằm trong danh sách ngoại lệ (G.2) — **luôn ghi đè/cập nhật trực tiếp**, không đính kèm ngày tháng.
> Đặt tên file theo dạng: `[ten_du_an_hoac_module]_setup.md`.

**Cập nhật lần cuối:** YYYY-MM-DD HH:MM

---

## 1. Tổng quan Kiến trúc
- Chức năng/module này làm gì: ...
- Các thành phần chính và tương tác giữa chúng (vd: Frontend gọi API → Backend xử lý → ghi DB):
  ...
- (Tuỳ chọn) Sơ đồ luồng đơn giản dạng text/mermaid nếu phức tạp.

## 2. Yêu cầu Hệ thống (Prerequisites)
- ...
- Phiên bản Node/Python/... tối thiểu: ...

## 3. Các Bước Cài Đặt
```bash
# Bước 1: Clone dự án
git clone <repo_url>
# ✅ Kết quả mong đợi: thư mục <repo_name> được tạo, không báo lỗi permission/auth.

# Bước 2: Cài dependencies
...
# ✅ Kết quả mong đợi: ...

# Bước 3: Cấu hình biến môi trường
cp .env.example .env
# Điền giá trị thật vào .env (KHÔNG commit file này)
# ✅ Kết quả mong đợi: file .env tồn tại, các biến bắt buộc đã có giá trị (không còn placeholder).
```

## 4. Cấu hình chi tiết
- Danh sách biến `.env` bắt buộc và ý nghĩa từng biến: ...
- Setup Database/Wallet/Network (nếu có): ...

## 5. Chạy Dự án (Development)
```bash
...
# ✅ Kết quả mong đợi: server chạy tại http://localhost:PORT, log hiển thị "Ready" / không có lỗi đỏ.
```

## 6. Chạy Test tự động (nếu có)
```bash
...
# ✅ Kết quả mong đợi: toàn bộ test case PASS, 0 failed.
```

## 7. Kịch bản Kiểm thử thủ công (Manual Test Scenarios)
| # | Bước thực hiện | Kết quả mong đợi | Trường hợp lỗi cần thử |
|---|---|---|---|
| 1 | ... | ... | vd: nhập sai định dạng → hiện thông báo lỗi rõ ràng |
| 2 | ... | ... | ... |

## 8. Build / Deploy
```bash
...
# ✅ Kết quả mong đợi: ...
```

## 9. Xử lý Sự cố Thường gặp
| Vấn đề | Nguyên nhân | Cách khắc phục |
|---|---|---|
| ... | ... | ... |