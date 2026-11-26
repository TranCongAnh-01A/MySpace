# 🛠️ KẾ HOẠCH TRIỂN KHAI: Phase C4 — Calendar + nhắc nhở (v0.4)

> **Ngày:** 2026-11-26 21:00 · **Phiên chính:** Claude Opus 5.5 · **Triển khai bằng:** phiên phụ C4 (mới), Sonnet, effort medium
> **Nhánh git:** worktree mới tách từ `main` (v0.3.0) · **Bật:** skill (kho) `vercel-react-best-practices`, `vercel-composition-patterns`, `typescript-patterns`, `web-design-guidelines`
> Người triển khai làm đúng file này. Chỗ nào không làm được hoặc phải làm khác: ghi vào báo cáo, không tự đổi hướng.
> Đọc trước: [phân tích Phase C4](./lifehub_analysis_20261126.md), **hợp đồng v0.4 ở mục 2.1 và quy tắc 2.2 của [kế hoạch B4](./lifehub_B4_impl_20261126.md)**, spec mục 3.5, 5.2 (bước 4–5).

## 1. Mục tiêu
- **Xong khi:**
  - `VITE_IPC_MOCK=1 npm run dev`:
    - Calendar có 4 chế độ xem: ngày, tuần, tháng và danh sách.
    - Tạo, sửa, xoá Event (cả ngày hoặc có giờ).
    - Deadline hiện **khác** Event, bằng cả biểu tượng lẫn chữ, không chỉ khác màu.
    - Kéo Event để đổi giờ, kéo mép để đổi độ dài, kéo deadline để đổi hạn của Task.
    - Kéo Task từ danh sách "Chưa xếp lịch" vào lịch thì tạo time block.
    - Đặt và xoá nhắc nhở cho Task và Event.
    - Có dialog "nhắc nhở bị lỡ".
    - Today có widget Lịch trình và thẻ "n sự kiện".
  - Đi trọn spec 5.2 bước 4–5 bằng mock: kéo Task vào sáng thứ Năm tạo block 2 giờ, đặt nhắc nhở, giả lập `navigate` thì mở đúng Task.
  - `npm run lint`, `npm test`, `npm run build` đều xanh.
- **Không làm:** sự kiện lặp, `.ics`, chế độ xem năm, nhiều lịch. Không làm Notes (C5). Không sửa `src-tauri/**`, `bindings/`.

## 2. Quyết định đã chốt
- **Kiểu dữ liệu tạm v0.4:**
  - Đặt trong khối `// v0.4 tạm — thay bằng bindings khi merge` ở cuối `contract.ts`.
  - `TaskDetail` và `TodayView` có thêm trường: **xoá** dòng re-export cũ của hai kiểu này và định nghĩa lại chúng trong khối v0.4.
  - Không tự thêm trường nào ngoài hợp đồng.
- **Thư viện:** `@fullcalendar/react`, `@fullcalendar/core`, `@fullcalendar/daygrid`, `@fullcalendar/timegrid`, `@fullcalendar/interaction`, `@fullcalendar/list`, `@fullcalendar/luxon3` + `luxon`.
  - Toàn bộ là bản MIT. **Không** dùng plugin premium nào; kiểm tra license trong `package.json` của từng gói.
  - Luxon dùng để FullCalendar hiển thị theo `timezone` trong Settings (múi giờ này có thể khác múi giờ của máy).
- **Mock:**
  - Đủ các command v0.4, theo quy tắc B4 mục 2.2: khoảng ngày, deadline, time block, `trigger_at`, `Dismissed` khi Done, `Missed`.
  - Không có thông báo thật. Thêm vào `window.__lifehubMock` hai hàm `fireReminder(id)` và `emitNavigate(route)` để thử bằng tay và dùng trong test.
- **Query key:** `['calendar', from, to]`, `['reminders', source, id]`, `['reminders', 'missed']`.
  - `entity-changed` loại `event`, `task` hoặc `reminder` thì invalidate `['calendar']`, `['today']`, `['reminders']`.
  - Kéo thả dùng optimistic update; lỗi thì rollback và hiện toast.
- **Sidebar:** thêm **Calendar** (`Ctrl+4`). Thứ tự: Today, Inbox, Tasks, Calendar, rồi Dự án, Lĩnh vực.
- **Route:** `/calendar?view=day|week|month|list&date=YYYY-MM-DD&event=<id>`. Nếu có `event` thì mở panel của Event đó.
- **Màn Calendar** (`src/modules/calendar/`):
  - **Cấu hình FullCalendar:**
    - `timeZone` = Settings (qua luxon), `firstDay` theo `weekStart`, `locale` vi/en.
    - `nowIndicator`; giờ hiển thị từ 06:00 (cuộn được cả 24 giờ); `slotDuration` 30 phút.
    - Màu lấy từ token (biến CSS) cho cả Dark và Light.
  - **Nạp dữ liệu:** khi `datesSet` đổi, gọi `calendarRange`. `end` của FullCalendar là exclusive, nên phải trừ 1 ngày trước khi gửi `to`.
  - **Event:** màu theo lịch; time block có biểu tượng liên kết Task.
  - **Deadline:**
    - Hiện dạng "⚑ Hạn: <tiêu đề>", viền nét đứt, màu `--warning`. Task `Done` thì gạch ngang.
    - `due_date` hiện ở hàng cả ngày; `due_at` hiện thành khối 30 phút tại giờ đó.
    - Không kéo dãn được (`durationEditable: false`).
  - **Thao tác:**
    - Chọn một khoảng trên lịch thì mở dialog tạo Event, điền sẵn thời gian.
    - Bấm vào Event thì mở panel bên phải: sửa tiêu đề, mô tả, cả ngày/có giờ, thời gian, nhắc nhở, xoá. Time block có link mở Task.
    - Bấm vào deadline thì mở panel Task của C2.
    - Kéo hoặc dãn Event: gọi `eventUpdate` kèm `baseVersion`. Event cả ngày chuyển `endDate` từ exclusive về inclusive.
    - Kéo deadline:
      - Thả vào hàng cả ngày → `taskUpdate` với `dueDate` (và `dueAt: null`).
      - Thả vào khung giờ → `dueAt` (và `dueDate: null`).
      - Không cho thả deadline vào lịch của ngày khác theo kiểu tạo mới.
  - **Danh sách "Chưa xếp lịch":**
    - Cột trái thu gọn được, gồm các Task chưa `Done` và chưa có time block trong khoảng đang xem: những Task có hạn trong khoảng đó, cùng những Task không có hạn.
    - Kéo vào lịch dùng `Draggable` của plugin interaction, gọi `taskScheduleBlock`. Độ dài = `estimatedMinutes`, không có thì 60 phút.
    - Có thêm nút "Xếp lịch…" (dialog chọn ngày giờ) cho người chỉ dùng bàn phím.
  - **Bàn phím và a11y:**
    - Chế độ "Danh sách" (`listWeek`) đọc được bằng trình đọc màn hình.
    - Nút "Tạo sự kiện" (phím `N` khi đang ở Calendar).
    - Phím `T` về hôm nay; `←`/`→` sang kỳ trước/sau.
    - Mọi thao tác kéo thả đều có cách làm tương đương trong panel.
- **Nhắc nhở** (`src/modules/reminders/`): component `ReminderEditor` dùng chung trong panel Task (C2) và panel Event.
  - Danh sách reminder hiện kèm trạng thái.
  - Thêm reminder: các mức có sẵn "Đúng giờ, 5, 10, 15, 30 phút, 1 giờ, 1 ngày trước", mặc định lấy `defaultReminderMinutes`; hoặc chọn "Giờ cụ thể…".
  - Nguồn không có thời điểm gốc thì ẩn các mức offset và ghi "Đặt hạn để dùng nhắc trước".
  - Xoá reminder.
- **Nhắc nhở bị lỡ:**
  - Khi app khởi động và khi có `entity-changed` loại `reminder`, gọi `reminderMissedList`.
  - Có mục bị lỡ thì hiện dialog "Bạn đã lỡ N nhắc nhở": danh sách gồm tiêu đề và thời điểm gốc, nút Mở (đi tới bản ghi), nút Bỏ qua từng mục, nút Bỏ qua tất cả.
  - Bấm "Để sau" thì đóng dialog và hiện huy hiệu trên Today, không tự hiện lại cho đến lần khởi động sau.
- **Event từ core:**
  - `navigate`: gọi `router.navigate(route)`.
  - `reminder-fired`: cửa sổ đang có focus thì hiện thêm toast trong app; không có focus thì thôi, vì Windows đã hiện thông báo.
- **Today:** thêm thẻ "n sự kiện" và widget "Lịch trình" dạng dòng thời gian theo `schedule`. Bấm vào một mục thì mở Calendar ở đúng Event.
- i18n đủ vi/en. Mỗi màn hình có đủ loading, empty, error state.

## 3. File được sửa
| File | Việc | Ghi chú |
|---|---|---|
| `package.json`, `package-lock.json` | sửa | các gói FullCalendar, luxon |
| `src/lib/ipc/{contract.ts,commands.ts,mock.ts,events.ts}` | sửa | |
| `src/lib/{i18n,format,tz}/**` | sửa | |
| `src/app/**` | sửa | sidebar, route, `Ctrl+4`, dialog nhắc nhở bị lỡ, xử lý `navigate` |
| `src/styles/**` | sửa | theme cho FullCalendar |
| `src/modules/{calendar,reminders}/**` | tạo | có test |
| `src/modules/{tasks,today}/**` | sửa | `ReminderEditor` trong panel Task; widget Lịch trình |
| `docs/log/log_YYYYMMDD_HHMM.md` | tạo | |
| `docs/plan/lifehub_analysis_20261126.md` | chỉ đánh ✅ Phase C4 | |

> Không sửa `src-tauri/**`, `bindings/`, `docs/INDEX.md`, `PROJECT_CONTEXT.md`, CI.

## 4. Các bước
1. [ ] Worktree đã tách từ `main` (v0.3.0); chạy `npm ci`; `npm test` xanh.
2. [ ] Kiểu dữ liệu v0.4, wrapper command, mock (cùng các hàm giả lập).
3. [ ] Màn Calendar: cấu hình, nạp dữ liệu, cách hiện Event và deadline, theme.
4. [ ] Tạo/sửa Event, panel; kéo thả Event và deadline (logic đổi kết quả FullCalendar sang patch tách thành hàm thuần, có test).
5. [ ] Danh sách "Chưa xếp lịch" + time block + "Xếp lịch…".
6. [ ] `ReminderEditor`, dialog nhắc nhở bị lỡ, xử lý `navigate` và `reminder-fired`.
7. [ ] Today: thẻ sự kiện, widget Lịch trình.
8. [ ] Test: đổi patch khi kéo thả (Event có giờ, Event cả ngày, deadline ngày ↔ giờ), `to` inclusive, ẩn offset khi không có thời điểm gốc, dialog bị lỡ, `navigate`.
9. [ ] Rà a11y bằng `web-design-guidelines`; kiểm tra (mục 5); ghi log; đánh ✅; commit `feat(ui): C4 calendar, reminders`. Hỏi người dùng trước khi push.

## 5. Kiểm tra trước khi báo xong
- [ ] `npm run lint`, `npm test` (ghi số test), `npm run build` đều xanh.
- [ ] Chạy mock trong built-in browser, chụp Calendar tuần và tháng (Dark và Light), panel Event, dialog nhắc nhở bị lỡ, Today có Lịch trình. Không có lỗi console.
- [ ] `git diff main --stat` chỉ có file trong bảng mục 3.

## 6. Báo cáo (dòng đầu đúng mẫu)
`XONG: <việc> | File: <file đã đổi> | Kiểm tra: <đã chạy gì: kết quả> | Khác kế hoạch: <không / gì> | Còn lại: <không / gì>`
