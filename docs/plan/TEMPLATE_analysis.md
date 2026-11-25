# 🧭 PHÂN TÍCH KẾ HOẠCH: [TÊN_DỰ_ÁN]

> Tạo từ kế hoạch: [./[file_ke_hoach].md](./[file_ke_hoach].md)
> **Ngày phân tích:** YYYY-MM-DD HH:MM · **Model phân tích:** [tên model, mức effort]
> File có ngày, không ghi đè. Phân tích lại thì tạo bản mới (`_v2`...).

## 1. Tóm tắt ý tưởng
- **Mục tiêu:** ...
- **Người dùng:** ...
- **Phạm vi làm:** ...
- **KHÔNG làm (đợt này):** ...

## 2. Đánh giá kế hoạch
| Điểm | Nhận xét |
|---|---|
| Rõ ràng | ... |
| Thiếu sót / mơ hồ | ... |
| Rủi ro | ... |
| Đề xuất bỏ hoặc hoãn | ... |

### Câu hỏi cần người dùng trả lời trước khi làm
1. ...

## 3. Kiến trúc & thoả thuận chung
> Chốt ở đây để các phiên làm song song không lệch nhau.
- **Tech stack:** ...
- **Cấu trúc database:** ...
- **API (đường dẫn, method, dữ liệu vào/ra, tên trường):**

| Endpoint | Method | Vào | Ra |
|---|---|---|---|
| ... | ... | ... | ... |

- **File dễ đụng nhau giữa các phiên:** ... (ai được sửa)

## 4. Các phiên (session)
> Mỗi phiên là một mảng việc (giao diện, backend, ghép nối...). Không tách một mảng thành nhiều phiên; việc lớn trong một phiên thì chia phase bên trong phiên đó (mục 5).

- **Git/GitHub:** [có / chưa có] · Nhánh chính: `...` · Repo: ...
> Chưa có GitHub thì mọi phiên chạy lần lượt, cột "Nhánh" ghi "nhánh chính".

| Phiên | Mảng việc | Model (lý do) | Skill/plugin (lý do) | Nhánh (lý do) | Chạy song song với | File/khu vực được sửa | Số phase |
|---|---|---|---|---|---|---|---|
| A | ... | ... | ... | `feat/...` | ... | ... | ... |
| B | ... | ... | ... | ... | ... | ... | ... |

## 5. Phase trong từng phiên
> Việc ngắn: 1 phase, làm liền. Việc lớn: chia phase; xong mỗi phase thì cập nhật docs (mục "Khi xong phase") rồi mới sang phase sau, vẫn trong cùng phiên.

### Phiên A: [tên]

#### 📍 Phase A1: [tên]
- **Việc:**
  - [ ] ...
  - [ ] ...
- **Xong khi (kiểm tra được):** ...
- **Khi xong phase:** đánh dấu ✅ vào các ô trên trong file này, ghi `docs/log/log_YYYYMMDD.md`, cập nhật `PROJECT_CONTEXT.md` + `INDEX.md`, commit (nếu có git).

#### 📍 Phase A2: [tên]
(lặp lại cấu trúc trên)

### Phiên B: [tên]
(lặp lại cấu trúc trên)

## 6. Thứ tự bắt đầu
1. Mở phiên [A] trước vì ...
2. ...

## 7. Ghi chú
- ...
