# 🛠️ KẾ HOẠCH TRIỂN KHAI: Phase B1 — Nền tảng core (v0.1)

> **Ngày:** 2026-11-26 02:20 · **Phiên chính:** Claude Opus 5.5 · **Triển khai bằng:** phiên phụ B, Sonnet, effort medium
> **Nhánh git:** `feat/core` (worktree riêng) · **Bật:** plugin `mattpocock-skills` (tdd, diagnosing-bugs), skill (kho) `database-migrations`
> Người triển khai làm đúng file này. Chỗ nào không làm được hoặc phải làm khác: ghi vào báo cáo, không tự đổi hướng.
> Đọc trước: [../WORKING_RULES.md](../WORKING_RULES.md), [../PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md), [phân tích mục 3 + Phiên B](./lifehub_analysis_20261126.md), [schema](./lifehub_schema_20261126.md). Mẫu module: `src-tauri/src/modules/inbox/`.

## 1. Mục tiêu
- **Xong khi:** `cargo test`, `cargo fmt --check`, `cargo clippy -- -D warnings` xanh. Mọi command trong mục 2.1 chạy được qua devtools của `npm run tauri dev` (ghi lại lệnh đã thử). Phím Quick Capture đổi được qua `shortcut_register`, có hiệu lực ngay. Sao lưu → sửa dữ liệu → khôi phục → dữ liệu trở về như cũ (có test). `export_json` ra file JSON hợp lệ. Log ghi ra `<data>/logs/`.
- **Không làm:** Inbox CRUD đầy đủ, Tasks, Trash purge (B2); mọi thứ trong `src/` ngoài `src/lib/ipc/bindings/` (phiên C); CI và README (phiên D / phiên chính).

## 2. Quyết định đã chốt

### 2.1. Hợp đồng v0.1 (phiên C dựa vào đúng mục này, không tự đổi)
Quy ước ts-rs giữ như module inbox: `rename_all = "camelCase"`. Trường `Option` ở **dữ liệu trả ra** dùng `#[ts(optional)]` + `skip_serializing_if = "Option::is_none"` (TS: `field?: T`). Trường của **patch** cũng là optional; muốn xoá màu thì gửi chuỗi rỗng `""`.

```ts
type Theme = 'Dark' | 'Light' | 'System';
type Language = 'vi' | 'en';
type WeekStart = 'Mon' | 'Sun';
type DateFormat = 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY';
type AppSettings = {
  theme: Theme; language: Language; timezone: string /* IANA */; dateFormat: DateFormat; weekStart: WeekStart;
  quickCaptureShortcut: string /* "Ctrl+Shift+Space" */; launchAtStartup: boolean; startHidden: boolean;
  closeToTray: boolean; notificationsEnabled: boolean; defaultReminderMinutes: number; trashRetentionDays: number;
};
type SettingsPatch = Partial<AppSettings>;
type Area = { id: string; name: string; color?: string; sortKey: string };
type AreaCreate = { name: string; color?: string };
type AreaPatch = { name?: string; color?: string };           // color "" = xoá màu
type BackupReason = 'Manual' | 'Daily' | 'PreMigration' | 'PreRestore';
type Backup = { fileName: string; reason: BackupReason; sizeBytes: number; createdAt: string };
type AppInfo = { version: string; dataDir: string; logDir: string; backupDir: string };
```

| Command | Tham số `invoke` | Trả về | Lỗi |
|---|---|---|---|
| `settings_get` | — | `AppSettings` | |
| `settings_update` | `{ patch: SettingsPatch }` | `AppSettings` | `VALIDATION`; đổi `quickCaptureShortcut` qua đây thì xử lý như `shortcut_register` |
| `shortcut_register` | `{ accelerator: string }` | `AppSettings` | `VALIDATION` (không đọc được phím), `CONFLICT` (phím đã bị chiếm, phím cũ được giữ nguyên) |
| `area_list` | — | `Area[]` (theo `sortKey`) | |
| `area_create` | `{ input: AreaCreate }` | `Area` (xếp cuối) | `VALIDATION` |
| `area_update` | `{ id, patch: AreaPatch }` | `Area` | `NOT_FOUND`, `VALIDATION` |
| `area_reorder` | `{ id, beforeId?: string, afterId?: string }` | `Area` | `beforeId` là mục nằm **ngay trên** vị trí mới, `afterId` là mục nằm **ngay dưới** |
| `area_delete` | `{ id }` | `void` | Xoá mềm; Project/Task đang trỏ tới Area này được đặt `area_id = NULL` trong cùng transaction |
| `backup_now` | — | `Backup` | `IO`, `DB` |
| `backup_list` | — | `Backup[]` (mới nhất trước) | |
| `backup_restore` | `{ fileName }` | `void` (app khởi động lại) | `NOT_FOUND`, `VALIDATION` (file hỏng) |
| `export_json` | — | `string \| null` (đường dẫn; `null` khi người dùng huỷ hộp thoại) | `IO` |
| `open_data_folder` / `open_log_folder` | — | `void` | `IO` |
| `app_info` | — | `AppInfo` | |

Event: `entity-changed` với `entity: 'settings'` (sau `settings_update` / `shortcut_register`) và `entity: 'area'`.

### 2.2. Thiết kế bên trong
- **Thư viện thêm:** `tracing`, `tracing-subscriber`, `tracing-appender`, `tauri-plugin-autostart`, `tauri-plugin-dialog`, `tauri-plugin-opener`, `iana-time-zone`, `chrono-tz` (chỉ để kiểm tra tên múi giờ), rusqlite feature `backup`. Không thêm thư viện npm.
- **Transaction:** command khoá `Db`, gọi `conn.transaction()`, truyền `&tx` (deref thành `&Connection`) cho repository, rồi `tx.commit()`. Mọi thao tác ghi nhiều bảng phải nằm trong một transaction.
- **Helper dùng chung:**
  - `db/changelog.rs`: `record(conn, entity, id, ChangeOp, clock)`. Areas gọi hàm này mỗi lần ghi.
  - `modules/search/infrastructure.rs`: `index(conn, kind, id, title, body)` (xoá dòng cũ theo `search_map` rồi chèn mới, cập nhật `fts_rowid`) và `remove(conn, kind, id)`. Chưa module nào gọi; chỉ cần test (index → match không dấu → remove → hết kết quả).
  - `sort_key.rs`: `between(before: Option<&str>, after: Option<&str>) -> String`. Chuỗi trả về phải **sắp xếp đúng theo so sánh TEXT của SQLite**. Ưu tiên crate `fractional_index` nếu nó cho ra chuỗi so sánh được theo thứ tự byte; nếu không thì tự viết thuật toán điểm giữa base-62 (khoảng 40 dòng). Test: chèn 1.000 lần liên tiếp vào đầu, cuối và giữa, sau đó thứ tự vẫn đúng.
- **Settings** (`modules/settings/`, đủ 4 lớp):
  - Lưu mỗi khoá một dòng trong bảng `settings` (`value_json`). Giá trị mặc định nằm trong code, gồm: `System`, `vi`, múi giờ máy (`iana-time-zone`, lỗi thì dùng `Asia/Ho_Chi_Minh`), `DD/MM/YYYY`, `Mon`, `Ctrl+Shift+Space`, `false`, `true`, `true`, `true`, `15`, `30`.
  - Validate: tên múi giờ có trong `chrono-tz`; `defaultReminderMinutes` từ 0 đến 10080; `trashRetentionDays` từ 1 đến 365.
  - Giữ bản sao `AppSettings` trong state (`SettingsState(RwLock<AppSettings>)`) để chỗ khác đọc nhanh.
  - Hiệu ứng khi đổi:
    - `launchAtStartup`: gọi `autolaunch().enable()/disable()`. Plugin autostart chạy app với tham số `--hidden`.
    - `closeToTray = false`: đóng cửa sổ chính thì thoát app.
    - `startHidden`: chỉ có tác dụng khi app được mở với `--hidden`.
- **Phím tắt** (`system/shortcut.rs`): lúc khởi động đọc phím từ settings. Khi đổi phím: parse bằng `Shortcut::from_str` (lỗi → `VALIDATION`), huỷ đăng ký phím cũ, đăng ký phím mới. Đăng ký thất bại thì đăng ký lại phím cũ và trả `CONFLICT`. Chỉ lưu setting khi đăng ký thành công.
- **Cửa sổ chính:** đặt `"visible": false` trong `tauri.conf.json`; trong `setup`, hiện cửa sổ trừ khi app có `--hidden` và `startHidden = true`. Cách này tránh màn hình nháy lúc khởi động.
- **Areas** (`modules/areas/`, đủ 4 lớp): tên không rỗng, tối đa 100 ký tự; màu dạng `#RRGGBB` hoặc trống. Tạo mới thì `sortKey = between(last, None)`. Danh sách bỏ qua bản ghi `deleted_at`.
- **Backup** (`system/backup.rs`):
  - Thư mục `<app_local_data_dir>/backups/`. Tên file `lifehub-<reason-kebab>-<YYYYMMDD-HHMMSS>Z.db`, ví dụ `lifehub-pre-migration-20261126-021500Z.db`. Tạo bằng `VACUUM INTO`.
  - Ghi metadata vào bảng `backups`. Backup pre-migration được tạo trước khi bảng tồn tại, nên ghi dòng metadata sau khi migrate xong. Sửa hàm `backup_pre_migration` của phase A cho đúng quy tắc đặt tên này.
  - `backup_list` lấy **thư mục làm nguồn chuẩn**: quét file khớp mẫu tên, thêm dòng còn thiếu, xoá dòng không còn file.
  - Giữ lại theo loại: `Daily` 7 bản, `Manual` 10 bản, `PreMigration` 3, `PreRestore` 3. Xoá bản cũ hơn ngay sau mỗi lần tạo.
  - Tự sao lưu hằng ngày: lúc khởi động và mỗi giờ một lần (`tauri::async_runtime::spawn` + sleep), nếu chưa có bản `Daily` nào trong 24 giờ qua thì tạo.
  - **Restore:** `fileName` phải khớp đúng mẫu tên (chặn `..`, `/`, `\`) và có trong thư mục. Mở file chỉ đọc, chạy `PRAGMA integrity_check`, kết quả khác `ok` thì trả `VALIDATION`. Tạo bản `PreRestore` của DB hiện tại. Dùng `rusqlite::backup::Backup` chép từ file vào kết nối đang mở (không tráo file), chạy `migrations::run` (bản sao lưu có thể cũ hơn), rồi `app.restart()`.
- **Export JSON** (`system/export.rs`): mở hộp thoại lưu file bằng `tauri-plugin-dialog`, gọi từ phía Rust (`blocking_save_file` trong `spawn_blocking`), tên gợi ý `lifehub-export-YYYYMMDD.json`. Nội dung: `{ app: "LifeHub", appVersion, schemaVersion, exportedAt, tables: { <bảng>: [ {cột: giá trị} ] } }`, gồm mọi bảng trừ `search_index`, `search_map`, `change_log`, `backups`. Frontend **không** được cấp quyền `fs` hay `dialog`.
- **Mở thư mục:** dùng `tauri-plugin-opener` gọi từ Rust (`open_path`). Không cấp capability cho frontend.
- **Log** (`logging.rs`):
  - `tracing-appender` xoay vòng theo ngày, `max_log_files(7)`, ghi ra `<data>/logs/lifehub.log`, mức `info`, bản dev thêm `debug` ra stdout.
  - Thay toàn bộ `eprintln!` bằng `tracing::warn!`/`error!`.
  - Không log nội dung người dùng (nội dung Inbox, tiêu đề), chỉ log id và mã lỗi.
- **Explain:** cuối phase viết `docs/explain/lifehub_core-b1_explain_20261126.md` theo `docs/explain/TEMPLATE_explain.md`. Nội dung: transaction, `Mutex<Connection>`, trait repository, cách test với SQLite in-memory, giải thích cho người mới học Rust.

## 3. File được sửa
| File | Việc | Ghi chú |
|---|---|---|
| `src-tauri/Cargo.toml`, `Cargo.lock` | sửa | thư viện ở mục 2.2 |
| `src-tauri/tauri.conf.json` | sửa | `main.visible = false` |
| `src-tauri/capabilities/*` | không đổi | trừ khi plugin bắt buộc; nếu bắt buộc thì ghi lý do vào báo cáo |
| `src-tauri/src/lib.rs` | sửa | đăng ký plugin, state, command, logging |
| `src-tauri/src/logging.rs`, `src-tauri/src/sort_key.rs` | tạo | |
| `src-tauri/src/db/{mod.rs,migrations.rs,changelog.rs}` | sửa / tạo | |
| `src-tauri/src/modules/{settings,areas,search}/**` | tạo | 4 lớp; `search` chỉ có `mod.rs` + `infrastructure.rs` |
| `src-tauri/src/modules/mod.rs` | sửa | |
| `src-tauri/src/system/{backup.rs,export.rs,commands.rs,shortcut.rs,windows.rs,tray.rs,mod.rs}` | tạo / sửa | `commands.rs`: backup, export, open folder, `app_info` |
| `src/lib/ipc/bindings/*` | sinh tự động | commit cả file sinh ra |
| `docs/explain/lifehub_core-b1_explain_20261126.md`, `docs/log/log_YYYYMMDD.md` | tạo | |
| `docs/plan/lifehub_analysis_20261126.md` | chỉ đánh ✅ Phase B1 | |

> Chỉ sửa các file trong bảng. Cần sửa file khác (kể cả `package.json`, `src/**`, CI): hỏi phiên chính trước. `docs/INDEX.md` và `PROJECT_CONTEXT.md` **không sửa trên nhánh này** (tránh xung đột với phiên C); ghi phần cần cập nhật vào báo cáo, phiên chính cập nhật sau khi merge.

## 4. Các bước
1. [ ] `git switch feat/core` (worktree đã ở nhánh này). Chạy `npm ci` một lần để `tauri dev` chạy được.
2. [ ] `logging.rs`, `db/changelog.rs`, `sort_key.rs`, `modules/search` kèm test.
3. [ ] Settings: domain (struct, validate, giá trị mặc định), repository, use case `get`/`update`, `SettingsState`, command. Test: lấy mặc định khi DB trống; patch một trường không ảnh hưởng trường khác; giá trị sai → `VALIDATION`.
4. [ ] Phím tắt đọc từ settings, `shortcut_register` với cơ chế khôi phục phím cũ; `closeToTray`; autostart + `--hidden`; `main.visible = false`.
5. [ ] Areas: 4 lớp, đủ 5 command, `area_delete` tách Project/Task (test bằng cách chèn trực tiếp một dòng `tasks`/`projects` bằng SQL). Test thứ tự sau khi reorder.
6. [ ] Backup: tạo, liệt kê (đồng bộ với thư mục), dọn bản cũ, tự sao lưu hằng ngày, restore (test trên file tạm: tạo Area → backup → xoá Area → restore từ file vào kết nối → Area quay lại), sửa phần pre-migration.
7. [ ] `export_json`, `open_data_folder`, `open_log_folder`, `app_info`.
8. [ ] Chạy `npm run tauri dev`, thử từng command bằng `window.__TAURI_INTERNALS__.invoke(...)` trong devtools; thử đổi phím tắt sang `Ctrl+Alt+K` rồi bấm.
9. [ ] Kiểm tra (mục 5), viết explain + log, đánh ✅, commit `feat(core): B1 nền tảng — settings, areas, backup, log`. **Không push** khi chưa hỏi người dùng.

## 5. Kiểm tra trước khi báo xong
- [ ] `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test` (chạy trong `src-tauri/`) xanh; ghi số test.
- [ ] `npm run lint` và `npm test` vẫn xanh (bindings mới không làm hỏng frontend).
- [ ] Thử thủ công ở bước 8, ghi kết quả từng command.
- [ ] `git diff main --stat` chỉ có file nằm trong bảng ở mục 3.

## 6. Báo cáo (dòng đầu đúng mẫu)
`XONG: <việc> | File: <file đã đổi> | Kiểm tra: <đã chạy gì: kết quả> | Khác kế hoạch: <không / gì> | Còn lại: <không / gì>`
