# 🛠️ KẾ HOẠCH TRIỂN KHAI: Phase C2 — Inbox, Tasks, Quick Capture, Command Palette (v0.2)

> **Ngày:** 2026-11-26 15:20 · **Phiên chính:** Claude Opus 5.5 · **Triển khai bằng:** phiên phụ C, Sonnet, effort medium
> **Nhánh git:** nhánh worktree của phiên C (`claude/ui-…`), sau khi `git merge main` · **Bật:** skill (kho) `vercel-react-best-practices`, `vercel-composition-patterns`, `typescript-patterns`, `web-design-guidelines`
> Người triển khai làm đúng file này. Chỗ nào không làm được hoặc phải làm khác: ghi vào báo cáo, không tự đổi hướng.
> Đọc trước: [phân tích Phase C2](./lifehub_analysis_20261126.md), **hợp đồng v0.2 ở mục 2.1 và quy tắc 2.2 của [kế hoạch B2](./lifehub_B2_impl_20261126.md)**, spec mục 3.2, 3.3, 4.2, 4.3, 4.6, 5.2.

## 1. Mục tiêu
- **Xong khi:**
  - Chạy `VITE_IPC_MOCK=1 npm run dev` và đi trọn spec 5.2, bước 1–2: ghi vào Inbox → mở Inbox → chuyển thành Task, đặt deadline thứ Sáu và gắn tag.
  - Làm việc được với Task ở List và Kanban (kéo thả bằng chuột và bàn phím), panel chi tiết, checklist, Task lặp, lọc và sắp xếp, Trash.
  - `Ctrl+K` tìm được Task và Inbox; `Ctrl+N` tạo Task.
  - Danh sách 5.000 Task giả cuộn mượt.
  - `npm run lint`, `npm test`, `npm run build` xanh.
- **Không làm:** Projects, Dashboard (C3); Calendar (C4); Notes (C5). Không sửa `src-tauri/**`, `src/lib/ipc/bindings/**`.

## 2. Quyết định đã chốt
- **Kiểu dữ liệu tạm cho v0.2:**
  - `src/lib/ipc/contract.ts` hiện đang re-export kiểu v0.1 từ `bindings/`. Thêm **bên dưới** các kiểu v0.2 viết tay, chép **đúng** hợp đồng ở B2 mục 2.1, đặt trong một khối có chú thích `// v0.2 tạm — thay bằng bindings khi merge`.
  - Phiên chính sẽ đổi khối đó sang re-export khi merge.
  - Không tự thêm trường. Nếu B2 đổi hợp đồng, phiên chính sẽ báo.
- **`commands.ts` + `mock.ts`:**
  - Wrapper cho mọi command v0.2, tham số `invoke` đúng như bảng của B2.
  - Mock cài đúng quy tắc ở B2 mục 2.2 ở mức đủ để giao diện chạy: Done/mở lại, sinh lần lặp tiếp theo, `CONFLICT` khi chuyển Inbox hai lần và khi lệch `baseVersion`, lọc theo hạn, sắp xếp, Trash, tìm kiếm không dấu (`normalize('NFD')` + bỏ dấu, đổi `đ` → `d`).
  - `VITE_MOCK_SEED=5000` sinh 5.000 Task giả để thử hiệu năng.
- **Thư viện thêm:** `@tanstack/react-virtual` (danh sách ảo), `@date-fns/tz` (đổi giờ địa phương theo múi giờ trong Settings ↔ UTC), `cmdk` (Command Palette, qua component `Command` của shadcn).
- **Query key:** `['tasks', filter]`, `['task', id]`, `['tags']`, `['trash']`, `['search', query, kinds]`, `['inbox', status]`. Event `entity-changed` `task`/`inbox`/`tag` invalidate theo tiền tố (`['tasks']`, `['task']`, `['trash']`, `['search']`…).
  - Optimistic update cho đổi trạng thái, `task_move`, toggle checklist. Lỗi thì rollback kèm toast.
  - `CONFLICT` của `task_update`: toast "Task vừa được sửa ở nơi khác", tải lại Task, giữ nguyên nội dung người dùng đang gõ trong ô.
- **Sidebar:** thêm **Tasks** (`Ctrl+3`), nhóm **Lĩnh vực** (danh sách Areas; bấm vào thì mở Tasks lọc theo `areaId`), **Thùng rác** (cuối sidebar, trên Settings). Today, Calendar, Notes, Projects vẫn chưa hiện.
- **Routes:** `/tasks?view=list|board&due=&status=&priority=&tag=&area=&sort=` (bộ lọc nằm trên URL để giữ trạng thái khi chuyển trang), `/tasks/:id` (mở panel), `/trash`.
- **Màn Tasks** (`src/modules/tasks/`):
  - Thanh lọc gồm: tab nhanh (Tất cả, Hôm nay, Quá hạn, 7 ngày tới, Không hạn), lọc trạng thái, độ ưu tiên, tag, Area; chọn cách sắp xếp; nút "Hiện đã lưu trữ"; chuyển List/Board.
  - **List:** ảo hoá; mỗi dòng có checkbox Done, tiêu đề, huy hiệu ưu tiên (có chữ hoặc biểu tượng, không chỉ dùng màu), hạn, tag, số checklist (`2/5`), biểu tượng lặp.
    - Hạn quá thì chữ đỏ và có chữ "Quá hạn".
    - Bàn phím: ↑/↓ chọn dòng, Enter mở panel, Space đổi Done, `Delete` xoá (có hoàn tác bằng toast 5 giây gọi `trash_restore`).
  - **Board:** 4 cột trạng thái, dnd-kit (`KeyboardSensor`); thả xong gọi `taskMove` với `beforeId`/`afterId` lấy từ thẻ ngay trên/dưới trong cột đích.
  - Context menu (chuột phải hoặc `Shift+F10`): đổi trạng thái, ưu tiên, lưu trữ, xoá.
  - **Panel chi tiết** bên phải (không rời danh sách, `Esc` để đóng):
    - Sửa tiêu đề và mô tả (textarea, lưu khi blur hoặc sau 800 ms không gõ, gửi kèm `baseVersion`), trạng thái, ưu tiên.
    - Hạn: chọn "Theo ngày" hoặc "Có giờ" (DatePicker cộng ô giờ; giờ nhập là giờ địa phương theo múi giờ Settings, đổi sang UTC bằng `@date-fns/tz` trước khi gửi `dueAt`).
    - Ngày bắt đầu, thời lượng dự kiến, Area.
    - Lặp lại: tần suất, mỗi N, chọn thứ trong tuần khi chọn Weekly.
    - Tag: combobox chọn nhiều, gõ tên chưa có thì tạo mới qua `tagCreate`.
    - Checklist: thêm, sửa, toggle, kéo thả sắp xếp, xoá.
    - Dòng thông tin: đã tạo, đã cập nhật.
  - Done một Task lặp và có `next` thì toast "Đã tạo lần tiếp theo: <ngày>".
- **Tạo Task:** `Ctrl+N` (ngoài ô nhập) hoặc nút "+" trong Tasks mở dialog tạo nhanh: tiêu đề (bắt buộc), hạn, ưu tiên, tag, Area. Enter để lưu.
- **Inbox** (`src/modules/inbox/`):
  - Tab Đang mở / Đã xử lý.
  - Sửa tại chỗ (double-click hoặc Enter). Xoá có hoàn tác.
  - Nút "Chuyển thành Task" mở dialog tạo Task, điền sẵn tiêu đề từ nội dung Inbox, gọi `inboxConvertToTask`. Nhận `CONFLICT` thì báo "Mục này đã được xử lý" và tải lại.
  - Mục đã xử lý có link tới Task đã tạo.
  - [Nice] chọn nhiều mục: chưa làm.
  - URL trong nội dung hiện dạng link, mở bằng trình duyệt ngoài. Mở link cần quyền `opener` ở frontend: **chưa có quyền này**, nên v0.2 chỉ tô màu link và cho copy. Đã ghi lại để phiên chính quyết sau.
- **Thùng rác** (`src/modules/trash/`): danh sách (loại, tiêu đề, ngày xoá, "xoá vĩnh viễn sau N ngày"), nút Khôi phục, nút "Dọn sạch thùng rác" (AlertDialog).
- **Command Palette** (`Ctrl+K`, trong `src/app/command-palette/`):
  - Ô tìm kiếm có debounce 150 ms gọi `search`; nhóm kết quả theo loại.
  - Nhóm "Đi tới": Inbox, Tasks, Thùng rác, Settings.
  - Nhóm "Tạo": Task mới, ghi Inbox.
  - Chọn kết quả Task thì mở `/tasks/:id`; chọn Inbox thì mở Inbox và cuộn tới mục đó.
  - Ô tìm trên TitleBar bỏ trạng thái disabled; bấm vào thì mở Palette.
- **Quick Capture:** giữ nguyên hành vi. [Nice] cú pháp `#tag @project !high`: chưa làm.
- **i18n:** mọi chuỗi mới có đủ `vi` và `en`. Ngày hiển thị theo `dateFormat` và ngôn ngữ ("Hôm nay", "Ngày mai", "Thứ Sáu 27/11").
- **Mỗi màn hình** có đủ loading, empty, error state.
  - Empty của Tasks: "Chưa có việc nào. Nhấn Ctrl+N để tạo."
  - Empty của Hôm nay: "Không có việc nào hôm nay 🎉".

## 3. File được sửa
| File | Việc | Ghi chú |
|---|---|---|
| `package.json`, `package-lock.json` | sửa | thư viện ở mục 2 |
| `src/lib/ipc/{contract.ts,commands.ts,mock.ts,events.ts}` | sửa | không đụng `bindings/` |
| `src/lib/{format,i18n,tz}/**` | sửa / tạo | `tz`: đổi giờ địa phương ↔ UTC (có test, gồm cả ngày đổi giờ mùa hè của `America/New_York`) |
| `src/app/**` | sửa | sidebar, routes, phím tắt, command palette |
| `src/components/**` | sửa / tạo | |
| `src/modules/{inbox,tasks,trash}/**` | sửa / tạo | kèm test |
| `src/windows/quick-capture/**` | chỉ sửa nếu cần | |
| `docs/log/log_YYYYMMDD_HHMM.md` | tạo | |
| `docs/plan/lifehub_analysis_20261126.md` | chỉ đánh ✅ Phase C2 | |

> Không sửa `src-tauri/**`, `bindings/`, `docs/INDEX.md`, `PROJECT_CONTEXT.md`, CI.

## 4. Các bước
1. [ ] `git merge main` (nhận v0.1 đã merge: `contract.ts` re-export bindings, cấu hình test bỏ qua `.claude/`). `npm ci`, `npm test` xanh.
2. [ ] Kiểu dữ liệu v0.2, wrapper, mock (kèm seed 5.000), `src/lib/tz`.
3. [ ] Sidebar, routes, phím tắt `Ctrl+3`/`Ctrl+N`.
4. [ ] Tasks List (ảo hoá) + thanh lọc + context menu.
5. [ ] Panel chi tiết (gồm checklist, lặp, tag).
6. [ ] Board kéo thả.
7. [ ] Inbox (sửa, xoá, chuyển thành Task, tab Đã xử lý) + Thùng rác.
8. [ ] Command Palette.
9. [ ] Rà a11y bằng `web-design-guidelines`; test cho: lọc theo URL, Done task lặp hiện toast, `CONFLICT` khi chuyển Inbox, `beforeId`/`afterId` khi kéo thả (tách thành hàm thuần), đổi giờ có múi giờ.
10. [ ] Kiểm tra (mục 5), ghi log, đánh ✅, commit `feat(ui): C2 inbox, tasks list/board, trash, command palette`. Hỏi trước khi push.

## 5. Kiểm tra trước khi báo xong
- [ ] `npm run lint`, `npm test` (ghi số test), `npm run build` xanh.
- [ ] Mock trong built-in browser: chụp màn hình List, Board, panel chi tiết, Inbox chuyển thành Task, Command Palette, Thùng rác, ở theme Dark và Light. Không có lỗi console. Đi trọn spec 5.2 bước 1–2 chỉ bằng bàn phím.
- [ ] `VITE_MOCK_SEED=5000`: cuộn List mượt, lọc phản hồi ngay (ghi nhận xét).
- [ ] `git diff main --stat` chỉ có file trong bảng ở mục 3.

## 6. Báo cáo (dòng đầu đúng mẫu)
`XONG: <việc> | File: <file đã đổi> | Kiểm tra: <đã chạy gì: kết quả> | Khác kế hoạch: <không / gì> | Còn lại: <không / gì>`
