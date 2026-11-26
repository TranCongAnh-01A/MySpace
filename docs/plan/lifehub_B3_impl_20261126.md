# 🛠️ KẾ HOẠCH TRIỂN KHAI: Phase B3 — Projects + Dashboard (v0.3)

> **Ngày:** 2026-11-26 18:30 · **Phiên chính:** Claude Opus 5.5 · **Triển khai bằng:** phiên phụ B, Sonnet, effort medium
> **Nhánh git:** nhánh worktree của phiên B (`claude/core-12db3e`), sau khi `git merge main` · **Bật:** plugin `mattpocock-skills` (tdd), skill (kho) `database-migrations`
> Người triển khai làm đúng file này. Chỗ nào không làm được hoặc phải làm khác: ghi vào báo cáo, không tự đổi hướng.
> Đọc trước: [phân tích Phase B3](./lifehub_analysis_20261126.md), [schema mục 3](./lifehub_schema_20261126.md), [B2 mục 2](./lifehub_B2_impl_20261126.md) (quy ước patch ba trạng thái, "hôm nay" theo múi giờ).

## 1. Mục tiêu
- **Xong khi:**
  - `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test` đều xanh.
  - Test tiến độ: Project chưa có Task → `percent` không có; 26/40 → 65; Task đã lưu trữ hoặc đã xoá không tính.
  - Test archive/delete:
    - `Detach` giữ Task, đặt `project_id = NULL`, và Task nhận `area_id` của Project.
    - `WithChildren` archive cả Task.
    - `project_unarchive` chỉ khôi phục những Task bị archive cùng lúc với Project.
  - Test `dashboard_today` với đồng hồ giả và múi giờ trong Settings.
  - Test search ra Project.
  - `seed_demo_data` tạo dự án GGStudio đúng 26/40 Task Done.
- **Không làm:** Milestones ([Nice]), Calendar/Reminders (B4), Notes (B5). Không sửa gì ngoài `src-tauri/**` và `bindings/`.

## 2. Quyết định đã chốt

### 2.1. Hợp đồng v0.3 (phiên C dựa vào đúng mục này)
Quy ước giữ như B2. Patch dùng ba trạng thái (`field?: T | null`, `null` = xoá) cho mọi trường xoá được. **Không** dùng quy ước chuỗi rỗng như Area/Tag.

```ts
type ProjectStatus = 'Planned' | 'Active' | 'OnHold' | 'Completed';
type Project = {
  id: string; areaId?: string; name: string; description: string; status: ProjectStatus;
  color?: string; icon?: string; startDate?: string; targetDate?: string; sortKey: string;
  archivedAt?: string; version: number; createdAt: string; updatedAt: string;
};
type ProjectCreate = {
  name: string; description?: string; areaId?: string; status?: ProjectStatus;
  color?: string; icon?: string; startDate?: string; targetDate?: string;
};
type ProjectPatch = {
  name?: string; description?: string; status?: ProjectStatus;
  areaId?: string | null; color?: string | null; icon?: string | null;
  startDate?: string | null; targetDate?: string | null;
};
type ChildMode = 'WithChildren' | 'Detach';
type ProjectProgress = { projectId: string; name: string; color?: string; done: number; total: number; percent?: number }; // percent làm tròn 0–100; không có khi total = 0
type StatusCounts = { todo: number; inProgress: number; review: number; done: number };
type NoteSummary = { id: string; title: string; projectId?: string; updatedAt: string };    // v0.3 luôn trả mảng rỗng
type ProjectOverview = { project: Project; progress: ProjectProgress; counts: StatusCounts; recentNotes: NoteSummary[] };
type TodayView = {
  date: string;                 // ngày địa phương YYYY-MM-DD theo Settings
  today: Task[]; overdue: Task[]; upcoming: Task[];
  activeProjects: ProjectProgress[]; recentNotes: NoteSummary[];
};                              // v0.4 sẽ THÊM trường `schedule` (không đổi các trường đã có)
type TrashKind = 'Task' | 'Inbox' | 'Project';     // thêm 'Project'
// SearchKind giữ nguyên; từ v0.3 `search` trả cả kind 'Project'
```

| Command | Tham số `invoke` | Trả về | Ghi chú / lỗi |
|---|---|---|---|
| `project_list` | `{ archived?: boolean }` | `Project[]` theo `sortKey` | `archived: true` thì **chỉ** trả các Project đã lưu trữ; mặc định trả các Project chưa lưu trữ. Không trả Project đã xoá |
| `project_get_overview` | `{ id }` | `ProjectOverview` | `NOT_FOUND` |
| `project_create` | `{ input: ProjectCreate }` | `Project` (xếp cuối) | `VALIDATION` |
| `project_update` | `{ id, patch: ProjectPatch, baseVersion }` | `Project` | `CONFLICT` khi lệch version |
| `project_reorder` | `{ id, beforeId?, afterId? }` | `Project` | thứ tự hiển thị ở sidebar |
| `project_archive` | `{ id, mode: ChildMode }` | `void` | |
| `project_unarchive` | `{ id }` | `void` | |
| `project_delete` | `{ id, mode: ChildMode }` | `void` | xoá mềm, Project vào Trash |
| `trash_restore` | `{ kind: 'Project', id }` | `void` | khôi phục cả các Task bị xoá cùng lúc |
| `dashboard_today` | — | `TodayView` | |
| `seed_demo_data` | — | `void` | **chỉ đăng ký ở bản debug** (`#[cfg(debug_assertions)]`). Đã có Project tên "GGStudio" → `CONFLICT` |

Event `entity-changed`: `'project'`. Khi archive/delete/restore làm Task thay đổi thì phát thêm `'task'`.

### 2.2. Quy tắc nghiệp vụ
- **Validate:**
  - Tên Project không rỗng, tối đa 100 ký tự; mô tả tối đa 20.000.
  - Màu dạng `#RRGGBB`. `icon` là tên icon lucide, chỉ gồm `[a-z0-9-]`, tối đa 40 ký tự.
  - `targetDate` không được trước `startDate`. `areaId` phải là Area chưa bị xoá.
- **Tiến độ:** `done` = số Task `Done`; `total` = số Task có `archived_at IS NULL AND deleted_at IS NULL`. `percent = round(done*100/total)`. Checklist không tính.
- **Archive và delete:**
  - Dùng **cùng một mốc thời gian `now`** cho Project và các Task con, để biết Task nào bị archive/xoá cùng lúc với Project:
    - `WithChildren`: archive (hoặc xoá mềm) cả các Task con **đang chưa** archive/xoá, gán cùng mốc `now`.
    - `Detach`: đặt `project_id = NULL` cho Task và Note của Project. Task nào đang có `area_id IS NULL` thì nhận `area_id` của Project.
  - `project_unarchive` (và `trash_restore` cho Project): khôi phục Project, cùng các Task có `archived_at` (hoặc `deleted_at`) **bằng đúng** mốc của Project.
  - Task bị xoá **trước** Project thì vẫn nằm trong Trash như một mục riêng.
- **Purge Project:** đến hạn purge hoặc `trash_empty` thì purge các Task con còn trỏ tới Project trước (theo quy tắc purge Task của B2), tách Note (đặt `project_id = NULL`), rồi mới xoá Project.
- **Task:**
  - `task_create`/`task_update` có `projectId`: Project phải tồn tại và chưa lưu trữ, nếu không → `VALIDATION`.
  - `task_list` lọc theo `projectId` đã có từ B2. `task_move` tính cột theo `(project_id, status)`, đã có.
- **Search:** index Project với `title = name`, `body = description`. Lúc khởi động, reindex cả Project nếu `search_map` chưa có. Project đã lưu trữ vẫn tìm thấy được, Project đã xoá thì không.
- **`dashboard_today`:** "hôm nay" theo múi giờ trong Settings, tính như B2. Mọi danh sách bỏ qua Task đã lưu trữ, đã xoá, và Task thuộc Project đã lưu trữ.
  - `today`: Task chưa `Done` có hạn hôm nay. Sắp xếp: có giờ trước (theo giờ), rồi đến ưu tiên.
  - `overdue`: Task chưa `Done` đã quá hạn, sắp theo hạn, cũ nhất trước, tối đa 50.
  - `upcoming`: Task chưa `Done` có hạn thuộc `Next7`, sắp theo hạn, tối đa 20.
  - `activeProjects`: Project `Active` chưa lưu trữ, theo `sortKey`.
  - `recentNotes`: mảng rỗng (sẽ có ở v0.5).
- **`seed_demo_data`** (một transaction):
  - Area "Công việc" và "Học tập".
  - Project "GGStudio — Gaming Services Marketplace" (Area Công việc, `Active`, màu `#A08BDF`, icon `gamepad-2`) gồm 40 Task:
    - 26 Task `Done`, trong đó có Authentication, Database, Landing page.
    - `InProgress`: Booking system, Admin UI.
    - `Todo`: Payment API, Email service, SEO.
    - Các Task còn lại chia cho đủ số, có hạn rải trong 14 ngày quanh hôm nay. Có 2 Task quá hạn và 3 Task hạn hôm nay.
  - Project "Đồ án tốt nghiệp" (Area Học tập, 6 Task).
  - 3 Inbox item. Tag "backend", "frontend", "urgent".
  - Tên Project dùng để kiểm tra trùng là "GGStudio".

## 3. File được sửa
| File | Việc | Ghi chú |
|---|---|---|
| `src-tauri/src/modules/projects/**` | tạo | 4 lớp |
| `src-tauri/src/modules/dashboard/**` | tạo | chỉ đọc, gọi API công khai của tasks/projects |
| `src-tauri/src/modules/{tasks,trash,search,areas}/**` | sửa | kiểm tra Project, trash kind Project, index Project |
| `src-tauri/src/system/demo.rs` | tạo | `seed_demo_data` |
| `src-tauri/src/lib.rs`, `src-tauri/src/modules/mod.rs` | sửa | |
| `src-tauri/migrations/002_*.sql` | chỉ khi thật cần | ghi lý do vào báo cáo |
| `src/lib/ipc/bindings/*` | sinh tự động | |
| `docs/explain/lifehub_core-b3_explain_YYYYMMDD.md`, `docs/log/log_YYYYMMDD_HHMM.md` | tạo | |
| `docs/plan/lifehub_analysis_20261126.md` | chỉ đánh ✅ Phase B3 | |

> Không sửa `docs/INDEX.md`, `PROJECT_CONTEXT.md`, `src/**` ngoài `bindings/`, `package.json`, CI.

## 4. Các bước
1. [ ] `git merge main` (v0.2.0); `cargo test` xanh.
2. [ ] Projects: domain, repository, use case (CRUD, reorder, archive/unarchive/delete theo `mode`), command; tiến độ và overview.
3. [ ] Sửa tasks (kiểm tra Project), trash (kind Project: list/restore/purge), search (Project).
4. [ ] Dashboard `dashboard_today`.
5. [ ] `seed_demo_data` (chỉ bản debug).
6. [ ] Thử trong `tauri dev` bằng devtools: seed → `project_get_overview` ra 65% → archive `Detach` → `dashboard_today`.
7. [ ] Kiểm tra (mục 5), viết explain + log, đánh ✅, commit `feat(core): B3 projects, dashboard, demo data`. Hỏi trước khi push.

## 5. Kiểm tra trước khi báo xong
- [ ] `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test` xanh (ghi số test). `cargo clippy --release` cũng xanh (để chắc `seed_demo_data` bị loại khỏi bản release mà không gây cảnh báo).
- [ ] `npm run lint`, `npm test` vẫn xanh.
- [ ] `git diff main --stat` chỉ có file trong bảng ở mục 3.

## 6. Báo cáo (dòng đầu đúng mẫu)
`XONG: <việc> | File: <file đã đổi> | Kiểm tra: <đã chạy gì: kết quả> | Khác kế hoạch: <không / gì> | Còn lại: <không / gì>`
