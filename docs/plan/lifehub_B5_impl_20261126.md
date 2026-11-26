# 🛠️ KẾ HOẠCH TRIỂN KHAI: Phase B5 — Notes (v0.5)

> **Ngày:** 2026-11-26 23:40 · **Phiên chính:** Claude Opus 5.5 · **Triển khai bằng:** phiên phụ B5 (mới), Sonnet, effort medium
> **Nhánh git:** worktree mới tách từ `main` (v0.4.0) · **Bật:** plugin `mattpocock-skills` (tdd), skill (kho) `database-migrations`
> Người triển khai làm đúng file này. Chỗ nào không làm được hoặc phải làm khác: ghi vào báo cáo, không tự đổi hướng.
> Đọc trước: [phân tích Phase B5](./lifehub_analysis_20261126.md), [schema](./lifehub_schema_20261126.md) (`notes`, `note_tags`, `note_tasks`, mục 3), mục 2 của [B2](./lifehub_B2_impl_20261126.md) và [B3](./lifehub_B3_impl_20261126.md), spec mục 3.6, 9.2 (chống XSS trong editor).

## 1. Mục tiêu
- **Xong khi:**
  - `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` xanh.
  - Có test cho các trường hợp sau:
    - `note_save` lệch `baseVersion` → `CONFLICT`; đúng version → `version + 1`.
    - Trích `search_text` từ JSON của Tiptap (heading, list, checklist, code block, link).
    - JSON có node/mark lạ hoặc link `javascript:` → `VALIDATION`.
    - Tìm "ghi chu" ra Note "Ghi chú".
    - Gọi `inbox_convert_to_note` lần hai → `CONFLICT`.
    - Thùng rác kind `Note`: xoá → khôi phục → purge.
    - Xoá Project `WithChildren` thì xoá luôn Note, khôi phục Project thì Note quay lại.
    - `dashboard_today.recentNotes` và `ProjectOverview.recentNotes` có dữ liệu.
    - `TaskDetail.noteIds` có dữ liệu.
    - `app-will-quit` → `app_quit_ready` → thoát; frontend không trả lời thì thoát sau 1,5 giây.
- **Không làm:** Page Tree UI, Table, xuất Markdown (đều là [Nice]); hình ảnh, Version History, backlinks (sau v1.0). Không sửa ngoài `src-tauri/**` và `bindings/`.

## 2. Quyết định đã chốt

### 2.1. Hợp đồng v0.5 (phiên C5 dựa vào đúng mục này)
Giữ quy ước B2–B4. `contentJson` là **chuỗi** JSON (Tiptap `editor.getJSON()` rồi `JSON.stringify`), không phải object.

```ts
type Note = {
  id: string; projectId?: string; parentNoteId?: string; title: string; contentJson: string;
  version: number; taskIds: string[]; tagIds: string[];
  createdAt: string; updatedAt: string; deletedAt?: string;
};
type NoteSummary = { id: string; title: string; projectId?: string; updatedAt: string; excerpt: string };   // THÊM excerpt (≤160 ký tự đầu của search_text)
type NoteCreate = {
  title?: string; contentJson?: string; projectId?: string; parentNoteId?: string;
  taskId?: string;                // liên kết ngay với Task này
  tagIds?: string[];
};
type NoteSort = 'Updated' | 'Title' | 'Created';
type NoteFilter = { projectId?: string; taskId?: string; tagId?: string; trashed?: boolean; sort?: NoteSort };
type NoteSaveResult = { version: number; updatedAt: string };
type TrashKind = 'Task' | 'Inbox' | 'Project' | 'Note';      // THÊM 'Note'
// SearchKind giữ nguyên; từ v0.5 `search` trả cả kind 'Note'
```

| Command | Tham số `invoke` | Trả về | Ghi chú / lỗi |
|---|---|---|---|
| `note_list` | `{ filter: NoteFilter }` | `NoteSummary[]` | mặc định `Updated` (mới nhất trước); bỏ qua Note đã xoá và Note của Project đã lưu trữ, trừ khi lọc đúng `projectId` đó |
| `note_get` | `{ id }` | `Note` | `NOT_FOUND` |
| `note_create` | `{ input: NoteCreate }` | `Note` | `VALIDATION` |
| `note_save` | `{ id, title, contentJson, baseVersion }` | `NoteSaveResult` | `CONFLICT` khi lệch version; `VALIDATION` khi nội dung không hợp lệ |
| `note_move` | `{ id, projectId?: string \| null, parentNoteId?: string \| null }` | `Note` | dùng ba trạng thái; không nhận `baseVersion`; parent tạo vòng → `VALIDATION` |
| `note_delete` | `{ id }` | `void` | xoá mềm, vào Thùng rác |
| `note_link_task` / `note_unlink_task` | `{ noteId, taskId }` | `void` | link lần hai không lỗi |
| `note_set_tags` | `{ noteId, tagIds }` | `Note` | |
| `inbox_convert_to_note` | `{ id, note: NoteCreate }` | `Note` | mục đã xử lý → `CONFLICT`; `title` hoặc `contentJson` thiếu thì lấy nội dung Inbox (title = 80 ký tự đầu, body = đoạn văn chứa toàn bộ nội dung) |
| `app_quit_ready` | — | `void` | frontend báo đã lưu xong; xem mục 2.2 |

Event:
- `entity-changed` có thêm `'note'`.
- Event mới **`app-will-quit`** (không có payload): core phát ra trước khi thoát hẳn.

### 2.2. Quy tắc nghiệp vụ
- **Kiểm tra nội dung** (`modules/notes/domain.rs`, hàm thuần):
  - `contentJson` phải parse được, có gốc `{ "type": "doc" }`, dài tối đa 2 MB; `title` tối đa 300 ký tự.
  - **Node được phép:** `doc`, `paragraph`, `heading` (`attrs.level` 1–3), `text`, `bulletList`, `orderedList`, `listItem`, `taskList`, `taskItem` (`attrs.checked` bool), `codeBlock` (`attrs.language` dạng chuỗi `[a-z0-9+#-]` tối đa 30 ký tự, hoặc null), `blockquote`, `horizontalRule`, `hardBreak`.
  - **Mark được phép:** `bold`, `italic`, `strike`, `code`, `link` (`attrs.href` bắt đầu bằng `http://`, `https://` hoặc `mailto:`).
  - Có node/mark/attr nằm ngoài danh sách → `VALIDATION`, `details` ghi tên node đầu tiên vi phạm. Chặn từ core là lớp phòng thủ thứ hai, bên cạnh schema Tiptap ở frontend.
- **`search_text`:** duyệt cây node, nối các `text`. Giữa các block (paragraph, heading, listItem, taskItem, codeBlock, blockquote) chèn `\n`. Kết quả bỏ khoảng trắng thừa ở hai đầu. `excerpt` là 160 ký tự đầu, xuống dòng đổi thành dấu cách.
- **`note_save`:** trong một transaction:
  - So `version`; ghi `title`, `content_json`, `search_text`; `version + 1`, `updated_at`.
  - Gọi `search::index('Note', title, search_text)` và `changelog`.
  - **Chỉ** phát `entity-changed` khi `title` đổi, để cửa sổ đang gõ không bị làm mới liên tục. Không đổi `title` thì vẫn ghi DB, nhưng không phát event.
- **Liên kết:**
  - `note_create` có `taskId` thì tạo luôn `note_tasks`. Task phải tồn tại và chưa xoá.
  - `projectId` phải là Project chưa lưu trữ.
  - Tạo/sửa Note có `parentNoteId`: Note cha phải cùng workspace, không tạo vòng (kiểm tra bằng cách đi ngược chuỗi cha, tối đa 50 cấp).
- **Thùng rác:**
  - `note_delete` đặt `deleted_at` và gọi `search::remove`. Note con **không** bị xoá theo.
  - Purge: xoá cứng Note; `note_tasks`/`note_tags` cascade; Note con được đặt `parent_note_id = NULL`; `inbox_items.converted_note_id` trỏ tới Note thì xoá cứng Inbox item đó (giống Task).
- **Project (bổ sung cho B3):**
  - `project_delete` `WithChildren` xoá mềm luôn Note của Project, cùng mốc `now`. Khôi phục Project thì khôi phục những Note có đúng mốc đó.
  - `project_archive` `WithChildren` **không** đụng tới Note (Note không có `archived_at`). Note chỉ bị ẩn khỏi `note_list` mặc định vì thuộc Project đã lưu trữ.
  - `Detach` đặt `project_id = NULL`, việc này đã có từ B3.
- **Đổ dữ liệu vào chỗ đang để trống:**
  - `TaskDetail.noteIds`: các Note chưa xoá liên kết với Task.
  - `ProjectOverview.recentNotes` và `dashboard_today.recentNotes`: 5 Note cập nhật gần nhất (của Project, hoặc của toàn bộ), không lấy Note đã xoá.
- **Search:** index Note theo `title` + `search_text`. Lúc khởi động, reindex Note nếu `search_map` chưa có.
- **Thoát an toàn** (để không mất nội dung Note):
  - Mọi đường thoát hẳn (`app_quit`, menu khay "Thoát", `Ctrl+Q`, đóng cửa sổ khi `closeToTray = false`) đi qua hàm `request_exit`. Hàm này phát `app-will-quit`, rồi chờ `app_quit_ready` (dùng `oneshot`/`Notify`), tối đa 1,5 giây, rồi gọi `app.exit(0)`.
  - Trong lúc chờ mà nhận thêm yêu cầu thoát thì bỏ qua.
  - Tắt máy/đăng xuất Windows nằm ngoài phạm vi; auto save debounce 1 giây là đủ cho MVP.
- Dữ liệu mẫu (`seed_demo_data`): thêm 3 Note cho GGStudio ("Yêu cầu kỹ thuật Booking", "Ghi chú họp khách hàng", "API thanh toán") có heading, checklist và code block. Một Note trong số đó liên kết với Task "Payment API".

## 3. File được sửa
| File | Việc | Ghi chú |
|---|---|---|
| `src-tauri/src/modules/notes/**` | tạo | 4 lớp; validator và trích text là hàm thuần, có test |
| `src-tauri/src/modules/{inbox,tasks,projects,trash,search,dashboard}/**` | sửa | `convert_to_note`, `noteIds`, `WithChildren` cho Note, kind Note, index Note, `recentNotes` |
| `src-tauri/src/system/{windows.rs,tray.rs,demo.rs}` | sửa | `request_exit`, dữ liệu mẫu |
| `src-tauri/src/lib.rs`, `src-tauri/src/modules/mod.rs` | sửa | |
| `src-tauri/migrations/002_*.sql` | chỉ khi thật cần | ghi lý do vào báo cáo |
| `src/lib/ipc/bindings/*` | sinh tự động | kiểm tra không có `bigint` (dùng `#[ts(type = "number")]` cho `u64`/`i64`) |
| `docs/explain/lifehub_core-b5_explain_YYYYMMDD.md`, `docs/log/log_YYYYMMDD_HHMM.md` | tạo | |
| `docs/plan/lifehub_analysis_20261126.md` | chỉ đánh ✅ Phase B5 | |

> Không sửa `docs/INDEX.md`, `PROJECT_CONTEXT.md`, `src/**` ngoài `bindings/`, `package.json`, CI.

## 4. Các bước
1. [ ] Worktree tách từ `main` (v0.4.0). Build lần đầu chạy nền. `cargo test` xanh.
2. [ ] Notes domain: validator, trích `search_text`, `excerpt`, kiểm tra vòng cha–con. Test theo bảng.
3. [ ] Repository, use case, command (list/get/create/save/move/delete/link/tags).
4. [ ] Bổ sung ở inbox (`convert_to_note`), tasks (`noteIds`), projects (`WithChildren` cho Note), trash (kind Note), search, dashboard.
5. [ ] `request_exit` + `app_quit_ready` + `app-will-quit`.
6. [ ] Thêm Note vào dữ liệu mẫu.
7. [ ] Thử trong `tauri dev` bằng devtools: tạo Note → `note_save` hai lần → tìm không dấu; `app_quit`.
8. [ ] Kiểm tra (mục 5), viết explain + log, đánh ✅, commit `feat(core): B5 notes`. Hỏi người dùng trước khi push.

## 5. Kiểm tra trước khi báo xong
- [ ] `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` xanh (ghi số test).
- [ ] `grep -r bigint src/lib/ipc/bindings` không ra kết quả.
- [ ] `npm run lint`, `npm test` vẫn xanh.
- [ ] `git diff main --stat` chỉ có các file trong bảng mục 3.

## 6. Báo cáo (dòng đầu đúng mẫu)
`XONG: <việc> | File: <file đã đổi> | Kiểm tra: <đã chạy gì: kết quả> | Khác kế hoạch: <không / gì> | Còn lại: <không / gì>`
