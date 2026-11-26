# 📖 TÀI LIỆU GIẢI THÍCH: Core Rust phase B1 (settings, areas, backup, log)

> Viết cho người mới học Rust. Mẫu cấu trúc: module `inbox` (phiên A). Kế hoạch: [../plan/lifehub_B1_impl_20261126.md](../plan/lifehub_B1_impl_20261126.md).

# 1. Tổng quan (Overview)
- **Mục đích cốt lõi:** dựng phần nền cho mọi phase sau: cài đặt, Area, sao lưu/khôi phục, xuất dữ liệu, log, và các helper dùng chung (nhật ký thay đổi, chỉ mục tìm kiếm, khoá sắp xếp).
- **Vai trò trong hệ thống:** nằm ở Rust core (`src-tauri/src`). Frontend chỉ gọi command qua IPC; mọi quy tắc nghiệp vụ và mọi truy cập SQLite nằm ở đây (ADR-003).

## 2. Phân tích Chi tiết (Detailed Breakdown)

### 📌 Mô hình 4 lớp của một module (`settings`, `areas`)
- `domain.rs`: kiểu dữ liệu và quy tắc thuần (kiểm tra tên, màu, khoảng giá trị). Không biết DB hay Tauri nên test rất nhanh.
- `application.rs`: các use case (`create`, `update`, `reorder`...) cùng **trait repository**. Trait là "cái ổ cắm": use case chỉ biết "có ai đó lưu được Area", không biết đó là SQLite.
- `infrastructure.rs`: cài trait bằng `rusqlite`. Đây là chỗ duy nhất có câu SQL.
- `commands.rs`: lớp mỏng `#[tauri::command]`: khoá DB, mở transaction, gọi use case, commit, phát event `entity-changed`.

### 📌 Transaction và `Mutex<Connection>`
- Cả app dùng **một** kết nối SQLite, đặt trong `Db(Mutex<Connection>)`. `db.lock()` trả về một "chìa khoá"; trong lúc cầm chìa không ai khác dùng DB được, và chìa tự trả khi biến ra khỏi phạm vi `{ ... }`.
- Ghi nhiều bảng phải gói trong transaction: `let tx = conn.transaction()?; ...; tx.commit()?;`. Nếu giữa chừng có lỗi (`?` thoát sớm) mà chưa `commit`, `tx` bị huỷ và SQLite **tự hoàn tác** tất cả. Ví dụ `area_delete` vừa xoá mềm Area vừa đặt `area_id = NULL` cho Project/Task: hoặc cả hai, hoặc không gì cả (có test `transaction_rollback_undoes_delete`).
- `&tx` tự "hạ cấp" thành `&Connection` (deref), nên repository không cần biết đang trong transaction hay không.

### 📌 Test bằng SQLite in-memory
- `db::open_in_memory()` tạo DB trong RAM, chạy migration 001, mỗi test một DB sạch, không đụng đĩa. `FixedClock` cố định giờ để so sánh chính xác. Nhờ trait repository + `Clock`, use case test được mà không cần Tauri.
- Riêng backup dùng thư mục tạm thật (`std::env::temp_dir()`) vì cần tệp. Trên Windows phải `drop` mọi kết nối đang mở tệp trước khi xoá thư mục.

### 📌 Settings
- Mỗi khoá một dòng trong bảng `settings` (`value_json`). **Giá trị mặc định nằm trong code** (`AppSettings::defaults`), bảng chỉ lưu thứ người dùng đã đổi. `get` chồng giá trị đã lưu lên mặc định; dòng hỏng thì bỏ qua và dùng mặc định cho khoá đó.
- `update` áp patch lên bản sao, kiểm tra (`validate`), chỉ `upsert` các khoá thực sự đổi.
- `SettingsState(RwLock<AppSettings>)` giữ bản sao trong RAM cho chỗ cần đọc nhanh (đóng cửa sổ chính kiểm tra `closeToTray`).
- `apply_update` (dùng chung cho `settings_update` và `shortcut_register`): kiểm tra → đổi phím tắt → đổi autostart → lưu trong transaction → cập nhật state → phát event. Bước nào lỗi thì các hiệu ứng trước đó được hoàn lại (phím cũ được đăng ký lại).

### 📌 Phím tắt (`system/shortcut.rs`)
- `parse` biến chuỗi `Ctrl+Alt+K` thành `Shortcut` (lỗi → `VALIDATION`). `change` huỷ phím cũ rồi đăng ký phím mới; nếu thất bại (phím bị chương trình khác chiếm) thì đăng ký lại phím cũ và trả `CONFLICT`. Setting chỉ được lưu khi cả quá trình thành công.

### 📌 `sort_key.rs` (khoá sắp xếp)
- Mỗi Area có `sort_key` là chuỗi base-62 (`0-9A-Za-z`, đúng thứ tự byte nên SQLite `ORDER BY` so sánh TEXT ra đúng thứ tự). `between(trên, dưới)` trả về chuỗi nằm giữa hai khoá. Nhờ đó kéo thả một mục chỉ **sửa một dòng**, không phải đánh số lại cả danh sách. Khoá không bao giờ kết thúc bằng `0` để luôn còn chỗ chèn. Tự viết (~40 dòng) thay vì thêm crate vì crate cần kiểm chứng thêm về thứ tự byte.
- `area_reorder`: `beforeId` là mục ngay trên, `afterId` là mục ngay dưới. Chỉ cho một phía thì use case tự tìm mục kề thật sự ở phía kia.

### 📌 `changelog::record` và `search::index/remove`
- Ghi ở tầng repository, trong cùng transaction với thao tác chính, không dùng trigger (xem schema mục 1). `changelog` là nền cho đồng bộ sau này. `search` giữ ánh xạ `search_map` (loại + id → rowid FTS5) để cập nhật/xoá không phải quét bảng. B1 chưa module nào gọi `search`, chỉ có test.

### 📌 Backup (`system/backup.rs`)
- Tên tệp `lifehub-<loại>-<YYYYMMDD-HHMMSS>Z.db` đọc ngược được bằng `parse_file_name`; tên không đúng mẫu bị bỏ qua (nên không thể dùng `..` hay `/`).
- **Thư mục là nguồn chuẩn**: `list` quét thư mục rồi đồng bộ bảng `backups` (thêm dòng thiếu, xoá dòng mất tệp). Vì vậy bản `PreMigration` (tạo trước khi bảng tồn tại) vẫn được ghi nhận sau khi migrate (`register_existing` gọi trong `db::open`).
- Giữ: Daily 7, Manual 10, PreMigration 3, PreRestore 3; dọn ngay sau mỗi lần tạo. Tự sao lưu hằng ngày: một thread nền kiểm tra mỗi giờ, 24 giờ chưa có bản Daily thì tạo.
- **Restore:** kiểm tra tên → mở tệp chỉ đọc → `PRAGMA integrity_check` phải là `ok` và có bảng `workspaces` → tạo bản `PreRestore` của DB hiện tại → `rusqlite::backup` chép nội dung vào **kết nối đang mở** (không tráo tệp nên không phải đóng kết nối) → chạy lại migration → `app.restart()`.

### 📌 Export JSON, mở thư mục, log
- `export_json` dựng JSON (mọi bảng trừ `search_index*`, `search_map`, `change_log`, `backups`; BLOB thành chuỗi hex), rồi mở hộp thoại lưu **từ Rust** (`blocking_save_file` trong `spawn_blocking`). Frontend không có quyền `fs`/`dialog`. Dữ liệu xuất gồm cả bản ghi đã xoá mềm (đây là bản sao đầy đủ).
- `open_data_folder`/`open_log_folder` gọi `tauri-plugin-opener` từ Rust.
- Log (`logging.rs`): `tracing` ghi tệp xoay vòng theo ngày `logs/lifehub.<ngày>.log`, giữ 7 tệp, dev thêm ra stdout. `WorkerGuard` phải được giữ trong state, nếu thả thì log chưa kịp ghi bị mất. Không log nội dung người dùng.

## 3. Quản lý Trạng thái & Dữ liệu
- State do Tauri quản lý (`app.manage`): `Db`, `AppDirs` (thư mục data/logs/backups), `SettingsState`, `LogGuard`.
- Luồng: UI `invoke` → command khoá `Db` → transaction → repository ghi + `changelog` → commit → `entity-changed` → UI làm mới query.

## 4. Xử lý Ngoại lệ (Error Handling & Edge Cases)
- Mọi lỗi là `AppError { code, message, details? }` (`VALIDATION`, `NOT_FOUND`, `CONFLICT`, `DB`, `IO`, `INTERNAL`); `?` tự đổi `rusqlite::Error`/`io::Error` sang `AppError` nhờ `impl From`.
- Phím tắt lúc khởi động bị chiếm: chỉ ghi log, app vẫn chạy. Backup trùng tên trong cùng giây: `CONFLICT`. Tệp sao lưu hỏng hoặc không phải DB LifeHub: `VALIDATION`, DB đang mở không bị đụng.

## 5. Lưu ý cho Developer (Notes)
- 💡 `Mutex` bị giữ suốt command: đừng gọi `await` khi còn giữ `MutexGuard` (xem `export_json`: dựng JSON trong khối `{}` rồi mới mở hộp thoại).
- 💡 Đổi tên/kiểu trường trong `AppSettings`/`Area`/`Backup` là đổi hợp đồng IPC với phiên C: hỏi phiên chính trước. Bindings sinh bằng `cargo test` (ts-rs) vào `src/lib/ipc/bindings/`.
- 💡 Thêm migration 002 trở đi: `needs_backup` sẽ tạo bản `PreMigration` theo đúng tên mới.
- 💡 `iana-time-zone` trên Windows có thể trả tên cũ như `Asia/Saigon`; vẫn hợp lệ với `chrono-tz`.
