# 🧭 PHÂN TÍCH KẾ HOẠCH: LifeHub

> Tạo từ kế hoạch: [../spec/lifehub_spec_20261126.md](../spec/lifehub_spec_20261126.md)
> **Ngày phân tích:** 2026-11-26 00:55 · **Model phân tích:** Claude Opus 5.5, effort high
> File có ngày, không ghi đè. Phân tích lại thì tạo bản mới (`_v2`...).
> Tài liệu đi kèm: [Schema SQL MVP](./lifehub_schema_20261126.md) · [Kế hoạch triển khai phiên A](./lifehub_A-khung_impl_20261126.md)

## 1. Tóm tắt ý tưởng
- **Mục tiêu:** LifeHub là ứng dụng desktop Windows (`.exe`), local-first. Nó gom Inbox/Quick Capture, Tasks, Projects, Calendar, Notes và Dashboard vào một nơi, dữ liệu nằm trong một file SQLite của người dùng. Đây là dự án chủ lực cho CV.
- **Người dùng:** một người, một máy Windows 10/11, không có tài khoản.
- **Phạm vi làm:** MVP v1.0, gồm 6 module. Đi kèm các nền tảng: Search FTS5, nhắc nhở bằng thông báo Windows, Backup/Restore, khay hệ thống, phím tắt toàn cục, bộ cài NSIS, Auto Update. Làm lần lượt qua các bản v0.1 → v0.5 → v1.0 (spec mục 11).
- **KHÔNG làm (đợt này):** mọi thứ "Sau v1.0" và "Nâng cao" trong spec (Focus, Habits, Goals, Journal, Analytics, Bookmarks, Files, Knowledge Base, Sync, AI, Mobile). Ngoài ra không làm: sự kiện lặp, subtask nhiều cấp, trạng thái tuỳ chỉnh, Version History, Gantt/Timeline, wireframe riêng (dùng bố cục ASCII trong spec mục 4, phiên UI dựng thẳng màn hình), ký số Authenticode. Mục [Nice] chỉ làm ở tuần đệm.

## 2. Đánh giá kế hoạch
| Điểm | Nhận xét |
|---|---|
| Rõ ràng | Rất tốt. Đã có phạm vi MVP, nhãn Must/Nice, quy tắc nghiệp vụ, ERD, quy tắc dữ liệu, danh sách command IPC, tiêu chí nghiệm thu và rủi ro. Mức này đủ để chia phiên làm song song. |
| Thiếu sót / mơ hồ | (1) Chưa có command cho **Areas**, **Tags**, **Trash**, **Reminders** và **Dashboard**. Đã bổ sung ở mục 3. (2) "Mở lại Task thì trả về trạng thái trước đó" cần thêm cột `previous_status`, đã thêm vào schema. (3) Task vừa có `ProjectId` vừa có `AreaId` thì bị mơ hồ. Đã chốt: Task thuộc Project thì lấy Area theo Project (`area_id` để trống). (4) Purge Trash đụng tới khoá ngoại (Inbox đã chuyển thành Task, time block của Task). Đã chốt quy tắc ở mục 3. (5) Chưa nói `SearchText` của Note do ai tạo. Đã chốt: Rust trích từ `ContentJson`. (6) Spec chưa có trạng thái "nhắc nhở bị lỡ". Đã thêm `Missed`. |
| Rủi ro | (1) **Rust mới với người dùng.** Claude viết code nên tiến độ không phụ thuộc vào việc người dùng học Rust. Nhưng để trả lời phỏng vấn, người dùng cần hiểu code (câu hỏi 3). (2) **Làm song song UI và core** dễ lệch nếu hợp đồng IPC không chặt. Vì vậy hợp đồng được chốt ở mục 3, và UI dùng lớp mock `invoke` khi core chưa xong. (3) Mỗi worktree phải tải `node_modules` và build `target/` riêng: tốn vài GB ổ đĩa, lần build Rust đầu mất vài phút. (4) Thông báo Windows chỉ chạy đúng trên bản đã cài, nên kiểm thử nhắc nhở phải dùng bản build `.exe`. (5) Khối lượng 20 tuần là lớn. Mỗi phase nên làm trong một phiên mới để tránh ngữ cảnh quá dài; docs được cập nhật sau mỗi phase nên phiên mới làm tiếp được. |
| Đề xuất bỏ hoặc hoãn | Hoãn: wireframe 7 màn hình (dựng thẳng bằng code từ spec mục 4 và design token). Tạo GitHub Issues: máy chưa có `gh`, nên dùng ô ✅ trong file này thay cho issue (câu hỏi 4). Ký số: chấp nhận cảnh báo SmartScreen và ghi rõ trong README (ADR-008). |

### Câu hỏi cần người dùng trả lời trước khi làm
1. **Tên và identifier:** giữ `LifeHub` / `com.lifehub.app`? Identifier quyết định thư mục dữ liệu `%LOCALAPPDATA%\com.lifehub.app\` nên cần chốt **trước phiên A**. Repo GitHub hiện tên `MySpace`. Có đổi tên repo không (không bắt buộc)?
2. **Repo private hay public?** Auto Update đọc từ GitHub Releases thì tiện nhất khi repo public. Đề xuất: để private đến khoảng v0.3, rồi chuyển public cho Portfolio.
3. **Bạn muốn tự viết phần nào không** (để học Rust và trả lời phỏng vấn)? Mặc định: Claude viết hết, người dùng đọc lại. Cuối mỗi phase của phiên B có một file giải thích ngắn trong `docs/explain/` về phần Rust vừa làm.
4. **GitHub Issues:** có cài `gh` để tạo issue tự động không? Mặc định: không, theo dõi tiến độ bằng ô ✅ trong file này.

## 3. Kiến trúc & thoả thuận chung
> Chốt ở đây để các phiên làm song song không lệch nhau. Muốn đổi thì nhắn phiên chính, không tự sửa.

- **Tech stack (đã chốt những chỗ spec để ngỏ):**
  - Tauri 2, Rust stable (máy có 1.99, MSVC Build Tools 2019, WebView2), React 19 + TypeScript strict + Vite, npm (máy đã có; không dùng pnpm).
  - Routing: **React Router** (đơn giản hơn TanStack Router). Dữ liệu: **TanStack Query** bọc `invoke`. Trạng thái UI: **Zustand**.
  - Tailwind CSS v4 + shadcn/ui (Radix). Font Inter đóng gói qua `@fontsource-variable/inter`.
  - Kiểu Rust → TS: **ts-rs** (ổn định; wrapper `invoke` viết tay, mỏng). Không dùng tauri-specta vì vẫn đang ở bản RC.
  - DB: rusqlite (`bundled`, có FTS5) + **rusqlite_migration**. Thời điểm có giờ: `TEXT` ISO-8601 UTC, cố định dạng `YYYY-MM-DDTHH:MM:SS.sssZ` (so sánh chuỗi được). Ngày thuần: `TEXT` dạng `YYYY-MM-DD`.
  - ID: UUID v7 (crate `uuid`, feature `v7`), sinh ở Rust. SortKey: crate `fractional_index`.
  - Một kết nối ghi duy nhất, `Mutex<Connection>` trong state của Tauri. Tầng DB đồng bộ, không async (spec rủi ro 1). Scheduler nhắc nhở là một tác vụ tokio.
  - Log: `tracing` + `tracing-appender` (xoay vòng theo ngày, giữ 7 file). Không ghi nội dung Note vào log.
  - Lịch: FullCalendar bản MIT (`daygrid`, `timegrid`, `interaction`). Editor: Tiptap (StarterKit + CodeBlockLowlight). Kéo thả: dnd-kit.
  - Test: `cargo test` với SQLite in-memory; Vitest + Testing Library (mock `invoke`); E2E: WebdriverIO + tauri-driver (phiên D).
- **Cấu trúc database:** xem [lifehub_schema_20261126.md](./lifehub_schema_20261126.md). Tóm tắt các quy ước:
  - Tên bảng và cột dùng `snake_case` (`tasks`, `inbox_items`, `due_at`...).
  - Migration `001` là toàn bộ schema MVP, do phiên A tạo. **Trước khi phát hành v0.1** được sửa thẳng `001`. **Sau v0.1**, migration đã merge vào `main` là bất biến; muốn thay đổi thì thêm `002`, `003`... (chỉ phiên B được thêm).
  - Quy tắc nghiệp vụ đã chốt:
    - Task thuộc Project thì `area_id` để NULL.
    - Xoá mềm Task thì xoá mềm luôn các Event time block và Reminder `Pending` của Task đó, trong cùng transaction. Khôi phục thì khôi phục cả hai.
    - Purge một Task sẽ xoá cứng cả `inbox_items` trỏ tới Task đó.
    - Lưu trữ hoặc xoá Project nhận tham số `mode`: `WithChildren` hoặc `Detach`. Không xoá dây chuyền.
- **Định dạng IPC chung:**
  - JSON qua IPC dùng `camelCase` (`#[serde(rename_all = "camelCase")]`). Enum có dạng chuỗi PascalCase (`"InProgress"`).
  - Mọi command trả về `Result<T, AppError>`. `AppError` có dạng `{ code, message, details? }`, với `code` ∈ `NOT_FOUND`, `VALIDATION`, `CONFLICT`, `DB`, `IO`, `INTERNAL`. `message` viết tiếng Việt, hiển thị được cho người dùng.
  - Kiểu TS do ts-rs sinh ra `src/lib/ipc/bindings/` (chỉ phiên B ghi thư mục này). Wrapper gọi command nằm ở `src/lib/ipc/commands.ts`, mock nằm ở `src/lib/ipc/mock.ts` (phiên C sở hữu).
  - **Event từ core gửi lên:**
    - `entity-changed { entity: 'inbox'|'task'|'project'|'event'|'note'|'area'|'tag'|'settings', ids: string[] }`: frontend invalidate query theo `entity`.
    - `reminder-fired { reminderId, taskId?, eventId? }`
    - `navigate { route: string }`: phát khi bấm thông báo hoặc menu khay.
- **Kiểu dữ liệu chính (DTO, viết theo kiểu TS cho gọn):**
  - `Area { id, name, color?, sortKey }`
  - `Tag { id, name, color? }`
  - `Project { id, areaId?, name, description, status: 'Planned'|'Active'|'OnHold'|'Completed', color?, icon?, startDate?, targetDate?, archivedAt?, createdAt, updatedAt }`
  - `ProjectProgress { projectId, name, color?, done, total, percent: number|null }`. `percent` là null khi `total = 0`, UI hiện "Chưa có công việc".
  - `Task { id, projectId?, areaId?, title, description, status: 'Todo'|'InProgress'|'Review'|'Done', priority: 'Urgent'|'High'|'Medium'|'Low', startDate?, dueDate?, dueAt?, estimatedMinutes?, completedAt?, sortKey, recurrence?: Recurrence, tagIds: string[], checklistDone: number, checklistTotal: number, archivedAt?, deletedAt?, version, createdAt, updatedAt }`
  - `TaskDetail = Task & { checklist: ChecklistItem[], noteIds: string[], reminders: Reminder[] }`
  - `Recurrence { frequency: 'Daily'|'Weekly'|'Monthly', interval: number, byWeekday?: ('Mo'|'Tu'|'We'|'Th'|'Fr'|'Sa'|'Su')[] }`
  - `ChecklistItem { id, taskId, content, isDone, sortKey }`
  - `InboxItem { id, content, status: 'Open'|'Processed', convertedTaskId?, convertedNoteId?, processedAt?, createdAt }`
  - `Event { id, calendarId, taskId?, title, description, isAllDay, startAt?, endAt?, startDate?, endDate? }`. Với sự kiện cả ngày, `endDate` **tính cả ngày cuối**; UI tự đổi sang dạng end-exclusive của FullCalendar.
  - `CalendarItem = { kind: 'Event', event: Event } | { kind: 'Deadline', task: Task }`
  - `Note { id, projectId?, parentNoteId?, title, contentJson, version, taskIds: string[], tagIds: string[], createdAt, updatedAt }`
  - `NoteSummary { id, title, projectId?, updatedAt }`
  - `Reminder { id, taskId?, eventId?, triggerAt, offsetMinutes?, status: 'Pending'|'Sent'|'Dismissed'|'Missed' }`
  - `SearchHit { kind: 'Task'|'Project'|'Note'|'Inbox', id, title, snippet }`
  - `AppSettings { theme: 'Dark'|'Light'|'System', language: 'vi'|'en', timezone, dateFormat, weekStart: 'Mon'|'Sun', quickCaptureShortcut, launchAtStartup, startHidden, closeToTray, notificationsEnabled, defaultReminderMinutes }`
  - `Backup { fileName, reason: 'Manual'|'Daily'|'PreMigration'|'PreRestore', sizeBytes, createdAt }`
  - `TodayView { today: Task[], overdue: Task[], upcoming: Task[], schedule: CalendarItem[], activeProjects: ProjectProgress[], recentNotes: NoteSummary[] }`
- **API (Tauri commands):**

| Command | Vào | Ra | Bản |
|---|---|---|---|
| `inbox_list` | `{ status?: 'Open'\|'Processed' }` | `InboxItem[]` | v0.1 (A) |
| `inbox_create` | `{ content }` | `InboxItem` | v0.1 (A) |
| `inbox_update` / `inbox_delete` | `{ id, content }` / `{ id }` | `InboxItem` / `()` | v0.2 |
| `inbox_convert_to_task` | `{ id, task: TaskCreate }` | `Task`. Đã xử lý rồi → `CONFLICT` | v0.2 |
| `inbox_convert_to_note` | `{ id, note: NoteCreate }` | `Note`. Đã xử lý rồi → `CONFLICT` | v0.5 |
| `settings_get` / `settings_update` | `()` / `Partial<AppSettings>` | `AppSettings` | v0.1 |
| `shortcut_register` | `{ accelerator }` | `()`. Phím đã bị chiếm → `CONFLICT` | v0.1 |
| `area_list/create/update/reorder/delete` | `{...}` | `Area[]` / `Area` / `()` | v0.1 |
| `backup_now` / `backup_list` / `backup_restore` | `()` / `()` / `{ fileName }` | `Backup` / `Backup[]` / `()` (khởi động lại app) | v0.1 |
| `export_json` / `open_data_folder` / `open_log_folder` | `()` | `string` (đường dẫn) / `()` | v0.1 |
| `task_list` | `TaskFilter { status?[], priority?[], projectId?, areaId?, tagId?, due?: 'Today'\|'Overdue'\|'Next7'\|'None', archived?: bool, sort?: 'Manual'\|'DueDate'\|'Priority'\|'Created' }` | `Task[]` | v0.2 |
| `task_get` | `{ id }` | `TaskDetail` | v0.2 |
| `task_create` / `task_update` | `TaskCreate` / `{ id, patch: TaskPatch, baseVersion }` | `Task` | v0.2 |
| `task_set_status` | `{ id, status }` | `{ task: Task, next?: Task }` (`next` = lần lặp tiếp theo) | v0.2 |
| `task_move` | `{ id, status, beforeId?, afterId? }` | `Task` (sortKey do core tính) | v0.2 |
| `task_archive` / `task_unarchive` / `task_delete` | `{ id }` | `()` | v0.2 |
| `trash_list` / `trash_restore` / `trash_empty` | `()` / `{ kind, id }` / `()` | `TrashItem[]` / `()` / `()` | v0.2 |
| `checklist_add/toggle/update/reorder/delete` | `{...}` | `ChecklistItem` / `()` | v0.2 |
| `tag_list/create/update/delete`, `task_set_tags` | `{...}` | `Tag[]` / `Tag` / `()` | v0.2 |
| `search` | `{ query, kinds?, limit? }` | `SearchHit[]` | v0.2 (Task, Inbox), v0.3 (+Project), v0.5 (+Note) |
| `project_list` | `{ archived?: bool }` | `Project[]` | v0.3 |
| `project_get_overview` | `{ id }` | `{ project, progress: ProjectProgress, counts: Record<Status, number>, recentNotes: NoteSummary[] }` | v0.3 |
| `project_create` / `project_update` | `ProjectCreate` / `{ id, patch }` | `Project` | v0.3 |
| `project_archive` / `project_unarchive` / `project_delete` | `{ id, mode: 'WithChildren'\|'Detach' }` | `()` | v0.3 |
| `dashboard_today` | `{ date }` (ngày địa phương) | `TodayView` | v0.3 (lịch và ghi chú bổ sung ở v0.4/v0.5) |
| `seed_demo_data` | `()` (chỉ bản dev) | `()` | v0.3 |
| `calendar_range` | `{ from, to }` (ngày) | `CalendarItem[]` | v0.4 |
| `event_create` / `event_update` / `event_delete` | `EventCreate` / `{ id, patch }` / `{ id }` | `Event` / `()` | v0.4 |
| `task_schedule_block` | `{ taskId, startAt, endAt, calendarId? }` | `Event` | v0.4 |
| `reminder_set` / `reminder_delete` | `{ taskId?\|eventId?, offsetMinutes?\|triggerAt? }` / `{ id }` | `Reminder` / `()` | v0.4 |
| `reminder_missed_list` / `reminder_dismiss` | `()` / `{ id }` | `Reminder[]` / `()` | v0.4 |
| `note_list` | `{ projectId?, taskId?, trashed?: bool }` | `NoteSummary[]` | v0.5 |
| `note_get` / `note_create` | `{ id }` / `NoteCreate` | `Note` | v0.5 |
| `note_save` | `{ id, title, contentJson, baseVersion }` | `{ version, updatedAt }`. Lệch version → `CONFLICT` | v0.5 |
| `note_delete` / `note_link_task` / `note_unlink_task` | `{ id }` / `{ noteId, taskId }` | `()` | v0.5 |

- **File dễ đụng nhau giữa các phiên (ai được sửa):**
  - `src-tauri/**` (gồm `Cargo.toml`, `tauri.conf.json`, `capabilities/`, `migrations/`) và `src/lib/ipc/bindings/**`: **phiên B**. Phiên A tạo ra, rồi giao lại cho B.
  - `src/**` (trừ `bindings/`), `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `index.html`, `quick-capture.html`: **phiên C**. Phiên A tạo ra, rồi giao lại cho C. Phiên B cần thêm thư viện npm thì nhắn phiên chính.
  - `.github/workflows/**`, `tests/e2e/**`, `README.md`: phiên A tạo ra, sau đó giao cho **phiên D**. Giữa chừng mà CI hỏng vì B hoặc C thì phiên chính sửa.
  - `docs/plan/**`, `docs/adr/**`: **phiên chính**. Các phiên khác chỉ đánh ✅ vào file này và ghi `docs/log/`.

## 4. Các phiên (session)
> Mỗi phiên là một mảng việc (giao diện, backend, ghép nối...). Không tách một mảng thành nhiều phiên; việc lớn trong một phiên thì chia phase bên trong phiên đó (mục 5).

- **Git/GitHub:** có · Nhánh chính: `main` · Repo: https://github.com/TranCongAnh-01A/MySpace
- **Phiên chính** (phiên này, Opus): chốt thiết kế, viết schema và ADR, viết kế hoạch triển khai cho từng phase, review rồi merge (khi người dùng đồng ý), xử lý khi phiên khác cần nghĩ lại.

| Phiên | Mảng việc | Model (lý do) | Skill/plugin (lý do) | Nhánh (lý do) | Chạy song song với | File/khu vực được sửa | Số phase |
|---|---|---|---|---|---|---|---|
| A | Khung ứng dụng + luồng mỏng xuyên suốt (spec 16.2) | Sonnet, medium (dựng khung theo kế hoạch rõ ràng) | skill (kho) `typescript-patterns` (cấu hình TS strict) | `main` (chạy một mình, đặt nền cho mọi phiên sau) | Không. Chạy trước tiên | Toàn repo lúc khởi tạo (xem kế hoạch triển khai A) | 2 |
| B | Core Rust: DB, nghiệp vụ, command, nhắc nhở, hệ thống | Sonnet, medium (làm theo hợp đồng đã chốt); lỗi khó sai 2 lần → Opus | plugin `mattpocock-skills` → tdd, diagnosing-bugs (nghiệp vụ nhiều quy tắc); skill (kho) `database-migrations` | `feat/core` (song song với C, lớn) | C | `src-tauri/**`, `src/lib/ipc/bindings/**` | 5 |
| C | Giao diện React: design system, màn hình | Sonnet, medium | skill (kho) `vercel-react-best-practices`, `vercel-composition-patterns`, `typescript-patterns`, `web-design-guidelines` (a11y, bàn phím) | `feat/ui` (song song với B, lớn) | B | `src/**` trừ `bindings/`, cấu hình frontend | 5 |
| D | Ghép nối cuối, E2E, phát hành v1.0 | Sonnet, medium; lỗi khó → Opus | plugin `mattpocock-skills` → diagnosing-bugs; skill (kho) `writing-guidelines` (README, release notes) | `feat/release` | Không (chạy sau khi B5 và C5 đã merge; lúc đó D được sửa mọi file) | `tests/e2e/**`, `.github/workflows/**`, `README.md`; ở D2, D3 thêm cấu hình updater và sửa lỗi ở bất kỳ đâu | 3 |

**Nhịp merge của B và C:** B và C cùng làm phase cùng số (B1 + C1 = v0.1, B2 + C2 = v0.2...). Xong cả hai thì dừng lại. Phiên chính review (`/code-review`), người dùng đồng ý, phiên chính merge `feat/core` rồi `feat/ui` vào `main`, chạy app và tag `v0.x`. Trước phase tiếp theo, B và C mỗi bên `git merge main` vào nhánh của mình. Lỗi ghép nối phát hiện khi chạy thử được giao vào bước 0 của phase sau, cho đúng phiên sở hữu file.

**Nếu hạn mức tuần vượt 50%:** B và C chạy lần lượt (B_n rồi C_n), không song song.

## 5. Phase trong từng phiên
> Việc ngắn: 1 phase, làm liền. Việc lớn: chia phase; xong mỗi phase thì cập nhật docs (mục "Khi xong phase") rồi mới sang phase sau, vẫn trong cùng phiên. Phase lớn nên mở phiên mới, đọc docs rồi làm tiếp.

**Khi xong mỗi phase (áp dụng cho mọi phase dưới đây):** đánh ✅ vào các ô của phase trong file này, ghi `docs/log/log_YYYYMMDD.md`, cập nhật `PROJECT_CONTEXT.md` + `INDEX.md`, commit vào nhánh của phiên (hỏi trước khi push), gửi báo cáo theo mẫu `XONG: ...`.

### Phiên A: Khung ứng dụng
Chi tiết từng bước: [lifehub_A-khung_impl_20261126.md](./lifehub_A-khung_impl_20261126.md)

#### 📍 Phase A1: Khung chạy được + CI ✅
- **Việc:**
  - [x] Khởi tạo Tauri 2 + React + TS + Vite đúng cấu trúc spec 7.3 (chỉ tạo thư mục khi dùng); `.gitignore`.
  - [x] ESLint, Prettier, TS strict, `cargo fmt`, `cargo clippy`.
  - [x] GitHub Actions `windows-latest`: lint → test → build bộ cài NSIS, đăng file `.exe` làm artifact.
- **Xong khi (kiểm tra được):** `npm run tauri dev` mở được cửa sổ; `npm run tauri build` ra file `*-setup.exe`; CI xanh trên GitHub.

#### 📍 Phase A2: Luồng mỏng Quick Capture → SQLite → Inbox ✅
- **Việc:**
  - [x] `db/`: mở `lifehub.db` trong thư mục dữ liệu của app, đặt pragma, chạy migration `001` (toàn bộ schema), sao lưu trước khi migrate.
  - [x] `error.rs` (AppError), ts-rs sinh bindings, `inbox_create` và `inbox_list` chia đủ 4 lớp, có test in-memory.
  - [x] Cửa sổ chính hiện danh sách Inbox (UI thô); cửa sổ Quick Capture riêng, phím `Ctrl+Shift+Space`, Enter để lưu, Esc để đóng; phát `entity-changed` để danh sách tự làm mới.
  - [x] Khay hệ thống (Mở, Ghi nhanh, Thoát), single-instance, window-state, đóng cửa sổ thì ẩn xuống khay.
- **Xong khi (kiểm tra được):** cài bản `.exe`, ẩn app xuống khay, nhấn phím tắt, gõ một dòng rồi Enter → dòng đó hiện trong Inbox, và vẫn còn sau khi thoát hẳn rồi mở lại. `cargo test` xanh.

### Phiên B: Core Rust
> Đầu mỗi phase: `git merge main`, sửa lỗi ghép nối được giao (nếu có), đọc kế hoạch triển khai của phase đó do phiên chính viết (`docs/plan/lifehub_B<n>_impl_*.md`). Mỗi use case có test integration với SQLite in-memory. Cuối phase viết `docs/explain/lifehub_core-b<n>_explain_YYYYMMDD.md` giải thích ngắn phần Rust vừa làm (câu hỏi 3).

#### 📍 Phase B1: Nền tảng (v0.1) ✅
- **Việc:**
  - [ ] Helper chung: `changelog::record`, `search::index/remove` (chưa có module nào dùng search), sinh UUID v7, giờ UTC, `fractional_index`.
  - [ ] Settings (giá trị mặc định nằm trong code), `shortcut_register` kiểm tra phím bị trùng, autostart.
  - [ ] Areas CRUD + reorder.
  - [ ] Backup: thủ công, tự động hằng ngày, trước migration, trước restore; giữ 7 bản; restore khởi động lại app; `export_json`; mở thư mục dữ liệu/log; log bằng `tracing`.
- **Xong khi:** test xanh cho settings, areas, backup/restore (sao lưu → sửa dữ liệu → khôi phục → so sánh lại). Gọi được từng command qua mock UI hoặc devtools.

#### 📍 Phase B2: Inbox + Tasks + Search (v0.2) ✅
- **Việc:**
  - [ ] Inbox đủ CRUD, `inbox_convert_to_task` trong một transaction; gọi lần hai → `CONFLICT`.
  - [ ] Tasks: CRUD, trạng thái kèm `completed_at`/`previous_status`, deadline theo ngày hoặc ngày giờ, lọc và sắp xếp, lưu trữ, Trash (xoá mềm, khôi phục, purge sau 30 ngày), `task_move`.
  - [ ] Checklist, Tags, Task lặp (sinh lần tiếp khi hoàn thành, khoá duy nhất, không sinh trùng).
  - [ ] FTS5 cho Task và Inbox, tìm không dấu.
- **Xong khi:** test xanh cho các quy tắc ở spec 3.3 (Done/mở lại, lặp không trùng, đổi Inbox hai lần), test tìm "nhac nho" ra "nhắc nhở", lọc 5.000 Task dưới 100 ms (test có đo).

#### 📍 Phase B3: Projects + Dashboard (v0.3) ✅
- **Việc:**
  - [ ] Projects: CRUD, overview, tiến độ (không tính Task đã lưu trữ hoặc đã xoá), archive/delete với `mode`.
  - [ ] Search thêm Project; `dashboard_today` (Task hôm nay, quá hạn, 7 ngày tới, dự án đang chạy); `seed_demo_data` (GGStudio giả lập).
- **Xong khi:** test tiến độ (0 Task → null; 26/40 → 65%), archive `Detach` không làm mất Task.

#### 📍 Phase B4: Calendar + Reminders (v0.4) ✅
- **Việc:**
  - [ ] Events, `calendar_range` (Event + deadline, không tạo bản trùng), `task_schedule_block`.
  - [ ] Reminders: đặt theo offset hoặc giờ cố định; đổi deadline hoặc giờ Event thì tính lại `trigger_at`.
  - [ ] Scheduler tokio: ngủ đến lần nhắc gần nhất, được đánh thức khi dữ liệu đổi; đánh dấu `Sent` trong cùng transaction; khi mở lại app thì lần nhắc đã qua chuyển thành `Missed`; bấm thông báo → event `navigate`.
  - [ ] `dashboard_today` thêm `schedule`.
- **Xong khi:** test scheduler với đồng hồ giả lập (đúng giờ, không trùng, xử lý lần bị lỡ). Trên bản `.exe` đã cài, thông báo hiện khi app đang ở khay.

#### 📍 Phase B5: Notes (v0.5) ✅
- **Việc:**
  - [ ] Notes: CRUD, `note_save` với `baseVersion`, trích `search_text` từ JSON của Tiptap, liên kết Task, Tags, Trash.
  - [ ] `inbox_convert_to_note`; search thêm Note; `dashboard_today` thêm `recentNotes`.
- **Xong khi:** test lệch version → `CONFLICT`; tìm không dấu ra Note; đổi Inbox sang Note hai lần → `CONFLICT`.

### Phiên C: Giao diện
> Đầu mỗi phase: `git merge main`, đọc kế hoạch triển khai của phase đó. Gọi command qua `src/lib/ipc/commands.ts` đúng theo hợp đồng ở mục 3. Command nào core chưa có thì dùng `mock.ts`, bật bằng `VITE_IPC_MOCK=1`. Mỗi màn hình có đủ empty, loading, error state; dùng được hoàn toàn bằng bàn phím; component test bằng Vitest.

#### 📍 Phase C1: Design system + vỏ ứng dụng (v0.1) ✅
- **Việc:**
  - [ ] Token màu Dark/Light theo spec 4.5, theme theo Windows, font Inter đóng gói kèm.
  - [ ] Component nền (Button, Input, Dialog, Dropdown, Context Menu, Tabs, Card, Toast, Badge, Skeleton, Empty State, Date Picker).
  - [ ] Custom titlebar, sidebar thu gọn được (Projects, Areas), routing, `Ctrl+1…5`, `Ctrl+Q`.
  - [ ] Màn hình Settings (giao diện, ngôn ngữ, phím tắt, khởi động cùng Windows, thông báo, dữ liệu/backup) và quản lý Areas. i18n vi/en.
- **Xong khi:** chạy `VITE_IPC_MOCK=1 npm run dev` thấy đủ vỏ ứng dụng ở cả 2 theme; Vitest xanh; tab qua hết các control.

#### 📍 Phase C2: Inbox, Tasks, Quick Capture, Command Palette (v0.2) ✅
- **Việc:**
  - [ ] Inbox: danh sách, sửa, xoá, dialog chuyển thành Task (gán Project/Area/Tags/ngày).
  - [ ] Tasks dạng List (virtualization) và Kanban (dnd-kit, gọi `task_move`); panel chi tiết bên phải; checklist, tags, deadline ngày hoặc ngày giờ, lặp; lọc và sắp xếp; Trash.
  - [ ] Hoàn thiện giao diện Quick Capture; `Ctrl+K` Command Palette kèm tìm kiếm; `Ctrl+N`.
- **Xong khi:** đi trọn spec 5.2 bước 1–2 bằng mock; danh sách 5.000 Task mock cuộn mượt.

#### ✅ 📍 Phase C3: Projects + Dashboard (v0.3)
- **Việc:**
  - [x] Project với các tab Overview / Tasks / Board / Notes (placeholder đến v0.5) / Settings; hộp thoại lưu trữ/xoá có lựa chọn `mode`.
  - [x] Dashboard/Today: thẻ số liệu, việc hôm nay, quá hạn, sắp tới, dự án; bấm widget mở bản ghi gốc; thêm nhanh.
- **Xong khi:** dữ liệu demo GGStudio hiển thị đúng 65%; kéo thả trên Board giữ thứ tự sau khi tải lại.

#### 📍 Phase C4: Calendar (v0.4) ✅
- **Việc:**
  - [x] FullCalendar ngày/tuần/tháng theo theme; tạo/sửa/xoá Event; deadline hiển thị khác Event.
  - [x] Kéo Task vào lịch tạo time block; kéo Event đổi giờ, kéo deadline đổi `dueDate`/`dueAt`; đặt nhắc nhở; danh sách nhắc nhở bị lỡ.
  - [x] Thêm lịch trình vào Dashboard; xử lý event `navigate`.
- **Xong khi:** đi trọn spec 5.2 bước 4–5 (bằng mock); kéo thả cập nhật đúng loại bản ghi.

#### 📍 Phase C5: Notes (v0.5) ✅
- **Việc:**
  - [ ] Tiptap: heading, định dạng, danh sách, checklist, slash command, code block có highlight; chặn HTML thô và làm sạch khi dán.
  - [ ] Auto save debounce 1 giây, lưu khi đóng note hoặc đóng app, hiện trạng thái lưu, xử lý `CONFLICT`.
  - [ ] Gắn Note với Project/Task, tab Notes của Project, ghi chú gần đây trên Dashboard, chuyển Inbox thành Note.
- **Xong khi:** gõ xong đóng app ngay sau 1 giây → mở lại vẫn còn nội dung (trên bản thật, sau khi merge với B5).

### Phiên D: Ghép nối cuối và phát hành
#### 📍 Phase D1: E2E + kiểm thử dữ liệu ✅ (xanh trên máy; job `e2e` trên CI đỏ, tạm không chặn — việc còn mở)
- **Việc:**
  - [x] WebdriverIO + tauri-driver chạy trong CI: Quick Capture → Inbox → Task, Kanban kéo thả, tạo Event, Note auto save rồi khởi động lại.
  - [x] Test migration (mở DB của bản v0.x rồi nâng cấp), test backup/restore trong CI.
- **Xong khi:** E2E và test dữ liệu xanh trên CI.

#### 📍 Phase D2: Auto Update + phát hành ✅ (phần code, tài liệu; còn bước người dùng: khoá, Secrets, tag, Publish, thử cập nhật)
- **Việc:**
  - [ ] Plugin updater, khoá ký trong GitHub Secrets (người dùng tự tạo và dán vào, Claude không xem khoá), workflow tag `v*` → bản nháp release kèm manifest.
  - [ ] README (vấn đề, giải pháp, GIF demo, kiến trúc, ERD, link ADR, cảnh báo SmartScreen), release notes.
  - [ ] Checklist cài trên VM Windows 10/11 sạch (người dùng chạy theo hướng dẫn).
- **Xong khi:** từ bản v0.9.0 đã cài, app tự cập nhật lên v0.9.1.

#### 📍 Phase D3: Dùng thật 2 tuần → v1.0
- **Việc:**
  - [ ] Người dùng dùng LifeHub hằng ngày, ghi các điểm khó chịu vào Inbox của LifeHub; phiên D sửa theo lô.
  - [ ] Đo hiệu năng theo spec 9.3 (ghi rõ cấu hình máy) và đối chiếu tiêu chí nghiệm thu spec 12.2.
- **Xong khi:** mọi ô ở spec 12.2 đều ✅; tag `v1.0.0`.

## 6. Thứ tự bắt đầu
1. **Trả lời câu hỏi 1** (tên/identifier), sau đó mở **phiên A** trên `main`, chạy một mình, vì mọi phiên khác cần khung và cấu hình do A tạo.
2. Trong lúc A chạy, **phiên chính** viết 8 ADR vào `docs/adr/` (giao cho agent con, Haiku) và kế hoạch triển khai B1, C1.
3. A xong → phiên chính review và merge. Bật plugin/skill cho B và C, mở **B và C song song** (worktree, `feat/core`, `feat/ui`), lặp B_n + C_n → merge → tag `v0.n` cho đến v0.5.
4. Mở **phiên D** sau khi v0.5 đã merge.

## 7. Ghi chú
- `docs/adr/` là thư mục riêng ngoài các loại trong WORKING_RULES. Lý do: spec mục 14 yêu cầu ADR, và đây là quy ước quen thuộc trong Portfolio. Tên file cố định `ADR-00x-<ten>.md`.
- `ke-hoach.md` ở thư mục gốc là file người dùng viết. Bản dùng để tham chiếu là [../spec/lifehub_spec_20261126.md](../spec/lifehub_spec_20261126.md) (Claude chỉ đọc).
- Plugin bật ở phạm vi project (`.claude/settings.local.json`). Nếu phiên trong worktree không thấy plugin thì chạy `kho.ps1 on <tên> -Project <đường dẫn worktree>`.
- Mỗi worktree cần chạy `npm install` và build Rust lần đầu riêng (tốn vài GB ổ đĩa).
