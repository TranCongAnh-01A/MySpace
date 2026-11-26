# 📖 TÀI LIỆU GIẢI THÍCH: Core B4 — Calendar, Reminders, thông báo Windows (v0.4)

# 1. Tổng quan (Overview)
- **Mục đích cốt lõi:** thêm Event và lịch (`calendar_range` trả Event lẫn deadline), time block của Task, Reminder (offset hoặc giờ cố định), scheduler nền và thông báo Windows bấm vào được.
- **Vai trò trong hệ thống:** `modules/calendar` (Event, khoảng ngày) và `reminders/` (domain, repository, use case, scheduler, notifier) là hai module mới. `tasks`, `trash`/`tasks::restore`, `dashboard` và `system/{tray,windows}` được mở rộng. Không có migration mới: bảng `calendars`, `events`, `reminders` đã có từ `001`.

## 2. Phân tích Chi tiết

### 📌 `modules/calendar`
- **Kiểu hợp đồng v0.4:** `Calendar`, `Event`, `EventCreate`, `EventPatch` (patch ba trạng thái cho giờ/ngày), `CalendarItem` (`#[serde(tag = "kind")]`, struct variant → `{ kind: 'Event', event }` / `{ kind: 'Deadline', task }`).
- **Validate** (`domain::validate_shape`, chạy trên trạng thái cuối nên patch đổi `isAllDay` phải gửi đủ bộ trường mới và `null` cho bộ cũ): tiêu đề 1–500 ký tự; có giờ thì `end > start`, tối đa 14 ngày; cả ngày thì `end_date >= start_date`, tối đa 366 ngày (tính cả hai đầu); `taskId` phải là Task chưa xoá.
- **`range`:** đổi `[from, to]` (ngày địa phương, inclusive) sang khoảng UTC `[0h from, 0h to+1)` bằng `TimeCtx`. Event có giờ lấy khi `start < cuối && end > đầu`; Event cả ngày khi `start_date <= to && end_date >= from`; Event time block của Task đã xoá bị loại. Deadline: Task chưa xoá/lưu trữ, không thuộc Project đã lưu trữ, có `due_date` trong khoảng hoặc `due_at` trong khoảng UTC, **gồm cả Task Done**. Sắp theo (thời điểm bắt đầu, hạng: cả ngày 0 < có giờ 1 < deadline 2).
- **`today_schedule`:** chỉ Event của hôm nay, cả ngày xếp trước; gắn vào `TodayView.schedule`.
- **Time block** = Event có `task_id`, tiêu đề lấy từ Task lúc tạo (đổi tên Task sau đó không đổi Event).
- **Event bị xoá mềm không hiện ở Thùng rác** (`TrashKind` chưa có Event, đúng hợp đồng).

### 📌 `reminders`
- **domain:** `Reminder`, `ReminderSet`, `MissedReminder`, `ReminderFired`, `Navigate`. `task_anchor` / `event_anchor` cho mốc gốc (`due_at`/`start_at`, hoặc 09:00 địa phương của ngày), `trigger_from_offset`, và hàm thuần `decide(trigger_at, now, paused)` → `Wait | Fire | Missed` (trễ quá 5 phút hoặc đang tạm dừng/tắt thông báo → `Missed`).
- **repository / application:** làm việc trực tiếp trên `Connection` (như Trash), nên chạy chung transaction với use case gọi nó.
  - `reminder_set`: đúng một trong `taskId`/`eventId`, đúng một trong `offsetMinutes`/`triggerAt`; offset mà nguồn không có mốc gốc → `VALIDATION`.
  - Tính lại: `recompute_for_task/event` khi hạn/giờ bắt đầu đổi (mất mốc gốc thì xoá cứng reminder offset). Task sang `Done`: `Pending` → `Dismissed`. Task lặp sinh lần tiếp: chép reminder dạng offset (mọi trạng thái, mỗi offset một bản `Pending`).
  - Xoá mềm/khôi phục cùng Task: dùng đúng mốc `deleted_at` của Task nên chỉ những bản bị xoá cùng lúc mới quay lại.
- **scheduler (`process`)** là hàm thuần nhận `&Connection`, `&dyn Clock`: lấy reminder `Pending` gần nhất (bỏ nguồn đã xoá), `Missed` nếu trễ > 5 phút hoặc đang tạm dừng/tắt, còn lại đặt `Sent` bằng `UPDATE ... WHERE status='Pending'` (chỉ khi đúng 1 dòng thì mới đưa vào danh sách cần gửi → không thể gửi trùng). Thông báo gửi **sau khi commit**.
- **Vòng lặp nền** (`start`): chạy một vòng đồng bộ ngay lúc khởi động (reminder quá hạn thành `Missed` trước khi UI gọi `reminder_missed_list`), rồi `tauri::async_runtime::spawn` ngủ `min(trigger_at, 60 giây)` bằng `tokio::time::timeout` trên `Notify`. `emit_entity_changed` gọi `SchedulerHandle::wake()` nên mọi thay đổi dữ liệu/Settings đều đánh thức scheduler.
- **notifier:** trait `Notifier` (bản giả để test) và `WinNotifier` dùng `tauri-winrt-notification` trực tiếp. `on_activated` → `system::windows::navigate` (phát `navigate`, hiện + focus cửa sổ chính). `app_id`: bản debug dùng AUMID của PowerShell, bản release dùng `identifier` (`com.lifehub.app`). Nội dung: tiêu đề = tiêu đề Task/Event, dòng 2 "Đến hạn lúc HH:mm" / "Bắt đầu lúc HH:mm" (hoặc "Due at" / "Starts at"), theo múi giờ và ngôn ngữ Settings.
- **Route:** `/tasks/<id>` hoặc `/calendar?date=YYYY-MM-DD&event=<id>`.

### 📌 `tasks` / `system`
- `TaskRepository` thêm 4 hàm reminder (`reminders`, `reminders_recompute`, `reminders_dismiss_pending`, `reminders_copy_offsets`); `TaskDetail.reminders`.
- `soft_delete` xoá mềm Event time block và reminder `Pending` cùng mốc `now` (gỡ TODO của B2). `tasks::infrastructure::restore` đọc `deleted_at` trước rồi khôi phục các bản đúng mốc. Purge đã xoá Event trước Task từ B2 (reminder xoá theo `ON DELETE CASCADE`).
- **Khay:** thêm submenu "Việc hôm nay" (5 Task đầu của `dashboard_today.today`, bấm → `navigate /tasks/<id>`, dựng lại khi `entity-changed` loại `task`) và ô "Tạm dừng thông báo" (trong bộ nhớ, mất khi khởi động lại).

## 3. Lưu ý và phần chưa kiểm
- Chưa thử toast trên bản `.exe` đã cài (cần UI C4 để tạo reminder, hoặc gọi lệnh thủ công). Test tự động chỉ phủ phần logic với đồng hồ giả và notifier giả.
- Đang tạm dừng/tắt thông báo mà reminder đến hạn → `Missed` (đúng kế hoạch), nghĩa là bật lại sau đó không bắn bù.
- `emit_entity_changed` cho `reminder` đôi khi gửi `ids` rỗng (scheduler, dismiss_all, cập nhật hàng loạt); frontend nên invalidate cả loại.
