# 🛠️ KẾ HOẠCH TRIỂN KHAI: Phase B2 — Inbox + Tasks + Search (v0.2)

> **Ngày:** 2026-11-26 15:20 · **Phiên chính:** Claude Opus 5.5 · **Triển khai bằng:** phiên phụ B, Sonnet, effort medium
> **Nhánh git:** nhánh worktree của phiên B (`claude/core-…`), sau khi `git merge main` · **Bật:** plugin `mattpocock-skills` (tdd), skill (kho) `database-migrations`
> Người triển khai làm đúng file này. Chỗ nào không làm được hoặc phải làm khác: ghi vào báo cáo, không tự đổi hướng.
> Đọc trước: [phân tích mục 3 + Phase B2](./lifehub_analysis_20261126.md), [schema mục 3](./lifehub_schema_20261126.md), [kế hoạch B1](./lifehub_B1_impl_20261126.md) (quy ước đã dùng).

## 1. Mục tiêu
- **Xong khi:**
  - `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test` xanh.
  - Có test cho: Done/mở lại (`completed_at`, `previous_status`); task lặp sinh đúng lần tiếp và không sinh trùng khi gọi lặp lại; đổi Inbox hai lần → `CONFLICT`; `baseVersion` lệch → `CONFLICT`; tìm "nhac nho" ra "Nhắc nhở"; lọc `Today/Overdue/Next7` theo múi giờ trong Settings; thứ tự `task_move`; purge Trash.
  - Có test đo thời gian: lọc 5.000 Task và tìm trên 10.000 bản ghi đều dưới 100 ms (bản debug thì ghi số đo; bản `--release` phải dưới 100 ms).
- **Không làm:** Projects, Dashboard (B3); Reminders, Events (B4); Notes, `inbox_convert_to_note` (B5); mọi file ngoài `src-tauri/**` và `src/lib/ipc/bindings/**`.

## 2. Quyết định đã chốt

### 2.1. Hợp đồng v0.2 (phiên C dựa vào đúng mục này)
Giữ quy ước của B1. **Mới:** trường xoá được trong patch dùng kiểu ba trạng thái: thiếu = giữ nguyên, `null` = xoá, có giá trị = đặt. Rust dùng `Option<Option<T>>` với `serde_with::rust::double_option`, TS là `field?: T | null`. `TaskDetail` lồng nhau (`{ task, checklist, noteIds }`), không trải phẳng như ghi trong phân tích.

```ts
type TaskStatus = 'Todo' | 'InProgress' | 'Review' | 'Done';
type Priority = 'Urgent' | 'High' | 'Medium' | 'Low';
type Weekday = 'Mo' | 'Tu' | 'We' | 'Th' | 'Fr' | 'Sa' | 'Su';
type Frequency = 'Daily' | 'Weekly' | 'Monthly';
type Recurrence = { frequency: Frequency; interval: number; byWeekday?: Weekday[] };
type Task = {
  id: string; projectId?: string; areaId?: string; title: string; description: string;
  status: TaskStatus; priority: Priority; startDate?: string; dueDate?: string; dueAt?: string;
  estimatedMinutes?: number; completedAt?: string; sortKey: string; recurrence?: Recurrence;
  tagIds: string[]; checklistDone: number; checklistTotal: number;
  archivedAt?: string; deletedAt?: string; version: number; createdAt: string; updatedAt: string;
};
type ChecklistItem = { id: string; taskId: string; content: string; isDone: boolean; sortKey: string };
type TaskDetail = { task: Task; checklist: ChecklistItem[]; noteIds: string[] };   // noteIds rỗng tới v0.5
type TaskCreate = {
  title: string; description?: string; projectId?: string; areaId?: string; status?: TaskStatus;
  priority?: Priority; startDate?: string; dueDate?: string; dueAt?: string; estimatedMinutes?: number;
  tagIds?: string[]; recurrence?: Recurrence;
};
type TaskPatch = {
  title?: string; description?: string; priority?: Priority;
  projectId?: string | null; areaId?: string | null; startDate?: string | null;
  dueDate?: string | null; dueAt?: string | null; estimatedMinutes?: number | null; recurrence?: Recurrence | null;
};
type DueFilter = 'Today' | 'Overdue' | 'Next7' | 'None';
type TaskSort = 'Manual' | 'DueDate' | 'Priority' | 'Created';
type TaskFilter = {
  status?: TaskStatus[]; priority?: Priority[]; projectId?: string; areaId?: string; tagId?: string;
  due?: DueFilter; archived?: boolean; sort?: TaskSort;
};
type TaskStatusResult = { task: Task; next?: Task };
type Tag = { id: string; name: string; color?: string };
type TagCreate = { name: string; color?: string };
type TagPatch = { name?: string; color?: string };          // color "" = xoá (như Area)
type TrashKind = 'Task' | 'Inbox';
type TrashItem = { kind: TrashKind; id: string; title: string; deletedAt: string; purgeAt: string };
type SearchKind = 'Task' | 'Project' | 'Note' | 'Inbox';
type SearchHit = { kind: SearchKind; id: string; title: string; snippet: string };
```

| Command | Tham số `invoke` | Trả về | Ghi chú / lỗi |
|---|---|---|---|
| `inbox_update` | `{ id, content }` | `InboxItem` | `NOT_FOUND`, `VALIDATION`; mục đã xử lý → `CONFLICT` |
| `inbox_delete` | `{ id }` | `void` | xoá mềm, vào Trash |
| `inbox_convert_to_task` | `{ id, task: TaskCreate }` | `Task` | một transaction; mục đã xử lý → `CONFLICT` |
| `task_list` | `{ filter: TaskFilter }` | `Task[]` | mặc định bỏ qua Task đã lưu trữ hoặc đã xoá |
| `task_get` | `{ id }` | `TaskDetail` | `NOT_FOUND` |
| `task_create` | `{ input: TaskCreate }` | `Task` | `VALIDATION` |
| `task_update` | `{ id, patch: TaskPatch, baseVersion }` | `Task` | lệch version → `CONFLICT` |
| `task_set_status` | `{ id, status }` | `TaskStatusResult` | |
| `task_move` | `{ id, status, beforeId?, afterId? }` | `TaskStatusResult` | đổi cột thì áp quy tắc giống `task_set_status` |
| `task_archive` / `task_unarchive` / `task_delete` | `{ id }` | `void` | `task_delete` = xoá mềm |
| `trash_list` | — | `TrashItem[]` (mới xoá trước) | |
| `trash_restore` | `{ kind, id }` | `void` | |
| `trash_empty` | — | `void` | xoá cứng mọi mục trong Trash |
| `checklist_add` | `{ taskId, content }` | `ChecklistItem` (xếp cuối) | |
| `checklist_update` | `{ id, content }` | `ChecklistItem` | |
| `checklist_toggle` | `{ id }` | `ChecklistItem` | |
| `checklist_reorder` | `{ id, beforeId?, afterId? }` | `ChecklistItem` | |
| `checklist_delete` | `{ id }` | `void` | xoá cứng |
| `tag_list` | — | `Tag[]` (theo tên) | |
| `tag_create` / `tag_update` | `{ input: TagCreate }` / `{ id, patch: TagPatch }` | `Tag` | trùng tên (không phân biệt hoa thường) → `CONFLICT` |
| `tag_delete` | `{ id }` | `void` | xoá mềm tag, xoá cứng các liên kết `task_tags` |
| `task_set_tags` | `{ taskId, tagIds }` | `Task` | thay toàn bộ danh sách tag |
| `search` | `{ query, kinds?: SearchKind[], limit?: number }` | `SearchHit[]` | v0.2 chỉ có `Task`, `Inbox`; `limit` mặc định 20, tối đa 100 |

Event `entity-changed`: `entity: 'task'` (gồm cả checklist và tag của task; `ids` là id task), `'inbox'`, `'tag'`.

### 2.2. Quy tắc nghiệp vụ
- **"Hôm nay"** tính theo múi giờ trong Settings (`chrono-tz`), core tự tính, không nhận ngày từ frontend.
  - `Today`: `due_date = hôm nay`, hoặc `due_at` rơi vào ngày hôm nay theo giờ địa phương.
  - `Overdue`: `due_date < hôm nay` hoặc `due_at < bây giờ`, và trạng thái khác `Done`.
  - `Next7`: hạn từ ngày mai đến hôm nay + 7.
  - `None`: không có hạn.
- **Sắp xếp:**
  - `Manual` theo `sort_key`.
  - `DueDate`: hạn sớm trước, Task không có hạn xếp cuối. So `due_date` với ngày địa phương của `due_at`; trùng ngày thì Task có giờ đứng trước.
  - `Priority`: Urgent → Low, rồi đến hạn.
  - `Created`: mới nhất trước.
- **Trạng thái:**
  - Sang `Done`: đặt `completed_at = now`, lưu `previous_status` (nếu khác Done).
  - Rời `Done`: xoá `completed_at`. Nếu là "mở lại" bằng `task_set_status` thì dùng đúng trạng thái được truyền vào. `previous_status` chỉ để gợi ý cho UI (nút "Mở lại" gọi với `previous_status ?? 'Todo'`).
  - Mỗi lần ghi Task: `version += 1`, `updated_at`, gọi `changelog::record` và `search::index(kind='Task', title, description)`.
- **`task_move`:**
  - `sort_key = between(sort_key của beforeId, sort_key của afterId)`. `beforeId`/`afterId` là Task nằm ngay trên/dưới **trong cột đích**; cả hai đều thiếu thì xếp cuối cột.
  - Cột được tính theo `(project_id, status)`. Task không thuộc Project nào dùng chung một bảng (`project_id IS NULL`).
- **Task lặp:**
  - Tạo hoặc đặt `recurrence` cần có `dueDate` hoặc `dueAt`, thiếu thì trả `VALIDATION` ("Task lặp cần có hạn").
  - Lúc tạo: thêm `recurrence_series`, với `template_json` = `{ title, description, priority, projectId, areaId, tagIds, checklist: [content…], estimatedMinutes, dueTime? }`. `occurrence_date` = ngày của hạn.
  - Khi chuyển sang `Done` (trong cùng transaction): tính ngày lần tiếp theo rồi tạo Task mới từ template. Hạn giữ nguyên kiểu: chỉ có ngày thì `dueDate` mới; có giờ thì đặt `dueAt` vào cùng giờ địa phương của ngày mới. Checklist mới chưa đánh dấu. Vi phạm `UNIQUE(series, occurrence_date)` thì không báo lỗi, `next` bỏ trống.
  - Cách tính ngày tiếp theo:
    - `Daily`: cộng `interval` ngày.
    - `Weekly`: không có `byWeekday` thì cộng 7×`interval` ngày. Có `byWeekday` thì lấy ngày gần nhất trong tuần còn lại thuộc danh sách; hết tuần thì nhảy `interval` tuần, rồi lấy ngày đầu tiên thuộc danh sách.
    - `Monthly`: cộng `interval` tháng, giữ ngày trong tháng; tháng không có ngày đó thì dùng ngày cuối tháng. Mốc tính luôn là ngày của lần đầu tiên, nên 31/1 → 28/2 → 31/3.
  - `task_update` đổi `recurrence` thì cập nhật series. Đặt `null` thì `is_active = 0`, và từ đó không sinh lần tiếp. Mở lại một Task Done không xoá lần tiếp đã sinh.
- **Inbox → Task:** khoá dòng Inbox, kiểm tra `status = 'Open'`, tạo Task (dùng chung use case tạo Task), đặt `converted_task_id`, `processed_at`, `status = 'Processed'`, rồi `search::remove('Inbox', id)`. Tất cả trong một transaction.
- **Trash:**
  - `task_delete`: đặt `deleted_at`, gọi `search::remove`. Từ v0.4 sẽ xoá mềm thêm Event và Reminder (để sẵn chỗ có TODO).
  - `trash_restore`: xoá `deleted_at`, index lại. Task khôi phục mà Project/Area của nó đã bị xoá thì đặt các trường đó về NULL.
  - Purge: chạy lúc khởi động cho mục có `deleted_at` cũ hơn `trashRetentionDays`; `trash_empty` thì purge toàn bộ. Thứ tự purge Task theo schema mục 3: xoá cứng `inbox_items` trỏ tới Task, rồi `checklist_items`/`task_tags` (cascade), rồi Task. Task có `recurrence_series` mà series không còn Task nào thì xoá series.
  - `purgeAt` = `deleted_at` + `trashRetentionDays`.
- **Search:**
  - Câu tìm được chuẩn hoá: tách theo khoảng trắng, bỏ ký tự đặc biệt của FTS5 (`" * ( ) : ^ -` và `AND`/`OR`/`NOT` viết hoa), mỗi từ thành `"từ"*` (tìm tiền tố), các từ nối bằng AND. Câu rỗng thì trả mảng rỗng.
  - Xếp hạng bằng `bm25`.
  - `snippet` là văn bản thuần, không HTML, lấy bằng `snippet(search_index, 1, '', '', '…', 12)`; body rỗng thì lấy title.
  - Kết quả bỏ qua bản ghi đã xoá mềm (đã `remove` khỏi index nên không còn).
  - Lúc khởi động, nếu `search_map` rỗng mà bảng Task/Inbox có dữ liệu thì index lại toàn bộ (dữ liệu tạo từ phase A chưa được index).
- **Validate:**
  - Tiêu đề Task không rỗng, tối đa 500 ký tự; mô tả tối đa 20.000.
  - `estimatedMinutes` từ 1 đến 10.080.
  - Có cả `dueDate` lẫn `dueAt` → `VALIDATION`; `startDate` > ngày hạn → `VALIDATION`.
  - Có cả `projectId` và `areaId` → `VALIDATION` (Task thuộc Project dùng Area của Project).
  - Tag có tên tối đa 50 ký tự.
  - Checklist có nội dung tối đa 500 ký tự.
- **Hiệu năng:** `task_list` đọc `tag_ids` và số checklist bằng truy vấn gom (`GROUP_CONCAT` / subquery), **không** N+1.
- Module: `modules/tasks/` (gồm checklist và recurrence), `modules/tags/`, `modules/trash/` (điều phối restore/purge qua API công khai của tasks và inbox), `modules/search/` (thêm `application` + `commands`). Mở rộng `modules/inbox/`. Thêm dependency `serde_with`.

## 3. File được sửa
| File | Việc | Ghi chú |
|---|---|---|
| `src-tauri/Cargo.toml`, `Cargo.lock` | sửa | `serde_with` |
| `src-tauri/src/lib.rs`, `src-tauri/src/modules/mod.rs` | sửa | đăng ký command, purge + reindex lúc khởi động |
| `src-tauri/src/modules/{inbox,tasks,tags,trash,search}/**` | tạo / sửa | |
| `src-tauri/src/db/**`, `src-tauri/src/sort_key.rs` | sửa nếu cần | |
| `src-tauri/migrations/002_*.sql` | **chỉ khi thật cần** | v0.1 đã phát hành nên `001` bất biến; thêm migration mới phải ghi lý do vào báo cáo |
| `src/lib/ipc/bindings/*` | sinh tự động | |
| `docs/explain/lifehub_core-b2_explain_YYYYMMDD.md`, `docs/log/log_YYYYMMDD_HHMM.md` | tạo | |
| `docs/plan/lifehub_analysis_20261126.md` | chỉ đánh ✅ Phase B2 | |

> Không sửa `docs/INDEX.md`, `PROJECT_CONTEXT.md`, `src/**` ngoài `bindings/`, `package.json`, CI.

## 4. Các bước
1. [ ] `git merge main` (nhận bản v0.1 đã merge). `cargo test` xanh trước khi bắt đầu.
2. [ ] Search: chuẩn hoá câu tìm, use case, command, reindex lúc khởi động. Test không dấu, test tiền tố, test ký tự đặc biệt không làm lỗi.
3. [ ] Tags.
4. [ ] Tasks: domain (validate, quy tắc trạng thái, tính ngày lặp thành hàm thuần, có test bảng cho Daily/Weekly/Monthly, cả ngày 31 và năm nhuận), repository (truy vấn lọc + sắp xếp, gom tag và checklist), use case, command. Gồm checklist.
5. [ ] Inbox: update, delete, convert_to_task.
6. [ ] Trash: list, restore, empty, purge lúc khởi động.
7. [ ] Test hiệu năng: tạo 5.000 Task / 10.000 bản ghi trong DB in-memory, đo `task_list` có lọc và `search`. Chạy thêm `cargo test --release` cho test này.
8. [ ] Thử trong `tauri dev` bằng devtools: tạo Task, Done một Task lặp, chuyển Inbox → Task, tìm không dấu.
9. [ ] Kiểm tra (mục 5), viết explain + log, đánh ✅, commit `feat(core): B2 inbox, tasks, tags, trash, search`. Hỏi trước khi push.

## 5. Kiểm tra trước khi báo xong
- [ ] `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test` xanh (ghi số test); số đo hiệu năng ở bản release.
- [ ] `npm run lint`, `npm test` vẫn xanh.
- [ ] `git diff main --stat` chỉ có file trong bảng ở mục 3.

## 6. Báo cáo (dòng đầu đúng mẫu)
`XONG: <việc> | File: <file đã đổi> | Kiểm tra: <đã chạy gì: kết quả> | Khác kế hoạch: <không / gì> | Còn lại: <không / gì>`
