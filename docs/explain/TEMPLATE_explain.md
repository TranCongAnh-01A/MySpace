<!-- 
🚨 TEMPLATE INSTRUCTION: 
- [HUMAN] Please copy this template, fill in the blanks, and DELETE this comment block before saving.
- [AGENT/MCP] You MUST remove this entire comment block and all placeholder tags (e.g., [Tên_lệnh]) when generating the final file. Do not output this instruction block to the user.
-->

# 📖 TÀI LIỆU GIẢI THÍCH: [TÊN_FILE_HOẶC_MODULE]

> ⚠️ File này KHÔNG nằm trong danh sách ngoại lệ (G.2) — khi tạo thật, đặt tên theo dạng:
> `docs/explain/[tên_file]_explain_.md` (VD: `sohuutritue_test_explain_20260712.md`).
> Nếu trùng ngày, thêm hậu tố `_HHMM` hoặc `_v2`.
> Sau khi tạo, nhớ cập nhật liên kết vào [docs/INDEX.md](./INDEX.md).

# 1. Tổng quan (Overview)
- **Mục đích cốt lõi:** [Giải thích ngắn gọn: Đoạn code/file này sinh ra để giải quyết vấn đề gì?]
- **Vai trò trong hệ thống:** [Nó nằm ở tầng nào? Tương tác với phần nào khác? VD: Nằm ở Data Layer, chịu trách nhiệm gọi API và parse JSON.]


## 2. Phân tích Chi tiết (Detailed Breakdown)

### 📌 Khối Logic / Class: `[Tên_Class_hoặc_Thành_phần_1]`
- **Mô tả chung:** [Khối này đảm nhiệm công việc gì?]
- **Các hàm/phương thức quan trọng:**
  
  **1. Hàm `[ten_ham_A](...)`**
  - **Input (Đầu vào):** [Mô tả các tham số, kiểu dữ liệu]
  - **Output (Đầu ra):** [Mô tả dữ liệu trả về]
  - **Tư duy xử lý (Logic):** [Giải thích luồng chạy bên trong. *Tại sao lại tiếp cận theo cách này?* (VD: Dùng map thay vì for loop để tối ưu performance)]

  **2. Hàm `[ten_ham_B](...)`**
  - **Input (Đầu vào):** [...]
  - **Output (Đầu ra):** [...]
  - **Tư duy xử lý (Logic):** [...]

### 📌 Khối Logic / Class: `[Tên_Class_hoặc_Thành_phần_2]`
*(Thêm các class/component khác nếu file phức tạp...)*

---

## 3. Quản lý Trạng thái & Dữ liệu (State & Data Flow - Nếu có)
- **Biến toàn cục / State quan trọng:** [Liệt kê các biến lưu trạng thái đáng chú ý]
- **Luồng dữ liệu:** [Ví dụ: Dữ liệu từ Controller truyền xuống đây, được format lại và gửi tiếp sang Database]

---

## 4. Xử lý Ngoại lệ (Error Handling & Edge Cases)
- **Trường hợp 1: [Mô tả tình huống lỗi - VD: Mất kết nối mạng]**
  - *Cách xử lý:* [Đoạn code đang dùng try-catch bắt lỗi ra sao? Có throw lỗi lên tầng trên không?]
- **Trường hợp 2: [Mô tả tình huống đầu vào rỗng/null]**
  - *Cách xử lý:* [Có check null hoặc dùng default value không?]

---

## 5. Lưu ý cho Developer (Notes)
- 💡 [Ghi chú điểm cần chú ý nếu dev khác muốn refactor/sửa đổi file này sau này (Ví dụ: Đừng đổi kiểu trả về vì Frontend đang parse cứng cấu trúc này).]