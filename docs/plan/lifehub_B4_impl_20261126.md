# 🛠️ KẾ HOẠCH TRIỂN KHAI: Phase B4 — Calendar + Reminders (v0.4)

> **Ngày:** 2026-11-26 21:00 · **Phiên chính:** Claude Opus 5.5 · **Triển khai bằng:** phiên phụ B4 (mới), Sonnet, effort medium
> **Nhánh git:** worktree mới tách từ `main` (v0.3.0) · **Bật:** plugin `mattpocock-skills` (tdd, diagnosing-bugs), skill (kho) `database-migrations`
> Người triển khai làm đúng file này. Chỗ nào không làm được hoặc phải làm khác: ghi vào báo cáo, không tự đổi hướng.
> Đọc trước: [phân tích Phase B4](./lifehub_analysis_20261126.md), [schema](./lifehub_schema_20261126.md) (bảng `calendars`, `events`, `reminders` và mục 3), mục 2 của [B2](./lifehub_B2_impl_20261126.md) và [B3](./lifehub_B3_impl_20261126.md) (quy ước, "hôm nay" theo múi giờ), spec mục 3.5, 4.4, 7.5.

## 1. Mục tiêu
- **Xong khi:**
  - `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` đều xanh.
  - Có test:
    - `calendar_range` trả cả Event lẫn deadline trong khoảng ngày, theo múi giờ Settings. Event cả ngày dùng ngày cuối inclusive. Không trả Task đã xoá hoặc đã lưu trữ.
    - `task_schedule_block` tạo Event có `taskId`.
    - Xoá mềm Task thì xoá mềm Event time block và Reminder `Pending`; khôi phục Task thì hai thứ này quay lại.
    - Đổi hạn Task hoặc giờ Event thì `trigger_at` được tính lại.
    - Task chuyển sang `Done` thì Reminder `Pending` thành `Dismissed`.
    - Scheduler (đồng hồ giả):
      - Bắn đúng giờ và không bắn trùng.
      - Lần nhắc đã trễ quá 5 phút thì thành `Missed`, không bắn.
      - Đang tạm dừng thông báo thì lần nhắc đến hạn thành `Missed`.
  - Trên **bản `.exe` đã cài**: app đang ở khay vẫn hiện thông báo Windows đúng giờ; bấm vào thông báo thì mở cửa sổ ở đúng Task hoặc Event. Bước này cần người dùng thử, ghi kết quả vào báo cáo.
- **Không làm:** sự kiện lặp, `.ics`, nhiều lịch ([Nice]: chỉ dùng lịch mặc định, có sẵn `calendar_list`), Notes (B5). Không sửa gì ngoài `src-tauri/**` và `bindings/`.

## 2. Quyết định đã chốt

### 2.1. Hợp đồng v0.4 (phiên C4 dựa vào đúng mục này)
Giữ quy ước B2/B3 (patch ba trạng thái, `baseVersion`). `CalendarItem` dùng serde `#[serde(tag = "kind")]` với **struct variant**, để JSON có dạng `{ kind: 'Event', event: {...} }`.

```ts
type Calendar = { id: string; name: string; color?: string; isDefault: boolean };
type Event = {
  id: string; calendarId: string; taskId?: string; title: string; description: string; isAllDay: boolean;
  startAt?: string; endAt?: string; startDate?: string; endDate?: string;   // endDate inclusive
  version: number; createdAt: string; updatedAt: string;
};
type EventCreate = {
  calendarId?: string;          // thiếu = lịch mặc định
  title: string; description?: string; isAllDay: boolean;
  startAt?: string; endAt?: string; startDate?: string; endDate?: string; taskId?: string;
};
type EventPatch = {
  title?: string; description?: string; calendarId?: string; isAllDay?: boolean;
  startAt?: string | null; endAt?: string | null; startDate?: string | null; endDate?: string | null;
};                              // trạng thái cuối cùng phải hợp lệ (schema CHECK); đổi isAllDay thì gửi đủ bộ trường mới và null cho bộ cũ
type CalendarItem = { kind: 'Event'; event: Event } | { kind: 'Deadline'; task: Task };
type ReminderStatus = 'Pending' | 'Sent' | 'Dismissed' | 'Missed';
type Reminder = {
  id: string; taskId?: string; eventId?: string; triggerAt: string; offsetMinutes?: number;
  status: ReminderStatus; sentAt?: string;
};
type ReminderSet = { taskId?: string; eventId?: string; offsetMinutes?: number; triggerAt?: string };
// đúng một trong taskId/eventId; đúng một trong offsetMinutes/triggerAt
type MissedReminder = { reminder: Reminder; title: string; dueLabelAt: string };   // dueLabelAt = thời điểm gốc (hạn hoặc giờ bắt đầu), UTC
type TaskDetail = { task: Task; checklist: ChecklistItem[]; noteIds: string[]; reminders: Reminder[] };   // THÊM reminders
type TodayView = { /* giữ nguyên các trường v0.3 */ schedule: CalendarItem[] };                         // THÊM schedule
type ReminderFired = { reminderId: string; taskId?: string; eventId?: string };      // payload event `reminder-fired`
type Navigate = { route: string };                                                   // payload event `navigate`
```

| Command | Tham số `invoke` | Trả về | Ghi chú / lỗi |
|---|---|---|---|
| `calendar_list` | — | `Calendar[]` | MVP chỉ có lịch mặc định |
| `calendar_range` | `{ from, to }` (ngày `YYYY-MM-DD`, cả hai đầu inclusive) | `CalendarItem[]` | Event chồng lên khoảng, cùng deadline nằm trong khoảng; sắp theo thời điểm bắt đầu |
| `event_create` | `{ input: EventCreate }` | `Event` | `VALIDATION` |
| `event_update` | `{ id, patch: EventPatch, baseVersion }` | `Event` | `CONFLICT` khi lệch version |
| `event_delete` | `{ id }` | `void` | xoá mềm; xoá mềm luôn reminder `Pending` của Event (Trash chưa có kind Event, nên mục này không hiện trong Thùng rác) |
| `task_schedule_block` | `{ taskId, startAt, endAt, calendarId? }` | `Event` | title = title của Task |
| `reminder_set` | `{ input: ReminderSet }` | `Reminder` | `VALIDATION` khi dùng offset mà nguồn không có thời điểm gốc |
| `reminder_list` | `{ taskId?, eventId? }` | `Reminder[]` | mọi trạng thái, sắp theo `triggerAt` |
| `reminder_delete` | `{ id }` | `void` | xoá cứng |
| `reminder_missed_list` | — | `MissedReminder[]` | trạng thái `Missed`, mới nhất trước |
| `reminder_dismiss` / `reminder_dismiss_all` | `{ id }` / — | `void` | `Missed` → `Dismissed` |

Event `entity-changed`: thêm `'event'` và `'reminder'`. Event riêng: `reminder-fired` (`ReminderFired`) và `navigate` (`Navigate`).
- `route` có dạng `/tasks/<id>` hoặc `/calendar?date=YYYY-MM-DD&event=<id>`.
- Sau khi phát `navigate`, core tự hiện cửa sổ chính và đưa nó lên trước.

### 2.2. Quy tắc nghiệp vụ
- **Khoảng ngày:** đổi `from`/`to` (ngày địa phương theo múi giờ Settings) sang khoảng UTC `[from 00:00, to+1 00:00)`.
  - Event có giờ: lấy nếu `start_at < cuối khoảng` **và** `end_at > đầu khoảng`.
  - Event cả ngày: lấy nếu `start_date <= to` **và** `end_date >= from`.
  - Deadline: lấy Task chưa xoá, chưa lưu trữ, không thuộc Project đã lưu trữ, có `due_date` trong `[from, to]` hoặc `due_at` trong khoảng UTC. **Gồm cả Task `Done`** (UI hiện gạch ngang).
- **Validate Event:**
  - Tiêu đề không rỗng, tối đa 500 ký tự.
  - Event có giờ: `end_at > start_at`, dài tối đa 14 ngày.
  - Event cả ngày: `end_date >= start_date`, dài tối đa 366 ngày.
  - `taskId` phải là Task tồn tại, chưa xoá.
- **Time block:** là Event có `task_id`. Đổi tiêu đề Task không đổi tiêu đề Event.
  - `task_delete` (TODO để sẵn từ B2): trong cùng transaction và dùng cùng mốc `now`, xoá mềm các Event có `task_id` này cùng reminder `Pending` của Task và của các Event đó.
  - `trash_restore` Task: khôi phục những bản ghi có `deleted_at` bằng đúng mốc đó.
  - Purge Task: xoá cứng Event của Task trước, theo schema mục 3.
- **Thời điểm gốc để tính offset:**
  - Task có `due_at`: dùng `due_at`. Task chỉ có `due_date`: 09:00 giờ địa phương của ngày đó.
  - Event có giờ: `start_at`. Event cả ngày: 09:00 giờ địa phương của `start_date`.
  - Không có thời điểm gốc mà dùng `offsetMinutes` → `VALIDATION`. `triggerAt` cố định thì không cần thời điểm gốc.
  - `trigger_at = gốc − offset`.
- **Tính lại `trigger_at`:** khi `task_update` đổi `dueDate`/`dueAt`, hoặc `event_update` đổi giờ bắt đầu, thì tính lại mọi reminder `Pending` có `offset_minutes`. Mất thời điểm gốc (xoá hạn) thì xoá cứng các reminder offset đó.
- **Đổi trạng thái:**
  - Task chuyển sang `Done`: reminder `Pending` của Task → `Dismissed`. Mở lại Task không khôi phục chúng.
  - Task lặp sinh lần tiếp theo: **chép** các reminder dạng offset sang Task mới.
- **Scheduler** (`src-tauri/src/reminders/`):
  - Một tác vụ `tauri::async_runtime`. Vòng lặp: lấy reminder `Pending` gần nhất (bỏ qua bản ghi đã xoá và nguồn đã xoá), rồi ngủ đến `min(trigger_at, 60 giây)`. Có `tokio::sync::Notify` để đánh thức khi dữ liệu reminder, Task hoặc Event thay đổi, hoặc khi đổi Settings.
  - Khi đến hạn: trong **một transaction**, `UPDATE reminders SET status='Sent', sent_at=? WHERE id=? AND status='Pending'`. Chỉ khi cập nhật đúng 1 dòng mới gửi thông báo, nên không thể gửi trùng.
  - Trễ hơn 5 phút so với `trigger_at` (app vừa mở, máy vừa thức dậy sau khi ngủ, hoặc đang bị khoá) thì đặt `Missed` và không gửi.
  - `notificationsEnabled = false` hoặc đang tạm dừng: đến hạn thì đặt `Missed`.
  - Lúc khởi động: chạy một vòng ngay, để các reminder quá hạn thành `Missed` trước khi UI gọi `reminder_missed_list`.
  - Logic thuần (chọn lần nhắc kế tiếp, quyết định gửi hay đánh `Missed`) tách thành hàm nhận `Clock`, để test được với đồng hồ giả.
- **Thông báo Windows:** dùng crate `tauri-winrt-notification` trực tiếp, vì plugin notification của Tauri không có callback khi bấm vào thông báo trên desktop.
  - `on_activated` thì phát `navigate`, show + focus cửa sổ `main`.
  - `app_id`: bản release dùng identifier `com.lifehub.app`; bản debug dùng `Toast::POWERSHELL_APP_ID`.
  - Nội dung:
    - Tiêu đề = tiêu đề Task hoặc Event.
    - Dòng 2 là "Đến hạn lúc HH:mm" hoặc "Bắt đầu lúc HH:mm", theo múi giờ và ngôn ngữ trong Settings.
  - Phát `reminder-fired` tới frontend.
  - Bản cài mà thông báo không hiện hoặc bấm không mở được app thì ghi rõ vào báo cáo. Không tự đổi sang cách khác.
- **Khay hệ thống** (theo spec 4.4): thêm "Việc hôm nay" (submenu gồm 5 Task đầu của `dashboard_today.today`, bấm vào thì `navigate` tới Task, làm mới khi có `entity-changed` loại `task`) và "Tạm dừng thông báo" (checkbox, giữ trong bộ nhớ, mất khi khởi động lại).
- **`dashboard_today.schedule`:** các Event (gồm time block) chồng lên hôm nay, sắp theo giờ bắt đầu. Event cả ngày xếp trước. Không gồm deadline, vì deadline đã có trong `today`.
- **`calendars`:** lịch mặc định đã được seed sẵn trong migration `001`. `EventCreate` thiếu `calendarId` thì dùng lịch mặc định.

## 3. File được sửa
| File | Việc | Ghi chú |
|---|---|---|
| `src-tauri/Cargo.toml`, `Cargo.lock` | sửa | `tauri-winrt-notification`, `tokio` (feature `sync`, `time`) nếu cần |
| `src-tauri/src/modules/calendar/**` | tạo | calendars, events, range, time block |
| `src-tauri/src/reminders/**` | tạo | domain, repository, use case, scheduler, notifier (trait để test) |
| `src-tauri/src/modules/{tasks,trash,dashboard}/**` | sửa | `reminders` trong `TaskDetail`, xoá/khôi phục kèm Event, `schedule` |
| `src-tauri/src/system/{tray.rs,windows.rs}` | sửa | menu khay, `navigate` |
| `src-tauri/src/lib.rs`, `src-tauri/src/modules/mod.rs` | sửa | |
| `src-tauri/capabilities/*` | chỉ khi cần | ghi lý do vào báo cáo |
| `src-tauri/migrations/002_*.sql` | chỉ khi thật cần | ghi lý do vào báo cáo |
| `src/lib/ipc/bindings/*` | sinh tự động | |
| `docs/explain/lifehub_core-b4_explain_YYYYMMDD.md`, `docs/log/log_YYYYMMDD_HHMM.md` | tạo | |
| `docs/plan/lifehub_analysis_20261126.md` | chỉ đánh ✅ Phase B4 | |

> Không sửa `docs/INDEX.md`, `PROJECT_CONTEXT.md`, `src/**` ngoài `bindings/`, `package.json`, CI.

## 4. Các bước
1. [ ] Worktree đã tách từ `main` (v0.3.0); build lần đầu chạy nền; `cargo test` xanh.
2. [ ] Calendar: domain, repository, `calendar_list`, `calendar_range`, CRUD Event, `task_schedule_block`.
3. [ ] Sửa Task: xoá/khôi phục/purge kèm Event, giữ đúng mốc thời gian.
4. [ ] Reminders: domain (tính `trigger_at`), repository, use case (set/list/delete/missed/dismiss), tính lại khi hạn đổi, `Dismissed` khi Done, chép sang lần lặp tiếp theo, `TaskDetail.reminders`.
5. [ ] Scheduler + notifier (trait `Notifier`, có bản giả để test), xử lý `Missed`, `Notify` để đánh thức.
6. [ ] Menu khay, event `navigate`, `dashboard_today.schedule`.
7. [ ] Thử trong `tauri dev`: tạo reminder sau 1 phút → thông báo hiện (bản dev dùng AUMID của PowerShell).
8. [ ] Build `.exe`, nhờ người dùng cài và thử: reminder khi app đang ở khay, bấm vào thông báo; tắt app rồi mở lại sau giờ nhắc → reminder thành `Missed`.
9. [ ] Kiểm tra (mục 5), viết explain + log, đánh ✅, commit `feat(core): B4 calendar, events, reminders, notifications`. Hỏi người dùng trước khi push.

## 5. Kiểm tra trước khi báo xong
- [ ] `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` xanh (ghi số test).
- [ ] `npm run lint`, `npm test` vẫn xanh.
- [ ] Ghi kết quả thử trên bản cài (bước 8), hoặc ghi rõ "chưa thử được" kèm lý do.
- [ ] `git diff main --stat` chỉ có file trong bảng mục 3.

## 6. Báo cáo (dòng đầu đúng mẫu)
`XONG: <việc> | File: <file đã đổi> | Kiểm tra: <đã chạy gì: kết quả> | Khác kế hoạch: <không / gì> | Còn lại: <không / gì>`
