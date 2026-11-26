# 📖 TÀI LIỆU GIẢI THÍCH: Core Rust phase B2 (Inbox, Tasks, Tags, Trash, Search)

> Viết cho người mới học Rust, nối tiếp [B1](./lifehub_core-b1_explain_20261126.md). Kế hoạch: [../plan/lifehub_B2_impl_20261126.md](../plan/lifehub_B2_impl_20261126.md).

# 1. Tổng quan (Overview)
- **Mục đích cốt lõi:** làm phần nghiệp vụ chính của v0.2: Task (trạng thái, hạn, lặp, checklist, tag), Inbox (sửa, xoá, chuyển thành Task), thùng rác, tìm kiếm không dấu.
- **Vai trò trong hệ thống:** vẫn theo mô hình 4 lớp (domain / application / infrastructure / commands). `modules/trash` không có infrastructure riêng: nó chỉ điều phối các hàm công khai của `tasks` và `inbox`.

## 2. Phân tích Chi tiết (Detailed Breakdown)

### 📌 Trường "ba trạng thái" trong patch (`TaskPatch`)
- Cần phân biệt: **thiếu** (giữ nguyên), **`null`** (xoá), **có giá trị** (đặt). Kiểu `Option<T>` chỉ phân biệt được hai. Nên dùng `Option<Option<T>>`: `None` = thiếu, `Some(None)` = null, `Some(Some(v))` = đặt. serde mặc định gộp `null` và thiếu làm một, nên phải thêm `#[serde(with = "serde_with::rust::double_option")]`.
- Phía TypeScript, ts-rs sinh `field?: T | null` nhờ `#[ts(optional, type = "…")]`.
- Đặt `dueDate` thì `dueAt` tự bỏ (và ngược lại), đặt `projectId` thì `areaId` tự bỏ, nếu patch không nhắc tới trường kia. Gửi cả hai cùng lúc thì `VALIDATION`.

### 📌 `TimeCtx`: múi giờ và "bây giờ"
- Mọi phép tính theo ngày (Today/Overdue/Next7, ngày của lần lặp) cần múi giờ của người dùng. Gom `(múi giờ, bây giờ)` vào một struct truyền xuống use case; test chỉ việc tạo `TimeCtx` với giờ cố định, không cần đụng đồng hồ thật.
- `due_at` lưu UTC. "Hôm nay" theo giờ địa phương = khoảng `[0h hôm nay, 0h ngày mai)` đổi sang UTC rồi so sánh chuỗi ISO (so sánh chuỗi đúng vì cùng định dạng có mili-giây). Giờ rơi vào khoảng "nhảy" của giờ mùa hè được dời tới giờ hợp lệ kế tiếp.

### 📌 Task lặp (`recurrence.rs`, `application::spawn_next`)
- `next_occurrence(rule, anchor, current)` là hàm thuần (dễ test bằng bảng): Daily cộng ngày; Weekly lấy thứ gần nhất còn lại trong tuần hoặc nhảy `interval` tuần; Monthly cộng tháng và **luôn tính từ ngày gốc** (`anchor`), nên 31/1 → 28/2 → 31/3.
- Khi Task sang `Done`, trong cùng transaction `spawn_next` đọc chuỗi (`recurrence_series`), tính ngày kế, **kiểm tra `occurrence_exists` trước khi chèn** nên mở lại rồi Done lần nữa không sinh trùng (ràng buộc `UNIQUE(series, occurrence_date)` là lớp bảo vệ thứ hai). Hạn có giờ thì giữ nguyên giờ địa phương.
- Checklist của lần mới lấy từ Task vừa xong (đúng với những gì người dùng đã sửa), chưa đánh dấu.
- Tắt lặp = `is_active = 0`; `Task.recurrence` chỉ hiện khi chuỗi còn bật (`LEFT JOIN … is_active = 1`).

### 📌 Kéo thả và `sort_key::place`
- `task_move` và `checklist_reorder` dùng chung `sort_key::place(before, after, last, neighbour)`: hai phía có đủ thì lấy điểm giữa; một phía thì hỏi DB mục kề thật sự phía kia (để không đè lên mục khác); không có phía nào thì xếp cuối. Truyền `last`/`neighbour` dưới dạng closure để hàm không biết gì về DB.
- "Cột" Kanban = `(project_id, status)`; `project_id IS ?` so sánh được cả NULL.

### 📌 Chuyển Inbox → Task
- `inbox::application::convert_to_task` nhận **hai repository** (Inbox và Task) cùng một transaction: kiểm tra `Open` → tạo Task bằng chính use case `tasks::create` → `mark_processed`. Lỗi ở bất cứ bước nào, `tx` bị huỷ mà không commit nên Inbox vẫn `Open` (có test rollback).

### 📌 Tìm kiếm (`modules/search`)
- `normalize_query`: mỗi từ chỉ giữ chữ và số, bỏ `AND/OR/NOT/NEAR`, thành `"từ"*` (tiền tố) nối bằng AND, nên ký tự đặc biệt của FTS5 không thể làm hỏng câu truy vấn.
- Xếp hạng `bm25`; `snippet()` trả văn bản thuần. **Tiêu đề hiển thị lấy từ bảng gốc** (tasks/inbox_items), không lấy từ chỉ mục.
- **`đ/Đ`:** `remove_diacritics` của FTS5 không gộp `đ` với `d` (không phải chữ có dấu tách được). `search::index` nối thêm bản đã đổi `đ→d` vào cuối title/body, nên gõ "dien" vẫn ra "điện". Đây là lý do tiêu đề phải lấy từ bảng gốc.
- Lúc khởi động, nếu `search_map` rỗng mà đã có dữ liệu (tạo từ phase A) thì index lại toàn bộ.

### 📌 Trash
- Xoá mềm đặt `deleted_at`, gỡ khỏi chỉ mục; khôi phục xoá `deleted_at`, tách khỏi Project/Area đã bị xoá, index lại.
- Xoá hẳn theo thứ tự trong schema: Inbox đã chuyển thành Task đó → Event → Task (checklist, tag, reminder xoá theo `ON DELETE CASCADE`) → chuỗi lặp nếu không còn Task nào. Chạy lúc khởi động cho mục quá `trashRetentionDays`, hoặc `trash_empty`.

### 📌 Tags
- Tên không trùng không phân biệt hoa thường. SQLite `NOCASE` chỉ hiểu chữ ASCII (không biết "Ệ" ~ "ệ") nên so sánh tên làm bằng `to_lowercase()` trong Rust; chỉ mục unique của DB chỉ là lớp bảo vệ phụ.

## 3. Quản lý Trạng thái & Dữ liệu
- Mỗi command mở một transaction (`in_tx`), gọi use case, commit, rồi phát `entity-changed` (`task`, `inbox`, `tag`). Xoá tag gỡ luôn liên kết nên phát cả `task`.
- `task_list` đọc tag và số checklist bằng truy vấn con trong cùng câu SELECT (không N+1); sắp xếp theo hạn/ưu tiên làm trong Rust sau khi lấy (vì cần đổi `due_at` sang ngày địa phương).

## 4. Xử lý Ngoại lệ (Error Handling & Edge Cases)
- `baseVersion` lệch → `CONFLICT`; Inbox đã xử lý mà sửa/chuyển lần nữa → `CONFLICT`; tag trùng tên → `CONFLICT`.
- Project/Area không tồn tại: SQLite báo lỗi khoá ngoại (mã 787), được đổi thành `VALIDATION` thay vì lỗi DB.
- Task lặp không có hạn → `VALIDATION`.

## 5. Lưu ý cho Developer (Notes)
- 💡 `TaskDetail.noteIds` luôn rỗng tới v0.5; `task_delete` còn TODO xoá mềm Event/Reminder (B4).
- 💡 `Inbox` trả `convertedTaskId: null` thay vì bỏ trường (di sản phase A), khác quy ước `field?:` của TS; frontend nên coi `null` và thiếu như nhau.
- 💡 Hiệu năng: xem số đo trong `tasks/perf_tests.rs` (chạy `cargo test --release perf -- --nocapture`).
