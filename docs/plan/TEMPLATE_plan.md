<!-- 
🚨 TEMPLATE INSTRUCTION: 
- [HUMAN] Please copy this template, fill in the blanks, and DELETE this comment block before saving.
- [AGENT/MCP] You MUST remove this entire comment block and all placeholder tags (e.g., [Tên_lệnh]) when generating the final file. Do not output this instruction block to the user.
-->

# 📅 KẾ HOẠCH DỰ ÁN: [TÊN_DỰ_ÁN_HOẶC_TÍNH_NĂNG]

> ⚠️ File này KHÔNG nằm trong danh sách ngoại lệ (G.2) — khi tạo thật, đặt tên theo dạng:
> `docs/plan/[ten_du_an]_plan_YYYYMMDD.md` (VD: `sohuutritue_test_plan_20260712.md`).
> Nếu trùng ngày, thêm hậu tố `_HHMM` hoặc `_v2`.
> Sau khi tạo, nhớ cập nhật liên kết vào [docs/INDEX.md](./INDEX.md).

> **Ngày lập kế hoạch:** YYYY-MM-DD HH:MM

## 1. Tổng quan Mục tiêu (Overview)
- **Mục tiêu chính:** [Tóm tắt ngắn gọn mục đích của dự án/tính năng này]
- **Phạm vi (Scope):** [Xác định rõ những gì sẽ làm và những gì KHÔNG làm trong đợt này]

## 2. Cấu trúc & Luồng dữ liệu (Architecture & Data Flow)
*(Lưu ý: Chỉ phác thảo kiến trúc cấp cao, không chứa source code chi tiết)*
- **Cấu trúc hệ thống:** [Ví dụ: Áp dụng Clean Architecture, chia 3 layer Domain - Data - Presentation]
- **Luồng dữ liệu chính:** 
  - Bước 1: [Client gọi API...]
  - Bước 2: [Server xử lý...]
  - Bước 3: [Database lưu trữ...]

---

## 3. Lộ trình Triển khai (Phases & Milestones)

### 📍 Phase 1: [Tên Giai đoạn 1 - VD: Khởi tạo & Thiết lập hạ tầng]
- **Mục tiêu (Milestone):** [Kết quả kỳ vọng đạt được khi xong Phase 1]
- **Ràng buộc (Dependencies):** [Có cần thông tin/tài nguyên nào trước khi bắt đầu không?]
- **Danh sách công việc:**
  - [ ] **Task 1.1:** [Mô tả chi tiết công việc] *(Ưu tiên: Cao)*
  - [ ] **Task 1.2:** [Mô tả chi tiết công việc] *(Ràng buộc: Phải xong Task 1.1)*
  - [ ] **Task 1.3:** [Mô tả chi tiết công việc] 

### 📍 Phase 2: [Tên Giai đoạn 2 - VD: Phát triển tính năng cốt lõi]
- **Mục tiêu (Milestone):** [Kết quả kỳ vọng đạt được khi xong Phase 2]
- **Ràng buộc (Dependencies):** Bắt buộc phải hoàn thành toàn bộ Phase 1.
- **Danh sách công việc:**
  - [ ] **Task 2.1:** [Mô tả chi tiết công việc] 
  - [ ] **Task 2.2:** [Mô tả chi tiết công việc] 
  - [ ] **Task 2.3:** [Mô tả chi tiết công việc] *(Ràng buộc: Đợi API từ backend)*

*(Có thể tạo thêm các Phase khác nếu dự án lớn...)*

---

## 4. Bảng Tổng hợp & Theo dõi (Task Matrix)

| Giai đoạn | Tên Công việc (Task) | Ràng buộc (Blockers) | Mức Ưu tiên | Trạng thái |
| :--- | :--- | :--- | :--- | :--- |
| Phase 1 | Task 1.1: [Tên ngắn gọn] | Không có | 🔴 Cao | `[ ] Chưa làm` |
| Phase 1 | Task 1.2: [Tên ngắn gọn] | Đợi Task 1.1 | 🟡 Vừa | `[ ] Chưa làm` |
| Phase 2 | Task 2.1: [Tên ngắn gọn] | Đợi Phase 1 | 🔴 Cao | `[ ] Chưa làm` |

---

## 5. Đánh giá & Điều chỉnh (Feedback Loop)
*(Phần này dành cho Project Manager / AI đặt câu hỏi lại với người dùng)*

🤔 **Các câu hỏi cần làm rõ trước khi chốt kế hoạch:**
1. [Câu hỏi 1: Lộ trình phân bổ 2 Phase như trên đã hợp lý với tiến độ của bạn chưa?]
2. [Câu hỏi 2: Có tính năng phụ nào bạn muốn thêm/bớt khỏi Phase 2 không?]
3. [Câu hỏi 3: ...]