# 🛠️ KẾ HOẠCH TRIỂN KHAI: Phase D1 — E2E + kiểm thử dữ liệu (chuẩn bị v1.0)

> **Ngày:** 2026-11-27 01:30 · **Phiên chính:** Claude Opus 5.5 · **Triển khai bằng:** phiên phụ D (mới), Sonnet, effort medium
> **Nhánh git:** worktree mới tách từ `main` (v0.5.0) · **Bật:** plugin `mattpocock-skills` (diagnosing-bugs khi gặp lỗi)
> Người triển khai làm đúng file này. Chỗ nào không làm được hoặc phải làm khác: ghi vào báo cáo, không tự đổi hướng.
> Đọc trước: [phân tích Phase D1](./lifehub_analysis_20261126.md), spec mục 12.1–12.2 ([../spec/lifehub_spec_20261126.md](../spec/lifehub_spec_20261126.md)), `.github/workflows/ci.yml`.

## 1. Mục tiêu
- **Xong khi:**
  - `npm run e2e` chạy được trên máy và có job `e2e` riêng trên CI (`windows-latest`) đều xanh, phủ 4 luồng ở mục 2.3.
  - Test dữ liệu ở mục 2.4 xanh trong `cargo test`.
  - Số phiên bản đồng bộ ở `0.5.0` và chỉ còn một nguồn.
  - Bundle JS chính dưới 500 kB, không còn cảnh báo chunk.
  - **E2E không bao giờ chạm vào dữ liệu thật của người dùng.**
- **Không làm:** updater, workflow phát hành, README đầy đủ (D2); sửa lỗi theo trải nghiệm dùng thật (D3); thêm tính năng mới.

## 2. Quyết định đã chốt

### 2.1. Thư mục dữ liệu riêng cho test
- Thêm biến môi trường `LIFEHUB_DATA_DIR`. Khi có biến này, core dùng thư mục đó thay cho `app_local_data_dir()` (DB, backups, logs).
  - **Chỉ áp dụng ở bản debug** (`#[cfg(debug_assertions)]`). Bản release bỏ qua biến này.
- Khi chạy E2E, `single-instance` và phím tắt toàn cục cũng phải không đụng tới app thật đang chạy trên máy:
  - Bản debug đặt identifier riêng cho single-instance khi có `LIFEHUB_DATA_DIR`, hoặc tắt hẳn single-instance trong trường hợp đó. Chọn một cách, ghi lý do vào báo cáo.
  - Bỏ qua đăng ký phím tắt toàn cục khi `LIFEHUB_E2E=1`.

### 2.2. Công cụ E2E
- WebdriverIO v9 (`@wdio/cli`, `@wdio/local-runner`, `@wdio/mocha-framework`, `@wdio/spec-reporter`) cùng `tauri-driver` (`cargo install tauri-driver --locked`).
- Cần `msedgedriver` đúng phiên bản WebView2 trên máy:
  - Trên máy: script `scripts/e2e-setup.ps1` đọc phiên bản WebView2, tải `msedgedriver` cùng phiên bản về thư mục `.e2e/` (thư mục này đưa vào `.gitignore`).
  - Trên CI: làm tương tự. Có thể dùng action/công cụ có sẵn nếu đơn giản hơn.
- Binary dùng để test: `npm run tauri build -- --debug --no-bundle`. Cấu hình wdio trỏ tới `src-tauri/target/debug/lifehub.exe`.
- Mỗi spec dùng thư mục dữ liệu tạm riêng: tạo mới trong `beforeEach` hoặc mỗi file, xoá sau khi chạy. Riêng luồng "khởi động lại" thì giữ lại thư mục đó giữa hai session.
- Thư mục `tests/e2e/`:
  - `wdio.conf.ts`
  - `specs/*.e2e.ts`
  - `helpers/` (khởi động app với thư mục dữ liệu chỉ định; chọn phần tử theo `data-testid`)
- Được thêm `data-testid` vào component ở `src/**`, chỉ ở những chỗ test cần. **Không** đổi hành vi.

### 2.3. Bốn luồng E2E (theo spec 12.1)
1. **Inbox → Task:**
   - Thêm Inbox bằng nút "+ Thêm nhanh" trên titlebar. Phím tắt toàn cục không bấm được qua WebDriver; luồng Quick Capture thật đã được người dùng thử tay ở v0.1 và v0.4.
   - Chuyển mục Inbox thành Task, đặt deadline.
   - Task hiện trong Tasks; mục Inbox chuyển sang tab Đã xử lý.
2. **Kanban:**
   - Tạo 3 Task, mở Board, dùng bàn phím (dnd-kit `KeyboardSensor`) đưa một thẻ sang `Done`.
   - Đóng app, mở lại với cùng thư mục dữ liệu: thứ tự và trạng thái vẫn giữ nguyên.
3. **Calendar:**
   - Tạo Event qua nút "Tạo sự kiện" và dialog. Event hiện ở chế độ Danh sách.
   - Mở Event, sửa giờ trong panel, lưu: giờ mới hiện đúng.
4. **Note:**
   - Tạo Note, gõ nội dung, đợi trạng thái "Đã lưu".
   - Gõ thêm một câu, thoát ngay bằng `Ctrl+Q` (đi qua `app-will-quit`).
   - Mở lại app: cả hai đoạn đều còn.

### 2.4. Test dữ liệu (Rust, chạy trong `cargo test`)
- **Fixture DB:** thêm test bị `#[ignore]` để sinh file `src-tauri/tests/fixtures/lifehub_v0.5.0.db`.
  - Nội dung: chạy migration hiện tại, rồi `seed_demo_data`, rồi thêm 1 Event có reminder và 1 Note.
  - Chạy test này một lần rồi **commit file fixture**. Từ đó file này là "DB của bản trước".
- **Test nâng cấp:**
  - Chép fixture ra file tạm, gọi `db::open` (có backup trước khi migrate cùng toàn bộ migration).
  - Kiểm tra: số dòng các bảng chính, tiến độ GGStudio 65%, tìm "ghi chu" ra Note, `PRAGMA integrity_check = ok`, `PRAGMA foreign_key_check` rỗng.
  - Hiện chưa có migration mới, nên test này bảo vệ cho các migration sau. Ghi rõ điều đó trong comment.
- **Test backup → restore trên file thật** (không dùng in-memory):
  - Tạo dữ liệu, `backup_now`, sửa và xoá dữ liệu, chạy luồng restore ở tầng use case (không gọi `app.restart`).
  - Kiểm tra dữ liệu về đúng như lúc backup và có thêm bản `PreRestore`.
  - Nếu use case restore đang gắn chặt với `AppHandle` thì tách phần logic ra để test được. Ghi lại vào báo cáo.

### 2.5. Dọn dẹp kèm theo
- **Phiên bản:**
  - `package.json` → `0.5.0`.
  - `tauri.conf.json` dùng `"version": "../package.json"` để chỉ còn một nguồn.
  - `Cargo.toml` → `0.5.0`.
  - Thêm script `npm run version:check`: kiểm tra `package.json` và `Cargo.toml` trùng phiên bản, chạy trong CI.
- **Bundle:**
  - Tách route Calendar (FullCalendar) và Notes (Tiptap, lowlight) bằng `React.lazy`. Router đã có sẵn `lazy`; kiểm tra những chỗ còn import trực tiếp.
  - Nếu cần thì thêm `build.rollupOptions.output.manualChunks` cho `@fullcalendar`, `@tiptap` và `lowlight`.
  - Ghi kích thước bundle trước và sau.

## 3. File được sửa
Lúc này phiên B và C đã xong, nên **phiên D được sửa mọi nơi** trong phạm vi các việc ở mục 2.

| File | Việc | Ghi chú |
|---|---|---|
| `tests/e2e/**`, `scripts/e2e-setup.ps1` | tạo | |
| `package.json`, `package-lock.json` | sửa | wdio, script `e2e`, `version:check`, phiên bản |
| `.gitignore` | sửa | `.e2e/` |
| `.github/workflows/ci.yml` | sửa | job `e2e` + `version:check` |
| `src-tauri/src/{lib.rs,system/**}` | sửa | `LIFEHUB_DATA_DIR`, `LIFEHUB_E2E` |
| `src-tauri/src/**` (backup/restore) | sửa | chỉ để tách logic cho dễ test |
| `src-tauri/tests/**` | tạo | test nâng cấp, fixture, backup/restore |
| `src-tauri/{Cargo.toml,tauri.conf.json}` | sửa | phiên bản |
| `src/**` | sửa | `data-testid`, lazy route |
| `vite.config.ts` | sửa | `manualChunks` nếu cần |
| `docs/log/…`, `docs/plan/lifehub_analysis_20261126.md` | tạo / chỉ đánh ✅ D1 | |

> Không sửa `docs/INDEX.md`, `PROJECT_CONTEXT.md`. Không đổi hành vi của app ngoài những gì liệt kê ở mục 2.

## 4. Các bước
1. [ ] Worktree tách từ `main` (v0.5.0). Chạy `npm ci`, build lần đầu chạy nền.
2. [ ] `LIFEHUB_DATA_DIR`, `LIFEHUB_E2E`, xử lý single-instance và phím tắt trong bản debug.
3. [ ] Phiên bản 0.5.0 + `version:check`. Lazy route + `manualChunks`; đo bundle.
4. [ ] Test dữ liệu Rust: fixture, test nâng cấp, test backup/restore trên file.
5. [ ] Cài đặt E2E: `e2e-setup.ps1`, `wdio.conf.ts`, helpers. Chạy được một spec "app mở được".
6. [ ] Viết 4 spec ở mục 2.3, thêm `data-testid` khi cần.
7. [ ] Thêm job `e2e` vào CI (để riêng, không làm chậm job chính; cache `tauri-driver`).
8. [ ] Kiểm tra (mục 5), ghi log, đánh ✅, commit `test: D1 e2e, data tests, version, bundle split`. Hỏi người dùng trước khi push. Sau khi được push, xem job `e2e` trên CI. Repo private: nhờ người dùng xem tab Actions nếu không xem được.

## 5. Kiểm tra trước khi báo xong
- [ ] `npm run lint`, `npm test`, `npm run build` (ghi kích thước chunk), `npm run version:check` đều xanh.
- [ ] `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` xanh (ghi số test).
- [ ] `npm run e2e` trên máy xanh với 4 luồng. Sau khi chạy, **thư mục dữ liệu thật** `%LOCALAPPDATA%\com.lifehub.app` không bị đổi (so thời gian sửa file DB trước và sau).
- [ ] Bản release vẫn bỏ qua `LIFEHUB_DATA_DIR`: có test hoặc kiểm tra bằng `cfg`, ghi cách kiểm.

## 6. Báo cáo (dòng đầu đúng mẫu)
`XONG: <việc> | File: <file đã đổi> | Kiểm tra: <đã chạy gì: kết quả> | Khác kế hoạch: <không / gì> | Còn lại: <không / gì>`
