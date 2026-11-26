# 🛠️ KẾ HOẠCH TRIỂN KHAI: Phase C3 — Projects + Dashboard/Today (v0.3)

> **Ngày:** 2026-11-26 18:30 · **Phiên chính:** Claude Opus 5.5 · **Triển khai bằng:** phiên phụ C, Sonnet, effort medium
> **Nhánh git:** nhánh worktree của phiên C (`claude/ui-226460`), sau khi `git merge main` · **Bật:** skill (kho) `vercel-react-best-practices`, `vercel-composition-patterns`, `typescript-patterns`, `web-design-guidelines`
> Người triển khai làm đúng file này. Chỗ nào không làm được hoặc phải làm khác: ghi vào báo cáo, không tự đổi hướng.
> Đọc trước: [phân tích Phase C3](./lifehub_analysis_20261126.md), **hợp đồng v0.3 ở mục 2.1 và quy tắc 2.2 của [kế hoạch B3](./lifehub_B3_impl_20261126.md)**, spec mục 3.1, 3.4, 4.2, 5.2.

## 1. Mục tiêu
- **Xong khi:**
  - `VITE_IPC_MOCK=1 npm run dev`: dữ liệu mẫu GGStudio hiện **26/40 (65%)** ở Overview và trên Today.
  - Tạo, sửa, sắp xếp, lưu trữ, khôi phục, xoá Project đều làm được. Dialog lưu trữ/xoá có lựa chọn `mode`.
  - Board của Project giữ thứ tự sau khi tải lại trang (mock lưu vào `localStorage`).
  - Today hiện đủ: việc hôm nay, quá hạn, 7 ngày tới, dự án đang chạy. Bấm vào widget thì mở đúng bản ghi.
  - Đi trọn spec 5.2 bước 6 (bằng mock): hoàn thành Task trên Board thì tiến độ trên Today tự cập nhật.
  - `npm run lint`, `npm test`, `npm run build` đều xanh.
- **Không làm:** Calendar, Events, lịch trình trong ngày (C4); Notes và tab Notes (C5). Ẩn hẳn, không để menu chết. Milestones ([Nice]). Không sửa `src-tauri/**`, `bindings/`.

## 2. Quyết định đã chốt
- **Kiểu dữ liệu tạm cho v0.3:**
  - Thêm khối `// v0.3 tạm — thay bằng bindings khi merge` ở cuối `src/lib/ipc/contract.ts`, chép đúng B3 mục 2.1.
  - `TrashKind` thêm `'Project'`: **xoá dòng re-export `TrashKind` từ bindings** rồi định nghĩa lại trong khối v0.3. `TrashItem` vẫn re-export và tự nhận `TrashKind` mới qua import của bindings: nếu TS báo lỗi kiểu thì định nghĩa lại cả `TrashItem` trong khối v0.3.
- **Mock:** đủ các command v0.3 theo quy tắc B3 mục 2.2 (tiến độ, `mode`, unarchive theo mốc thời gian, `dashboard_today` tính theo múi giờ trong Settings). `seed_demo_data` sinh đúng dữ liệu như mục 2.2 của B3. Khi `VITE_IPC_MOCK=1`, mock tự seed lúc khởi động nếu chưa có dữ liệu (lưu trong `localStorage` key `lifehub.mock`). Có cách xoá dữ liệu mock: `?resetMock=1`.
- **Query key:** `['projects', archived]`, `['project', id]`, `['today']`. Event `entity-changed` loại `'project'` và `'task'` đều invalidate `['today']` và `['project']`.
- **Sidebar** (theo spec 4.2):
  - Thêm **Today** lên đầu (`Ctrl+1`, route `/today` và là trang mặc định `/`).
  - Nhóm **Dự án**: danh sách Project chưa lưu trữ theo `sortKey`, có chấm màu hoặc icon. Kéo thả để sắp xếp (dnd-kit, có hỗ trợ bàn phím), gọi `projectReorder`. Nút "+" mở dialog tạo Project.
  - Context menu trên Project: Đổi tên, Lưu trữ, Xoá.
  - Link "Đã lưu trữ" ở cuối nhóm Dự án.
  - Inbox giữ `Ctrl+2`, Tasks giữ `Ctrl+3`.
- **Routes:** `/today`, `/projects/:id/:tab` với `tab` ∈ `overview|tasks|board|settings`, mặc định `overview`. Thêm `/projects/archived`.
- **Trang Project** (`src/modules/projects/`):
  - Header: icon, màu, tên (sửa tại chỗ), trạng thái, Area.
  - **Overview:**
    - Thanh tiến độ kèm chữ "26/40 việc · 65%". `percent` không có thì hiện "Chưa có công việc", không hiện 0%.
    - Số Task theo trạng thái, mô tả (sửa được), ngày bắt đầu và ngày dự kiến kết thúc.
    - Danh sách 5 Task sắp đến hạn của dự án.
  - **Tasks:** dùng lại List của C2 với `projectId` cố định (ẩn bộ lọc Area).
  - **Board:** dùng lại Board của C2 với `projectId` cố định. Tách component dùng chung nếu C2 chưa tách, không chép code.
  - **Settings:** sửa đủ các trường của `ProjectPatch`.
    - Chọn màu: 8 màu token.
    - Chọn icon: khoảng 16 icon lucide định sẵn (`folder`, `briefcase`, `gamepad-2`, `graduation-cap`, `code`, `book`, `heart`, `home`, `rocket`, `star`, `target`, `wrench`, `music`, `camera`, `globe`, `leaf`).
    - Vùng nguy hiểm: Lưu trữ, Xoá.
  - Gửi `baseVersion`; nhận `CONFLICT` thì xử lý như Task ở C2.
  - Tab Notes **không hiện** cho tới C5.
- **Dialog lưu trữ/xoá Project:** radio "Lưu trữ (hoặc xoá) cả N công việc" / "Giữ công việc, chuyển thành việc độc lập", mặc định chọn phương án thứ hai. Có ghi rõ hệ quả. Xoá xong hiện toast có nút Hoàn tác (`trash_restore`).
- **Today** (`src/modules/today/`):
  - Tiêu đề "Hôm nay, Thứ Năm 26/11" (theo `date` của `TodayView`, ngôn ngữ và `dateFormat`).
  - 3 thẻ số liệu: việc hôm nay, quá hạn, dự án đang chạy. Thẻ "sự kiện" làm ở C4.
  - Các widget:
    - Việc hôm nay: checkbox Done ngay tại chỗ, optimistic.
    - Quá hạn: có nút "Dời sang hôm nay", gọi `task_update` với `dueDate` = hôm nay; Task có giờ thì giữ giờ.
    - 7 ngày tới.
    - Dự án đang chạy: thanh tiến độ, bấm vào mở Project.
  - Nút "+ Thêm nhanh" ở Today tạo Task có hạn hôm nay.
  - Bấm vào Task ở bất kỳ widget nào thì mở panel chi tiết của Task ngay trên Today (dùng lại panel C2), không chuyển trang.
  - Empty state cho từng widget.
  - Today tự làm mới khi qua nửa đêm: hẹn giờ đến 00:00 theo múi giờ Settings rồi invalidate `['today']`.
- **Ghép với phần đã có:**
  - Panel Task và dialog tạo Task: thêm ô chọn Project. Đã chọn Project thì ô Area bị khoá và hiện Area của Project.
  - Dòng Task ở List hiện nhãn tên dự án (trừ khi đang ở trang Project).
  - Dialog Inbox → Task: thêm ô chọn Project.
  - Thùng rác: hiện kind Project.
  - Command Palette: kết quả loại Project; thêm nhóm "Đi tới dự án…"; thêm hành động "Tạo dự án".
- **Dữ liệu mẫu:** trong Settings → Dữ liệu, nút "Nạp dữ liệu mẫu" **chỉ hiện khi `import.meta.env.DEV`**, gọi `seedDemoData`. Nhận `CONFLICT` thì báo "Đã có dữ liệu mẫu".
- i18n đủ vi/en. Mỗi màn hình có đủ loading, empty, error state.

## 3. File được sửa
| File | Việc | Ghi chú |
|---|---|---|
| `src/lib/ipc/{contract.ts,commands.ts,mock.ts}` | sửa | không đụng `bindings/` |
| `src/lib/{i18n,format}/**` | sửa | |
| `src/app/**` | sửa | sidebar, routes, phím tắt, command palette |
| `src/components/**` | sửa / tạo | |
| `src/modules/{projects,today}/**` | tạo | kèm test |
| `src/modules/{tasks,inbox,trash,settings}/**` | sửa | chọn Project, nhãn dự án, kind Project, nút dữ liệu mẫu |
| `package.json`, `package-lock.json` | chỉ khi cần | |
| `docs/log/log_YYYYMMDD_HHMM.md` | tạo | |
| `docs/plan/lifehub_analysis_20261126.md` | chỉ đánh ✅ Phase C3 | |

> Không sửa `src-tauri/**`, `bindings/`, `docs/INDEX.md`, `PROJECT_CONTEXT.md`, CI.

## 4. Các bước
1. [ ] `git merge main` (v0.2.0, `contract.ts` đã re-export toàn bộ kiểu v0.2); `npm ci`; `npm test` xanh.
2. [ ] Kiểu dữ liệu v0.3, wrapper, mock (seed, lưu `localStorage`).
3. [ ] Sidebar (Today, Dự án kéo thả, Đã lưu trữ), routes, `Ctrl+1`.
4. [ ] Trang Project: 4 tab, tách List/Board dùng chung.
5. [ ] Dialog lưu trữ/xoá, trang Đã lưu trữ, Thùng rác kind Project.
6. [ ] Today.
7. [ ] Ghép với panel Task, dialog Inbox, Command Palette, nút dữ liệu mẫu.
8. [ ] Test: hiện tiến độ (có/không `percent`), `mode` trong dialog, Today invalidate khi Done, đổi ngày lúc nửa đêm (hẹn giờ giả), thứ tự Project kéo thả.
9. [ ] Rà a11y bằng `web-design-guidelines`; kiểm tra (mục 5); ghi log; đánh ✅; commit `feat(ui): C3 projects, today`. Hỏi trước khi push.

## 5. Kiểm tra trước khi báo xong
- [ ] `npm run lint`, `npm test` (ghi số test), `npm run build` đều xanh.
- [ ] Chạy mock trong built-in browser và chụp màn hình ở cả Dark và Light: Today, Project Overview (65%), Board của Project, dialog lưu trữ, Đã lưu trữ. Không có lỗi console. Đi trọn bước 6 của spec 5.2 chỉ bằng bàn phím.
- [ ] `git diff main --stat` chỉ có file trong bảng mục 3.

## 6. Báo cáo (dòng đầu đúng mẫu)
`XONG: <việc> | File: <file đã đổi> | Kiểm tra: <đã chạy gì: kết quả> | Khác kế hoạch: <không / gì> | Còn lại: <không / gì>`
