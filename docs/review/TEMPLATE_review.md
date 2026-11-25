<!-- 
🚨 TEMPLATE INSTRUCTION: 
- [HUMAN] Please copy this template, fill in the blanks, and DELETE this comment block before saving.
- [AGENT/MCP] You MUST remove this entire comment block and all placeholder tags (e.g., [Tên_lệnh]) when generating the final file. Do not output this instruction block to the user.
-->

# 🔎 BÁO CÁO CODE REVIEW: [TÊN_FILE_HOẶC_ĐOẠN_CODE]

> ⚠️ File này KHÔNG nằm trong danh sách ngoại lệ (G.2) — khi tạo thật, đặt tên theo dạng:
> `docs/review/[ten_file]_review_YYYYMMDD.md` (VD: `sohuutritue_test_review_20260712.md`).
> Nếu trùng ngày, thêm hậu tố `_HHMM` hoặc `_v2`.
> Sau khi tạo, nhớ cập nhật liên kết vào [docs/INDEX.md](./INDEX.md).

> **Ngày review:** YYYY-MM-DD HH:MM

## 1. Tổng quan Đánh giá (Overview)
- **Mức độ an toàn:** [Tốt / Cần cải thiện / Nguy hiểm]
- **Tóm tắt:** [Đánh giá ngắn gọn 1-2 câu về chất lượng code hiện tại, ví dụ: "Logic chính hoạt động đúng, nhưng còn thiếu xử lý lỗi khi gọi API và cấu trúc chưa tuân thủ DRY."]

---

## 2. Kết quả Review Chi tiết (Detailed Findings)

### 🔴 CRITICAL (Lỗi nghiêm trọng - Bắt buộc phải sửa)
*(Chứa lỗi logic sai, lỗ hổng bảo mật, rò rỉ bộ nhớ hoặc gây crash app)*
1. **[Tên vấn đề 1 - VD: Lộ API Key trong code]**
   - **Vị trí:** Dòng [X] hoặc hàm `[tên_hàm]`
   - **Nguyên nhân:** [Giải thích tại sao lại lỗi]
   - **Cách khắc phục:** [Hướng dẫn cách sửa, ví dụ: "Chuyển API Key vào file .env và gọi qua biến môi trường."]

2. **[Tên vấn đề 2]**
   - **Vị trí:** ...

### 🟡 WARNING (Cảnh báo - Nên cân nhắc sửa)
*(Chứa code smell, vòng lặp thừa, thiếu tối ưu hiệu năng hoặc vi phạm Clean Code)*
1. **[Tên vấn đề 1 - VD: Lặp lại logic kiểm tra chuỗi rỗng (Vi phạm DRY)]**
   - **Vị trí:** Hàm `[tên_hàm_A]` và `[tên_hàm_B]`
   - **Hậu quả tiềm ẩn:** Dễ gây lỗi khi bảo trì, code dài dòng.
   - **Cách khắc phục:** Tách phần kiểm tra ra thành một helper/extension method riêng.

### 🟢 SUGGESTION (Đề xuất cải thiện - Tùy chọn)
*(Gợi ý các syntax mới hơn, cách đặt tên biến rõ nghĩa hơn hoặc refactor cho đẹp mắt)*
1. **[Tên đề xuất 1 - VD: Rút gọn cú pháp if-else]**
   - Thay vì dùng `if-else` dài dòng, có thể dùng toán tử 3 ngôi (ternary operator) hoặc pattern matching (nếu ngôn ngữ hỗ trợ) để code gọn gàng hơn.

---

## 3. Đề xuất Code Mẫu (Refactored Snippets)
*(Cung cấp đoạn code mẫu khắc phục các lỗi 🔴 và 🟡 ở trên để người dùng tham khảo)*

```[tên_ngôn_ngữ]
// 🛠️ Code đề xuất cho hàm [tên_hàm] (Đã fix lỗi 🔴 1 và 🟡 1)
[Đoạn code đã được review và refactor chuẩn chỉnh...]
```

## 4. Checklist Hành động (Next Steps)
[ ] Xác nhận và sửa các lỗi 🔴 Critical.

[ ] Xem xét áp dụng các đề xuất 🟡 Warning.

[ ] Báo lại cho tôi (AI) nếu bạn muốn tôi hướng dẫn chi tiết cách tích hợp đoạn code mẫu vào file gốc.

---
### Cách AI sẽ hoạt động với template này:
Khi bạn dán một đoạn code dài và gõ `"#review Xem giúp mình đoạn code tính toán giỏ hàng này"`, AI sẽ:
1. Đọc code với tư duy soi lỗi bảo mật và hiệu năng.
2. Áp dụng ngay template trên, phân loại rõ ràng: cái nào làm chết app (🔴), cái nào làm app chậm (🟡), cái nào chỉ để cho đẹp (🟢).
3. Đưa ra đoạn code đã sửa mẫu ở phần 3 để bạn copy.
4. **Tuyệt đối tuân thủ nguyên tắc:** Không tự động sinh ra một file mới đè lên file cũ của bạn, bảo vệ an toàn tối đa cho source code hiện tại.