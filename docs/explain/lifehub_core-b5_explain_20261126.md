# 📖 TÀI LIỆU GIẢI THÍCH: Core B5 — Notes (v0.5)

# 1. Tổng quan (Overview)
- **Mục đích cốt lõi:** thêm Note (nội dung Tiptap lưu dạng JSON), kiểm tra nội dung bằng allowlist, trích `search_text` cho tìm kiếm, liên kết Note với Task/Tag/Project, và cơ chế thoát an toàn để không mất nội dung đang soạn.
- **Vai trò trong hệ thống:** `modules/notes` là module mới (4 lớp). `inbox`, `tasks`, `projects`, `trash`, `search`, `dashboard` và `system/{windows,tray,demo}` được mở rộng. Không có migration mới: bảng `notes`, `note_tags`, `note_tasks` và cột `inbox_items.converted_note_id` đã có từ `001`.

## 2. Phân tích Chi tiết

### 📌 `modules/notes`
- **domain (hàm thuần, có test):**
  - `validate_content`: parse JSON, gốc phải là `{"type":"doc"}`, tối đa 2 MB, lồng tối đa 64 cấp. Chỉ nhận node `doc, paragraph, heading(level 1–3), text, bulletList, orderedList, listItem, taskList, taskItem(checked), codeBlock(language), blockquote, horizontalRule, hardBreak` và mark `bold, italic, strike, code, link`. Link phải bắt đầu bằng `http://`, `https://`, `mailto:` (không phân biệt hoa/thường, nên `JavaScript:` bị chặn). Vi phạm → `VALIDATION`, `details` ghi tên node/mark/thuộc tính đầu tiên sai.
  - `extract_text`: duyệt cây, nối các `text`; chèn `\n` trước mỗi block (paragraph, heading, listItem, taskItem, codeBlock, blockquote) và ở `hardBreak`; bỏ khoảng trắng hai đầu. `excerpt` = 160 ký tự đầu, `\n` → dấu cách.
  - `paragraph_doc`: dựng nội dung một đoạn văn từ chuỗi thường (xuống dòng thành `hardBreak`), dùng cho `inbox_convert_to_note`.
  - `NoteMoveArgs`: ba trạng thái (thiếu / `null` / giá trị) bằng `serde_with::double_option`.
- **application:** trait `NoteRepository` + use case `create`, `get`, `list`, `save`, `move_note`, `delete`, `link_task`, `unlink_task`, `set_tags`.
  - `save`: so `baseVersion` (lệch → `CONFLICT`), kiểm tra nội dung, ghi, trả `SaveOutcome { result, title_changed }`. Command chỉ phát `entity-changed` khi `title_changed`.
  - Kiểm tra Project/Task/Tag/Note cha khi tạo và di chuyển; cha tạo vòng hoặc sâu quá 50 cấp → `VALIDATION`.
- **infrastructure:** `SqliteNoteRepository` + các hàm làm việc trực tiếp trên `Connection` cho module khác (`list_summaries`, `recent`, `note_ids_of_task`, `list_deleted`, `restore`, `purge`, `soft_delete_for_project`, `restore_for_project`, `purge_deleted_of_project`, `deleted_before`).
- **`note_move`** đọc thẳng body JSON của lời gọi (`tauri::ipc::Request`) vì Tauri không phân biệt "thiếu" với `null` khi tách từng tham số. Hợp đồng vẫn là `{ id, projectId?, parentNoteId? }`.
- **Link/Tag không tăng `version`** của Note (chỉ ghi nhật ký thay đổi). Nhờ vậy việc gắn Task/Tag không làm editor đang mở bị `CONFLICT` ở lần auto save kế tiếp.

### 📌 Tích hợp với module khác
- **Inbox:** `convert_to_note` (cùng transaction): mục không còn `Open` → `CONFLICT`; thiếu `title` thì lấy 80 ký tự đầu của dòng đầu; thiếu `contentJson` thì dùng một đoạn văn chứa toàn bộ nội dung. `mark_processed_note` đặt `converted_note_id`.
- **Tasks:** `TaskDetail.noteIds` = Note chưa xoá liên kết với Task (mới cập nhật trước).
- **Projects:** `recentNotes` của `ProjectOverview` (5 Note mới nhất của Project). `project_delete` `WithChildren` xoá mềm Note cùng mốc `now`; khôi phục Project chỉ khôi phục Note có đúng mốc đó (Note đã xoá từ trước vẫn nằm trong Thùng rác). `project_archive` không đụng tới Note. Purge Project xoá cứng Note đã xoá mềm của nó, và gỡ Project khỏi Note còn sống.
- **Trash:** thêm `TrashKind::Note`. Thứ tự purge: Task → Inbox → Note → Project. Purge Note: Note con về `parent_note_id = NULL`, mục Inbox đã chuyển thành Note đó bị xoá cứng, `note_tags`/`note_tasks` xoá theo cascade. Khôi phục Note có Project đã xoá thì tách Project ra.
- **Search:** Note được index theo `title` + `search_text` (lúc tạo, lưu, khôi phục), gỡ khi xoá. `search` hiện tiêu đề lấy từ bảng `notes`. Lúc khởi động `reindex_missing_notes` index nốt Note chưa có trong `search_map`.
- **Dashboard:** `recent_notes` = 5 Note mới nhất của toàn bộ, bỏ Note đã xoá và Note của Project đã lưu trữ.
- **`NoteSummary`** chuyển từ `projects::domain` sang `notes::domain` (có thêm `excerpt`); `projects::domain` vẫn re-export tên cũ.

### 📌 Thoát an toàn (`system/windows.rs`)
- `ExitGate` (state) giữ kênh `mpsc`. `request_exit(app)`: nếu đang chờ thì bỏ qua; ngược lại phát `app-will-quit`, rồi một thread chờ `app_quit_ready` tối đa 1,5 giây (`QUIT_TIMEOUT`) và gọi `app.exit(0)`.
- Mọi đường thoát hẳn qua `request_exit`: command `app_quit`, mục "Thoát" của khay, đóng cửa sổ chính khi `closeToTray = false`. (`Ctrl+Q` do frontend gọi `app_quit`.)
- Command mới `app_quit_ready` để frontend báo đã lưu xong.

### 📌 Dữ liệu mẫu
`seed_demo_data` thêm 3 Note cho GGStudio (có heading, checklist, code block); "API thanh toán" liên kết với Task "Payment API".

## 3. Lưu ý và phần chưa kiểm
- Validator chấp nhận thêm các thuộc tính mà Tiptap luôn ghi nhưng danh sách trong kế hoạch không nhắc: `orderedList.start` (số) và `link.target/rel/class` (chuỗi hoặc `null`). Thuộc tính khác vẫn bị từ chối. Nếu C5 dùng extension khác (ví dụ `underline`, `image`) thì phải báo để mở rộng allowlist.
- Chưa thử trong `tauri dev` và trên bản `.exe`: gọi `note_save` hai lần, tìm không dấu, `app_quit` → `app-will-quit` → `app_quit_ready` (test tự động chỉ phủ `ExitGate` và logic chờ/timeout, chưa phủ việc phát event thật).
- Test B3 `purge_removes_children_and_detaches_notes` được sửa theo hành vi mới: `WithChildren` xoá luôn Note nên purge Project xoá cả Note (trước B5 Note chỉ bị gỡ khỏi Project).
