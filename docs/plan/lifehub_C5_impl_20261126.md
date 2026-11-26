# 🛠️ KẾ HOẠCH TRIỂN KHAI: Phase C5 — Notes (v0.5)

> **Ngày:** 2026-11-26 23:40 · **Phiên chính:** Claude Opus 5.5 · **Triển khai bằng:** phiên phụ C5 (mới), Sonnet, effort medium
> **Nhánh git:** worktree mới tách từ `main` (v0.4.0) · **Bật:** skill (kho) `vercel-react-best-practices`, `vercel-composition-patterns`, `typescript-patterns`, `web-design-guidelines`
> Người triển khai làm đúng file này. Chỗ nào không làm được hoặc phải làm khác: ghi vào báo cáo, không tự đổi hướng.
> Đọc trước: [phân tích Phase C5](./lifehub_analysis_20261126.md), **hợp đồng v0.5 ở mục 2.1 và quy tắc 2.2 của [kế hoạch B5](./lifehub_B5_impl_20261126.md)**, spec mục 3.6, 9.2.

## 1. Mục tiêu
- **Xong khi:**
  - Chạy `VITE_IPC_MOCK=1 npm run dev`, các việc sau làm được:
    - Tạo, sửa, xoá, khôi phục Note.
    - Editor có: heading, đậm/nghiêng/gạch, danh sách, checklist, quote, đường kẻ, link, code block có tô màu cú pháp, slash command `/`.
    - Trạng thái lưu hiện rõ ("Đang lưu…", "Đã lưu lúc HH:mm", "Lỗi lưu, thử lại").
    - Gắn Note với Project và Task.
    - Tab Notes của Project, "Ghi chú gần đây" trên Today, chuyển Inbox thành Note, tìm Note trong `Ctrl+K`.
  - Dán HTML có `<script>`, `onclick`, `style` vào editor thì các phần này bị loại bỏ.
  - `CONFLICT` hiện dialog có lựa chọn.
  - `npm run lint`, `npm test`, `npm run build` xanh.
- **Không làm:** Page Tree (UI phẳng, không có cây), Table, xuất Markdown ([Nice]); ảnh, Version History, backlinks, embed, LaTeX. Không sửa `src-tauri/**` và `bindings/`.

## 2. Quyết định đã chốt
- **Kiểu tạm v0.5:**
  - Thêm khối `// v0.5 tạm — thay bằng bindings khi merge` ở cuối `contract.ts`.
  - `TrashKind` và `NoteSummary` đã thay đổi so với trước: **xoá** dòng re-export cũ của hai kiểu này, rồi định nghĩa lại trong khối v0.5. Nếu TS báo lỗi thì định nghĩa lại cả các kiểu đang dùng chúng (`TrashItem`, `ProjectOverview`, `TodayView`).
- **Thư viện:** `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-task-list`, `@tiptap/extension-task-item`, `@tiptap/extension-link`, `@tiptap/extension-placeholder`, `@tiptap/extension-code-block-lowlight`, `@tiptap/suggestion`, `lowlight`. Tất cả đều MIT; chỉ dùng extension miễn phí, không dùng Tiptap Pro.
- **Cấu hình editor** (`src/modules/notes/editor/`). Danh sách extension phải **khớp đúng** danh sách node/mark mà B5 cho phép:
  - StarterKit: heading chỉ có `levels: [1, 2, 3]`; tắt `codeBlock` của StarterKit để dùng lowlight; tắt các extension không có trong danh sách của B5 (ví dụ `underline` nếu StarterKit bản này có kèm).
  - Link: `openOnClick: false`, `autolink: true`, `protocols` chỉ gồm `http`, `https`, `mailto`, có `validate` chặn mọi scheme khác.
  - CodeBlockLowlight: dùng `common` của lowlight (các ngôn ngữ phổ biến), có ô chọn ngôn ngữ ở góc block.
  - TaskList + TaskItem (cho phép lồng nhau), Placeholder ("Gõ / để chèn khối…").
  - **Khi dán:** `editorProps.transformPastedHTML` gỡ `<script>`, `<style>`, `<iframe>`, mọi thuộc tính `on*` và `style` trước khi parse. Schema của Tiptap sẽ tự bỏ những node không khai báo. Không bao giờ render HTML thô.
  - Test: nội dung đi qua `getJSON()` chỉ chứa các node/mark được phép (khớp bộ kiểm tra của B5). Sao chép logic kiểm tra node/mark sang TS để test, đặt tại `src/modules/notes/editor/allowlist.ts`.
- **Slash command:** dùng `@tiptap/suggestion`, hiện khi gõ `/` ở đầu dòng hoặc sau khoảng trắng. Menu gồm: Văn bản, Tiêu đề 1/2/3, Danh sách, Danh sách số, Checklist, Code, Trích dẫn, Đường kẻ. Gõ để lọc (không phân biệt dấu), ↑/↓/Enter để chọn, Esc để đóng. Menu nổi có `role="listbox"`.
- **Bubble menu khi bôi đen chữ:** đậm, nghiêng, gạch, code, link (ô nhập URL, kiểm tra scheme).
- **Auto save** (`useNoteAutosave`):
  - Lưu sau 1 giây không gõ. Lưu ngay khi: rời trang Note, đổi sang Note khác, cửa sổ bị ẩn (`visibilitychange`, `blur`), hoặc nhận event `app-will-quit` (lưu xong thì gọi `appQuitReady`; không có thay đổi chưa lưu thì gọi ngay).
  - **Mỗi lúc chỉ một lần lưu.** Có thay đổi mới trong lúc đang lưu thì xếp hàng một lần lưu tiếp, dùng `baseVersion` lấy từ kết quả lần trước.
  - Lỗi mạng hoặc DB: giữ nguyên nội dung, hiện "Lỗi lưu, thử lại" kèm nút, và thử lại sau 5 giây (tối đa 3 lần).
  - `CONFLICT`: hiện dialog "Ghi chú đã được sửa ở nơi khác" với hai lựa chọn:
    - **Giữ bản của tôi:** `note_get` lấy version mới, rồi `note_save` đè bằng nội dung đang có.
    - **Dùng bản đã lưu:** tải lại, bỏ thay đổi đang có.
  - Hàm thuần xử lý hàng đợi lưu phải có test, dùng timer giả.
- **Trang Notes** (`/notes`, `/notes/:id`; sidebar **Notes**, `Ctrl+5`; thứ tự sidebar: Today, Inbox, Tasks, Calendar, Notes):
  - Cột trái: danh sách `NoteSummary` gồm tiêu đề (rỗng thì hiện "Không có tiêu đề"), `excerpt`, thời gian cập nhật. Có ô lọc theo chữ (lọc tại chỗ, không dấu), sắp xếp, lọc theo Project/Tag, nút "+ Ghi chú" (`Ctrl+N` khi đang ở trang Notes; ở trang khác `Ctrl+N` vẫn là tạo Task).
  - Bên phải: ô tiêu đề lớn (Enter để xuống editor), thanh thông tin (Project, Tag, các Task liên kết, trạng thái lưu), editor.
  - Menu "⋯": chuyển sang Project khác (`noteMove`), liên kết/bỏ liên kết Task (combobox tìm Task), xoá (toast Hoàn tác).
  - Note mới tạo xong thì focus vào ô tiêu đề.
- **Ghép với phần đã có:**
  - Tab **Notes** của Project: danh sách Note của Project, kèm nút tạo Note có sẵn `projectId`.
  - Panel Task: mục "Ghi chú" lấy từ `TaskDetail.noteIds` (gọi `note_list` với `{ taskId }`), có nút "Tạo ghi chú cho việc này" (`note_create` với `taskId`) và "Liên kết ghi chú…".
  - Today: widget "Ghi chú gần đây".
  - Inbox: thêm nút "Chuyển thành ghi chú" (`inboxConvertToNote`, bắt `CONFLICT`), xong thì mở Note vừa tạo.
  - Thùng rác: thêm kind Note.
  - Command Palette: kết quả kind Note mở `/notes/:id`; thêm hành động "Tạo ghi chú".
- **Mock:** làm đủ các command v0.5 theo quy tắc của B5. Gồm: chặn node lạ (dùng `allowlist.ts`), `CONFLICT` khi lệch version, trích `excerpt`, tạo Note mẫu khi seed. `window.__lifehubMock.bumpNoteVersion(id)` để tự tạo tình huống `CONFLICT` khi thử.
- i18n đủ vi/en. Mỗi màn hình có loading, empty và error state. Editor dùng được hoàn toàn bằng bàn phím và có `aria-label`.

## 3. File được sửa
| File | Việc | Ghi chú |
|---|---|---|
| `package.json`, `package-lock.json` | sửa | các gói Tiptap, lowlight |
| `src/lib/ipc/{contract.ts,commands.ts,mock.ts,events.ts}` | sửa | |
| `src/lib/i18n/**` | sửa | |
| `src/app/**` | sửa | sidebar, route, `Ctrl+5`, command palette, xử lý `app-will-quit` |
| `src/styles/**` | sửa | kiểu chữ trong editor, màu code theo token Dark/Light |
| `src/modules/notes/**` | tạo | có test |
| `src/modules/{projects,tasks,today,inbox,trash}/**` | sửa | ghép với phần đã có |
| `docs/log/log_YYYYMMDD_HHMM.md` | tạo | |
| `docs/plan/lifehub_analysis_20261126.md` | chỉ đánh ✅ Phase C5 | |

> Không sửa `src-tauri/**`, `bindings/`, `docs/INDEX.md`, `PROJECT_CONTEXT.md`, CI.

## 4. Các bước
1. [ ] Worktree tách từ `main` (v0.4.0); `npm ci`; `npm test` xanh.
2. [ ] Kiểu v0.5, wrapper, mock (kèm `allowlist.ts`).
3. [ ] Editor: extension, chặn khi dán, bubble menu, slash command.
4. [ ] Auto save + xử lý `CONFLICT` + `app-will-quit`.
5. [ ] Trang Notes (danh sách + editor + menu ⋯), sidebar, `Ctrl+5`.
6. [ ] Ghép với Project, Task, Today, Inbox, Thùng rác, Command Palette.
7. [ ] Test: allowlist (kèm HTML độc hại khi dán), hàng đợi lưu (timer giả), `CONFLICT` hai lựa chọn, `app-will-quit` gọi `appQuitReady`, lọc slash command không dấu.
8. [ ] Rà a11y bằng `web-design-guidelines`; kiểm tra (mục 5); ghi log; đánh ✅; commit `feat(ui): C5 notes`. Hỏi người dùng trước khi push.

## 5. Kiểm tra trước khi báo xong
- [ ] `npm run lint`, `npm test` (ghi số test), `npm run build` xanh. Ghi lại kích thước bundle tăng thêm bao nhiêu sau khi thêm Tiptap.
- [ ] Mock trong built-in browser: chụp trang Notes với một Note có đủ loại block (Dark và Light), menu slash, dialog `CONFLICT`, tab Notes của Project. Không có lỗi console.
- [ ] `git diff main --stat` chỉ có các file trong bảng mục 3.

## 6. Báo cáo (dòng đầu đúng mẫu)
`XONG: <việc> | File: <file đã đổi> | Kiểm tra: <đã chạy gì: kết quả> | Khác kế hoạch: <không / gì> | Còn lại: <không / gì>`
