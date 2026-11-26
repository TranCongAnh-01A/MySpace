# 📖 TÀI LIỆU GIẢI THÍCH: Core B3 — Projects, Dashboard, dữ liệu mẫu (v0.3)

# 1. Tổng quan (Overview)
- **Mục đích cốt lõi:** thêm Project (nhóm Task có tiến độ), trang Today (`dashboard_today`) và dữ liệu mẫu cho bản debug.
- **Vai trò trong hệ thống:** `modules/projects` là module 4 lớp như `areas`/`tasks`. `modules/dashboard` chỉ đọc, gọi API công khai của `tasks` và `projects`. `trash`, `search`, `tasks` được mở rộng để biết Project. `system/demo.rs` chỉ được biên dịch ở bản debug.

## 2. Phân tích Chi tiết

### 📌 `projects` (domain / application / infrastructure / commands)
- **domain:** `Project`, `ProjectCreate`, `ProjectPatch` (patch ba trạng thái: thiếu = giữ, `null` = xoá, giá trị = đặt, qua `serde_with::double_option`), `ChildMode`, `ProjectProgress`, `StatusCounts`, `ProjectOverview`. `Project::apply` áp patch lên bản sao rồi mới gán, nên patch lỗi không để lại thay đổi dở.
- **Tiến độ:** `done` và `total` lấy từ Task chưa lưu trữ, chưa xoá. `percent = (done*200 + total) / (total*2)` (làm tròn số nguyên, .5 lên); không có khi `total = 0`. Checklist không tính.
- **`archive` / `soft_delete` theo `ChildMode`:** cùng một `now` ghi cho Project và Task con.
  - `WithChildren`: Task con đang mở được gán cùng mốc (archive: chỉ Task chưa archive/xoá; xoá: mọi Task chưa xoá, đồng thời gỡ khỏi chỉ mục tìm kiếm).
  - `Detach`: đặt `project_id = NULL` cho mọi Task và Note của Project, Task chưa có Area nhận Area của Project (`COALESCE`).
- **`unarchive` / `trash_restore`:** chỉ khôi phục Task có `archived_at` / `deleted_at` **bằng đúng** mốc của Project. Task đã archive/xoá từ trước nên giữ nguyên (vẫn nằm riêng trong Trash).
- **Purge:** `projects::purge` purge các Task còn trỏ tới Project (theo `tasks::purge`), đặt `project_id = NULL` cho Note, rồi xoá dòng Project (milestones xoá theo `ON DELETE CASCADE`).
- **Chỉ mục tìm kiếm:** index khi tạo/sửa (title = tên, body = mô tả), vẫn tìm được khi đã lưu trữ, gỡ khi xoá mềm, index lại khi khôi phục. `reindex_missing_projects` chạy lúc khởi động cho Project chưa có trong `search_map`.

### 📌 `tasks` / `trash` / `search`
- `TaskRepository::project_is_active`: `task_create` và `task_update` (khi **đổi** sang Project khác) yêu cầu Project tồn tại, chưa xoá, chưa lưu trữ, nếu không → `VALIDATION`. Task đã nằm sẵn trong Project vẫn sửa được.
- `TrashKind::Project`: `list`, `restore`, `purge_expired`, `empty` (`empty` nay nhận thêm `clock`). Project purge sau Task và Inbox.
- `search`: tiêu đề kết quả của kind `Project` lấy từ `projects.name`.

### 📌 `dashboard::application::today`
- Lọc Task chưa `Done` bằng `DueFilter` của B2 (nên "hôm nay" theo múi giờ Settings), bỏ Task thuộc Project đã lưu trữ.
- `today`: có giờ (`due_at`) trước theo giờ, rồi tới Task cả ngày theo ưu tiên và `sort_key`. `overdue` cũ nhất trước, tối đa 50. `upcoming` (Next7) tối đa 20. `activeProjects`: Project `Active` chưa lưu trữ theo `sortKey`, kèm tiến độ. `recentNotes` luôn rỗng (v0.5).

### 📌 `system/demo.rs` — `seed_demo_data`
- Một transaction. Có Project tên bắt đầu bằng "GGStudio" thì `CONFLICT`. Tạo (hoặc dùng lại theo tên) Area "Công việc"/"Học tập", Tag backend/frontend/urgent, Project GGStudio (40 Task: 26 Done, 2 quá hạn, 3 hạn hôm nay), "Đồ án tốt nghiệp" (6 Task), 3 mục Inbox.
- Đăng ký bằng `#[cfg(debug_assertions)]` ngay trong `generate_handler!`; module `demo` cũng chỉ biên dịch ở debug, nên bản release không có command và không có cảnh báo dead code (`name_starts_with` cũng gắn cfg).

## 3. Luồng dữ liệu
Command → `in_tx` (một transaction) → application → repository → SQLite + `change_log`. Sau commit phát `entity-changed`: `project`, và thêm `task` khi archive/delete/restore có thể đổi Task.

## 4. Xử lý Ngoại lệ
- Id không có → `NOT_FOUND`; lệch `baseVersion` → `CONFLICT`; tên rỗng/quá dài, màu/icon sai, `targetDate < startDate`, Area đã xoá, Project đã lưu trữ/xoá khi gán Task → `VALIDATION`.
- `archive` Project đã lưu trữ và `unarchive` Project chưa lưu trữ là no-op (không lỗi).

## 5. Lưu ý cho Developer
- 💡 Đừng đổi hợp đồng v0.3 (kế hoạch B3 mục 2.1): C3 dựa vào đó.
- 💡 `Detach` cũng tách cả Task đã archive/xoá khỏi Project, nên Task trong Trash không bị kéo theo khi Project bị purge.
- 💡 So sánh mốc archive/xoá bằng chuỗi ISO nên mọi nơi phải dùng `clock.now_iso()` (cùng định dạng mili-giây).
- 💡 Bindings ts-rs sinh ra file LF; các file cũ trong repo là CRLF. Chỉ commit file thực sự đổi (`TrashKind.ts` + file mới).
